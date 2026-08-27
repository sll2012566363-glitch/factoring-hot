import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for Vercel Pro

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// A crashed instance never marks its row finished; anything older than
// maxDuration + margin is treated as a stale lock and ignored.
const LOCK_STALE_MINUTES = 6;

interface RunLock {
  allowed: boolean;
  finish: (status: 'finished' | 'failed') => Promise<void>;
}

async function acquireRunLock(): Promise<RunLock> {
  const staleBefore = new Date(Date.now() - LOCK_STALE_MINUTES * 60_000).toISOString();
  try {
    const { data: active, error } = await supabase
      .from('pipeline_runs')
      .select('id, started_at')
      .eq('status', 'running')
      .gt('started_at', staleBefore)
      .order('started_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    if (active && active.length > 0) {
      console.warn(`Run lock held since ${active[0].started_at}; refusing to start.`);
      return { allowed: false, finish: async () => {} };
    }
    const { data: inserted, error: insertError } = await supabase
      .from('pipeline_runs')
      .insert({ status: 'running', trigger: 'http' })
      .select('id')
      .single();
    if (insertError) throw insertError;
    const runId = inserted.id;
    return {
      allowed: true,
      finish: async (status) => {
        await supabase
          .from('pipeline_runs')
          .update({ status, finished_at: new Date().toISOString() })
          .eq('id', runId);
      },
    };
  } catch (error) {
    // pipeline_runs migration not applied yet — log and proceed unlocked.
    console.warn(`Run lock unavailable (${(error as Error).message}); proceeding without lock.`);
    return { allowed: true, finish: async () => {} };
  }
}

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

  const lock = await acquireRunLock();
  if (!lock.allowed) {
    return NextResponse.json(
      { error: 'Pipeline is already running. Try again after it finishes.' },
      { status: 409 }
    );
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

  try {
    const fetchOk = await runStep('fetch', async () => (await import('@/scripts/fetch-sources')).runFetch());
    const enrichOk = fetchOk && await runStep('enrich', async () => (await import('@/scripts/enrich-articles')).runEnrich());
    const scoreOk = enrichOk && await runStep('score', async () => {
      if (!process.env.LLM_API_KEY && !process.env.DEEPSEEK_API_KEY) throw new Error('LLM_API_KEY not configured');
      return (await import('@/scripts/llm-score')).runScore();
    });
    const reconcileOk = scoreOk && await runStep('reconcile', async () => (await import('@/scripts/reconcile-selection')).reconcileSelection());
    const clusterOk = reconcileOk && await runStep('cluster', async () => (await import('@/scripts/cluster-events')).runClustering());
    const success = Boolean(fetchOk && enrichOk && scoreOk && reconcileOk && clusterOk);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    await lock.finish(success ? 'finished' : 'failed');
    return NextResponse.json({ success, elapsed_seconds: Number(elapsed), results }, { status: success ? 200 : 500 });
  } catch (error) {
    await lock.finish('failed');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
