import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for Vercel Pro

export async function GET(request: NextRequest) {
  // 鉴权：必须配置 CRON_SECRET 且请求携带正确 Bearer token（默认 closed）
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, any> = {};
  const startTime = Date.now();

  const runStep = async (name: string, fn: () => Promise<unknown>) => {
    try {
      results[name] = await fn();
      return true;
    } catch (error) {
      results[name] = { error: error instanceof Error ? error.message : String(error) };
      return false;
    }
  };

  const fetchOk = await runStep('fetch', async () => (await import('@/scripts/fetch-sources')).runFetch());
  const enrichOk = fetchOk && await runStep('enrich', async () => (await import('@/scripts/enrich-articles')).runEnrich());
  const scoreOk = enrichOk && await runStep('score', async () => {
    if (!process.env.LLM_API_KEY && !process.env.DEEPSEEK_API_KEY) throw new Error('LLM_API_KEY not configured');
    return (await import('@/scripts/llm-score')).runScore();
  });
  const clusterOk = scoreOk && await runStep('cluster', async () => (await import('@/scripts/cluster-events')).runClustering());
  const success = Boolean(fetchOk && enrichOk && scoreOk && clusterOk);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  return NextResponse.json({ success, elapsed_seconds: Number(elapsed), results }, { status: success ? 200 : 500 });
}
