import OpenAI from 'openai';
import { Article, ScoringConfig, DimensionScore } from '@/types';

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export async function scoreArticle(
  article: Article,
  config: ScoringConfig
): Promise<{ totalScore: number; dimensions: DimensionScore[] } | null> {
  if (!openai) {
    // Fallback to rule-based scoring when no OpenAI key
    return scoreWithRules(article, config);
  }

  try {
    const prompt = buildScoringPrompt(article, config);
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: '你是一个专业的保理与供应链金融资讯评分助手。请根据给定的4个维度对文章进行评分，每个维度0-100分。只返回JSON格式。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) return scoreWithRules(article, config);
    
    const result = JSON.parse(content);
    return {
      totalScore: calculateWeightedScore(result.dimensions, config),
      dimensions: result.dimensions
    };
  } catch (error) {
    console.error(`Scoring error for article ${article.id}:`, error);
    return scoreWithRules(article, config);
  }
}

function scoreWithRules(
  article: Article,
  config: ScoringConfig
): { totalScore: number; dimensions: DimensionScore[] } {
  const title = (article.title || '').toLowerCase();
  const content = (article.content || '').toLowerCase();
  const dimensions: DimensionScore[] = [];
  let totalScore = 0;

  for (const dim of config.dimensions) {
    let score = 30; // base
    for (const kw of dim.keywords) {
      if (title.includes(kw.toLowerCase()) || content.includes(kw.toLowerCase())) {
        score += 10;
      }
    }
    score = Math.min(score, 100);
    dimensions.push({ name: dim.name, score });
    totalScore += score * dim.weight;
  }

  return { totalScore: Math.round(totalScore), dimensions };
}

export async function scoreBatch(
  articles: Article[],
  config: ScoringConfig,
  batchSize: number = 10
): Promise<Map<string, { totalScore: number; dimensions: DimensionScore[] }>> {
  const results = new Map();
  
  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize);
    const batchPromises = batch.map(article => scoreArticle(article, config));
    
    const batchResults = await Promise.allSettled(batchPromises);
    
    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        results.set(batch[index].id, result.value);
      }
    });
    
    // Rate limiting
    if (i + batchSize < articles.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return results;
}

function buildScoringPrompt(article: Article, config: ScoringConfig): string {
  return `请对以下文章进行评分，评估其在保理与供应链金融领域的价值。

文章标题：${article.title}
文章来源：${article.source_name}
文章内容：${article.content || article.title}

请按以下4个维度评分（每个维度0-100分）：
${config.dimensions.map(d => `${d.name}（${d.label}）- 权重${d.weight * 100}%: ${d.description}`).join('\n')}

返回JSON格式：
{
  "dimensions": [
    { "name": "policy_sensitivity", "score": 85 },
    { "name": "market_signal", "score": 70 },
    { "name": "risk_alert", "score": 60 },
    { "name": "innovation", "score": 45 }
  ]
}`;
}

function calculateWeightedScore(dimensions: DimensionScore[], config: ScoringConfig): number {
  return dimensions.reduce((total, dim) => {
    const dimensionConfig = config.dimensions.find(d => d.name === dim.name);
    const weight = dimensionConfig?.weight || 0.25;
    return total + (dim.score * weight);
  }, 0);
}
