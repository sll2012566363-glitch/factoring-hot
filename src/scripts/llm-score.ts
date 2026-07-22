export {};
import { createClient } from '@supabase/supabase-js';
import { hasFullContent } from '@/lib/content-quality';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LLM_API_URL = process.env.LLM_API_URL || 'https://api.deepseek.com/v1';
const LLM_API_KEY = process.env.LLM_API_KEY!;
const MODEL = process.env.LLM_MODEL || 'step-3.7-flash';

interface Article {
  id: string;
  title: string;
  content: string;
  excerpt?: string | null;
  content_html?: string | null;
  score: number | null;
}

interface ScoreResult {
  score: number;
  dimensions: {
    frontier: number;
    industry_model: number;
    regulatory: number;
    dispute: number;
    normative: number;
  };
  excerpt: string;
  reason?: string;
}

/** 兼容 StepFun 等 OpenAI-compatible 服务偶发的 Markdown、前缀文本或嵌套 JSON。 */
function parseScorePayload(raw: string): Record<string, unknown> | null {
  const candidates = [raw, raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()];
  const objectStart = raw.indexOf('{');
  const objectEnd = raw.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) candidates.push(raw.slice(objectStart, objectEnd + 1));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch { /* try the next normalized form */ }
  }
  return null;
}

function readScore(payload: Record<string, unknown>): number | null {
  const nested = [payload, payload.data, payload.result].filter((value): value is Record<string, unknown> => !!value && typeof value === 'object');
  for (const value of nested) {
    const score = value.score ?? value['总分'] ?? value['评分'];
    const numeric = typeof score === 'number' ? score : Number(score);
    if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 100) return numeric;
  }
  return null;
}

function readText(payload: Record<string, unknown>, keys: string[]): string {
  const nested = [payload, payload.data, payload.result].filter((value): value is Record<string, unknown> => !!value && typeof value === 'object');
  for (const value of nested) {
    for (const key of keys) {
      const text = value[key];
      if (typeof text === 'string' && text.trim()) return text.trim().substring(0, 200);
    }
  }
  return '';
}

function readDimensions(payload: Record<string, unknown>, score: number): ScoreResult['dimensions'] {
  const fallback = Math.round(score / 5);
  const nested = [payload, payload.data, payload.result].filter((value): value is Record<string, unknown> => !!value && typeof value === 'object');
  const raw = nested.map(value => value.dimensions ?? value['评分维度']).find((value): value is Record<string, unknown> => !!value && typeof value === 'object');
  const value = (key: string) => {
    const numeric = Number(raw?.[key]);
    return Number.isFinite(numeric) ? Math.max(0, Math.min(20, Math.round(numeric))) : fallback;
  };
  return { frontier: value('frontier'), industry_model: value('industry_model'), regulatory: value('regulatory'), dispute: value('dispute'), normative: value('normative') };
}

async function scoreWithDeepSeek(article: Article): Promise<ScoreResult | null> {
  const contentSnippet = (article.content || article.excerpt || '').substring(0, 1000);
  const prompt = `你是保理与供应链金融行业主编。请严格评估以下已收录全文，而不是给出默认中高分。

五维评分各0-20分，score 必须严格等于五维之和：
- frontier：独立分析、专业解释或重要数据
- industry_model：保理/供应链金融业务模式、交易或科技实践
- regulatory：直接涉及保理、应收账款融资、ABS、票据等的监管变化
- dispute：保理/融资租赁等具体争议、案例或风控教训
- normative：可执行的规范文件、政策或司法规则

校准：90+仅限全国性重大规则或多源重大事件；75-89为明确且重要行业信号；55-74为有价值的一般专业内容；低于55为关联弱、重复或信息增量不足。不得因出现“金融”“供应链”等泛词给高分。

标题：${article.title}
内容：${contentSnippet || '无内容'}

返回JSON: {"score": 0, "dimensions": {"frontier": 0, "industry_model": 0, "regulatory": 0, "dispute": 0, "normative": 0}, "excerpt": "基于原文事实的一句话摘要", "reason": "引用原文具体事实的选稿理由"}`;

  try {
    const response = await fetch(`${LLM_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        // step-3.7-flash emits a private reasoning trace before JSON; 500 tokens
        // truncates that trace and leaves message.content empty (finish=length).
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.log(`  API error ${response.status}: ${errBody.substring(0, 100)}`);
      return null;
    }

    const data = await response.json() as {
      choices: Array<{ finish_reason?: string; message: { content?: string; reasoning_content?: string } }>;
    };
    const choice = data.choices?.[0];
    const raw = choice?.message?.content?.trim() || '';
    if (!raw) {
      console.log(`  Empty model content (finish=${choice?.finish_reason ?? 'unknown'}, reasoning=${choice?.message?.reasoning_content?.length ?? 0})`);
      return null;
    }
    const result = parseScorePayload(raw);
    if (!result) {
      console.log(`  Invalid JSON response: ${raw.slice(0, 160).replace(/\s+/g, ' ')}`);
      return null;
    }
    const score = readScore(result);
    if (score === null || score < 0 || score > 100) {
      console.log(`  Invalid score payload: ${JSON.stringify(result).slice(0, 160)}`);
      return null;
    }

    const dimensions = readDimensions(result, score);
    // The dimensions are the auditable score contract. Never preserve a
    // model-provided total that disagrees with its own five explanations.
    const total = Object.values(dimensions).reduce((sum, value) => sum + value, 0);
    return {
      score: total,
      dimensions,
      excerpt: readText(result, ['excerpt', '摘要']),
      reason: readText(result, ['reason', '选稿理由', '推荐理由']),
    };
  } catch (error) {
    const msg = (error as Error).message;
    console.log(`  Request error: ${msg.substring(0, 80)}`);
    return null;
  }
}

export async function runScore() {
  console.log(`🤖 Starting LLM scoring with ${MODEL}...\n`);

  if (!LLM_API_KEY) {
    console.error('ERROR: LLM_API_KEY is not set. Export it before running.');
    throw new Error('LLM_API_KEY not set');
  }

  // `scoring_method` records an attempt, not completion. Enrichment may add a
  // body after an earlier failed attempt, so `score IS NULL` is authoritative.
  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, title, content, content_html, excerpt, score')
    .is('score', null)
    .or('pre_filtered.is.null,pre_filtered.eq.true')
    .or('status.is.null,status.neq.rejected')
    .limit(Math.min(Math.max(Number(process.env.SCORE_LIMIT) || 200, 1), 200));

  if (error || !articles) {
    console.error('Failed to fetch articles:', error);
    throw error;
  }

  const sourceOnly = articles.filter(article => !hasFullContent(article));
  if (sourceOnly.length > 0) {
    await Promise.all(sourceOnly.map(article => supabase.from('articles').update({
      status: 'rejected',
      ai_reason: '正文未达到站内全文标准，仅作为原文线索展示。',
    }).eq('id', article.id)));
  }
  const scoreable = articles.filter(hasFullContent) as Article[];
  console.log(`Found ${scoreable.length} full-text articles to score; ${sourceOnly.length} source-only items skipped\n`);

  let scored = 0;
  let failed = 0;
  let skipped = 0;
  const concurrency = Math.min(Math.max(Number(process.env.SCORE_CONCURRENCY) || 4, 1), 8);

  const processArticle = async (article: Article, index: number) => {
    const progress = `[${index + 1}/${scoreable.length}]`;
    console.log(`${progress} ${article.title.substring(0, 50)}...`);

    const result = await scoreWithDeepSeek(article);

    if (!result) {
      failed++;
      console.log(`  ✗ Failed, keeping existing score\n`);
    } else {
      const updatePayload: Record<string, any> = {
        score: result.score,
        score_dimensions: result.dimensions,
        scoring_method: 'llm',
        scored_at: new Date().toISOString(),
        status: result.score >= 55 ? 'selected' : 'rejected',
        is_selected: result.score >= 55,
      };

      if (result.excerpt) {
        updatePayload.excerpt = result.excerpt;
      }

      if (result.reason) {
        updatePayload.ai_reason = result.reason;
      }

      const { error: updateError } = await supabase
        .from('articles')
        .update(updatePayload)
        .eq('id', article.id);

      if (updateError) {
        console.log(`  ✗ Update failed: ${updateError.message}`);
        failed++;
      } else {
        scored++;
        const dim = result.dimensions;
        console.log(`  ✓ Score: ${result.score} [F:${dim.frontier} M:${dim.industry_model} R:${dim.regulatory} D:${dim.dispute} N:${dim.normative}]`);
        if (result.excerpt) {
          console.log(`    "${result.excerpt.substring(0, 60)}..."`);
        }
        if (result.reason) {
          console.log(`    选稿理由: "${result.reason.substring(0, 60)}..."`);
        }
        console.log('');
      }
    }
  };

  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, scoreable.length) }, async () => {
    while (nextIndex < scoreable.length) {
      const index = nextIndex++;
      await processArticle(scoreable[index], index);
    }
  }));

  console.log(`\n✅ LLM scoring complete!`);
  console.log(`   Scored:  ${scored}`);
  console.log(`   Failed:  ${failed}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Total:   ${scoreable.length}`);
  if (scoreable.length > 0 && scored === 0 && failed > 0) {
    throw new Error('All LLM scoring requests failed; refusing to mark the pipeline successful.');
  }
  return { scored, failed, skipped: skipped + sourceOnly.length, total: scoreable.length };
}

const isMain = typeof process !== 'undefined' &&
  process.argv[1] && /llm-score/.test(process.argv[1]);
if (isMain) {
  // Keep the Node process alive until every concurrent API request and
  // database update has settled. A bare promise chain can otherwise let the
  // CLI exit early while requests are still queued.
  const keepAlive = setInterval(() => undefined, 1000);
  runScore()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => clearInterval(keepAlive));
}
