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
  // 行业常用的资产证券化/票据融资表达。此前只识别“保理ABS”等组合词，
  // 导致“ABS项目获批”“再贴现利率调整”这类实质行业信号被漏掉。
  '资产证券化', '资产支持证券', '资产支持票据', 'ABS项目', 'ABN',
  '供应链票据', '票据贴现', '再贴现', '贴现利率',
  '应收账款融资', '应收账款质押', '应收账款转让', '保理融资', '供应链融资',
  '供金', 'Factoring', 'factor',
  // 融资租赁补充领域：只在与租赁业务/资产/监管语境共同出现时放行
  '金融租赁', '融资租赁公司', '售后回租', '租赁物', '租赁资产', '租赁业务',
  '直租', '金租',
];

// 核心主题词：决定文章是否真正落在本站业务范围内。
// 泛“供应链/金融/应收账款/票据”不单独作为主题依据。
export const CORE_TOPIC_KEYWORDS = [
  '商业保理', '银行保理', '保理公司', '保理业务', '保理合同', '保理融资',
  '保理纠纷', '明保理', '暗保理', '反向保理', '再保理', '有追索权保理', '无追索权保理',
  '供应链金融', '供应链融资', '供应链ABS', '保理ABS', '应收账款融资', '应收账款转让',
  '应收账款质押', '供应链票据', '动产融资统一登记', '中登网',
  '融资租赁', '金融租赁', '售后回租', '租赁物', '租赁资产', '租赁业务', '设备融资',
];

const TOPIC_COMBINATIONS = [
  ['供应链', '金融|融资|票据|确权|应收账款|核心企业'],
  ['应收账款', '融资|转让|质押|确权|保理|ABS|资产证券化|票据'],
  ['票据|商票|银票|承兑汇票', '供应链|融资|确权|保理|贴现'],
  ['ABS|ABN|资产证券化|资产支持证券|资产支持票据', '保理|供应链|应收账款|租赁|票据'],
  ['租赁', '融资|金融|售后回租|租赁物|租金债权|直租|资产证券化'],
];

// 扩展召回词组：不是“主资讯直接入选”条件，而是让边缘但可能有价值的
// 行业动态进入候选池，由正文抓取 + 模型终审决定去留。
// 这样既不会把“供应链”一词当作相关，也不会漏掉结算、账期、贸易融资、
// 租赁资产等行业惯用但不总带“保理”字样的报道。
const BROAD_TOPIC_COMBINATIONS = [
  ['供应链|产业链', '采购|订单|结算|付款|账期|账款|物流|仓储|库存|供应商|经销商|中小企业|普惠|授信|信贷|产业金融|金融科技|平台'],
  ['应收账款|应付账款|账款', '回款|结算|账期|逾期|拖欠|确权|信用|供应商|采购|融资|转让|质押'],
  ['票据|商票|银票|承兑汇票', '贴现|承兑|融资|信用|结算|供应链|转让'],
  ['融资租赁|金融租赁|租赁', '资产|设备|项目|租金|债权|融资|金融|直租|回租|证券化'],
  ['ABS|ABN|资产证券化|资产支持证券|资产支持票据', '应收|租赁|票据|供应链|基础设施|企业融资'],
  ['贸易', '融资|结算|信用|供应链|应收|账期|保理'],
  ['保函|国际结算|跨境结算', '贸易|融资|供应链|应收|信用'],
];

/** 保理、供应链金融、融资租赁的直接词或业务词组合。 */
export function matchesTopicSignal(text: string): boolean {
  if (CORE_TOPIC_KEYWORDS.some(keyword => text.includes(keyword))) return true;
  return TOPIC_COMBINATIONS.some(([left, right]) => new RegExp(left).test(text) && new RegExp(right).test(text));
}

/** 用于候选池的宽松行业信号；命中后仍必须经模型评分才能进入主资讯。 */
export function matchesCandidateTopic(text: string): boolean {
  if (matchesTopicSignal(text)) return true;
  return BROAD_TOPIC_COMBINATIONS.some(([left, right]) => new RegExp(left).test(text) && new RegExp(right).test(text));
}

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
  '租赁', '设备融资', '租金', '残值风险',
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

// ---- 课程 / 培训广告 / 招商引流黑名单 ----
// 这些标题特征几乎只出现在"实操课/研修班/总裁班/招商会/白皮书领取"等
// 商业推广页，正文常为空壳或留资表单，与行业资讯无关，无论关键词怎么
// 命中一律拦截（优先级高于白名单信源豁免）
const AD_BLACKLIST_RE = /(实操|培训|研修|总裁|私董|内训|特训)\s*(课|班)|招生|报名\s*(截止|进行中|中)?|课纲|学费|讲师\s*(阵容|介绍)?|大咖\s*(分享|授课|来了)?|席位|私享|闭门会|招商会|白皮书\s*领取|资料包\s*领取|扫码\s*领取|免费\s*领取?|加微信|进群|留资|立即咨询|预约\s*(咨询|报名)/;

function isTrainingAd(title: string): boolean {
  return AD_BLACKLIST_RE.test(title.trim());
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
  'cfec',       // 中国服务贸易协会商业保理专业委员会
  'tcfa',       // 天津市商业保理协会
  'szscfa',     // 深圳市供应链金融协会
  'zjleasing',  // 浙江省租赁业协会
  'yiliantong', // 供应链票据公共服务平台
  'clba',       // 中国外商投资企业协会租赁业工作委员会
  'szfla',      // 深圳市融资租赁行业协会
  'wuhan-finance', // 地方金融监管部门的保理/租赁监管动态
  'wanlian',    // 强相关行业媒体；仅进入候选池，仍受正文与模型双闸门约束
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

  const prompt = `你是保理与供应链金融领域的内容审核专家。判断文章是否"真正属于"保理/供应链金融行业的实质资讯。

【判为相关】满足之一：
- 主体是保理业务、应收账款融资/转让、供应链金融、商业保理、银行保理、融资租赁、债权转让、供应链ABS、动产融资统一登记(中登)、反向保理、保兑仓等
- 监管机构(央行/金监总局/证监会)发布且涉及上述领域的政策/处罚/监管动态
- 真实行业事件、案例、数据、企业动态(如某保理公司增资/被罚/业务进展)

【判为不相关】满足之一：
- 培训课/研修班/总裁班/招商会/峰会报名等课程或活动招生广告
- 白皮书/资料包/扫码领取/加微信/进群等引流留资(lead-gen)
- 正文无实质内容：空壳、纯导航、纯机构介绍、党建/组织内部活动
- 仅蹭"供应链""保理"等词但实际讲个股/IPO/宏观/其他行业

只返回JSON：{"relevant": true 或 false, "reason": "不超过20字"}
标题：${title}
正文摘要：${snippet}`;

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

  // 课程 / 培训广告 / 招商引流：明确拦截，不浪费 LLM 调用
  if (isTrainingAd(title)) {
    return { relevant: false, method: 'skipped', score: 0, reason: 'training_ad' };
  }

  const text = `${title}\n${stripHtml(content || '')}`;
  const hasCoreTopic = matchesTopicSignal(text);
  const hasCandidateTopic = matchesCandidateTopic(text);

  // 白名单只代表信源可靠，不代表每篇标题都相关；先过核心主题词。
  if (opts?.sourceId && FACTORING_SOURCE_WHITELIST.has(opts.sourceId) && hasCoreTopic) {
    return { relevant: true, method: 'keyword', score: 2, reason: 'source_whitelist_core_keyword' };
  }
  // 垂直信源的文章先进入预筛/模型复核，避免因标题被截断而误杀；
  // 一般财经信源仍必须具备业务词组合，防止宏观和个股资讯混入。
  if (!hasCoreTopic && opts?.sourceId && FACTORING_SOURCE_WHITELIST.has(opts.sourceId)) {
    return { relevant: false, method: 'skipped', score: 0 };
  }
  if (!hasCandidateTopic) {
    return { relevant: false, method: 'skipped', score: 0, reason: 'missing_core_topic_keyword' };
  }

  // 宽松信号仅进入候选池，不能绕过终审直接显示；抓取脚本会把无 reason 的
  // skipped 项作为待预筛候选保留。
  if (!hasCoreTopic) {
    return { relevant: false, method: 'skipped', score: 1 };
  }

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
