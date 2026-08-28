export {};
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
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

const AUTHORITY_SOURCE_IDS = new Set<string>(
  (() => {
    try {
      const raw = JSON.parse(readFileSync(path.join(process.cwd(), 'config/sources.json'), 'utf8')) as Array<{ id: string; type: string; active?: boolean }>;
      const sources = Array.isArray(raw) ? raw : (raw as unknown as { sources: Array<{ id: string; type: string }> }).sources;
      return (sources || []).filter(s => ['government', 'association', 'exchange'].includes(s.type)).map(s => s.id);
    } catch {
      return [];
    }
  })(),
);

interface Article {
  id: string;
  title: string;
  source_id?: string;
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

function readDimensions(payload: Record<string, unknown>): ScoreResult['dimensions'] | null {
  const nested = [payload, payload.data, payload.result].filter((value): value is Record<string, unknown> => !!value && typeof value === 'object');
  const raw = nested.map(value => value.dimensions ?? value['评分维度']).find((value): value is Record<string, unknown> => !!value && typeof value === 'object');
  // 五维是审计契约：任一维度缺失即解析失败，绝不以 score/5 均匀填充伪造审计记录。
  if (!raw) return null;
  const value = (key: string) => {
    const numeric = Number(raw?.[key]);
    return Number.isFinite(numeric) ? Math.max(0, Math.min(20, Math.round(numeric))) : null;
  };
  const dims = { frontier: value('frontier'), industry_model: value('industry_model'), regulatory: value('regulatory'), dispute: value('dispute'), normative: value('normative') };
  if (Object.values(dims).some(v => v === null)) return null;
  return dims as ScoreResult['dimensions'];
}

/** 头部 + 尾部拼接：深度分析的结论、数据与风险清单常在文中后段。 */
function buildContentWindow(content: string): string {
  const text = (content || '').replace(/\s+/g, ' ').trim();
  if (text.length <= 3000) return text;
  return `${text.slice(0, 2000)}\n……（中段省略）……\n${text.slice(-1000)}`;
}

/** 官方/协会/交易所信源：白名单文章过预筛后得 0-2 分属异常信号，允许复核。 */
function isAuthoritySource(article: Article): boolean {
  return !!article.source_id && AUTHORITY_SOURCE_IDS.has(article.source_id);
}

export async function scoreWithDeepSeek(article: Article): Promise<ScoreResult | null> {
  const contentSnippet = buildContentWindow(article.content || article.excerpt || '');
  const prompt = `你是保理、供应链金融与融资租赁行业主编。请严格评估以下已收录正文或可靠摘要，而不是给出默认中高分。

五维评分各0-20分，score 必须严格等于五维之和：
- frontier：独立分析、专业解释或重要数据
- industry_model：保理、供应链金融、融资租赁/金融租赁的业务模式、交易或科技实践
- regulatory：直接涉及保理、应收账款融资、ABS、票据、融资租赁/金融租赁的监管变化
- dispute：保理/融资租赁等具体争议、案例或风控教训
- normative：上述行业可执行的规范文件、政策或司法规则

校准：融资租赁/金融租赁是本站明确覆盖的相邻核心领域，不得仅因“不涉及保理”判为无关；但仍须有具体监管、交易、数据、案例或业务实践。五维总分用于区分内容层级，不是传统百分制相关性分。${MUST_READ_MIN_SCORE}+为多维度的重要行业内容；${PUBLISH_MIN_SCORE}-${MUST_READ_MIN_SCORE - 1}为可公开展示的行业动态；低于${PUBLISH_MIN_SCORE}为无关、广告、导航或无实质信息。不得因出现“金融”“供应链”等泛词给分。reason 必须与总分层级一致：score >= ${PUBLISH_MIN_SCORE} 时不得写“不符合收录/入选标准”，应说明其可核验事实及价值边界。

金标锚例（人工核定的期望分数，用于对齐量级）：
【例1 · 78分】"转嫁风险=安全？穿透式审查下，背靠背合同就是一张自证违规的铁证"——结合国资委46号令、74号文十不准、最高法规则与无锡中院判例拆解模式风险 → {frontier:12, industry_model:15, regulatory:18, dispute:16, normative:17}。多监管文件+司法判例+模式拆解的深度分析是本站最高层级内容。
【例2 · 35分】"案例｜飞机融资租赁：承租人逾期付租，出租人可解除合同并优先受偿"——单一生效判例的实务解读 → {frontier:0, industry_model:10, regulatory:0, dispute:15, normative:10}。单一可靠事实、单一维度贡献，是行业动态的典型量级。
【例3 · 0分】"供应链数字化转型助力企业降本增效"——只堆砌大数据/区块链/赋能等泛词、无任何具体监管/交易/数据/案例 → 全维0分。泛词堆砌、口号式展望永远0分。

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

    const dimensions = readDimensions(result);
    if (!dimensions) {
      console.log(`  Incomplete dimensions in payload: ${JSON.stringify(result).slice(0, 160)}`);
      return null;
    }
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
 * 自适应中位数评分：flash 模型在长输入下推理链随机性强（实测同一文章
 * 44/54/70/70，极差 26），temp=0 也无法压住。判定边界带 [3,20) 内的文章
 * 顺序追加两次评分取维度中位数——中位数对单次跑偏的推理链完全免疫；
 * 清晰判定（明确拒绝/明确优质）单评直采控制成本。补评按顺序执行：
 * 三请求并行实测会互相拖慢至 88-90s 并触发超时。
 */
const UNCERTAIN_LOW = 3;
const UNCERTAIN_HIGH = 20;

export async function scoreWithMedian(article: Article): Promise<ScoreResult | null> {
  const first = await scoreWithDeepSeek(article);
  if (!first) return null;
  if (first.score < UNCERTAIN_LOW || first.score >= UNCERTAIN_HIGH) {
    return first;
  }

  const second = await scoreWithDeepSeek(article);
  const third = await scoreWithDeepSeek(article);
  const results = [first, second, third].filter((r): r is ScoreResult => !!r);
  if (results.length === 1) return first;

  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };

  const dims = {
    frontier: median(results.map(r => r.dimensions.frontier)),
    industry_model: median(results.map(r => r.dimensions.industry_model)),
    regulatory: median(results.map(r => r.dimensions.regulatory)),
    dispute: median(results.map(r => r.dimensions.dispute)),
    normative: median(results.map(r => r.dimensions.normative)),
  };
  // 摘要/理由取总分最接近五维中位数之和的那次，保证解释与分数同源。
  const total = Object.values(dims).reduce((sum, value) => sum + value, 0);
  const anchorResult = results.reduce((best, r) =>
    Math.abs(r.score - total) < Math.abs(best.score - total) ? r : best, results[0]);
  console.log(`  ⨯ 边界三评: ${results.map(r => r.score).join('/')} → 中位 ${total}`);
  return { ...anchorResult, score: total, dimensions: dims };
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
    .select('id, title, content, content_html, excerpt, score, pre_filtered, source_id')
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

  const applyResult = async (article: Article, result: ScoreResult) => {
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
  };

  const processArticle = async (article: Article, index: number) => {
    const progress = `[${index + 1}/${scoreable.length}]`;
    console.log(`${progress} ${article.title.substring(0, 50)}...`);

    const result = await scoreWithMedian(article);

    // 白名单专业信源（官方/协会）的文章过了预筛却得到 0-2 分，大概率是推理链
    // 跑偏或超时后部分解析——追评一次，零分误杀不再没有第二次机会。
    if (result && result.score <= 2 && isAuthoritySource(article)) {
      console.log(`  ↻ 专业信源低分复核(${result.score}分)`);
      const retry = await scoreWithDeepSeek(article);
      if (retry && retry.score > 2) {
        console.log(`  ↻ 复核结果 ${retry.score} 分，采纳`);
        await applyResult(article, retry);
        return;
      }
    }

    if (!result) {
      failed++;
      console.log(`  ✗ Failed, keeping existing score\n`);
    } else {
      await applyResult(article, result);
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
  if (scoreable.length > 0 && failed >= Math.max(3, scored)) {
    // Actions runner → 国内 LLM API 的链路间歇性不通（实测 20/21 请求亚秒级
    // fetch failed，仅个别成功）。多数失败必须显式红掉：否则连接性回归被
    // 绿色步骤掩盖。失败文章保持 score IS NULL，下一轮自愈重试。
    throw new Error(`LLM scoring majority failure: ${failed}/${scoreable.length} requests failed (scored ${scored}); marking the pipeline failed so connectivity regressions stay visible.`);
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
