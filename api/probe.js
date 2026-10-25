export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  let url = req.query?.url;
  if (!url) {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    url = body.url;
  }
  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: '?url= required' });
  }

  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
             '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

  // run HEAD and Range in PARALLEL, each capped at 6s
  const [headResult, rangeResult] = await Promise.allSettled([
    (async () => {
      const r = await fetch(url, {
        method: 'HEAD', redirect: 'follow',
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(6000),
      });
      return {
        status: r.status,
        finalUrl: r.url,
        contentType: r.headers.get('content-type'),
        contentLength: r.headers.get('content-length'),
        acceptRanges: r.headers.get('accept-ranges'),
      };
    })(),
    (async () => {
      const r = await fetch(url, {
        method: 'GET', redirect: 'follow',
        headers: { 'User-Agent': UA, Range: 'bytes=0-0' },
        signal: AbortSignal.timeout(6000),
      });
      const out = {
        status: r.status,
        finalUrl: r.url,
        contentRange: r.headers.get('content-range'),
        contentLength: r.headers.get('content-length'),
        contentType: r.headers.get('content-type'),
      };
      r.body?.cancel?.();
      return out;
    })(),
  ]);

  return res.status(200).json({
    url,
    head:  headResult.status  === 'fulfilled' ? headResult.value  : { error: String(headResult.reason) },
    range: rangeResult.status === 'fulfilled' ? rangeResult.value : { error: String(rangeResult.reason) },
  });
}
