import { createClient } from '@supabase/supabase-js';
import HomeClient from '@/components/HomeClient';
import { Article } from '@/types';
import { partitionByContentQuality } from '@/lib/content-quality';

// 资讯流允许最多 60 秒缓存；抓取任务完成后，用户无需等待长 ISR 周期。
export const revalidate = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getArticles(): Promise<{ full: Article[]; sourceOnly: Article[] }> {
  const { data, error } = await supabase
    .from('articles')
    .select(
      'id, title, link, excerpt, content, content_html, source_name, category, score, pub_date, ai_reason, scoring_method, cover_image'
    )
    // pre-filter.ts（hourly pipeline 2/5步）判不相关的文章排除展示——
    // 之前这个字段判了但没人读，白判了
    .or('pre_filtered.is.null,pre_filtered.eq.true')
    // 时效优先：未完成 AI 评分的新文章也必须先出现在信息流中。
    .order('pub_date', { ascending: false })
    .order('score', { ascending: false })
    .limit(500);

  if (error || !data) return { full: [], sourceOnly: [] };
  const partitioned = partitionByContentQuality(data as Article[]);
  const slim = (items: Article[]) => items.map((a) => ({
    ...a,
    content: a.content ? a.content.substring(0, 300) : a.content,
    content_html: undefined,
  })) as Article[];
  return { full: slim(partitioned.full), sourceOnly: slim(partitioned.sourceOnly) };
}

export default async function Home() {
  const { full, sourceOnly } = await getArticles();
  return <HomeClient initialArticles={full} sourceBriefs={sourceOnly.slice(0, 12)} />;
}
