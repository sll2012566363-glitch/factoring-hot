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

async function scoreWithDeepSeek(article: Article): Promise<ScoreResult | null> {
  const contentSnippet = (article.content || '').substring(0, 1000);
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
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.log(`  API error ${response.status}: ${errBody.substring(0, 100)}`);
      return null;
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content || '{}';
    const result = JSON.parse(raw);

    const score = typeof result.score === 'number' ? result.score : null;
    if (score === null || score < 0 || score > 100) {
      console.log(`  Invalid score returned: ${result.score}`);
      return null;
    }

    return {
      score,
      dimensions: result.dimensions || {
        frontier: Math.round(score / 5),
        industry_model: Math.round(score / 5),
        regulatory: Math.round(score / 5),
        dispute: Math.round(score / 5),
        normative: Math.round(score / 5),
      },
      excerpt: (result.excerpt || '').substring(0, 200),
      reason: (result.reason || '').substring(0, 200),
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
    .select('id, title, content, score')
    .or('and(scoring_method.is.null,or(pre_filtered.is.null,pre_filtered.eq.true)),and(scoring_method.eq.rule,or(pre_filtered.is.null,pre_filtered.eq.true))')
    .limit(200);

  if (error || !articles) {
    console.error('Failed to fetch articles:', error);
    throw error;
  }

  console.log(`Found ${articles.length} articles to score\n`);

  let scored = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i] as Article;
    const progress = `[${i + 1}/${articles.length}]`;
    console.log(`${progress} ${article.title.substring(0, 50)}...`);

    // Skip articles with no content at all
    if (!article.content || article.content.length < 10) {
      console.log(`  ⊘ Skipped (no content)\n`);
      skipped++;
      continue;
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

    // 500ms delay between API calls
    if (i < articles.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log(`\n✅ LLM scoring complete!`);
  console.log(`   Scored:  ${scored}`);
  console.log(`   Failed:  ${failed}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Total:   ${articles.length}`);
  return { scored, failed, skipped, total: articles.length };
}

const isMain = typeof process !== 'undefined' &&
  process.argv[1] && /llm-score/.test(process.argv[1]);
if (isMain) {
  runScore().catch(console.error);
}
