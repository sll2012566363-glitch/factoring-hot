import { createClient } from '@supabase/supabase-js';
import { fetch as undiciFetch } from 'undici';
import * as cheerio from 'cheerio';
import { extractContentHtml, extractPlainText } from '../lib/extract-content';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// --force / FORCE=1：重刷所有文章并同步修复脏 content/excerpt；默认只补 content_html 为空的
// --offset N / --limit N：分批
const FORCE = process.argv.includes('--force') || process.env.FORCE === '1';
const offsetArg = process.argv.indexOf('--offset');
const OFFSET = offsetArg > -1 ? parseInt(process.argv[offsetArg + 1], 10) || 0 : 0;
const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg > -1 ? parseInt(process.argv[limitArg + 1], 10) || 500 : 500;
const CONCURRENCY = 6;

/** 旧 content/excerpt 是否为垃圾（PDF 二进制流 / 站点样板文案） */
const DIRTY_RE = /(版权所有|All Rights Reserved|ICP备\s*\d|广告招商|客服邮箱|您当前的位置)/;
function isDirtyText(s: string | null): boolean {
  if (!s) return false;
  const head = s.trimStart().substring(0, 200);
  return head.startsWith('%PDF') || DIRTY_RE.test(head);
}

/** 纯文本截断到句边界 */
function capAtSentence(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.lastIndexOf('。', max);
  return s.substring(0, cut > max * 0.5 ? cut + 1 : max);
}

interface Row {
  id: string;
  title: string;
  link: string;
  content: string | null;
  excerpt: string | null;
  scoring_method: string | null;
}

let updated = 0, cleaned = 0, failed = 0, done = 0;

async function processOne(a: Row, total: number): Promise<void> {
  const progress = () => `[${++done}/${total}]`;
  try {
    const response = await undiciFetch(a.link, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
    });

    let contentHtml = '';
    let coverImage: string | null = null;

    if (response.ok) {
      const ct = (response.headers.get('content-type') || '').toLowerCase();
      const isHtml = ct.includes('text/') || ct.includes('html') || ct.includes('xml');
      if (isHtml) {
        const html = await response.text();
        if (!html.trimStart().startsWith('%PDF')) {
          const $ = cheerio.load(html);
          const r = extractContentHtml($, a.link);
          contentHtml = r.html;
          coverImage = r.coverImage;
        }
      }
    }

    if (contentHtml.length >= 50) {
      // 提取成功：写 content_html + 重算纯文本 content + 修脏 excerpt
      const plainText = extractPlainText(contentHtml);
      const payload: Record<string, any> = {
        content_html: contentHtml,
        content: capAtSentence(plainText, 5000),
      };
      if (coverImage) payload.cover_image = coverImage;
      // LLM 摘要保留，其余（空/脏/规则截取）用干净正文重切
      const keepExcerpt = a.scoring_method === 'llm' && a.excerpt && a.excerpt.length > 10 && !isDirtyText(a.excerpt);
      if (!keepExcerpt) {
        payload.excerpt = capAtSentence(plainText, 200);
      }

      const { error } = await supabase.from('articles').update(payload).eq('id', a.id);
      if (error) { failed++; console.log(`${progress()} ✗ DB ${error.message}`); return; }
      updated++;
      const imgCount = (contentHtml.match(/<img/g) || []).length;
      console.log(`${progress()} ✓ ${a.title.substring(0, 32)} (${imgCount} imgs)`);
    } else if (FORCE) {
      // 无有效正文：清 content_html；旧 content/excerpt 是垃圾也一并清
      const payload: Record<string, any> = { content_html: null };
      if (isDirtyText(a.content)) payload.content = null;
      if (isDirtyText(a.excerpt)) payload.excerpt = null;
      await supabase.from('articles').update(payload).eq('id', a.id);
      cleaned++;
      console.log(`${progress()} 🧹 无有效正文，清理 ${a.title.substring(0, 32)}`);
    } else {
      failed++;
      console.log(`${progress()} ✗ 无有效正文 ${a.title.substring(0, 32)}`);
    }
  } catch (err) {
    failed++;
    console.log(`${progress()} ✗ ${(err as Error).message.substring(0, 50)} ${a.title.substring(0, 24)}`);
  }
}

async function main() {
  console.log(`🔄 回填 content_html ${FORCE ? '(FORCE 全量重刷+清脏)' : ''} offset=${OFFSET} limit=${LIMIT} 并发=${CONCURRENCY}\n`);

  let query = supabase
    .from('articles')
    .select('id, title, link, content, excerpt, scoring_method')
    .order('pub_date', { ascending: false })
    .range(OFFSET, OFFSET + LIMIT - 1);
  if (!FORCE) {
    query = query.is('content_html', null).not('content', 'is', null).neq('content', '');
  }
  const { data: articles, error } = await query;

  if (error) { console.error(error); return; }
  const list = (articles || []) as Row[];
  console.log(`需要回填: ${list.length} 条\n`);

  // 并发 worker 池
  let cursor = 0;
  async function worker() {
    while (cursor < list.length) {
      const a = list[cursor++];
      await processOne(a, list.length);
      await new Promise(r => setTimeout(r, 200));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log(`\n✅ 回填完成! 成功: ${updated}, 清理: ${cleaned}, 失败: ${failed}, 总计: ${list.length}`);
}

main().catch(console.error);
