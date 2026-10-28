// app.js
import { createTiktokClient } from './core.js';
import { bindTiktokUI, squareByHeight } from './ui.js';

const client = createTiktokClient();

const els = {
  // progress
  fill: document.querySelector('#tt-progress .tt-fill'),
  prgLbl: document.querySelector('#tt-progress .tt-label'),
  
  // input
  inputEl: document.getElementById('input'),
  pasteBtn: document.getElementById('pasteBtn'),
  pasteBtnSpan: document.querySelector('#pasteBtn span'),
  
  // fetch / status
  fetchBtn: document.getElementById('fetchBtn'),
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),
  
  // media card
  coverImg: document.querySelector('.media-card img'),
  dldTitle: document.querySelector('.media-card-title'),
  dldNew: document.querySelector('.media-download-btn.new'),
  dldBtns: {
    hd: document.querySelector('.media-download-btn.hd'),
    sd: document.querySelector('.media-download-btn.sd'),
    watermark: document.querySelector('.media-download-btn.watermark'),
    audio: document.querySelector('.media-download-btn.audio'),
  },
  
  // author / video stats
  avatarImg: document.querySelector('.avatar img'),
  uniqueIdEl: document.querySelector('.uniqueid'),
  nicknameEl: document.querySelector('.nickname'),
  authorStats: document.querySelectorAll('.author-stats .value'),
  videoStats: document.querySelectorAll('.video-stats .value'),
  engagement: document.getElementById('engagement'),
};

const ui = bindTiktokUI(client, els);

// init
squareByHeight(document.querySelector('.media-meta .flex-1'), { round: true });
ui.resetAll();
ui.updateHealth();

// console access
window.app = ui;
window.client = client;