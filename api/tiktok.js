export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const vid = body.vid;

  // vid is a TikTok URL, not an ID
  if (typeof vid !== 'string' || !/^https?:\/\//i.test(vid.trim())) {
    return res.status(400).json({ error: 'vid must be a TikTok URL' });
  }

  try {
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

    const text = await upstream.text();
    res
      .status(upstream.status)
      .setHeader('Content-Type', upstream.headers.get('content-type') || 'text/html; charset=utf-8')
      .setHeader('Cache-Control', 'public, max-age=30')
      .send(text);
  } catch (e) {
    res.status(502).json({ error: 'Upstream failed', detail: String(e) });
  }
}
