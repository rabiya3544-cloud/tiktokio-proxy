// api/size.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const urls = body.urls;
  if (!urls || typeof urls !== 'object') {
    return res.status(400).json({ error: 'urls object required' });
  }

  const entries = Object.entries(urls).filter(
    ([, u]) => typeof u === 'string' && /^https?:\/\//i.test(u)
  );
  if (!entries.length) return res.status(400).json({ error: 'no valid urls' });

  // probe all in parallel
  const settled = await Promise.all(
    entries.map(async ([key, url]) => {
      try {
        return [key, await getSize(url)];
      } catch (e) {
        return [key, { error: e.message || String(e) }];
      }
    })
  );

  return res.status(200).json(Object.fromEntries(settled));
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function getSize(url) {
  // PRIMARY — HEAD returns content-length directly (verified for hd/sd/watermark/audio)
  try {
    const r = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(5000),
    });
    const len = r.headers.get('content-length');
    if (r.ok && len && len !== '0') {
      return pack(Number(len), r.headers.get('content-type'));
    }
  } catch { /* fall through */ }

  // FALLBACK — Range 0-0. Total is in content-range, NOT content-length.
  // (content-length on a 206 is the range length — "1" — not the file size.)
  try {
    const r = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': UA, Range: 'bytes=0-0' },
      signal: AbortSignal.timeout(6000),
    });
    const cr = r.headers.get('content-range');          // "bytes 0-0/53457795"
    const m  = cr && /bytes\s+\d+-\d+\/(\d+)/i.exec(cr);
    r.body?.cancel?.();
    if (m) return pack(Number(m[1]), r.headers.get('content-type'));
  } catch { /* fall through */ }

  throw new Error('size unavailable');
}

function pack(bytes, type) {
  return {
    bytes,
    human: formatBytes(bytes),
    type:  type || 'application/octet-stream',
  };
}

function formatBytes(b) {
  if (!Number.isFinite(b) || b < 0) return '?';
  if (b < 1000) return `${b} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  do { b /= 1000; i++; } while (b >= 1000 && i < units.length - 1);
  return `${b.toFixed(1)} ${units[i]}`;
}
