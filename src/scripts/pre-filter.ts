/**
 * 预筛层：用关键词 + 便宜模型批量判断文章是否与保理/供应链金融相关
 * 无关文章直接标记 pre_filtered=false，后续 enrich/score 跳过
 *
 * 设计原则（对齐 AIHOT）：能用代码处理的，一律不用模型
 */
import { createClient } from '@supabase/supabase-js';
import { keepProcessAlive } from '../lib/keep-process-alive';
import {
  editorialExclusionReason,
  FACTORING_SOURCE_WHITELIST,
  matchesCandidateTopic,
  matchesTopicSignal,
} from '../lib/relevance';
import { isScriptInvoked } from '../lib/script-entry';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LLM_API_URL = process.env.LLM_API_URL || 'https://api.deepseek.com/v1';
const LLM_API_KEY = process.env.LLM_API_KEY || '';

interface Article {
  id: string;
  title: string;
  link: string;
  content: string | null;
  excerpt: string | null;
  source_id: string;
}

/**
 * 关键词快速过滤
 * @returns true=通过, false=淘汰, null=不确定需LLM
 */
function keywordFilter(title: string, text: string, sourceId?: string, link?: string): boolean | null {
  if (editorialExclusionReason(title, link)) return false;

  const combined = `${title} ${text}`;

  // 行业垂直信源先交模型复核；协会内部事务及培训广告已在上方拦截。
  if (sourceId && FACTORING_SOURCE_WHITELIST.has(sourceId)) return null;

  // 一般信源命中扩展业务组合后交 LLM 复核；只有直接核心词才快速通过。
  if (!matchesCandidateTopic(combined)) return false;
  if (matchesTopicSignal(combined)) return true;
  return null;
}

/** step-3.7-flash 偶发在 JSON 外包裹 Markdown 或前置文本，先归一化再解析。 */
function parseBatchPayload(raw: string): unknown {
  const cleaned = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const candidates: string[] = [cleaned];
  const objectStart = cleaned.indexOf('{');
  const objectEnd = cleaned.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) candidates.push(cleaned.slice(objectStart, objectEnd + 1));
  for (const candidate of candidates) {
    try { return JSON.parse(candidate); } catch { /* try the next form */ }
  }
  return null;
}

/**
 * 批量LLM过滤：一次发10篇标题，让模型判断是否跟保理/供应链金融相关
 */
async function batchFilterWithLLM(articles: Article[]): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();

  if (!LLM_API_KEY) {
    console.log('  ⚠ LLM_API_KEY not set; using deterministic core-topic fallback');
    fallbackOnLLMFailure(articles, results);
    return results;
  }

  // 分批处理，每批10篇
  const batchSize = 10;
  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize);

    const articleList = batch.map((a, idx) =>
      `${idx + 1}. [${a.source_id}] ${a.title}`
    ).join('\n');

    const prompt = `你是保理与供应链金融领域的内容审核专家。判断以下文章标题是否"真正属于"保理/供应链金融行业的实质资讯。

【判为相关】满足之一：
- 保理业务、应收账款融资/转让、供应链金融、商业保理、银行保理、融资租赁、债权转让、供应链ABS、动产融资统一登记(中登)、反向保理、保兑仓
- 监管动态(央行/金监总局/证监会发布且涉及上述领域)
- 真实行业事件、案例、数据、企业动态

【判为不相关】满足之一：
- 培训课/研修班/总裁班/招商会/峰会报名等课程或活动招生广告
- 白皮书/资料包/扫码领取/加微信/进群等引流留资(lead-gen)
- 正文无实质内容：空壳、纯导航、纯机构介绍、党建/组织内部活动
- 仅蹭"供应链""保理"等词但实际讲个股/IPO/宏观/其他行业

文章列表：
${articleList}

返回JSON数组，每个元素为 {"index": 序号, "relevant": true/false}。
只返回JSON，不要其他内容。`;

    try {
      const response = await fetch(`${LLM_API_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LLM_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.LLM_MODEL || 'step-3.7-flash',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          temperature: 0.1,
          // flash 模型会先输出长推理链；300 会把 JSON 截断在推理段里，
          // 导致整批解析失败退回纯关键词兜底。
          max_tokens: 2048,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        console.log(`  LLM API error ${response.status}, 保守处理本批：仅高置信关键词命中保留`);
        fallbackOnLLMFailure(batch, results);
        continue;
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
      };
      const raw = data.choices?.[0]?.message?.content || '{}';
      const parsed = parseBatchPayload(raw);
      if (!parsed) {
        console.log(`  Invalid JSON response: ${raw.slice(0, 80).replace(/\s+/g, ' ')}，保守处理本批`);
        fallbackOnLLMFailure(batch, results);
        continue;
      }

      // 解析结果 — 支持 {items: [...]} 或直接 [...]
      const parsedObject = parsed as Record<string, unknown>;
      const items = (Array.isArray(parsed) ? parsed : (parsedObject.items || parsedObject.results || [])) as Array<Record<string, unknown>>;

      for (const item of items) {
        const idx = typeof item.index === 'number' ? item.index - 1 : -1;
        if (idx >= 0 && idx < batch.length) {
          results.set(batch[idx].id, !!item.relevant);
        }
      }

      // 模型漏项时按确定性规则兜底，不能默认为通过。
      fallbackOnLLMFailure(batch, results);
    } catch (error) {
      const msg = (error as Error).message;
      console.log(`  LLM batch error: ${msg.substring(0, 60)}, 保守处理本批：仅高置信关键词命中保留`);
      fallbackOnLLMFailure(batch, results);
    }

    // 批次间 300ms
    if (i + batchSize < articles.length) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  return results;
}

/**
 * LLM 不可用时的保守兜底：不盲目保留，只让命中高置信关键词的文章过关，
 * 其余（不确定但有蹭词嫌疑的）一律淘汰，等下次 LLM 可用时再判。
 */
function fallbackOnLLMFailure(batch: Article[], results: Map<string, boolean>) {
  for (const a of batch) {
    if (!results.has(a.id)) {
      const text = `${a.title} ${a.content || ''} ${a.excerpt || ''}`;
      results.set(a.id, !editorialExclusionReason(a.title, a.link) && matchesTopicSignal(text));
    }
  }
}

export async function runPreFilter() {
  console.log('🔍 Starting pre-filter...\n');

  // 查找最近60天未预筛的文章，支持分页补抓的历史文章进入统一审核。
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, title, link, content, excerpt, source_id')
    .is('pre_filtered', null)
    .gte('pub_date', sixtyDaysAgo.toISOString())
    .order('pub_date', { ascending: false })
    .limit(1500);

  if (error) {
    console.error('Failed to fetch articles:', error);
    throw error;
  }

  if (!articles || articles.length === 0) {
    console.log('No articles to pre-filter.');
    return { passed: 0, filtered: 0, total: 0 };
  }

  console.log(`Found ${articles.length} articles to pre-filter\n`);

  // Phase 1: 关键词快筛
  const passed: string[] = [];
  const filtered: string[] = [];
  const needsLLM: Article[] = [];

  for (const article of articles) {
    const text = `${article.content || ''} ${article.excerpt || ''}`;
    const result = keywordFilter(article.title, text, article.source_id, article.link);

    if (result === true) {
      passed.push(article.id);
    } else if (result === false) {
      filtered.push(article.id);
    } else {
      needsLLM.push(article);
    }
  }

  console.log(`Phase 1 (关键词): ${passed.length} 通过, ${filtered.length} 淘汰, ${needsLLM.length} 待LLM\n`);

  // Phase 2: LLM批量判断
  let llmPassed = 0;
  let llmFiltered = 0;

  if (needsLLM.length > 0) {
    console.log(`Phase 2: LLM批量过滤 ${needsLLM.length} 篇...`);
    const llmResults = await batchFilterWithLLM(needsLLM);

    for (const [id, relevant] of llmResults) {
      if (relevant) {
        passed.push(id);
        llmPassed++;
      } else {
        filtered.push(id);
        llmFiltered++;
      }
    }

    console.log(`Phase 2 (LLM): ${llmPassed} 通过, ${llmFiltered} 淘汰\n`);
  }

  // Phase 3: 批量更新数据库
  const batchSize = 100;

  if (passed.length > 0) {
    for (let i = 0; i < passed.length; i += batchSize) {
      const batch = passed.slice(i, i + batchSize);
      const { error } = await supabase
        .from('articles')
        .update({ pre_filtered: true, status: 'pending', is_selected: false, score: null })
        .in('id', batch);
      if (error) console.error(`Failed to update passed batch:`, error);
    }
  }

  if (filtered.length > 0) {
    for (let i = 0; i < filtered.length; i += batchSize) {
      const batch = filtered.slice(i, i + batchSize);
      const { error } = await supabase
        .from('articles')
        .update({ pre_filtered: false })
        .in('id', batch);
      if (error) console.error(`Failed to update filtered batch:`, error);
    }
  }

  console.log(`\n✅ Pre-filter complete!`);
  console.log(`   通过: ${passed.length} (${(passed.length / articles.length * 100).toFixed(1)}%)`);
  console.log(`   淘汰: ${filtered.length} (${(filtered.length / articles.length * 100).toFixed(1)}%)`);
  console.log(`   总计: ${articles.length}`);

  return {
    passed: passed.length,
    filtered: filtered.length,
    total: articles.length,
  };
}

const isMain = isScriptInvoked(/pre-filter/);
if (isMain) {
  keepProcessAlive(runPreFilter()).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
