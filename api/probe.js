export const config = { maxDuration: 30 };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export default async function handler(req, res) {
  const url = req.query.url || (typeof req.body === 'object' && req.body?.url);
  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: '?url= required' });
  }

  const out = { url, chain: [], head: null, range: null, get: null };

  // 1. manual redirect chain — see each hop
  let cur = url;
  for (let i = 0; i < 6; i++) {
    try {
      const r = await fetch(cur, {
        method: 'HEAD', redirect: 'manual',
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000),
      });
      out.chain.push({
        url: cur,
        status: r.status,
        location: r.headers.get('location'),
        contentType: r.headers.get('content-type'),
        contentLength: r.headers.get('content-length'),
        acceptRanges: r.headers.get('accept-ranges'),
      });
      const loc = r.headers.get('location');
      if (r.status >= 300 && r.status < 400 && loc) {
        cur = new URL(loc, cur).href;
      } else break;
    } catch (e) {
      out.chain.push({ url: cur, error: String(e) });
      break;
    }
  }

  // 2. followed HEAD
  try {
    const r = await fetch(url, {
      method: 'HEAD', redirect: 'follow',
      headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000),
    });
    out.head = {
      status: r.status, finalUrl: r.url,
      contentType: r.headers.get('content-type'),
      contentLength: r.headers.get('content-length'),
      acceptRanges: r.headers.get('accept-ranges'),
    };
  } catch (e) { out.head = { error: String(e) }; }

  // 3. Range GET — one byte, total in Content-Range
  try {
    const r = await fetch(url, {
      method: 'GET', redirect: 'follow',
      headers: { 'User-Agent': UA, Range: 'bytes=0-0' },
      signal: AbortSignal.timeout(10000),
    });
    out.range = {
      status: r.status, finalUrl: r.url,
      contentRange: r.headers.get('content-range'),
      contentLength: r.headers.get('content-length'),
      contentType: r.headers.get('content-type'),
    };
    r.body?.cancel?.();
  } catch (e) { out.range = { error: String(e) }; }

  return res.status(200).json(out);
}
