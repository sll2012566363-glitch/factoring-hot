// 发布日期统一处理工具
// 放置位置：src/lib/date-utils.ts
// 作用：所有写入 articles.pub_date 的日期都必须先过这里，唯一闸门。

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 60 * 60 * 1000; // 容忍未来 1 小时（时钟漂移 / 时区边界）

/**
 * 把任意日期输入规整为合规 ISO 字符串。
 * 闸门规则：
 *  - 空 / 非法                              → null
 *  - 未来（超过现在 1 小时）                 → null   ← 防止“发表日期变成未来”
 *  - 早于半年前                             → null
 * 其余一律返回 UTC ISO 字符串（toISOString）。
 */
export function sanitizePubDate(input: unknown): string | null {
  if (input === null || input === undefined || input === '') return null;
  const d = input instanceof Date ? input : new Date(input as string);
  if (isNaN(d.getTime())) return null;
  const now = Date.now();
  if (d.getTime() > now + FUTURE_TOLERANCE_MS) return null;
  if (d.getTime() < now - SIX_MONTHS_MS) return null;
  return d.toISOString();
}

/**
 * 从页面提取发布日期（v2，更稳）：
 *  - 仅看 <meta> 与 <time> 等结构化信号
 *  - 移除“整篇正文正则兜底”：会误抓“截至2027年… / 自2026年起”这类日期，污染发布时间
 *  - 结果一定过 sanitizePubDate，未来 / 非法 → null
 * 拿不到就返回 null（保留库里已有值，不瞎填）
 */
export function extractPubDate($: any): string | null {
  const metaSelectors = [
    'meta[name="publishdate"]', 'meta[name="pubdate"]', 'meta[name="publish_date"]',
    'meta[name="publishDate"]', 'meta[name="article:published_time"]',
    'meta[property="article:published_time"]', 'meta[property="og:article:published_time"]',
    'meta[name="Date"]', 'meta[name="pub_date"]', 'meta[name="createtime"]',
  ];
  for (const sel of metaSelectors) {
    const val = $(sel).attr('content');
    if (val) {
      const safe = sanitizePubDate(val);
      if (safe) return safe;
    }
  }
  const timeEl = $('time').first();
  if (timeEl.length) {
    const datetime = timeEl.attr('datetime') || timeEl.text().trim();
    if (datetime) {
      const safe = sanitizePubDate(datetime);
      if (safe) return safe;
    }
  }
  // 不再做整篇正文正则兜底
  return null;
}

/**
 * 相对时间展示（对齐 AIHOT："16小时前"）。
 * 超过 7 天或未来时间返回 null——调用方回退到绝对日期。
 */
export function formatRelativeTime(input: unknown): string | null {
  if (input === null || input === undefined || input === '') return null;
  const d = input instanceof Date ? input : new Date(input as string);
  if (isNaN(d.getTime())) return null;
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return null;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days <= 7) return `${days}天前`;
  return null;
}

/**
 * 统一的日期展示：固定按 Asia/Shanghai（北京时间）格式化，
 * null / 非法 → “日期不详”。避免服务器时区不同导致展示错位。
 */
export function formatDateSafe(input: unknown): string {
  if (input === null || input === undefined || input === '') return '日期不详';
  const d = input instanceof Date ? input : new Date(input as string);
  if (isNaN(d.getTime())) return '日期不详';
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}年${get('month')}月${get('day')}日 ${get('hour')}:${get('minute')}`;
}
