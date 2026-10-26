// tiktok-ui.js
// All DOM. Never calls fetch directly. Takes a tiktok client + elements.

export function bindUI(client, els) {
  const { box, fill, label, result, input, fetchBtn, statusDot, statusText } = els;
  
  function resetProgress({ hide = true } = {}) {
    fill.classList.remove('error');
    fill.style.width = '0%';
    label.textContent = 'Starting…';
    label.classList.remove('is-error', 'is-success');
    result.replaceChildren();
    box.hidden = hide;
  }
  
  function renderCard(data) {
    const card = document.createElement('div');
    card.className = 'media-card';
    
    const preview = document.createElement('div');
    preview.className = 'media-preview';
    card.append(preview);
    
    if (data.cover) {
      const img = document.createElement('img');
      img.src = data.cover;
      img.alt = data.title || '';
      img.loading = 'lazy';
      preview.append(img);
    }
    
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
    
    const labels = { hd: 'HD', sd: 'SD', watermark: 'Watermark', audio: 'MP3' };
    
    for (const [key, text] of Object.entries(labels)) {
      if (!data[key]) continue;
      
      const info = data.sizes?.[key];
      const size = info?.human ? ` (${info.human})` : '';
      const fname = client.buildFilename(data.meta, key);
      
      const a = document.createElement('a');
      a.className = 'media-download-btn ' + key;
      a.href = client.buildDownloadUrl(data[key], fname);
      a.download = fname;
      a.textContent = `${text}${size}`;
      if (info?.bytes) a.title = `${info.bytes.toLocaleString()} bytes`;
      meta.append(a);
    }
    
    const spacer = document.createElement('span');
    spacer.className = 'flex-1';
    meta.append(spacer);
    
    const newBtn = document.createElement('button');
    newBtn.className = 'media-download-btn new';
    newBtn.type = 'button';
    newBtn.textContent = 'New';
    meta.append(newBtn);
    
    return card;
  }
  
  async function load(vid) {
    resetProgress({ hide: false });
    const t0 = Date.now();
    try {
      const data = await client.process(vid, {
        onProgress: (evt) => {
          fill.style.width = evt.pct + '%';
          const secs = ((Date.now() - t0) / 1000).toFixed(1);
          label.textContent = `${evt.msg} (${secs}s)`;
        },
      });
      
      fill.style.width = '100%';
      label.classList.add('is-success');
      label.textContent = `Done in ${data.elapsed.toFixed(1)}s`;
      result.append(renderCard(data));
      return data;
    } catch (e) {
      fill.classList.add('error');
      fill.style.width = '100%';
      label.classList.add('is-error');
      label.textContent = 'Error: ' + e.message;
      throw e;
    } finally {
      setTimeout(() => { box.hidden = true; }, 2000);
    }
  }
  
  async function updateHealth() {
    const ok = await client.checkHealth();
    statusDot.classList.remove('up', 'down');
    statusDot.classList.add(ok ? 'up' : 'down');
    statusText.textContent = ok ? 'online' : 'unreachable';
    return ok;
  }
  
  fetchBtn.addEventListener('click', () => {
    const value = input.value.trim();
    if (!value) return;
    load(value).catch(() => {}); // swallow — error already in label
  });
  
  resetProgress({ hide: false });
  updateHealth();
  
  return { load, updateHealth, resetProgress, renderCard };
}