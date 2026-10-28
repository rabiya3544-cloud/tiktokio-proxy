// ui.js
// Pure UI layer. No fetch. Consumes the client. Reads data, writes DOM — never mutates data.

import { DOWNLOAD_KEYS } from './core.js';

const HOLDER_IMG = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

const LABELS = {
  hd: 'HD',
  sd: 'SD',
  watermark: 'Watermark',
  audio: 'MP3',
};

const SKELETON_SELECTORS = [
  '.avatar img',
  '.handle',
  '.author-stats .stats',
  '.video-stats .stats',
  '.media-card img',
  '.media-download-btn.hd',
  '.media-download-btn.sd',
  '.media-download-btn.watermark',
  '.media-download-btn.audio',
  '.media-download-btn.new',
  '#engagement',
  '.media-card-body',
];

// ── standalone layout util — no client needed ───────────────
export function squareByHeight(target, { round = false, iterations = 0 } = {}) {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!(el instanceof Element)) {
    throw new TypeError('squareByHeight: no element found for ' + target);
  }

  const px = (v) => parseFloat(v) || 0;
  let applied = 0;

  for (let i = 0; i <= iterations; i++) {
    const height = el.getBoundingClientRect().height;
    if (height === 0) {
      console.warn('squareByHeight: element has zero height (hidden or not laid out yet)');
      return 0;
    }

    const cs = getComputedStyle(el);
    let width = height;

    if (cs.boxSizing === 'content-box') {
      width -= px(cs.paddingLeft) + px(cs.paddingRight) +
               px(cs.borderLeftWidth) + px(cs.borderRightWidth);
    }

    width = Math.max(0, width);
    if (round) width = Math.round(width);

    el.style.width = width + 'px';
    applied = width;
  }

  return applied;
}

// ── main binder ─────────────────────────────────────────────
export function bindTiktokUI(client, els) {
  const {
    fill, prgLbl,
    inputEl, pasteBtn, pasteBtnSpan,
    fetchBtn, statusDot, statusText,
    coverImg, dldTitle, dldNew, dldBtns,
    avatarImg, uniqueIdEl, nicknameEl,
    authorStats, videoStats, engagement,
  } = els;

  let revertTimer;

  // ── progress bar ────────────────────────────────────────
  function resetProgress() {
    fill.classList.remove('error');
    fill.style.width = '0%';
    prgLbl.textContent = 'Starting…';
  }

  // ── result area ─────────────────────────────────────────
  function resetUi() {
    coverImg.src = HOLDER_IMG;
    coverImg.alt = '';
    dldTitle.textContent = '';
    engagement.textContent = 'ER %';

    for (const key of DOWNLOAD_KEYS) {
      const btn = dldBtns[key];
      if (!btn) continue;
      btn.href = '';
      btn.removeAttribute('download');
      btn.textContent = LABELS[key];
      btn.title = '';
    }

    avatarImg.src = HOLDER_IMG;
    uniqueIdEl.textContent = '-';
    nicknameEl.textContent = '-';
    for (let i = 0; i < authorStats.length; i++) authorStats[i].textContent = '-';
    for (let i = 0; i < videoStats.length;  i++) videoStats[i].textContent  = '-';
  }

  function resetAll() {
    resetProgress();
    resetUi();
  }

  // ── skeleton placeholders ───────────────────────────────
  function addSkeletons(root = document) {
    if (root.querySelector('.skeleton')) return;
    for (const sel of SKELETON_SELECTORS) {
      root.querySelectorAll(sel).forEach(el => el.classList.add('skeleton'));
    }
  }

  function removeSkeletons(root = document) {
    root.querySelectorAll('.skeleton').forEach(el => el.classList.remove('skeleton'));
  }

  // ── paste button feedback ───────────────────────────────
  function flash(text, ok) {
    pasteBtnSpan.textContent = text;
    pasteBtn.style.color = ok ? '' : 'var(--error)';
    pasteBtn.style.borderColor = ok ? '' : 'var(--error)';
    clearTimeout(revertTimer);
    revertTimer = setTimeout(() => {
      pasteBtnSpan.textContent = 'Paste';
      pasteBtn.style.color = '';
      pasteBtn.style.borderColor = '';
    }, 1400);
  }

  async function pasteFromClipboard() {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      flash('Denied', false);
      inputEl.focus();
      return;
    }
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) { flash('Empty', false); return; }
      inputEl.value = text;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.focus();
      flash('Pasted', true);
    } catch {
      flash('Denied', false);
      inputEl.focus();
    }
  }

  // ── renderers — pure reads, DOM writes only ─────────────
  function renderMeta(data) {
    if (!data.meta) {
      // leave dashes from resetUi — nothing to show
      return;
    }
    const m = data.meta;
    engagement.textContent = data.engagementRate;
    avatarImg.src = m.avatar || HOLDER_IMG;
    uniqueIdEl.textContent = '@' + (m.uniqueId || '-');
    nicknameEl.textContent = m.nickname || '-';
    authorStats[0].textContent = client.formatCount(m.followingCount);
    authorStats[1].textContent = client.formatCount(m.followerCount);
    authorStats[2].textContent = client.formatCount(m.heartCount);
    authorStats[3].textContent = client.formatCount(m.videoCount);
    videoStats[0].textContent  = client.formatCount(m.playCount);
    videoStats[1].textContent  = client.formatCount(m.diggCount);
    videoStats[2].textContent  = client.formatCount(m.commentCount);
    videoStats[3].textContent  = client.formatCount(m.shareCount);
    videoStats[4].textContent  = client.formatCount(m.collectCount);
  }

  function renderMedia(data) {
    coverImg.src = data.cover || HOLDER_IMG;
    coverImg.alt = data.title || '';
    dldTitle.textContent = data.title || '';

    for (const key of DOWNLOAD_KEYS) {
      const dl = data.download?.[key];
      const btn = dldBtns[key];
      if (!dl || !btn) continue;

      const info = data.sizes?.[key];
      const size = info?.human ? ` (${info.human})` : '';

      btn.href     = dl.url;
      btn.download = dl.filename;
      btn.textContent = `${LABELS[key]}${size}`;
      btn.title    = info?.bytes ? `${info.bytes.toLocaleString()} bytes` : '';
    }
  }

  // ── health (UI side) ────────────────────────────────────
  async function updateHealth() {
    const ok = await client.checkHealth();
    statusDot.classList.remove('up', 'down');
    statusDot.classList.add(ok ? 'up' : 'down');
    statusText.textContent = ok ? 'online' : 'offline';
    return ok;
  }

  // ── orchestrator ────────────────────────────────────────
  async function load(vid) {
  resetAll();
  addSkeletons();
  
  const t0 = performance.now();
  
  try {
    const data = await client.process(vid, {
      onProgress: (evt) => {
        fill.style.width = evt.pct + '%';
        const secs = ((performance.now() - t0) / 1000).toFixed(1);
        prgLbl.textContent = `${evt.msg} (${secs}s)`;
      },
    });
    
    renderMeta(data);
    renderMedia(data);
    console.log(data);
    fill.style.width = '100%';
    prgLbl.textContent = `Done in ${data.elapsed.toFixed(1)}s`;
    
    return data;
  } catch (e) {
    fill.classList.add('error');
    fill.style.width = '100%';
    prgLbl.textContent = 'Error: ' + e.message;
    throw e;
  } finally {
    removeSkeletons();
  }
}

  // ── event wiring ────────────────────────────────────────
  pasteBtn.addEventListener('mousedown', (e) => e.preventDefault());
  pasteBtn.addEventListener('click', pasteFromClipboard);

  fetchBtn.addEventListener('click', () => {
    const v = inputEl.value.trim();
    if (v) load(v).catch(() => {});
  });

  dldNew.addEventListener('click', resetAll);

  return {
    load, resetProgress, resetUi, resetAll,
    renderMeta, renderMedia, updateHealth,
    addSkeletons, removeSkeletons,
    flash, pasteFromClipboard,
  };
}