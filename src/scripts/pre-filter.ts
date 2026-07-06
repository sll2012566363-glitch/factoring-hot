/**
 * 预筛层：用关键词 + 便宜模型批量判断文章是否与保理/供应链金融相关
 * 无关文章直接标记 pre_filtered=false，后续 enrich/score 跳过
 *
 * 设计原则（对齐 AIHOT）：能用代码处理的，一律不用模型
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LLM_API_URL = process.env.LLM_API_URL || 'https://api.deepseek.com/v1';
const LLM_API_KEY = process.env.LLM_API_KEY || '';

// ─── 高置信度关键词：标题或摘要含这些 → 直接通过 ─────────
const HIGH_CONFIDENCE_KEYWORDS = [
  '保理', '供应链金融', '应收账款', '反向保理', '明保实贷',
  '保理融资', '保理合同', '保理公司', '商业保理', '银行保理',
  '应收账款融资', '应收账款转让', '应收账款ABS', '应收账款资产支持',
  '供应链ABS', '保理ABS', '供应链平台', '产融结合',
  '再保理', '联合保理', '池保理', '暗保理', '公开保理',
  '有追索权保理', '无追索权保理', '保理纠纷', '保理争议',
];

// ─── 中置信度关键词：需要结合上下文判断 ─────────────────
const MEDIUM_CONFIDENCE_KEYWORDS = [
  '资产证券化', 'ABS', 'ABS发行', '资产支持证券',
  '供应链', '产业链', '核心企业', '上下游',
  '票据', '商票', '银票', '承兑汇票',
  '动产融资', '存货融资', '预付款融资',
  '融资租赁', '小额贷款', '融资担保',
  '征信', '中征', '中登', '动产融资统一登记',
  '金融科技', '数字金融', '交易银行',
];

// ─── 排除关键词：含这些且无高/中置信度命中 → 直接淘汰 ─────
const EXCLUDE_KEYWORDS = [
  '娱乐', '明星', '八卦', '综艺', '选秀',
  '体育', '足球', '篮球', '赛事', 'NBA',
  '游戏', '手游', '电竞', '攻略',
  '美食', '菜谱', '烹饪', '餐厅推荐',
  '旅游', '景点', '民宿',
  '养生', '保健', '减肥', '美容',
  '房产', '楼盘', '户型', '装修',
  '汽车', '车型', '试驾', '4S店',
  '股市', '大盘', '涨停', '跌停', '个股推荐',
  '彩票', '中奖', '双色球',
  '婚恋', '相亲', '情感',
];

interface Article {
  id: string;
  title: string;
  content: string | null;
  excerpt: string | null;
  source_id: string;
}

/**
 * 关键词快速过滤
 * @returns true=通过, false=淘汰, null=不确定需LLM
 */
function keywordFilter(title: string, text: string): boolean | null {
  const combined = `${title} ${text}`;

  // 高置信度命中 → 直接通过
  for (const kw of HIGH_CONFIDENCE_KEYWORDS) {
    if (combined.includes(kw)) return true;
  }

  // 检查排除关键词
  let excludeHits = 0;
  for (const kw of EXCLUDE_KEYWORDS) {
    if (combined.includes(kw)) excludeHits++;
  }

  // 中置信度命中 → 如果没被排除则通过
  let mediumHits = 0;
  for (const kw of MEDIUM_CONFIDENCE_KEYWORDS) {
    if (combined.includes(kw)) mediumHits++;
  }

  if (mediumHits >= 2 && excludeHits === 0) return true;
  if (mediumHits >= 1 && excludeHits === 0) return null; // 需要LLM确认
  if (excludeHits >= 2 && mediumHits === 0) return false;

  return null; // 交给LLM判断
}

/**
 * 批量LLM过滤：一次发10篇标题，让模型判断是否跟保理/供应链金融相关
 */
async function batchFilterWithLLM(articles: Article[]): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();

  if (!LLM_API_KEY) {
    console.log('  ⚠ LLM_API_KEY not set, skipping LLM filter (keeping all)');
    for (const a of articles) results.set(a.id, true);
    return results;
  }

  // 分批处理，每批10篇
  const batchSize = 10;
  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize);

    const articleList = batch.map((a, idx) =>
      `${idx + 1}. [${a.source_id}] ${a.title}`
    ).join('\n');

    const prompt = `判断以下文章标题是否与"保理"或"供应链金融"行业相关。

相关范围包括：保理业务、应收账款融资、供应链金融、资产证券化(ABS)、供应链平台、核心企业融资、票据融资、供应链风控、金融监管(涉及保理/供应链金融的)、供应链金融纠纷案例。

不相关：与金融/供应链完全无关的娱乐、体育、生活类内容。

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
          max_tokens: 300,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        console.log(`  LLM API error ${response.status}, keeping all articles in batch`);
        for (const a of batch) results.set(a.id, true);
        continue;
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
      };
      const raw = data.choices?.[0]?.message?.content || '{}';
      const parsed = JSON.parse(raw);

      // 解析结果 — 支持 {items: [...]} 或直接 [...]
      const items = Array.isArray(parsed) ? parsed : (parsed.items || parsed.results || []);

      for (const item of items) {
        const idx = typeof item.index === 'number' ? item.index - 1 : -1;
        if (idx >= 0 && idx < batch.length) {
          results.set(batch[idx].id, !!item.relevant);
        }
      }

      // 未返回结果的默认保留
      for (const a of batch) {
        if (!results.has(a.id)) results.set(a.id, true);
      }
    } catch (error) {
      const msg = (error as Error).message;
      console.log(`  LLM batch error: ${msg.substring(0, 60)}, keeping all`);
      for (const a of batch) results.set(a.id, true);
    }

    // 批次间 300ms
    if (i + batchSize < articles.length) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  return results;
}

export async function runPreFilter() {
  console.log('🔍 Starting pre-filter...\n');

  // 查找最近30天未预筛的文章
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, title, content, excerpt, source_id')
    .is('pre_filtered', null)
    .gte('pub_date', thirtyDaysAgo.toISOString())
    .order('pub_date', { ascending: false })
    .limit(1000);

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
    const result = keywordFilter(article.title, text);

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
        .update({ pre_filtered: true })
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

const isMain = typeof process !== 'undefined' &&
  process.argv[1] && /pre-filter/.test(process.argv[1]);
if (isMain) {
  runPreFilter().catch(console.error);
}
