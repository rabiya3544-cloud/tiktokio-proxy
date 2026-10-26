const VERCEL_API = 'https://jfr-tiktokio-proxy.vercel.app';
// jfrtok + size
const VERCEL_META = 'https://jfrtik.vercel.app';
// scrape
const WORKER_DL = 'https://jfr-tiktokio-proxy.rabiya3544.workers.dev/api/download';

const authorStats = document.querySelectorAll('.author-stats .value');
const videoStats = document.querySelectorAll('.video-stats .value');
const box = document.getElementById('tt-progress');
const fill = box.querySelector('.tt-fill');
const label = box.querySelector('.tt-label');
const result = document.getElementById('tt-result');
const inputEl = document.getElementById("input");
const fetchBtn = document.getElementById("fetchBtn");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");

function resetProgress({ hide = true } = {}) {
  // progress bar
  fill.classList.remove('error');
  fill.style.width = '0%';
  
  // label
  label.textContent = 'Starting…';
  
  // result area
  result.replaceChildren();
  
  // visibility
  //box.hidden = hide;
}

async function tiktokWithProgress(vid, onProgress) {
  const res = await fetch(`${VERCEL_API}/api/jfrtok`, {
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
  let buf = '', data = null, error = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const evt = JSON.parse(line);
      onProgress?.(evt);
      if (evt.stage === 'done')  data  = evt.data;
      if (evt.stage === 'error') error = evt.msg;
    }
  }

  const tail = buf.trim();
  if (tail) {
    const evt = JSON.parse(tail);
    onProgress?.(evt);
    if (evt.stage === 'done')  data  = evt.data;
    if (evt.stage === 'error') error = evt.msg;
  }

  if (error) throw new Error(error);
  if (!data?.html) throw new Error('No HTML in response');

  const doc = new DOMParser().parseFromString(data.html, 'text/html');
  const el  = doc.querySelector('.tk-result-content');
  if (!el) throw new Error('tk-result-content not found');
  return el;
}

// ← this was missing: el → plain object
function parseTiktokResult(el) {
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

function formatCount(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '0';
  
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  
  if (abs < 1000) return sign + String(abs);
  if (abs < 1e6) return sign + (abs / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  if (abs < 1e9) return sign + (abs / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  return sign + (abs / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
}

function makeFilename(meta, key) {
  const ext = key === 'audio' ? 'mp3' : 'mp4';
  if (!meta?.uniqueId || !meta?.videoId) return `tiktok_${key}.${ext}`;
  
  // strip anything OS-hostile; TikTok usernames/ids are usually safe already
  const safe = (s) => String(s).replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${safe(meta.uniqueId)}_${safe(meta.videoId)}_${key}.${ext}`;
}

function renderTiktok(data) {
  const card = document.createElement('div');
  card.className = 'media-card';
  
  const preview = document.createElement('div');
  preview.className = 'media-preview';
  card.append(preview);
  
  const img = document.createElement('img');
  img.src = data.cover || '';
  img.alt = data.title || '';
  img.loading = 'lazy';
  preview.append(img);
  
  const meta = document.createElement('div');
  meta.className = 'media-meta';
  preview.append(meta);
  
  const cardBody = document.createElement('div');
  cardBody.className = 'media-card-body';
  card.append(cardBody);
  
  if (data.title) {
    const cardTitle = document.createElement('div');
    cardTitle.className = 'media-card-title';
    cardTitle.textContent = data.title;
    cardBody.append(cardTitle);
  }
  
  const cardStatus = document.createElement('div');
  cardStatus.className = 'media-download-status';
  cardStatus.style.display = 'none';
  cardBody.append(cardStatus);
  
  const labels = {
    hd: 'HD',
    sd: 'SD',
    watermark: 'Watermark',
    audio: 'MP3',
  };
  
  for (const [key, label] of Object.entries(labels)) {
  if (!data[key]) continue;
  
  const info = data.sizes?.[key];
  const size = info?.human ? ` (${info.human})` : '';
  const fname = makeFilename(data.meta, key);
  
  const a = document.createElement('a');
  a.className = 'media-download-btn ' + key;
  a.href = `${WORKER_DL}?url=${encodeURIComponent(data[key])}&filename=${encodeURIComponent(fname)}`;
  a.download = fname;
  a.textContent = `${label}${size}`;
  if (info?.bytes) a.title = `${info.bytes.toLocaleString()} bytes`;
  meta.append(a);
}
  
const span = document.createElement('span');
span.className = 'flex-1';
meta.append(span);
  const button = document.createElement('button');
  button.className = 'media-download-btn new';
  button.type = "button";
  button.textContent = "New";
  meta.append(button);
  
  return card;
}

async function checkHealth() {
  try {
    const res = await fetch(VERCEL_API + "/api/health");
    if (res.ok) {
      statusDot.classList.add("up");
      statusText.textContent = "online";
    } else {
      throw new Error();
    }
  } catch {
    statusDot.classList.add("down");
    statusText.textContent = "unreachable";
  }
}


async function getSizes(urls, proxy = `${VERCEL_API}/api/size`) {
  const res = await fetch(proxy, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Sizes ${res.status}`);
  return data;
}

async function fetchScrape(url) {
  const res = await fetch(`${VERCEL_API}/api/scrape?url=${encodeURIComponent(url)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function load(vid) {
  resetProgress({ hide: false });

  const t0 = performance.now();
  try {
    // ── 1. TikTok data (stream) ──────────────────────────
    const el = await tiktokWithProgress(vid, (evt) => {
      fill.style.width = evt.pct + '%';
      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      label.textContent = `${evt.msg} (${secs}s)`;
    });

    const data = parseTiktokResult(el);

    // ── 2. File sizes ────────────────────────────────────
    fill.style.width = '90%';
    label.textContent = 'Fetching file sizes…';
    try {
      data.sizes = await getSizes({
        hd: data.hd,
        sd: data.sd,
        watermark: data.watermark,
        audio: data.audio,
      });
    } catch (e) { console.warn('sizes failed:', e); }

    // ── 3. Metadata ──────────────────────────────────────
    fill.style.width = '95%';
    label.textContent = 'Fetching metadata…';
    try {
      const scrape = await fetchScrape(vid);
      data.meta = {
        uniqueId: scrape.author?.uniqueId ?? null,
        videoId:  scrape.video?.[0]?.id ?? null,
        avatar: scrape.author?.avatar ?? null,
        nickname: scrape.author?.nickname ?? null,
        followingCount: scrape.author?.stats?.followingCount ?? 0,
        followerCount: scrape.author?.stats?.followerCount ?? 0,
        heartCount: scrape.author?.stats?.heartCount ?? 0,
        videoCount: scrape.author?.stats?.videoCount ?? 0,
        playCount: scrape.video?.[0]?.stats?.playCount ?? 0,
        diggCount: scrape.video?.[0]?.stats?.diggCount ?? 0,
        commentCount: scrape.video?.[0]?.stats?.commentCount ?? 0,
        shareCount: scrape.video?.[0]?.stats?.shareCount ?? 0,
        collectCount: scrape.video?.[0]?.stats?.collectCount ?? 0,
      };
    } catch (e) { console.warn('meta failed:', e); data.meta = null; }

    fill.style.width = '100%';
    label.textContent = `Done in ${((performance.now() - t0) / 1000).toFixed(1)}s`;
    document.querySelector(".avatar img").src = data.meta.avatar;
    document.querySelector(".uniqueid").textContent = "@" + data.meta.uniqueId;
    document.querySelector(".nickname").textContent = data.meta.nickname;
    authorStats[0].textContent = formatCount(data.meta.followingCount);
    authorStats[1].textContent = formatCount(data.meta.followerCount);
    authorStats[2].textContent = formatCount(data.meta.heartCount);
    authorStats[3].textContent = formatCount(data.meta.videoCount);
    videoStats[0].textContent = formatCount(data.meta.playCount);
    videoStats[1].textContent = formatCount(data.meta.diggCount);
    videoStats[2].textContent = formatCount(data.meta.commentCount);
    videoStats[3].textContent = formatCount(data.meta.shareCount);
    videoStats[3].textContent = formatCount(data.meta.collectCount);
    result.append(renderTiktok(data));
  } catch (e) {
    fill.classList.add('error');
    fill.style.width = '100%';
    label.textContent = 'Error: ' + e.message;
  } finally {
    setTimeout(() => {
      //box.hidden = true;
    }, 2000);
  }
}

function runFetch() {
const value = inputEl.value.trim();
load(value);
}

fetchBtn.addEventListener("click", runFetch);

//resetProgress({hide: false});
checkHealth();
