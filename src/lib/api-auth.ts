import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

/** Internal write endpoints are closed unless API_KEY is explicitly configured. */
export function requireInternalApiKey(request: NextRequest): NextResponse | null {
  const expected = process.env.API_KEY;
  if (!expected) {
    return NextResponse.json({ error: 'API_KEY not configured' }, { status: 503 });
  }

  const authorization = request.headers.get('authorization');
  const provided = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  if (
    !provided ||
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
