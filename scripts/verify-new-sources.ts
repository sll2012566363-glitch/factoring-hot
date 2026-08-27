import { fetch as fetchHtml } from 'undici';
import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
const SOURCES = [
  { id: 'safe', url: 'https://www.safe.gov.cn/safe/whxw/index.html', selector: 'a[title]' },
  { id: 'shanghai-finance', url: 'https://jrj.sh.gov.cn', selector: 'a' },
  { id: 'sasac', url: 'http://www.sasac.gov.cn/n2588025/index.html', selector: 'a' },
  { id: 'thepaper-10pc', url: 'https://www.thepaper.cn/list_25434', selector: "a[href*='newsDetail']" },
  { id: 'jiemian', url: 'https://www.jiemian.com', selector: "a[href*='/article/']" },
];

const NOISE = [/登录|注册|首页|关于我们|联系我们|版权|隐私|免责|网站地图|more|更多|加入我们/i, /javascript:void/, /^#$/, /\.(jpg|png|gif|css|js|pdf|zip)$/i];

async function main() {
for (const source of SOURCES) {
  try {
    const response = await fetchHtml(source.url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'zh-CN,zh;q=0.9' },
      signal: AbortSignal.timeout(12_000),
    });
    const html = await response.text();
    const $ = cheerio.load(html);
    const found: Array<{ title: string; link: string }> = [];
    const seen = new Set<string>();
    $(source.selector).each((_i, el) => {
      const $el = $(el);
      const $link = $el.is('a') ? $el : $el.find('a').first();
      const href = $link.attr('href');
      const textTitle = $link.text().trim().replace(/\s+/g, ' ');
      const attributeTitle = ($link.attr('title') || '').trim().replace(/\s+/g, ' ');
      const title = attributeTitle.length > textTitle.length ? attributeTitle : textTitle;
      if (!href || !title || title.length < 6) return;
      if (NOISE.some(p => p.test(title) || p.test(href))) return;
      let link: string;
      try { link = new URL(href, source.url).href; } catch { return; }
      if (seen.has(link)) return;
      seen.add(link);
      found.push({ title, link });
    });
    console.log(`\n=== ${source.id}: HTTP ${response.status}, 提取 ${found.length} 条 ===`);
    for (const item of found.slice(0, 3)) {
      console.log(`  ${item.title.slice(0, 45)} | ${item.link.slice(0, 80)}`);
    }
  } catch (error) {
    console.log(`\n=== ${source.id}: FAILED — ${(error as Error).message} ===`);
  }
}
}

main();
