/**
 * 每周评分哨兵：重评金标锚例，报告均分漂移与翻转率。
 * 若模型供应商静默更新模型导致评分尺度漂移，此处会先于线上文章暴露。
 * 只读监控：重评结果写入 supabase pipeline_runs.metrics（哨兵行），不改文章。
 */
import { createClient } from '@supabase/supabase-js';
import { scoreWithDeepSeek } from '../src/scripts/llm-score';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface Anchor {
  id: string;
  title: string;
  expected: number;
}

// 金标锚例：人工核定期望分（与 llm-score 提示词中的锚例对齐）
const ANCHORS: Anchor[] = [
  { id: '78-backtoback', title: '转嫁风险=安全？别天真了！穿透式审查下，背靠背合同就是一张“自证违规”的铁证', expected: 78 },
  { id: '35-aircraft-leasing', title: '案例｜飞机融资租赁：承租人逾期付租，出租人可解除合同并优先受偿', expected: 35 },
];

interface AnchorArticle {
  id: string;
  title: string;
  content: string;
  excerpt?: string | null;
  source_id?: string;
}

async function main() {
  console.log('🛡️ 评分哨兵启动\n');

  const results: Array<{ title: string; expected: number; actual: number | null; delta: number | null }> = [];

  for (const anchor of ANCHORS) {
    const { data } = await supabase
      .from('articles')
      .select('id, title, content, excerpt, source_id')
      .ilike('title', anchor.title.slice(0, 20))
      .limit(1);
    const article = (data || [])[0] as AnchorArticle | undefined;
    if (!article) {
      console.log(`  ✗ 锚例未找到: ${anchor.title.slice(0, 30)}`);
      results.push({ title: anchor.title, expected: anchor.expected, actual: null, delta: null });
      continue;
    }
    const result = await scoreWithDeepSeek(article as never);
    const actual = result?.score ?? null;
    const delta = actual !== null ? actual - anchor.expected : null;
    results.push({ title: anchor.title, expected: anchor.expected, actual, delta });
    console.log(`  ${actual === null ? '✗' : delta !== null && Math.abs(delta) <= 10 ? '✓' : '⚠'} ${anchor.title.slice(0, 30)} 期望 ${anchor.expected} 实得 ${actual ?? '失败'}（Δ${delta ?? '-'}）`);
  }

  const valid = results.filter(r => r.delta !== null) as Array<{ title: string; expected: number; actual: number; delta: number }>;
  const avgDelta = valid.length ? valid.reduce((s, r) => s + r.delta, 0) / valid.length : 0;
  const flips = valid.filter(r => (r.expected >= 8) !== (r.actual >= 8)).length;

  console.log(`\n均分漂移: ${avgDelta.toFixed(1)} 分 | 翻转(跨发布线): ${flips}/${valid.length}`);

  await supabase.from('pipeline_runs').insert({
    status: 'finished',
    trigger: 'score-sentinel',
    metrics: {
      pipeline_version: 2,
      sentinel: true,
      avg_delta: Number(avgDelta.toFixed(1)),
      flips,
      anchors: results,
    },
  });
  console.log('\n✅ 哨兵结果已落库（不改文章数据）');
}

main().catch((e) => { console.error(e); process.exit(1); });
