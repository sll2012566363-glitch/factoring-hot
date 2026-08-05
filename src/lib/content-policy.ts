import { assessContentQuality } from '@/lib/content-quality';
import { matchesTopicSignal } from '@/lib/relevance';

export const SIGNAL_MIN_SCORE = 8;
export const PUBLISH_MIN_SCORE = 15;
export const MUST_READ_MIN_SCORE = 30;

export type ReviewStatus = 'pending' | 'selected' | 'rejected';

export interface SelectionInput {
  score?: number | null;
  pre_filtered?: boolean | null;
  scoring_method?: string | null;
  content?: string | null;
  content_html?: string | null;
  ai_reason?: string | null;
}

export interface SelectionDecision {
  status: ReviewStatus;
  isSelected: boolean;
  reason: 'not_pre_filtered' | 'publishable' | 'signal' | 'irrelevant';
}

export interface ScoreDimensions {
  frontier: number;
  industry_model: number;
  regulatory: number;
  dispute: number;
  normative: number;
}

const REGULATORY_EVENT = /发布|印发|公告|通知|办法|细则|规定|指引|征求意见|处罚|取消.{0,8}资质|名单/;
const TRANSACTION_EVENT = /首笔|首单|落地|获批|过会|发行|签约|增资|ABS|ABN|资产支持专项计划/;
const DISPUTE_OR_DATA_EVENT = /判决|裁定|执行|纠纷|白皮书|典型案例|同比|业务量|余额|规模/;
const REJECTING_REASON = /关联度极弱|仅存在泛金融业务的弱关联|与保理及供应链金融行业的关联度弱|仅属于存在业务关联但事实不足的线索|主体为课程推广广告|主体为课程广告|课程营销信息|大段为课程广告|未涉及保理\/供应链金融核心业务|^重复事件/;

/**
 * A short factual bulletin need not be a long analysis to be useful.
 * Apply the publication floor only when the title itself contains both a
 * high-confidence industry signal and an objective regulatory/deal/case event.
 */
export function applyObjectiveNewsFloor(
  article: Pick<SelectionInput, 'content' | 'content_html'> & { title: string },
  score: number,
  dimensions: ScoreDimensions,
): { score: number; dimensions: ScoreDimensions } {
  const title = article.title || '';
  const eventDimension = REGULATORY_EVENT.test(title)
    ? 'regulatory'
    : TRANSACTION_EVENT.test(title)
      ? 'industry_model'
      : DISPUTE_OR_DATA_EVENT.test(title)
        ? 'dispute'
        : null;
  if (
    score >= PUBLISH_MIN_SCORE
    || !eventDimension
    || !matchesTopicSignal(title)
    || assessContentQuality(article).tier !== 'full'
  ) {
    return { score, dimensions };
  }

  const calibrated = { ...dimensions };
  calibrated[eventDimension] = Math.min(20, calibrated[eventDimension] + PUBLISH_MIN_SCORE - score);
  return { score: Object.values(calibrated).reduce((sum, value) => sum + value, 0), dimensions: calibrated };
}

/** A model total cannot publish an item when its own explanation says the item is weak or promotional. */
export function reasonAllowsPublication(reason?: string | null): boolean {
  return !reason || !REJECTING_REASON.test(reason);
}

/** Single source of truth for whether an article may appear on the public site. */
export function decideSelection(article: SelectionInput): SelectionDecision {
  if (article.pre_filtered !== true) {
    return { status: 'rejected', isSelected: false, reason: 'not_pre_filtered' };
  }
  if (article.scoring_method !== 'llm') {
    return { status: 'pending', isSelected: false, reason: 'signal' };
  }

  const score = Number(article.score);
  const hasScore = Number.isFinite(score);
  const hasFullBody = assessContentQuality(article).tier === 'full';

  if (hasScore && score >= PUBLISH_MIN_SCORE && hasFullBody && reasonAllowsPublication(article.ai_reason)) {
    return { status: 'selected', isSelected: true, reason: 'publishable' };
  }
  if (!hasScore || score >= SIGNAL_MIN_SCORE) {
    return { status: 'pending', isSelected: false, reason: 'signal' };
  }
  return { status: 'rejected', isSelected: false, reason: 'irrelevant' };
}

/** Prevent a publishable score from being paired with a contradictory rejection message. */
export function normalizeSelectionReason(score: number | null | undefined, reason?: string | null, excerpt?: string | null): string | null {
  const value = reason?.trim() || null;
  if (Number(score) < PUBLISH_MIN_SCORE || !value || !/不符合[^。；]{0,80}(收录|入选|选稿)标准/.test(value)) {
    return value;
  }
  const tier = Number(score) >= MUST_READ_MIN_SCORE ? '重点内容' : '行业动态';
  const fact = excerpt?.trim() ? `核心事实：${excerpt.trim()}` : '正文事实与本站业务范围直接相关。';
  return `已核验为可读的保理、供应链金融、融资租赁或相关交易风控${tier}，达到本站收录线。${fact}`.substring(0, 400);
}
