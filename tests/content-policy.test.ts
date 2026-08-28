import assert from 'node:assert/strict';
import test from 'node:test';
import { assessContentQuality } from '../src/lib/content-quality';
import { editorialExclusionReason } from '../src/lib/relevance';
import { titleSimilarity } from '../src/lib/title-similarity';
import {
  applyObjectiveNewsFloor,
  decideSelection,
  reasonAllowsPublication,
  normalizeSelectionReason,
  PUBLISH_MIN_SCORE,
  SIGNAL_MIN_SCORE,
} from '../src/lib/content-policy';

test('short descriptions never count as full text', () => {
  assert.equal(assessContentQuality({ content: '保理业务落地。'.repeat(5), content_html: '' }).tier, 'external');
  assert.equal(assessContentQuality({ content: '保理业务落地。'.repeat(12), content_html: '' }).tier, 'summary');
});

test('publishable content never carries a contradictory rejection reason', () => {
  const normalized = normalizeSelectionReason(
    PUBLISH_MIN_SCORE,
    '内容有业务事实，但不符合重大内容收录标准。',
    '某银行落地首笔无追索权保理业务。',
  );
  assert.match(normalized || '', /达到本站收录线/);
  assert.doesNotMatch(normalized || '', /不符合/);
});

test('long text or a structured short announcement counts as full text', () => {
  assert.equal(assessContentQuality({ content: '保理业务事实。'.repeat(50), content_html: '' }).tier, 'full');
  assert.equal(assessContentQuality({
    content: '地方金融监管部门发布商业保理监管公告。'.repeat(12),
    content_html: `<p>${'地方金融监管部门发布商业保理监管公告。'.repeat(20)}</p>`,
  }).tier, 'full');
});

test('publication requires pre-filter, LLM score and full text', () => {
  const full = { content: '供应链金融业务事实。'.repeat(50), content_html: '' };
  assert.equal(decideSelection({ ...full, pre_filtered: true, scoring_method: 'llm', score: PUBLISH_MIN_SCORE }).status, 'selected');
  assert.equal(decideSelection({ ...full, pre_filtered: false, scoring_method: 'llm', score: 100 }).status, 'rejected');
  assert.equal(decideSelection({ ...full, pre_filtered: true, scoring_method: 'rule', score: 100 }).status, 'pending');
  assert.equal(decideSelection({ content: '摘要'.repeat(50), pre_filtered: true, scoring_method: 'llm', score: PUBLISH_MIN_SCORE }).status, 'pending');
  assert.equal(decideSelection({ ...full, pre_filtered: true, scoring_method: 'llm', score: SIGNAL_MIN_SCORE - 1 }).status, 'rejected');
});

test('objective industry events receive the publication floor', () => {
  const dimensions = { frontier: 1, industry_model: 3, regulatory: 0, dispute: 0, normative: 1 };
  const body = { content: '供应链金融ABS交易事实。'.repeat(50), content_html: '' };
  const rawScore = PUBLISH_MIN_SCORE - 1;
  const deal = applyObjectiveNewsFloor(
    { ...body, title: '20亿元供应链金融ABS获批' },
    rawScore,
    dimensions,
  );
  assert.equal(deal.score, PUBLISH_MIN_SCORE);
  assert.equal(deal.dimensions.industry_model, dimensions.industry_model + 1);

  const generic = applyObjectiveNewsFloor(
    { ...body, title: '城市产业发展会议召开' },
    rawScore,
    dimensions,
  );
  assert.equal(generic.score, rawScore);
});

test('training notices are excluded before scoring', () => {
  assert.equal(
    editorialExclusionReason('关于举办2025年商业保理公司合规体系建设专题培训的通知'),
    'training_ad',
  );
  assert.equal(
    editorialExclusionReason('【协会动态】协会举办融资租赁公司合规与评级注意事项辅导会'),
    'training_ad',
  );
});

test('a rejecting model reason cannot contradict a publishable score', () => {
  assert.equal(reasonAllowsPublication('正文主体为课程推广广告，与保理及供应链金融行业的关联度弱。'), false);
  assert.equal(reasonAllowsPublication('文章披露首笔无追索权保理交易，具备明确业务事实。'), true);
});

test('same-event titles are detected despite dates and wording differences', () => {
  assert.ok(titleSimilarity(
    '全国首单药品追溯码无追索权保理业务落地 医保数据赋能供应链金融',
    '医保数据为药企融资背书 国内首笔药品追溯码无追索权保理业务落地 2026-07-28 19:58',
  ) >= 0.4);
});
