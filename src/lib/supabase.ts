import { createClient } from '@supabase/supabase-js';
import type { Article, Source } from '@/types';

// Public read-only client (anon key, respects RLS)
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Admin client (service role, bypasses RLS) — server-side only
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function getSelectedArticles(limit = 50, offset = 0): Promise<Article[]> {
  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('is_selected', true)
    .order('pub_date', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Error fetching articles:', error);
    return [];
  }

  return data || [];
}

export async function getAllArticles(limit = 50, offset = 0): Promise<Article[]> {
  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('pre_filtered', true)
    .eq('status', 'selected')
    .eq('is_selected', true)
    .order('pub_date', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Error fetching all articles:', error);
    return [];
  }

  return data || [];
}

export async function getArticleById(id: string): Promise<Article | null> {
  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching article:', error);
    return null;
  }

  return data;
}

export async function getArticlesByDate(date: string): Promise<Article[]> {
  const startDate = `${date}T00:00:00`;
  const endDate = `${date}T23:59:59`;

  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('pre_filtered', true)
    .eq('status', 'selected')
    .eq('is_selected', true)
    .gte('pub_date', startDate)
    .lte('pub_date', endDate)
    .order('score', { ascending: false });

  if (error) {
    console.error('Error fetching articles by date:', error);
    return [];
  }

  return data || [];
}

export async function getDailyReport(date: string): Promise<any | null> {
  const { data, error } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('report_date', date)
    .single();

  if (error) {
    console.error('Error fetching daily report:', error);
    return null;
  }

  return data;
}

export async function getSources(): Promise<Source[]> {
  const { data, error } = await supabase
    .from('sources')
    .select('*')
    .eq('active', true)
    .order('priority', { ascending: true });

  if (error) {
    console.error('Error fetching sources:', error);
    return [];
  }

  return data || [];
}
