/**
 * 全链路爬虫管道：fetch → pre-filter → enrich → score → cluster
 * 用于 cron 定时调用或手动一键运行
 */
import { spawn } from 'child_process';
import path from 'path';

const SCRIPTS_DIR = path.dirname(new URL(import.meta.url).pathname);
const ROOT_DIR = path.resolve(SCRIPTS_DIR, '..', '..');

const STEP_TIMEOUT_MS = 600_000; // 10 min per step

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
function runStep(name: string, script: string): Promise<boolean> {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`▶ ${name}`);
  console.log('='.repeat(50));

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
      if (code === 0) {
        console.log(`✓ ${name} 完成`);
        resolve(true);
      } else {
        console.error(`✗ ${name} 失败: exit=${code} signal=${signal}${timedOut ? ' (timeout)' : ''}`);
        resolve(false);
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      console.error(`✗ ${name} 失败:`, err.message);
      resolve(false);
    });
  });
}

async function main() {
  const startTime = Date.now();
  const args = process.argv.slice(2);
  const fetchOnly = args.includes('--fetch-only');

  if (fetchOnly) {
    console.log('🔄 快速抓取模式（仅抓取，不评分不聚类）...\n');
    const ok = await runStep('1/1 抓取文章', 'src/scripts/fetch-sources.ts');
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n${ok ? '✅' : '✗'} 快速抓取完成，耗时 ${elapsed}s`);
    if (!ok) process.exitCode = 1;
    return;
  }

  console.log('🚀 开始执行全链路管道...\n');

  // Step 1: Fetch articles from sources
  const results: boolean[] = [];
  results.push(await runStep('1/5 抓取文章', 'src/scripts/fetch-sources.ts'));

  // Step 2: Pre-filter (关键词+LLM快筛，淘汰无关文章)
  results.push(await runStep('2/5 预筛过滤', 'src/scripts/pre-filter.ts'));

  // Step 3: Enrich articles (fetch body text + better dates)
  results.push(await runStep('3/5 充实正文', 'src/scripts/enrich-articles.ts'));

  // Step 4: Score articles with LLM
  results.push(await runStep('4/5 LLM评分', 'src/scripts/llm-score.ts'));

  // Step 5: Cluster events (bigram Jaccard similarity)
  results.push(await runStep('5/5 事件聚类', 'src/scripts/cluster-events.ts'));

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  if (results.every(Boolean)) {
    console.log(`\n✅ 全链路管道完成，耗时 ${elapsed}s`);
  } else {
    console.error(`\n✗ 全链路管道存在失败步骤，耗时 ${elapsed}s`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
