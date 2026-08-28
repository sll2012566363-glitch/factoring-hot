export {};
import { createClient } from '@supabase/supabase-js';
import { assessContentQuality, contentQualityFields } from '@/lib/content-quality';
import {
  applyObjectiveNewsFloor,
  decideSelection,
  MUST_READ_MIN_SCORE,
  normalizeSelectionReason,
  PUBLISH_MIN_SCORE,
  SIGNAL_MIN_SCORE,
} from '@/lib/content-policy';
import { isScriptInvoked } from '@/lib/script-entry';

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
  pre_filtered: boolean | null;
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
  const prompt = `你是保理、供应链金融与融资租赁行业主编。请严格评估以下已收录正文或可靠摘要，而不是给出默认中高分。

五维评分各0-20分，score 必须严格等于五维之和：
- frontier：独立分析、专业解释或重要数据
- industry_model：保理、供应链金融、融资租赁/金融租赁的业务模式、交易或科技实践
- regulatory：直接涉及保理、应收账款融资、ABS、票据、融资租赁/金融租赁的监管变化
- dispute：保理/融资租赁等具体争议、案例或风控教训
- normative：上述行业可执行的规范文件、政策或司法规则

校准：融资租赁/金融租赁是本站明确覆盖的相邻核心领域，不得仅因“不涉及保理”判为无关；但仍须有具体监管、交易、数据、案例或业务实践。五维总分用于区分内容层级，不是传统百分制相关性分。${MUST_READ_MIN_SCORE}+为多维度的重要行业内容；${PUBLISH_MIN_SCORE}-${MUST_READ_MIN_SCORE - 1}为可公开展示的行业动态；低于${PUBLISH_MIN_SCORE}为无关、广告、导航或无实质信息。不得因出现“金融”“供应链”等泛词给分。reason 必须与总分层级一致：score >= ${PUBLISH_MIN_SCORE} 时不得写“不符合收录/入选标准”，应说明其可核验事实及价值边界。

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
        // temp=0.3 caused ±20-point score swings on identical articles;
        // temp=0 keeps repeat variance within ~4 points.
        temperature: 0,
        // step-3.7-flash emits a long private reasoning trace before JSON.
        // 4096 still truncates some responses at 7k+ reasoning characters.
        max_tokens: 8192,
      }),
      // Measured 25-43s per request; 45s aborted slow requests and left
      // articles stuck at score IS NULL forever.
      signal: AbortSignal.timeout(90000),
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

/**
 * 边缘文章二次复核：首次得分落在发布线 ±5 分内（收录/拒绝的分界带），
 * 追加一次评分并取维度均值，抵消单次采样在判定边界上的抖动。
 */
async function scoreWithConfirmation(article: Article): Promise<ScoreResult | null> {
  const first = await scoreWithDeepSeek(article);
  if (!first) return null;
  if (first.score < PUBLISH_MIN_SCORE - 5 || first.score > PUBLISH_MIN_SCORE + 5) {
    return first;
  }
  const second = await scoreWithDeepSeek(article);
  if (!second) return first;
  const averaged: ScoreResult['dimensions'] = {
    frontier: Math.round((first.dimensions.frontier + second.dimensions.frontier) / 2),
    industry_model: Math.round((first.dimensions.industry_model + second.dimensions.industry_model) / 2),
    regulatory: Math.round((first.dimensions.regulatory + second.dimensions.regulatory) / 2),
    dispute: Math.round((first.dimensions.dispute + second.dimensions.dispute) / 2),
    normative: Math.round((first.dimensions.normative + second.dimensions.normative) / 2),
  };
  const total = Object.values(averaged).reduce((sum, value) => sum + value, 0);
  console.log(`  ↻ 边缘复核: ${first.score} / ${second.score} → 均值 ${total}`);
  return { ...first, score: total, dimensions: averaged };
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
    .select('id, title, content, content_html, excerpt, score, pre_filtered')
    .is('score', null)
    .eq('pre_filtered', true)
    .or('status.is.null,status.neq.rejected')
    .limit(Math.min(Math.max(Number(process.env.SCORE_LIMIT) || 200, 1), 200));

  if (error || !articles) {
    console.error('Failed to fetch articles:', error);
    throw error;
  }

  const scoreable = articles.filter(article => assessContentQuality(article).tier !== 'external') as Article[];
  const scoreableIds = new Set(scoreable.map(article => article.id));
  const unscoreable = articles.filter(article => !scoreableIds.has(article.id));
  if (unscoreable.length > 0) {
    await Promise.all(unscoreable.map(article => supabase.from('articles').update({
      status: 'rejected', is_selected: false,
      ai_reason: '未取得足以核验行业相关性的正文或摘要。',
    }).eq('id', article.id)));
  }
  console.log(`Found ${scoreable.length} articles with full text or usable summaries to score; ${unscoreable.length} empty items skipped\n`);

  let scored = 0;
  let failed = 0;
  let skipped = 0;
  const concurrency = Math.min(Math.max(Number(process.env.SCORE_CONCURRENCY) || 2, 1), 8);

  const processArticle = async (article: Article, index: number) => {
    const progress = `[${index + 1}/${scoreable.length}]`;
    console.log(`${progress} ${article.title.substring(0, 50)}...`);

    const result = await scoreWithConfirmation(article);

    if (!result) {
      failed++;
      console.log(`  ✗ Failed, keeping existing score\n`);
    } else {
      const objective = applyObjectiveNewsFloor(article, result.score, result.dimensions);
      const decision = decideSelection({
        ...article,
        score: objective.score,
        scoring_method: 'llm',
        ai_reason: result.reason,
      });
      const updatePayload: Record<string, any> = {
        score: objective.score,
        score_dimensions: objective.dimensions,
        scoring_method: 'llm',
        scored_at: new Date().toISOString(),
        status: decision.status,
        is_selected: decision.isSelected,
        ...contentQualityFields(article),
      };

      if (result.excerpt) {
        updatePayload.excerpt = result.excerpt;
      }

      const normalizedReason = normalizeSelectionReason(objective.score, result.reason, result.excerpt);
      if (normalizedReason) {
        updatePayload.ai_reason = normalizedReason;
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
        const dim = objective.dimensions;
        const calibrationNote = objective.score !== result.score ? ` (objective floor from ${result.score})` : '';
        console.log(`  ✓ Score: ${objective.score}${calibrationNote} [F:${dim.frontier} M:${dim.industry_model} R:${dim.regulatory} D:${dim.dispute} N:${dim.normative}]`);
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
  return { scored, failed, skipped: skipped + unscoreable.length, total: scoreable.length };
}

const isMain = isScriptInvoked(/llm-score/);
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
