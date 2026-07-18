/**
 * Sources whose article pages are only client-side shells. Their own public
 * page scripts disclose these JSON endpoints; retrieve the same article HTML
 * server-side so detail pages can retain body text and images.
 */
export async function fetchSourceBody(url: string): Promise<string | null> {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }

  try {
    if (parsed.hostname.endsWith('dahecube.com')) {
      const artid = parsed.searchParams.get('artid');
      if (!artid) return null;
      const response = await fetch('https://app.dahecube.com/napi/news/pc/artinfo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://www.dahecube.com',
          'Referer': 'https://www.dahecube.com/',
          'User-Agent': 'Mozilla/5.0 (compatible; FactoringHot/1.0)',
        },
        body: JSON.stringify({ artid }),
        signal: AbortSignal.timeout(15000),
      });
      const payload = await response.json() as { code?: number; data?: { content?: string } };
      return response.ok && payload.code === 0 && payload.data?.content ? payload.data.content : null;
    }

    if (parsed.hostname.endsWith('syblxh.org.cn')) {
      const newsid = parsed.searchParams.get('newsid');
      const pageid = parsed.pathname.match(/\/(\d+)-\d+\.html$/)?.[1];
      if (!newsid || !pageid) return null;
      const endpoint = new URL('https://s143js.nicebox.cn/sysTools.php');
      endpoint.search = new URLSearchParams({
        mod: 'viewsConn', rtype: 'json', idweb: '63623',
        viewid: 'newsDetail_style_01_1506318095542', name: 'newsDetail', style: 'style_01',
        langid: '0', pageid, viewCtrl: 'newsDetail', isfb: '1', newsid,
      }).toString();
      const response = await fetch(endpoint, {
        headers: { 'Referer': parsed.origin + '/', 'User-Agent': 'Mozilla/5.0 (compatible; FactoringHot/1.0)' },
        signal: AbortSignal.timeout(15000),
      });
      const payload = await response.json() as { html?: string };
      return response.ok && payload.html ? payload.html : null;
    }
  } catch {
    // Source-specific extraction is an optional enhancement; generic parsing follows.
  }
  return null;
}
