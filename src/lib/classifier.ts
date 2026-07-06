/**
 * 文章智能分类器
 * 基于月刊的实际分类规则，通过标题和内容关键词进行分类
 */

// ─── 关键词库 ─────────────────────────────────────────

const FRONTIER_KEYWORDS = [
  '解读', '深度分析', '深度解读', '观点', '评论', '趋势', '研究',
  '观察', '展望', '思考', '探讨', '白皮书', '新春寄语', '年度报告',
  '综述', '回顾', '盘点', '评析', '浅析', '探析', '分析',
  '法律分析', '合规分析', '实务分析', '趋势分析', '研究报告',
  '律师观点', '专家解读', '行业观察', '市场展望',
];

const INDUSTRY_MODEL_KEYWORDS = [
  '首单', '首笔', '首批', '首张', '首个', '首家', '首次',
  '首发', '首创', '率先', '落地', '成功发行', '成功落地',
  '新模式', '新产品', '新业务', '创新', '突破性',
  '上线', '推出', '启动', '达成', '签约', '合作',
  '融资落地', '项目落地', '业务落地',
  'abs', 'ABS', '资产支持', '资产证券化', '债券发行',
  '数据资产', '数据产品', '数据入表',
  '科技赋能', '数字化转型', '区块链', '供应链平台',
];

const NATIONAL_REGULATORS = [
  '国务院', '央行', '人民银行', '金融监管总局', '银保监会',
  '证监会', '发改委', '商务部', '财政部', '司法部',
  '国资委', '外汇局', '国家税务总局', '工信部',
  '最高人民法院', '最高人民检察院', '最高法', '最高检',
  '八部门', '七部门', '六部门', '五部门', '四部门', '三部门', '两部门', '多部门',
  '联合发布', '联合印发',
];

const REGIONAL_PREFIXES = [
  '北京', '上海', '天津', '重庆',
  '广东', '广州', '深圳', '珠海', '东莞', '佛山',
  '浙江', '杭州', '宁波', '温州',
  '江苏', '南京', '苏州', '无锡',
  '山东', '济南', '青岛', '烟台',
  '四川', '成都',
  '湖北', '武汉', '湖南', '长沙',
  '河南', '郑州', '河北', '石家庄',
  '福建', '福州', '厦门',
  '安徽', '合肥', '江西', '南昌',
  '辽宁', '沈阳', '大连', '吉林', '长春', '黑龙江', '哈尔滨',
  '陕西', '西安', '甘肃', '兰州',
  '广西', '南宁', '云南', '昆明', '贵州', '贵阳',
  '海南', '海口', '内蒙古', '新疆', '西藏', '宁夏', '青海',
  '天津滨海新区', '浦东新区', '雄安新区', '横琴',
  '各省', '各地', '多地', '地方',
];

const DISPUTE_KEYWORDS = [
  '案例', '典型案例', '判决', '裁判', '纠纷', '诉讼',
  '仲裁', '立案', '审判', '法院判', '高院', '中院',
  '合同纠纷', '名为保理实为借贷', '明保实贷',
  '保理合同', '融资租赁合同纠纷', '票据纠纷',
  '追索权', '应收账款转让', '虚假转让',
  '优先权', '善意取得', '对抗效力',
  '刑法规制', '涉嫌犯罪', '非法集资', '诈骗', '虚开',
  '处罚', '行政处罚', '罚款', '警告', '责令整改',
  '违规', '违法', '风险警示', '风险提示',
  '爆雷', '暴雷', '逾期', '违约', '跑路', '失联',
  '骗局', '陷阱', '套路', '涉众风险',
];

const NORMATIVE_KEYWORDS = [
  '办法', '规定', '条例', '指引', '规范',
  '管理办法', '管理规定', '实施细则', '实施意见',
  '征求意见稿', '修订草案', '公开征求意见',
  '正式实施', '正式施行', '发布实施',
  '全文', '全文发布', '全文印发',
  '监管规则', '行业规范', '行业标准',
];

const NOISE_PATTERNS = [
  /^(首页|关于我们|联系我们|版权声明|免责声明|网站地图|友情链接|返回顶部|more|更多)$/i,
  /^(登录|注册|投稿|下载|分享|关注|订阅|收藏)$/i,
];

// ─── 分类函数 ─────────────────────────────────────────

export interface ClassificationResult {
  section: 'frontier' | 'industry_model' | 'regulatory' | 'dispute' | 'normative';
  confidence: number;
  reason: string;
  subSection?: 'national' | 'regional';
}

function hasKeywords(text: string, keywords: string[]): { found: boolean; matched: string[] } {
  const matched = keywords.filter(kw => text.includes(kw));
  return { found: matched.length > 0, matched };
}

function isRegionalTitle(title: string): boolean {
  const hasRegionPrefix = REGIONAL_PREFIXES.some(p =>
    title.startsWith(p + '：') || title.startsWith(p + ':') || title.startsWith(p + ' ')
  );
  const hasRegionKeyword = REGIONAL_PREFIXES.some(p =>
    title.includes(p) && /地方|区域|各省|多地|当地/.test(title)
  );
  return hasRegionPrefix || hasRegionKeyword;
}

function isNationalRegulatory(title: string): boolean {
  return NATIONAL_REGULATORS.some(r => title.includes(r));
}

export function classifyArticle(title: string, content: string = ''): ClassificationResult {
  const text = `${title} ${content}`;
  const titleText = title;

  if (NOISE_PATTERNS.some(p => p.test(title))) {
    return { section: 'regulatory', confidence: 0, reason: 'noise' };
  }

  // 1. 争议解决
  const disputeResult = hasKeywords(text, DISPUTE_KEYWORDS);
  if (disputeResult.found && disputeResult.matched.length >= 2) {
    return {
      section: 'dispute',
      confidence: Math.min(disputeResult.matched.length * 0.3, 1.0),
      reason: `争议关键词: ${disputeResult.matched.slice(0, 3).join(', ')}`,
    };
  }
  if (hasKeywords(titleText, ['案例', '纠纷', '判决', '裁判', '诉讼', '仲裁']).found) {
    return { section: 'dispute', confidence: 0.8, reason: '标题含争议关键词' };
  }
  if (hasKeywords(titleText, ['处罚', '罚款', '违规', '违法', '爆雷', '暴雷', '骗局', '跑路']).found) {
    return { section: 'dispute', confidence: 0.7, reason: '标题含风险/违规关键词' };
  }

  // 2. 规范文件
  const normativeResult = hasKeywords(titleText, NORMATIVE_KEYWORDS);
  if (normativeResult.found) {
    const isFormalDoc = /印发|发布|施行|实施/.test(titleText) || /《.*》/.test(titleText);
    if (isFormalDoc) {
      return {
        section: 'normative',
        confidence: 0.9,
        reason: `规范文件: ${normativeResult.matched.slice(0, 2).join(', ')}`,
      };
    }
  }

  // 3. 前沿解读
  const frontierResult = hasKeywords(titleText, FRONTIER_KEYWORDS);
  if (frontierResult.found) {
    return {
      section: 'frontier',
      confidence: Math.min(frontierResult.matched.length * 0.4, 1.0),
      reason: `解读关键词: ${frontierResult.matched.slice(0, 2).join(', ')}`,
    };
  }

  // 4. 行业前沿模式
  const industryResult = hasKeywords(titleText, INDUSTRY_MODEL_KEYWORDS);
  if (industryResult.found) {
    return {
      section: 'industry_model',
      confidence: Math.min(industryResult.matched.length * 0.35, 1.0),
      reason: `创新关键词: ${industryResult.matched.slice(0, 3).join(', ')}`,
    };
  }

  // 5. 监管新闻
  if (isRegionalTitle(titleText)) {
    return { section: 'regulatory', confidence: 0.7, reason: '区域监管新闻', subSection: 'regional' };
  }

  return {
    section: 'regulatory',
    confidence: 0.5,
    reason: isNationalRegulatory(titleText) ? '国家级监管新闻' : '一般资讯',
    subSection: 'national',
  };
}
