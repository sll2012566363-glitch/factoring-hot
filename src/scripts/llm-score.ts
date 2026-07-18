export {};
import { createClient } from '@supabase/supabase-js';

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
  const prompt = `请对以下保理/供应链金融文章评分(0-100)、生成一句话中文摘要(不超过80字)，并给出一句话选稿理由(中文，不超过80字)说明该文章为何值得入选。

评分维度(各0-20分):
- 前沿解读: 是否有深度分析、专业解读
- 行业前沿模式: 是否涉及业务创新、新模式
- 前沿监管新闻: 是否涉及政策法规变化
- 前沿争议解决: 是否涉及纠纷案例、风险
- 前沿规范文件: 是否为重要规范文件

标题：${article.title}
内容：${contentSnippet || '无内容'}

返回JSON: {"score": 85, "dimensions": {"frontier": 18, "industry_model": 15, "regulatory": 16, "dispute": 12, "normative": 14}, "excerpt": "一句话摘要", "reason": "一句话选稿理由"}`;

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

    return {
      score,
      dimensions: readDimensions(result, score),
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
  console.log('🤖 Starting LLM scoring with DeepSeek...\n');

  if (!LLM_API_KEY) {
    console.error('ERROR: LLM_API_KEY is not set. Export it before running.');
    throw new Error('LLM_API_KEY not set');
  }

  // Fetch articles needing scoring, skipping pre-filtered-out articles
  // Combined OR: (scoring_method IS NULL OR scoring_method = 'rule') AND (pre_filtered IS NULL OR pre_filtered = true)
  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, title, content, excerpt, score')
    .or('and(scoring_method.is.null,or(pre_filtered.is.null,pre_filtered.eq.true)),and(scoring_method.eq.rule,or(pre_filtered.is.null,pre_filtered.eq.true))')
    .limit(Math.min(Math.max(Number(process.env.SCORE_LIMIT) || 200, 1), 200));

  if (error || !articles) {
    console.error('Failed to fetch articles:', error);
    throw error;
  }

  console.log(`Found ${articles.length} articles to score\n`);

  let scored = 0;
  let failed = 0;
  let skipped = 0;
  const concurrency = Math.min(Math.max(Number(process.env.SCORE_CONCURRENCY) || 4, 1), 8);

  const processArticle = async (article: Article, index: number) => {
    const progress = `[${index + 1}/${articles.length}]`;
    console.log(`${progress} ${article.title.substring(0, 50)}...`);

    // Several authoritative sources only expose a list-page summary. Score that
    // summary instead of discarding a current, relevant signal solely because
    // the original page blocks body extraction.
    if ((!article.content || article.content.length < 10) && (!article.excerpt || article.excerpt.length < 10)) {
      const { error: skipError } = await supabase
        .from('articles')
        // The existing database constraint permits only `llm`/`rule`. Keep a
        // null score (so it is not promoted) but use the accepted terminal
        // marker to prevent an hourly retry until body enrichment is improved.
        .update({ scoring_method: 'llm', scored_at: new Date().toISOString() })
        .eq('id', article.id);
      if (skipError) {
        console.log(`  ✗ Skip marker failed: ${skipError.message}\n`);
        failed++;
      } else {
        console.log(`  ⊘ Skipped permanently (no content)\n`);
        skipped++;
      }
      return;
    }

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
  await Promise.all(Array.from({ length: Math.min(concurrency, articles.length) }, async () => {
    while (nextIndex < articles.length) {
      const index = nextIndex++;
      await processArticle(articles[index] as Article, index);
    }
  }));

  console.log(`\n✅ LLM scoring complete!`);
  console.log(`   Scored:  ${scored}`);
  console.log(`   Failed:  ${failed}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Total:   ${articles.length}`);
  if (articles.length > 0 && scored === 0 && failed > 0) {
    throw new Error('All LLM scoring requests failed; refusing to mark the pipeline successful.');
  }
  return { scored, failed, skipped, total: articles.length };
}

const isMain = typeof process !== 'undefined' &&
  process.argv[1] && /llm-score/.test(process.argv[1]);
if (isMain) {
  runScore().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
