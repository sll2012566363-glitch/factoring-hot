import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

interface Article {
  id: string;
  title: string;
  content: string;
  category: string;
}

interface ScoreResult {
  score: number;
  dimensions: any;
  method: 'llm' | 'rule';
  excerpt: string;
}

async function scoreWithLLM(article: Article): Promise<ScoreResult> {
  if (!openai) {
    return scoreWithRules(article);
  }

  try {
    const prompt = `请对以下保理/供应链金融行业文章进行评分（0-100分）并生成一句话摘要。

标题：${article.title}
内容：${article.content?.substring(0, 1000) || '无内容'}
分类：${article.category}

评分维度（各0-20分，总分0-100）：
1. 前沿解读（frontier）：是否提供行业前沿趋势的深度解读
2. 行业前沿模式（industry_model）：是否反映行业前沿模式、商业模式创新、新技术应用
3. 前沿监管新闻（regulatory）：是否涉及监管政策、法规变化、合规要求
4. 前沿争议解决（dispute）：是否涉及行业风险、争议案例、合规问题
5. 前沿规范文件（normative）：是否涉及规范性文件、行业标准、政策指导

同时请生成一句话中文摘要（不超过50字），概括文章核心内容。

返回JSON格式：{"score": 85, "dimensions": {"frontier": 18, "industry_model": 17, "regulatory": 18, "dispute": 16, "normative": 16}, "excerpt": "央行发布保理行业新规，要求..."}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    return {
      score: result.score || 50,
      dimensions: result.dimensions || {},
      method: 'llm',
      excerpt: (result.excerpt || '').substring(0, 200),
    };
  } catch (error) {
    console.error(`LLM scoring failed for ${article.id}:`, error);
    return scoreWithRules(article);
  }
}

function scoreWithRules(article: Article): ScoreResult {
  let score = 50;
  const dimensions = {
    frontier: 10,
    industry_model: 10,
    regulatory: 10,
    dispute: 10,
    normative: 10
  };

  const title = article.title.toLowerCase();
  const content = (article.content || '').toLowerCase();

  const frontierKeywords = ['前沿', '解读', '趋势', '展望', '深度分析'];
  const industryModelKeywords = ['abs', '供应链金融', '保理', '融资', '规模', '增长', '商业模式', '数字化转型'];
  const regulatoryKeywords = ['监管', '办法', '规定', '通知', '银保监会', '人民银行', '金融监管', '法规', '政策'];
  const disputeKeywords = ['风险', '违规', '处罚', '警示', '案例', '争议', '纠纷', '仲裁'];
  const normativeKeywords = ['规范', '标准', '指引', '指导意见', '管理办法', '条例'];

  frontierKeywords.forEach(kw => {
    if (title.includes(kw) || content.includes(kw)) {
      score += 4;
      dimensions.frontier += 3;
    }
  });

  industryModelKeywords.forEach(kw => {
    if (title.includes(kw) || content.includes(kw)) {
      score += 3;
      dimensions.industry_model += 2;
    }
  });

  regulatoryKeywords.forEach(kw => {
    if (title.includes(kw) || content.includes(kw)) {
      score += 5;
      dimensions.regulatory += 3;
    }
  });

  disputeKeywords.forEach(kw => {
    if (title.includes(kw) || content.includes(kw)) {
      score += 4;
      dimensions.dispute += 3;
    }
  });

  normativeKeywords.forEach(kw => {
    if (title.includes(kw) || content.includes(kw)) {
      score += 4;
      dimensions.normative += 3;
    }
  });

  // Generate a simple rule-based excerpt: first sentence or first 80 chars
  const excerpt = generateRuleExcerpt(article);

  return { score: Math.min(score, 100), dimensions, method: 'rule', excerpt };
}

/** Generate a simple excerpt by extracting the first sentence from content */
function generateRuleExcerpt(article: Article): string {
  const content = article.content || '';
  // Try to find the first sentence ending with Chinese/English punctuation
  const sentenceMatch = content.match(/^.{10,120}?[。！？.!?]/);
  if (sentenceMatch) {
    return sentenceMatch[0].substring(0, 200);
  }
  // Fallback: use title + truncated content
  if (content.length > 0) {
    return content.substring(0, 100).replace(/\n/g, ' ').trim() + '...';
  }
  return article.title;
}

async function main() {
  console.log('🚀 Starting scoring...\n');

  const { data: articles, error } = await supabase
    .from('articles')
    .select('*')
    .is('score', null)
    .limit(1000);

  if (error || !articles) {
    console.error('Failed to fetch articles:', error);
    process.exit(1);
  }

  console.log(`📊 Scoring ${articles.length} articles...\n`);

  for (const article of articles) {
    const { score, dimensions, method, excerpt } = await scoreWithLLM(article);

    const updatePayload: Record<string, any> = {
      score,
      score_dimensions: dimensions,
      scored_at: new Date().toISOString(),
      scoring_method: method,
    };

    // Only set excerpt if the article doesn't already have one
    if (excerpt) {
      updatePayload.excerpt = excerpt;
    }

    const { error: updateError } = await supabase
      .from('articles')
      .update(updatePayload)
      .eq('id', article.id);

    if (updateError) {
      console.error(`Failed to update ${article.id}:`, updateError);
    } else {
      console.log(`✓ ${article.title.substring(0, 40)}... (${score}分)`);
    }
  }

  console.log('\n✅ Scoring complete!');
}

main().catch(console.error);
