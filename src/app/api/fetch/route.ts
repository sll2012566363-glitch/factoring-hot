import { NextRequest, NextResponse } from 'next/server';

/**
 * 手动触发抓取 API。
 * 复用 src/scripts/fetch-sources.ts 的 runFetch()，走完整的 relevance 闸门 +
 * sanitizePubDate（未来日期拦截）+ nowToMinute fallback + PDF/二进制防护。
 * 不再维护一套绕过闸门的简陋实现。
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Vercel Pro

export async function POST(request: NextRequest) {
  // 鉴权：必须配置 API_KEY 且请求携带正确 key（默认 closed）
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'API_KEY not configured' }, { status: 503 });
  }
  const headerKey = request.headers.get('authorization')?.replace('Bearer ', '');
  const queryKey = request.nextUrl.searchParams.get('api_key');
  if (headerKey !== apiKey && queryKey !== apiKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { runFetch } = await import('@/scripts/fetch-sources');
    const result = await runFetch();
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('Fetch error:', error);
    return NextResponse.json(
      { error: 'Fetch failed', message: (error as Error).message },
      { status: 500 }
    );
  }
}
