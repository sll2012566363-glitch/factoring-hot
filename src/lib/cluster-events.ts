import OpenAI from 'openai';
import { Article } from '@/types';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export interface ClusterResult {
  id: string;
  event_title: string;
  summary: string;
  article_ids: string[];
  created_at: string;
}

export async function clusterArticles(
  articles: Article[],
  similarityThreshold: number = 0.75
): Promise<ClusterResult[]> {
  if (articles.length === 0) return [];
  
  try {
    // Generate embeddings for all articles
    const embeddings = await generateEmbeddings(articles);
    
    // Calculate similarity matrix
    const clusters = performClustering(articles, embeddings, similarityThreshold);
    
    // Generate cluster titles using LLM
    const enrichedClusters = await enrichClustersWithLLM(clusters, articles);
    
    return enrichedClusters;
  } catch (error) {
    console.error('Clustering error:', error);
    return [];
  }
}

async function generateEmbeddings(articles: Article[]): Promise<number[][]> {
  const texts = articles.map(a => `${a.title}\n\n${a.content || ''}`.slice(0, 8000));
  
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts
  });
  
  return response.data.map(item => item.embedding);
}

function performClustering(
  articles: Article[],
  embeddings: number[][],
  threshold: number
): { articles: Article[]; centroid: number[] }[] {
  const clusters: { articles: Article[]; centroid: number[] }[] = [];
  const used = new Set<number>();
  
  for (let i = 0; i < articles.length; i++) {
    if (used.has(i)) continue;
    
    const cluster = {
      articles: [articles[i]],
      centroid: embeddings[i]
    };
    used.add(i);
    
    for (let j = i + 1; j < articles.length; j++) {
      if (used.has(j)) continue;
      
      const similarity = cosineSimilarity(embeddings[i], embeddings[j]);
      if (similarity > threshold) {
        cluster.articles.push(articles[j]);
        used.add(j);
      }
    }
    
    if (cluster.articles.length >= 2) {
      clusters.push(cluster);
    }
  }
  
  return clusters;
}

async function enrichClustersWithLLM(
  clusters: { articles: Article[]; centroid: number[] }[],
  allArticles: Article[]
): Promise<ClusterResult[]> {
  const results: ClusterResult[] = [];
  
  for (const cluster of clusters) {
    const titles = cluster.articles.map(a => a.title).join('\n');
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: '你是保理行业编辑。请为以下相关文章集群生成一个简洁的事件标题（10-20字）和一句话摘要。返回JSON格式。'
        },
        {
          role: 'user',
          content: `文章列表：
${titles}

请返回JSON：
{
  "event_title": "事件标题",
  "summary": "事件摘要"
}`
        }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });
    
    const content = response.choices[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content);
      results.push({
        id: `cluster-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        event_title: parsed.event_title,
        summary: parsed.summary,
        article_ids: cluster.articles.map(a => a.id),
        created_at: new Date().toISOString()
      });
    }
  }
  
  return results;
}

function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  if (magA === 0 || magB === 0) return 0;
  return dotProduct / (magA * magB);
}
