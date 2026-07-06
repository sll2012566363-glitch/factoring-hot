import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for Vercel Pro

export async function GET(request: NextRequest) {
  // Security: verify cron secret if set
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const results: Record<string, any> = {};
  const startTime = Date.now();

  try {
    // Step 1: Fetch new articles
    try {
      const { runFetch } = await import('@/scripts/fetch-sources');
      results.fetch = await runFetch();
    } catch (err) {
      results.fetch = { error: (err as Error).message };
    }

    // Step 2: Enrich articles (body text + dates)
    try {
      const { runEnrich } = await import('@/scripts/enrich-articles');
      results.enrich = await runEnrich();
    } catch (err) {
      results.enrich = { error: (err as Error).message };
    }

    // Step 3: LLM scoring
    try {
      if (process.env.DEEPSEEK_API_KEY) {
        const { runScore } = await import('@/scripts/llm-score');
        results.score = await runScore();
      } else {
        results.score = { skipped: true, reason: 'DEEPSEEK_API_KEY not set' };
      }
    } catch (err) {
      results.score = { error: (err as Error).message };
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    return NextResponse.json({
      success: true,
      elapsed_seconds: Number(elapsed),
      results,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message, results },
      { status: 500 }
    );
  }
}
