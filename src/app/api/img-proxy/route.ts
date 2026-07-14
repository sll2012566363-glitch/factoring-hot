import { NextRequest, NextResponse } from 'next/server';

/**
 * Image proxy API — fetches remote images server-side to bypass hotlink protection.
 * Mirrors wx-kit's fetchBinary() with Referer header, but serves via HTTP instead of local files.
 * Vercel edge cache handles caching (Cache-Control: public, max-age=604800 = 7 days).
 */

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

/** 内网/环回/链路本地/元数据地址一律拒绝（SSRF 防护） */
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  // IPv6 环回/链路本地/ULA/IPv4映射
  if (h === '::1' || h === '::' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('::ffff:')) return true;
  // IPv4 字面量
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)];
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;           // 链路本地/云元数据
  if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16/12
  if (a === 192 && b === 168) return true;
  if (a >= 224) return true;                          // 组播/保留
  return false;
}
export async function GET(request: NextRequest) {
  const imageUrl = request.nextUrl.searchParams.get('url');
  if (!imageUrl) {
    return new NextResponse('Missing url parameter', { status: 400 });
  }

  // Validate URL
  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return new NextResponse('Invalid protocol', { status: 400 });
    }
  } catch {
    return new NextResponse('Invalid URL', { status: 400 });
  }

  // SSRF 防护：拦截内网/环回/链路本地地址
  if (isPrivateHost(parsed.hostname)) {
    return new NextResponse('Forbidden host', { status: 403 });
  }

  try {
    // Derive Referer from the image's origin (helps bypass hotlink protection)
    const referer = `${parsed.protocol}//${parsed.host}/`;

    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': referer,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return new NextResponse(`Upstream error: ${response.status}`, { status: response.status });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';

    // 大小上限：先看声明，下载后再实测（防无 Content-Length 的超大响应）
    const declaredLen = parseInt(response.headers.get('content-length') || '0', 10);
    if (declaredLen > MAX_IMAGE_BYTES) {
      return new NextResponse('Image too large', { status: 413 });
    }
    const data = await response.arrayBuffer();
    if (data.byteLength > MAX_IMAGE_BYTES) {
      return new NextResponse('Image too large', { status: 413 });
    }

    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=604800, s-maxage=604800',
        'Content-Length': String(data.byteLength),
      },
    });
  } catch (error) {
    const msg = (error as Error).message;
    return new NextResponse(`Fetch failed: ${msg}`, { status: 502 });
  }
}
