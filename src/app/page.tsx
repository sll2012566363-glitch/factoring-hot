import { createClient } from '@supabase/supabase-js';
import HomeClient from '@/components/HomeClient';
import { Article } from '@/types';

// ISR：首屏服务端渲染 + 5 分钟增量再生，兼顾 SEO/首屏速度与数据新鲜度
export const revalidate = 300;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getArticles(): Promise<Article[]> {
  const { data, error } = await supabase
    .from('articles')
    .select(
      'id, title, link, excerpt, content, source_name, category, score, pub_date, ai_reason, scoring_method, cover_image'
    )
    // pre-filter.ts（hourly pipeline 2/5步）判不相关的文章排除展示——
    // 之前这个字段判了但没人读，白判了
    .or('pre_filtered.is.null,pre_filtered.eq.true')
    // 时效优先：未完成 AI 评分的新文章也必须先出现在信息流中。
    .order('pub_date', { ascending: false })
    .order('score', { ascending: false })
    .limit(500);

  if (error || !data) return [];
  // 列表只需摘要级 content，截断控制 HTML 体积
  return data.map((a) => ({
    ...a,
    content: a.content ? a.content.substring(0, 300) : a.content,
  })) as Article[];
}

export default async function Home() {
  const articles = await getArticles();
  return <HomeClient initialArticles={articles} />;
}
