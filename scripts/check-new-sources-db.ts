// One-off: check DB state for the new sources added on 2026-08-27
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const NEW_IDS = ['safe', 'shanghai-finance', 'sasac', 'thepaper-10pc', 'jiemian'];

async function main() {
const { data: sources } = await supabase
  .from('sources')
  .select('id, name, active, last_fetch_status, last_fetch_error, last_fetch_article_count, last_fetch_new_article_count')
  .in('id', NEW_IDS);

console.log('=== 新信源状态 ===');
for (const s of sources || []) {
  console.log(`${s.id} [${s.active ? 'active' : 'off'}] fetch=${s.last_fetch_status ?? '-'} 抓取=${s.last_fetch_article_count ?? '-'} 新增=${s.last_fetch_new_article_count ?? '-'} err=${s.last_fetch_error?.slice(0, 60) ?? '-'}`);
}

const { count } = await supabase
  .from('articles')
  .select('id', { count: 'exact', head: true })
  .in('source_id', NEW_IDS);
console.log(`\n新信源累计入库文章: ${count ?? 0}`);

const { data: recent } = await supabase
  .from('articles')
  .select('title, source_id, published_at, status')
  .in('source_id', NEW_IDS)
  .order('published_at', { ascending: false })
  .limit(10);
console.log('\n=== 最新入库 ===');
for (const a of recent || []) {
  console.log(`[${a.source_id}] ${a.status} | ${a.title?.slice(0, 50)}`);
}
}

main();
