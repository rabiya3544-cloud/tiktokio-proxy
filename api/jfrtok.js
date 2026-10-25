export const config = { maxDuration: 30 }; // Pro; hobby caps at 10s

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const vid = body.vid;
  if (typeof vid !== 'string' || !/^https?:\/\//i.test(vid.trim())) {
    return res.status(400).json({ error: 'vid must be a TikTok URL' });
  }

  // ── switch to streaming ─────────────────────────────────────
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no'); // tells some proxies not to buffer
  res.flushHeaders?.();

  const send = (obj) => {
    res.write(JSON.stringify(obj) + '\n');
    res.flush?.(); // Express/compression may expose this; Vercel ignores if absent
  };

  try {
    send({ stage: 'received',   pct: 5,  msg: 'Request received' });

    send({ stage: 'contacting', pct: 15, msg: 'Contacting TikTok…' });
    const upstream = await fetch('https://tiktokio.com/api/v1/tk/html', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://tiktokio.com',
        'Referer': 'https://tiktokio.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                      '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      },
      body: JSON.stringify({ vid: vid.trim(), prefix: 'tiktokio.com' }),
    });

    send({ stage: 'waiting',    pct: 40, msg: 'Waiting for TikTok…' });
    const html = await upstream.text();

    send({ stage: 'parsing',    pct: 80, msg: 'Preparing result…' });
    if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);

    send({ stage: 'done', pct: 100, msg: 'Done', data: { html } });
    res.end();
  } catch (e) {
    send({ stage: 'error', pct: 100, msg: String(e) });
    res.end();
  }
}
