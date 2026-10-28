// core.js
// Pure data layer. No DOM. Produces the complete shape UI consumes.

export const DEFAULT_ENDPOINTS = {
  main:   'https://jfr-tiktokio-proxy.vercel.app',
  worker: 'https://jfr-tiktokio-proxy.rabiya3544.workers.dev',
};

export const DOWNLOAD_KEYS = ['hd', 'sd', 'watermark', 'audio'];

export function createTiktokClient(endpoints = {}) {
  const E = Object.assign({}, DEFAULT_ENDPOINTS, endpoints);

  // ── fetch + parse pipeline ────────────────────────────────
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

  // ── network endpoints ────────────────────────────────────
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

    return {
      uniqueId:       data.author?.uniqueId ?? null,
      videoId:        data.video?.[0]?.id ?? null,
      avatar:         data.author?.avatar ?? null,
      nickname:       data.author?.nickname ?? null,
      followingCount: data.author?.stats?.followingCount ?? 0,
      followerCount:  data.author?.stats?.followerCount ?? 0,
      heartCount:     data.author?.stats?.heartCount ?? 0,
      videoCount:     data.author?.stats?.videoCount ?? 0,
      playCount:      data.video?.[0]?.stats?.playCount ?? 0,
      diggCount:      data.video?.[0]?.stats?.diggCount ?? 0,
      commentCount:   data.video?.[0]?.stats?.commentCount ?? 0,
      shareCount:     data.video?.[0]?.stats?.shareCount ?? 0,
      collectCount:   data.video?.[0]?.stats?.collectCount ?? 0,
    };
  }

  async function checkHealth() {
    try {
      const res = await fetch(`${E.main}/api/health`);
      return res.ok;
    } catch {
      return false;
    }
  }

  // ── pure derivations ─────────────────────────────────────
  function calcEngagementRate(meta, { includeSaves = false } = {}) {
    if (!meta) return null;
    const views = Number(meta.playCount) || 0;
    if (views <= 0) return null;
    const total =
      (Number(meta.diggCount)    || 0) +
      (Number(meta.commentCount) || 0) +
      (Number(meta.shareCount)   || 0) +
      (includeSaves ? (Number(meta.collectCount) || 0) : 0);
    return (total / views) * 100;
  }

  function formatEngagementRate(meta, opts) {
    if (!meta) return '—';
    const er = calcEngagementRate(meta, opts);
    return er === null ? '—' : er.toFixed(2) + '%';
  }

  function formatCount(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return '0';
    const abs  = Math.abs(num);
    const sign = num < 0 ? '-' : '';
    if (abs < 1e3) return sign + String(abs);
    if (abs < 1e6) return sign + (abs / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    if (abs < 1e9) return sign + (abs / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    return sign + (abs / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
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

  // ── full pipeline — returns complete data ────────────────
  async function process(vid, { onProgress } = {}) {
    const now = () => (typeof performance !== 'undefined' ? performance : Date).now();
    const t0  = now();

    const html = await fetchHtml(vid, onProgress);
    const data = parseHtml(html);

    onProgress?.({ stage: 'sizes', pct: 90, msg: 'Fetching file sizes…' });
    try {
      data.sizes = await getSizes({
        hd: data.hd, sd: data.sd, watermark: data.watermark, audio: data.audio,
      });
    } catch (e) {
      data.sizesError = String(e);
    }

    onProgress?.({ stage: 'meta', pct: 95, msg: 'Fetching metadata…' });
    try {
      data.meta = await getMeta(vid);
    } catch (e) {
      data.meta = null;
      data.metaError = String(e);
    }

    // derived — everything below is pure, runs after sizes+meta
    data.engagementRate = formatEngagementRate(data.meta, { includeSaves: true });
    data.download = {};
    for (const key of DOWNLOAD_KEYS) {
      if (!data[key]) continue;
      const filename = buildFilename(data.meta, key);
      data.download[key] = { url: buildDownloadUrl(data[key], filename), filename };
    }
    data.elapsed = (now() - t0) / 1000;

    return data;
  }

  return {
    endpoints: E,
    // network
    fetchHtml, getSizes, getMeta, checkHealth,
    // pure
    parseHtml, calcEngagementRate, formatEngagementRate, formatCount,
    buildFilename, buildDownloadUrl,
    // pipeline
    process,
  };
}