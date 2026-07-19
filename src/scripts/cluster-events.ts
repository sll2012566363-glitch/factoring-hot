/**
 * 事件聚类：用标题字符二元组 Jaccard 相似度将同一事件的多篇报道折叠
 * 原则：能用代码处理的，一律不用模型处理
 */
import { createClient } from '@supabase/supabase-js';
import { keepProcessAlive } from '../lib/keep-process-alive';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SIMILARITY_THRESHOLD = 0.42; // 二元组 Jaccard 阈值
const CLUSTER_WINDOW_DAYS = 14;    // 只聚类最近 N 天的文章

// ── Bigram Jaccard Similarity ─────────────────────────

function getBigrams(text: string): Set<string> {
  const bigrams = new Set<string>();
  for (let i = 0; i < text.length - 1; i++) {
    bigrams.add(text.substring(i, i + 2));
  }
  return bigrams;
}

function jaccardSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const setA = getBigrams(a);
  const setB = getBigrams(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const bg of setA) {
    if (setB.has(bg)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

// ── Union-Find for clustering ─────────────────────────

class UnionFind {
  private parent: Map<string, string>;
  private rank: Map<string, number>;

  constructor(items: string[]) {
    this.parent = new Map();
    this.rank = new Map();
    for (const item of items) {
      this.parent.set(item, item);
      this.rank.set(item, 0);
    }
  }

  find(x: string): string {
    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x)!));
    }
    return this.parent.get(x)!;
  }

  union(x: string, y: string): void {
    const rootX = this.find(x);
    const rootY = this.find(y);
    if (rootX === rootY) return;

    const rankX = this.rank.get(rootX) || 0;
    const rankY = this.rank.get(rootY) || 0;

    if (rankX < rankY) {
      this.parent.set(rootX, rootY);
    } else if (rankX > rankY) {
      this.parent.set(rootY, rootX);
    } else {
      this.parent.set(rootY, rootX);
      this.rank.set(rootX, rankX + 1);
    }
  }
}

// ── Main ───────────────────────────────────────────────

export async function runClustering() {
  console.log('🔗 Starting event clustering...\n');

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - CLUSTER_WINDOW_DAYS);

  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, title, source_id, source_name, score, excerpt, link, category, pub_date')
    .not('score', 'is', null)
    .or('pre_filtered.is.null,pre_filtered.eq.true')
    .gte('pub_date', cutoffDate.toISOString())
    .order('score', { ascending: false });

  if (error || !articles) {
    console.error('Failed to fetch articles:', error);
    throw error;
  }

  console.log(`Found ${articles.length} scored articles in the last ${CLUSTER_WINDOW_DAYS} days`);

  if (articles.length === 0) {
    console.log('No articles to cluster.');
    return { clusters: 0, articles: 0 };
  }

  // Build clusters using Union-Find
  const uf = new UnionFind(articles.map(a => a.id));

  for (let i = 0; i < articles.length; i++) {
    for (let j = i + 1; j < articles.length; j++) {
      const sim = jaccardSimilarity(articles[i].title, articles[j].title);
      if (sim >= SIMILARITY_THRESHOLD) {
        uf.union(articles[i].id, articles[j].id);
      }
    }
  }

  // Group articles by cluster root
  const clusterMap = new Map<string, typeof articles>();
  for (const article of articles) {
    const root = uf.find(article.id);
    if (!clusterMap.has(root)) {
      clusterMap.set(root, []);
    }
    clusterMap.get(root)!.push(article);
  }

  console.log(`Found ${clusterMap.size} raw clusters`);

  // Process clusters: only keep clusters with 2+ articles or high-scoring singletons
  let clusterCount = 0;
  const today = new Date().toISOString().split('T')[0];

  for (const [rootId, members] of clusterMap) {
    // Sort by score descending — highest scored article is the primary
    members.sort((a, b) => (b.score || 0) - (a.score || 0));
    const primary = members[0];
    const related = members.slice(1);

    // Get unique sources
    const allSources = members.map(m => m.source_name || m.source_id).filter(Boolean);
    const uniqueSources = [...new Set(allSources)];

    const clusterId = `cluster-${today}-${primary.id.substring(0, 8)}`;

    const clusterData = {
      id: clusterId,
      primary_article_id: primary.id,
      primary_title: primary.title,
      primary_excerpt: primary.excerpt || (primary as any).content?.substring(0, 200) || '',
      primary_score: primary.score,
      primary_link: primary.link,
      primary_source: primary.source_name,
      primary_category: primary.category,
      related_article_ids: related.map(r => r.id),
      related_count: related.length,
      source_count: uniqueSources.length,
      unique_sources: uniqueSources,
      max_score: Math.max(...members.map(m => m.score || 0)),
      avg_score: members.reduce((s, m) => s + (m.score || 0), 0) / members.length,
      cluster_date: today,
    };

    const { error } = await supabase
      .from('topic_clusters')
      .upsert(clusterData);

    if (error) {
      console.error(`Failed to upsert cluster ${clusterId}:`, error.message);
    } else {
      clusterCount++;
      if (members.length > 1) {
        console.log(`  ✓ Cluster: "${primary.title.substring(0, 40)}..." (${members.length}篇, ${uniqueSources.length}信源)`);
      }
    }
  }

  console.log(`\n✅ Clustering complete!`);
  console.log(`   Clusters: ${clusterCount}`);
  console.log(`   Articles processed: ${articles.length}`);

  return { clusters: clusterCount, articles: articles.length };
}

const isMain = typeof process !== 'undefined' &&
  process.argv[1] && /cluster-events/.test(process.argv[1]);
if (isMain) {
  keepProcessAlive(runClustering()).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
