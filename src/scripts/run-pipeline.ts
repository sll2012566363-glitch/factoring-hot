/**
 * 全链路爬虫管道：fetch → pre-filter → enrich → score → reconcile → cluster
 * 用于 cron 定时调用或手动一键运行
 */
import { spawn } from 'child_process';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { keepProcessAlive } from '../lib/keep-process-alive';

const SCRIPTS_DIR = path.dirname(new URL(import.meta.url).pathname);
const ROOT_DIR = path.resolve(SCRIPTS_DIR, '..', '..');

const STEP_TIMEOUT_MS = 600_000; // 10 min per step

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface RunRecord {
  phase: string;
  exit: 'ok' | 'failed' | 'timeout';
  duration_s: number;
}

/** 指标落库：列不存在时静默跳过（迁移 20260828 前的兼容行为）。 */
async function recordRun(phase: string, mode: string, steps: RunRecord[], allOk: boolean) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    await supabase.from('pipeline_runs').insert({
      status: allOk ? 'finished' : 'failed',
      trigger: mode,
      metrics: {
        pipeline_version: 2,
        steps_ok: steps.filter(s => s.exit === 'ok').length,
        steps_total: steps.length,
      },
      step_results: steps,
    });
  } catch { /* metrics column may not exist yet; run is still recorded by status */ }
}

/**
 * 运行单个管道步骤。
 *
 * 用 spawn + detached（自成进程组）替代 execSync：execSync 的 timeout 只对
 * 它直接起的 /bin/sh 发 SIGTERM，打不穿 sh → npx → tsx → node 这条链——
 * 超时后主流程以为步骤结束了，实际抓取子进程变孤儿继续跑继续写库，跟后续
 * 步骤在不完整数据上并发（2026-07-14 实测出过一次，40 信源只抓完 27 个
 * 而 GitHub Actions 还报 success）。detached 进程组 + kill(-pid, SIGKILL)
 * 才能保证超时时整棵进程树死透。
 */
function runStep(name: string, script: string): Promise<RunRecord> {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`▶ ${name}`);
  console.log('='.repeat(50));
  const stepStart = Date.now();

  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', script], {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      env: { ...process.env },
      detached: true,
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      console.error(`✗ ${name} 超时(${STEP_TIMEOUT_MS / 60000}分钟)，SIGKILL 进程组 -${child.pid}`);
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL');
      } catch { /* 进程已退出 */ }
    }, STEP_TIMEOUT_MS);

    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      const record: RunRecord = {
        phase: name,
        exit: code === 0 ? 'ok' : timedOut ? 'timeout' : 'failed',
        duration_s: Math.round((Date.now() - stepStart) / 1000),
      };
      if (code === 0) {
        console.log(`✓ ${name} 完成 (${record.duration_s}s)`);
      } else {
        console.error(`✗ ${name} 失败: exit=${code} signal=${signal}${timedOut ? ' (timeout)' : ''}`);
      }
      resolve(record);
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      console.error(`✗ ${name} 失败:`, err.message);
      resolve({ phase: name, exit: 'failed', duration_s: Math.round((Date.now() - stepStart) / 1000) });
    });
  });
}

async function main() {
  const startTime = Date.now();
  const args = process.argv.slice(2);
  const fetchOnly = args.includes('--fetch-only');
  const realtime = args.includes('--realtime');

  if (fetchOnly) {
    console.log('🔄 快速抓取模式（仅抓取，不评分不聚类）...\n');
    const record = await runStep('1/1 抓取文章', 'src/scripts/fetch-sources.ts');
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n${record.exit === 'ok' ? '✅' : '✗'} 快速抓取完成，耗时 ${elapsed}s`);
    await recordRun('fetch-only', 'fetch-only', [record], record.exit === 'ok');
    if (record.exit !== 'ok') process.exitCode = 1;
    return;
  }

  if (realtime) {
    console.log('⚡ 实时更新模式（抓取 → 预筛 → 正文 → 评分 → 状态校准）...\n');
    const steps = [
      ['1/5 抓取文章', 'src/scripts/fetch-sources.ts'],
      ['2/5 预筛过滤', 'src/scripts/pre-filter.ts'],
      ['3/5 充实正文', 'src/scripts/enrich-articles.ts'],
      ['4/5 LLM评分', 'src/scripts/llm-score.ts'],
      ['5/5 状态校准', 'src/scripts/reconcile-selection.ts'],
    ] as const;
    const records: RunRecord[] = [];
    for (const [name, script] of steps) {
      const record = await runStep(name, script);
      records.push(record);
      if (record.exit !== 'ok') {
        await recordRun('realtime', 'realtime', records, false);
        process.exitCode = 1;
        return;
      }
    }
    await recordRun('realtime', 'realtime', records, true);
    return;
  }

  console.log('🚀 开始执行全链路管道...\n');

  const steps = [
    ['1/6 抓取文章', 'src/scripts/fetch-sources.ts'],
    ['2/6 预筛过滤', 'src/scripts/pre-filter.ts'],
    ['3/6 充实正文', 'src/scripts/enrich-articles.ts'],
    ['4/6 LLM评分', 'src/scripts/llm-score.ts'],
    ['5/6 状态校准', 'src/scripts/reconcile-selection.ts'],
    ['6/6 事件聚类', 'src/scripts/cluster-events.ts'],
  ] as const;
  const records: RunRecord[] = [];
  let allOk = true;
  for (const [name, script] of steps) {
    const record = await runStep(name, script);
    records.push(record);
    if (record.exit !== 'ok') { allOk = false; break; }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  if (allOk) {
    console.log(`\n✅ 全链路管道完成，耗时 ${elapsed}s`);
  } else {
    console.error(`\n✗ 全链路管道存在失败步骤，耗时 ${elapsed}s`);
    process.exitCode = 1;
  }
  await recordRun('full', 'full', records, allOk);
}

keepProcessAlive(main()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
