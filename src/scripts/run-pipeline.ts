/**
 * 全链路爬虫管道：fetch → pre-filter → enrich → score
 * 用于 cron 定时调用或手动一键运行
 */
import { execSync } from 'child_process';
import path from 'path';

const SCRIPTS_DIR = path.dirname(new URL(import.meta.url).pathname);
const ROOT_DIR = path.resolve(SCRIPTS_DIR, '..', '..');

function runStep(name: string, script: string) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`▶ ${name}`);
  console.log('='.repeat(50));

  try {
    execSync(`npx tsx ${script}`, {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      env: { ...process.env },
      timeout: 600_000, // 10 min per step
    });
    console.log(`✓ ${name} 完成`);
  } catch (err) {
    console.error(`✗ ${name} 失败:`, (err as Error).message);
    // Continue to next step even if one fails
  }
}

async function main() {
  const startTime = Date.now();
  console.log('🚀 开始执行全链路管道...\n');

  // Step 1: Fetch articles from sources
  runStep('1/4 抓取文章', 'src/scripts/fetch-sources.ts');

  // Step 2: Pre-filter (关键词+LLM快筛，淘汰无关文章)
  runStep('2/4 预筛过滤', 'src/scripts/pre-filter.ts');

  // Step 3: Enrich articles (fetch body text + better dates)
  runStep('3/4 充实正文', 'src/scripts/enrich-articles.ts');

  // Step 4: Score articles with LLM
  runStep('4/4 LLM评分', 'src/scripts/llm-score.ts');

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ 全链路管道完成，耗时 ${elapsed}s`);
}

main().catch(console.error);
