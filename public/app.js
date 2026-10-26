// app.js
import { createClient } from './core.js';
import { bindUI } from './ui.js';

const client = createClient();

bindUI(client, {
  box: document.getElementById('tt-progress'),
  fill: document.querySelector('#tt-progress .tt-fill'),
  label: document.querySelector('#tt-progress .tt-label'),
  result: document.getElementById('tt-result'),
  input: document.getElementById('input'),
  fetchBtn: document.getElementById('fetchBtn'),
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),
});