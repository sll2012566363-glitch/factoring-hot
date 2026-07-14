import * as cheerio from 'cheerio';

/**
 * 统一的正文 HTML 提取（page.tsx 实时抓取 / enrich-articles / backfill-html 共用）。
 * wx-kit 思路：找到内容容器取 innerHTML，保留原始结构与图片；
 * 多源适配：多选择器 + 噪音清理 + 链接密度剪枝 + <p> 拼接降级。
 */

export const CONTENT_SELECTORS = [
  'article', '.article-content', '.content', '#content',
  '.post-body', '.entry-content', '.TRS_Editor', '.text',
  '.detail-content', '.news-content',
];

export const REMOVE_SELECTORS = [
  // 按标签名
  'script', 'style', 'nav', 'header', 'footer', 'aside', 'form',
  'iframe', 'button', 'input', 'select',
  // 广告与侧栏
  '.ad', '.advertisement', '.sidebar', '.comment', '.comments',
  '.share', '.social-share', '.related',
  // 面包屑与分页
  '.breadcrumb', '.crumb', '.pagination', '.copyright',
  // 工具栏
  '.toolbar', '.topbar', '.login', '.search-box', '.position', '.path',
  // 中文新闻站常见导航栏容器（class/id 含这些关键词的一律当导航删）
  '[class*="top-bar"]', '[class*="topbar"]', '[class*="nav-bar"]', '[class*="navbar"]',
  '[class*="user-nav"]', '[class*="userNav"]', '[class*="head-nav"]', '[class*="headnav"]',
  '[class*="site-nav"]', '[class*="sitenav"]', '[class*="main-nav"]', '[class*="mainnav"]',
  '[id*="top-bar"]', '[id*="topbar"]', '[id*="nav-bar"]', '[id*="navbar"]',
  '[class*="login-bar"]', '[class*="loginbar"]', '[class*="member-bar"]',
  '[class*="tool-bar"]', '[class*="toolbar"]', '[class*="func-bar"]',
  '[class*="subscription"]', '[class*="subscribe"]', '[class*="activate"]',
  '[class*="cart"]', '[class*="shopping"]',
  '[class*="jigou"]',   /* 经观智讯等机构入口 */
  '[class*="smart-news"]', '[class*="smartinfo"]',
].join(', ');

/** 链接密度剪枝：文本大半是链接的块（导航/页脚/推荐列表）直接删 */
function pruneLinkDenseBlocks($: cheerio.CheerioAPI, $root: any) {
  $root.children().each((_i: number, el: any) => {
    const $el = $(el);
    const text = $el.text().replace(/\s+/g, ' ').trim();
    if (text.length < 30) return;
    const links = $el.find('a');
    if (links.length < 5) return;
    let linkTextLen = 0;
    links.each((_j: number, a: any) => {
      linkTextLen += $(a).text().replace(/\s+/g, ' ').trim().length;
    });
    if (linkTextLen / text.length > 0.6) {
      $el.remove();
    } else {
      // 递归一层，处理"大容器里嵌着导航块"的情况
      pruneLinkDenseBlocks($, $el);
    }
  });
}

/** 页脚/样板文案剪枝：版权声明、备案号等站点固定话术 */
const BOILERPLATE_RE = /(版权所有|All Rights Reserved|ICP备\s*\d|公网安备|广告招商|客服邮箱|未经授权\s*不得转载|免责声明|您当前的位置|当前位置[:：]|扫一扫在手机打开|分享到[:：]?|责任编辑[:：]|上一篇[:：]?|下一篇[:：]?)/;
function pruneBoilerplate($: cheerio.CheerioAPI, $root: any) {
  $root.find('p, div, section, span').each((_i: number, el: any) => {
    const $el = $(el);
    const text = $el.text().replace(/\s+/g, ' ').trim();
    if (text.length > 0 && text.length < 300 && BOILERPLATE_RE.test(text)) {
      $el.remove();
    }
  });
}

/**
 * 前缀噪音剥离：正文容器顶部常混入导航栏/登录栏/订阅栏等非正文元素。
 * 从容器头部逐个检查直接子元素，命中导航特征则删除，直到遇到真正的正文内容。
 *
 * 导航特征：
 *  - 文本含 登录/注册/退出/激活/订阅/购物车/电子版 等关键词
 *  - 文本极短（<30字符）且包含链接
 *  - 元素 class/id 含 nav/top-bar/login/head/member/tool/cart 等
 */
const NAV_KEYWORDS = /登录|注册|退出|激活|电子版|购物车|经观智讯|智讯|Subscribe|subscribe|Login|login|Register|Sign\s*in|Cart|cart|会员|VIP/;
function stripLeadingNoise($: cheerio.CheerioAPI, $root: any): void {
  // 最多剥前 8 个子元素，防止误删正文
  let stripped = 0;
  const MAX_STRIP = 8;

  $root.children().each((_i: number, el: any) => {
    if (stripped >= MAX_STRIP) return false; // 停止遍历

    const $el = $(el);
    const tag = el.tagName?.toLowerCase() || '';
    const cls = ($el.attr('class') || '') + ' ' + ($el.attr('id') || '');
    const text = $el.text().replace(/\s+/g, ' ').trim();
    const linkCount = $el.find('a').length;
    const imgCount = $el.find('img').length;

    // 有真实内容的元素（长文本 / 含图）→ 停止剥离
    if (text.length > 80 || imgCount > 0) return false;

    // 导航特征命中 → 删除
    const isNavLike =
      NAV_KEYWORDS.test(text) ||
      NAV_KEYWORDS.test(cls) ||
      /(nav|top-?bar|head-?nav|user-?nav|login-?bar|tool-?bar|member|func-?bar|subscription)/i.test(cls);

    if (isNavLike || (text.length < 30 && linkCount > 0)) {
      $el.remove();
      stripped++;
      // 不 return false → 继续检查下一个兄弟元素
    } else if (text.length === 0 || tag === 'script' || tag === 'style') {
      // 空标签 / 脚本 → 也删
      $el.remove();
      stripped++;
    } else {
      // 不确定是什么但也不像导航 → 停止
      return false;
    }

    return undefined; // 继续下一个
  });
}

export interface ExtractedContent {
  html: string;
  coverImage: string | null;
}

/**
 * 从整页 cheerio 实例中提取正文 HTML。
 * @param $ cheerio.load(rawHtml) 的结果（会被就地修改）
 * @param baseUrl 原文 URL，用于解析相对图片路径
 */
export function extractContentHtml($: cheerio.CheerioAPI, baseUrl: string): ExtractedContent {
  $(REMOVE_SELECTORS).remove();

  let $content: any = null;
  for (const sel of CONTENT_SELECTORS) {
    const $el = $(sel).first();
    if ($el.length) {
      const text = $el.text().replace(/\s+/g, ' ').trim();
      if (text.length > 80) { $content = $el; break; }
    }
  }

  // 封面图：og:image 优先
  const ogImage = $('meta[property="og:image"]').attr('content') ||
                  $('meta[name="og:image"]').attr('content') ||
                  $('meta[property="twitter:image"]').attr('content');
  let coverImage: string | null = null;
  if (ogImage) {
    try { coverImage = new URL(ogImage, baseUrl).href; } catch { /* skip */ }
  }

  // 降级：不整体兜 body（会吞导航/页脚），改为拼接正文段落
  if (!$content) {
    const $body = $('body');
    const parts: string[] = [];
    $body.find('p, figure').each((_i: number, el: any) => {
      const $el = $(el);
      const t = $el.text().replace(/\s+/g, ' ').trim();
      if (t.length > 20 || $el.find('img').length > 0) {
        parts.push($.html(el));
      }
    });
    if (parts.length > 0) {
      const $wrapped = cheerio.load(`<div id="__fallback">${parts.join('')}</div>`);
      const $fb = $wrapped('#__fallback');
      pruneBoilerplate($wrapped, $fb);
      stripLeadingNoise($wrapped, $fb);
      return qualityGate(rewriteImages($wrapped, $fb, baseUrl, coverImage));
    }
    return { html: '', coverImage };
  }

  // 剪掉容器内的链接密集块（侧栏/相关推荐/站点导航残留）与页脚样板文案
  pruneLinkDenseBlocks($, $content);
  pruneBoilerplate($, $content);
  // 剥离顶部导航栏噪音（登录/注册/购物车/激活卡等混入正文容器的元素）
  stripLeadingNoise($, $content);

  return qualityGate(rewriteImages($, $content, baseUrl, coverImage));
}

/** 图片改写为 /api/img-proxy 代理 + 清理懒加载属性；顺带补封面 */
function rewriteImages(
  $: cheerio.CheerioAPI,
  $content: any,
  baseUrl: string,
  coverImage: string | null
): ExtractedContent {
  $content.find('img').each((_i: number, el: any) => {
    const $img = $(el);
    const src = $img.attr('data-src') || $img.attr('data-original') ||
                $img.attr('data-lazy-src') || $img.attr('src');
    if (!src) { $img.remove(); return; }
    let absoluteUrl: string;
    try { absoluteUrl = new URL(src, baseUrl).href; } catch { $img.remove(); return; }
    if (!/^https?:/.test(absoluteUrl)) { $img.remove(); return; }
    $img.attr('src', `/api/img-proxy?url=${encodeURIComponent(absoluteUrl)}`);
    $img.removeAttr('data-src');
    $img.removeAttr('data-original');
    $img.removeAttr('data-lazy-src');
    $img.removeAttr('data-lazyload');
    $img.removeAttr('width');
    $img.removeAttr('height');
    if (!coverImage) coverImage = absoluteUrl;
  });

  const html = ($content.html() || '')
    .replace(/ data-(?:src|original|lazy-src|lazyload)="[^"]*"/g, '');
  return { html, coverImage };
}

/** 从正文 HTML 提取纯文本（搜索/索引/摘要用） */
export function extractPlainText(html: string): string {
  const $ = cheerio.load(html);
  return $.text().replace(/\s+/g, ' ').trim();
}

/**
 * 质量闸门：剪枝后纯文本过短（快讯页/名单页/JS渲染页），宁缺勿滥 —
 * 返回空让调用方走纯文本降级渲染，避免把导航页脚当正文存库。
 * 有真实内容图的短图文（如公众号海报文）放行。
 */
function qualityGate(result: ExtractedContent): ExtractedContent {
  const text = extractPlainText(result.html);
  const imgCount = (result.html.match(/<img/g) || []).length;
  if (text.length < 100 && imgCount === 0) {
    return { html: '', coverImage: result.coverImage };
  }
  return result;
}
