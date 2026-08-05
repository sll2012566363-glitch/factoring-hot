const GB_CHARSET_RE = /^(?:gb2312|gbk|gb18030)$/i;

function declaredCharset(response: Response, bytes: Uint8Array): string {
  const header = response.headers.get('content-type') || '';
  const headerMatch = header.match(/charset\s*=\s*["']?([^;"'\s]+)/i);
  if (headerMatch) return headerMatch[1];

  const ascii = Buffer.from(bytes.subarray(0, 4096)).toString('latin1');
  return ascii.match(/<meta[^>]+charset\s*=\s*["']?([^"'\s/>]+)/i)?.[1]
    || ascii.match(/<meta[^>]+content=["'][^"']*charset=([^"'\s;]+)/i)?.[1]
    || 'utf-8';
}

/** Decode Chinese pages that still declare GBK/GB2312 instead of UTF-8. */
export async function readHtmlResponse(response: Response): Promise<string> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  const charset = declaredCharset(response, bytes).trim().toLowerCase();
  const encoding = GB_CHARSET_RE.test(charset) ? 'gb18030' : charset;

  try {
    return new TextDecoder(encoding).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}
