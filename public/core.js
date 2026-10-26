// tiktok-core.js
// Pure library. No DOM. Returns plain data. Progress via callbacks.
// Works in browsers (DOMParser), Node with jsdom/linkedom, Deno, etc.

export const DEFAULT_ENDPOINTS = {
  main:   'https://jfr-tiktokio-proxy.vercel.app',
  meta:   'https://jfrtik.vercel.app',
  worker: 'https://jfr-tiktokio-proxy.rabiya3544.workers.dev',
};

export function createClient(endpoints = {}) {
  const E = { ...DEFAULT_ENDPOINTS, ...endpoints };

  // ── internal: stream from /api/jfrtok, return HTML string ─
  async function fetchHtml(vid, onProgress) {
    const res = await fetch(`${E.main}/api/jfrtok`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vid }),
    });

    if (!res.body || !res.ok) {
      const text = await res.text();
      throw new Error(`Proxy ${res.status}: ${text}`);
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '', html = null, error = null;

    const handle = (line) => {
      if (!line) return;
      const evt = JSON.parse(line);
      onProgress?.(evt);
      if (evt.stage === 'done')  html  = evt.data?.html ?? null;
      if (evt.stage === 'error') error = evt.msg;
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        handle(buf.slice(0, nl).trim());
        buf = buf.slice(nl + 1);
      }
    }
    handle(buf.trim());

    if (error) throw new Error(error);
    if (!html) throw new Error('No HTML in response');
    return html;
  }

  // ── internal: tiktokio HTML → plain object ──────────────
  function parseHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const el  = doc.querySelector('.tk-result-content');
    if (!el) throw new Error('tk-result-content not found');

    const pick = (cls) => el.querySelector(`.download-links a.${cls}`)?.href || null;
    return {
      cover:     el.querySelector('.video-info img')?.src || null,
      title:     el.querySelector('.video-info h3')?.textContent.trim() || null,
      sd:        pick('download-btn-blue'),
      hd:        pick('download-btn-green'),
      watermark: pick('download-btn-gray'),
      audio:     pick('download-btn-purple'),
    };
  }

  async function getSizes(urls) {
    const res = await fetch(`${E.main}/api/size`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Sizes ${res.status}`);
    return data;
  }

  async function getMeta(vid) {
    const res = await fetch(`${E.main}/api/scrape?url=${encodeURIComponent(vid)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  function buildFilename(meta, key) {
    const ext = key === 'audio' ? 'mp3' : 'mp4';
    if (!meta?.uniqueId || !meta?.videoId) return `tiktok_${key}.${ext}`;
    const safe = (s) => String(s).replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${safe(meta.uniqueId)}_${safe(meta.videoId)}_${key}.${ext}`;
  }

  function buildDownloadUrl(rawUrl, filename) {
    return `${E.worker}/api/download?url=${encodeURIComponent(rawUrl)}&filename=${encodeURIComponent(filename)}`;
  }

  async function checkHealth() {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetch(`${E.main}/api/health`, {
        signal: ctrl.signal,
        cache:  'no-store',
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── full pipeline — returns fully structured data ───────
  async function process(vid, { onProgress } = {}) {
    const t0 = (typeof performance !== 'undefined' ? performance : Date).now();

    onProgress?.({ stage: 'fetching', pct: 10, msg: 'Contacting TikTok…' });
    const html = await fetchHtml(vid, onProgress);

    onProgress?.({ stage: 'parsing', pct: 80, msg: 'Parsing…' });
    const data = parseHtml(html);

    onProgress?.({ stage: 'sizes', pct: 90, msg: 'Fetching file sizes…' });
    try {
      data.sizes = await getSizes({
        hd: data.hd, sd: data.sd, watermark: data.watermark, audio: data.audio,
      });
    } catch (e) { data.sizesError = String(e); }

    onProgress?.({ stage: 'meta', pct: 95, msg: 'Fetching metadata…' });
    try {
      const scrape = await getMeta(vid);
      data.meta = {
        uniqueId: scrape.author?.uniqueId ?? null,
        videoId:  scrape.video?.[0]?.id ?? null,
      };
    } catch { data.meta = null; }

    onProgress?.({ stage: 'done', pct: 100, msg: 'Done' });
    const now = (typeof performance !== 'undefined' ? performance : Date).now();
    return { ...data, elapsed: (now - t0) / 1000 };
  }

  return {
    fetchHtml, parseHtml, getSizes, getMeta,
    buildFilename, buildDownloadUrl, checkHealth, process,
  };
}