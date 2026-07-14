// src/lib/relevance.ts
// 保理 / 供应链金融 相关性闸门
// 设计：关键词强命中 -> 直接判相关（零成本）；拿不准 -> 调 LLM 终判；其余丢弃。
// 用法：
//   抓取新文章入库前： if (!(await isRelevant(title, summary)).relevant) skip;
//   存量清理脚本：    复用本模块逐条扫描现有文章。
// 该文件不依赖任何数据库客户端，Supabase 版与国内 postgres 版通用。

// ---- 强相关关键词（命中即大概率相关，权重 2）----
const STRONG_KEYWORDS = [
  '保理', '供应链金融', '商业保理', '银行保理',
  '融资租赁', '反向保理', '再保理', '保兑仓', '融通仓',
  '保理公司', '保理业务', '国际保理', '双保理', '保理合同',
  '保理纠纷', '中登网', '动产融资', '信用保险保理',
  '供应链ABS', '保理ABS', '资产支持专项计划',
  '供金', 'Factoring', 'factor',
];

// ---- 弱相关关键词（太泛，单独命中不算，权重 1，需 LLM 复核）----
// 应收账款/核心企业/应付账款/债权转让/应收债权：财经媒体的 IPO/年报/
// 立案调查/监管问询类文章几乎必提这些通用会计/法律术语（任何公司财报
// 都有"应收账款"科目），单独出现不代表文章主题是保理——实测验证过
// 13 篇仅靠"应收账款"单独命中就被误判相关，全是无关个股新闻，
// 必须搭配另一个信号才算数
const WEAK_KEYWORDS = [
  '票据', '承兑汇票', '应收账款融资', '贸易金融',
  '产融', '确权', '信用流转',
  '应收账款', '核心企业', '应付账款', '债权转让', '应收债权',
];

// ---- 站点噪音黑名单：导航栏/机构名录/语言切换/协会党建组织活动 ----
// 这些是"网站结构"或"协会内部事务"，不是行业资讯，无论来自什么信源、
// 关键词打分多高，一律直接拦截。命中优先级高于白名单信源豁免。
const NAV_NOISE_RE = /(名单|名录)$/;
const SITE_FURNITURE_RE = /^(English|首页|时政要闻|总行新闻|党建动态|纪检工作|联系我们|会员服务热线|关于我们)>{0,3}$/;
// 只匹配"活动/会议公告"式措辞，不匹配裸词——避免"党建引领 合规前行"这类
// 只是标题里带党建框架语、实际是行业专家观点/分析文章的内容被误杀
const ORG_INTERNAL_RE = /(党委召开|党支部.{0,10}(活动|会议|主题)|理论学习中心组|纪检工作|庆祝中国共产党成立|主题党日|志愿服务显担当|参观.{0,6}(中共|党史)|专业委员会$)/;

function isSiteNoise(title: string): boolean {
  const t = title.trim();
  return NAV_NOISE_RE.test(t) || SITE_FURNITURE_RE.test(t) || ORG_INTERNAL_RE.test(t);
}

// ---- 保理/供应链金融专业信源白名单 ----
// 精选的垂直信源，全部内容默认视为主题相关，跳过关键词打分——
// 因为这类信源的列表页标题常被站点自身截断（省略号），关键词可能被切没，
// 用通用关键词闸门反而会误杀这些信源本该保留的文章。
// 仍需过一遍 isSiteNoise：协会官网也会混发党建/组织活动类非资讯内容。
export const FACTORING_SOURCE_WHITELIST = new Set([
  'syblxh-gd',  // 广东省商业保理协会
  'syblxh-sz',  // 深圳市商业保理协会
  'sinotf',     // 中国供应链金融网
  'tfsino',     // 供应链金融研究院
  'wanlian',    // 万联网
]);

function stripHtml(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** 关键词得分：强命中 +2，弱命中 +1。 */
export function keywordScore(text: string): number {
  if (!text) return 0;
  let score = 0;
  for (const k of STRONG_KEYWORDS) if (text.includes(k)) score += 2;
  for (const k of WEAK_KEYWORDS) if (text.includes(k)) score += 1;
  return score;
}

export interface RelevanceResult {
  relevant: boolean;
  method: 'keyword' | 'llm' | 'skipped';
  score: number;
  reason?: string;
}

async function llmJudge(
  title: string,
  snippet: string,
  signal?: AbortSignal,
): Promise<{ relevant: boolean; reason: string }> {
  // 项目实际配置的是 LLM_API_KEY/LLM_API_URL（当前指向 StepFun，非 DeepSeek）——
  // DEEPSEEK_API_KEY/默认 DeepSeek 地址只作兜底，不要求项目一定用 DeepSeek
  const apiKey = process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY;
  const baseUrl = process.env.LLM_API_URL || process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1';
  const model = process.env.LLM_MODEL || 'deepseek-chat';
  if (!apiKey) throw new Error('缺少 LLM_API_KEY / DEEPSEEK_API_KEY');

  const prompt = `你是保理与供应链金融领域的内容审核员。判断下面这篇文章是否真正与"保理、应收账款、供应链金融、商业保理、银行保理、融资租赁、债权转让、供应链ABS、动产融资统一登记"相关。\n只返回 JSON，格式：{"relevant": true 或 false, "reason": "不超过20字理由"}\n\n标题：${title}\n正文摘要：${snippet}`;

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0,
    }),
    signal: signal ?? AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`LLM HTTP ${resp.status}`);
  const data = await resp.json();
  const raw = data?.choices?.[0]?.message?.content || '{}';
  const parsed = JSON.parse(raw);
  return { relevant: !!parsed.relevant, reason: String(parsed.reason || '') };
}

/**
 * 判断文章是否与保理/供应链金融相关。
 * - 标题命中站点噪音特征（导航/名录/协会党建组织活动）：直接判不相关，
 *   不看来源、不看关键词——这类内容本来就不是资讯
 * - 来源在保理专业信源白名单：判相关（跳过关键词打分，避免标题截断误杀）
 * - 关键词得分 >= 2：直接判相关（省 LLM 成本）
 * - 得分 < 2 且未开启 LLM：判不相关（保守，宁可漏不放）
 * - 得分 < 2 且开启 LLM：调 LLM 终判，失败也按不相关处理
 */
export async function isRelevant(
  title: string,
  content: string,
  opts?: { enableLLM?: boolean; signal?: AbortSignal; sourceId?: string },
): Promise<RelevanceResult> {
  if (isSiteNoise(title)) {
    return { relevant: false, method: 'skipped', score: 0, reason: 'site_noise' };
  }

  if (opts?.sourceId && FACTORING_SOURCE_WHITELIST.has(opts.sourceId)) {
    return { relevant: true, method: 'skipped', score: 0, reason: 'source_whitelist' };
  }

  const text = `${title}\n${stripHtml(content || '')}`;
  const score = keywordScore(text);

  if (score >= 2) {
    return { relevant: true, method: 'keyword', score };
  }

  const enableLLM = opts?.enableLLM ?? process.env.RELEVANCE_LLM_ENABLED === 'true';
  if (!enableLLM) {
    return { relevant: false, method: 'skipped', score };
  }

  try {
    const llm = await llmJudge(title, text.slice(0, 600), opts?.signal);
    return { relevant: llm.relevant, method: 'llm', score, reason: llm.reason };
  } catch {
    // LLM 失败：保守判不相关，避免噪音入库
    return { relevant: false, method: 'llm', score, reason: 'llm_error' };
  }
}
