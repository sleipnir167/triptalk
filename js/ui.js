// UI ユーティリティ（DOM・モーダル・トースト・リング等）
import { icon } from './icons.js';
import { sfx } from './sfx.js';
import { mascot } from './mascot.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s = '') => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export const sample = (arr, n) => shuffle(arr).slice(0, n);

export function todayKey(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

/** ミリ秒 → 「10分」「3日」など */
export function fmtSpan(ms) {
  const m = ms / 6e4;
  if (m < 1) return '1分未満';
  if (m < 60) return `${Math.round(m)}分`;
  const h = m / 60;
  if (h < 22) return `${Math.round(h)}時間`;
  const d = h / 24;
  if (d < 14) return `${Math.max(1, Math.round(d))}日`;
  if (d < 60) return `${Math.round(d / 7)}週間`;
  if (d < 365) return `${Math.round(d / 30)}ヶ月`;
  return `${(d / 365).toFixed(1)}年`;
}

export function fmtDate(t) {
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fmtNum(n) {
  if (n >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

// ---- トースト ----
export function toast(msg, { type = 'info', ms = 2600, emoji = '' } = {}) {
  let wrap = $('#toasts');
  if (!wrap) { wrap = h('<div id="toasts" class="toasts" role="status" aria-live="polite"></div>'); document.body.append(wrap); }
  const el = h(`<div class="toast ${type}">${emoji ? `<span class="toast-emoji">${emoji}</span>` : ''}<span>${esc(msg)}</span></div>`);
  wrap.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 350); }, ms);
}

// ---- モーダル / シート ----
const openModals = [];
export function modal({ title = '', body = '', actions = [], cls = '', dismissible = true, onMount, headerHTML = '' } = {}) {
  return new Promise((resolve) => {
    const layer = $('#layer');
    const el = h(`
      <div class="modal-backdrop">
        <div class="modal ${cls}" role="dialog" aria-modal="true">
          ${headerHTML || (title ? `<div class="modal-head"><h3>${title}</h3>${dismissible ? `<button class="btn-icon ghost modal-x" aria-label="閉じる">${icon('x')}</button>` : ''}</div>` : '')}
          <div class="modal-body"></div>
          ${actions.length ? `<div class="modal-actions">${actions.map((a, i) => `<button class="btn ${a.cls || 'btn-soft'}" data-i="${i}">${a.label}</button>`).join('')}</div>` : ''}
        </div>
      </div>`);
    const bodyEl = $('.modal-body', el);
    if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.append(body);
    let done = false;
    const close = (v) => {
      if (done) return; done = true;
      el.classList.remove('show');
      openModals.splice(openModals.indexOf(close), 1);
      setTimeout(() => el.remove(), 260);
      resolve(v);
    };
    el.addEventListener('click', (e) => {
      if (e.target === el && dismissible) close(null);
      const x = e.target.closest('.modal-x'); if (x) close(null);
      const b = e.target.closest('.modal-actions [data-i]');
      if (b) {
        const a = actions[+b.dataset.i];
        if (a.onClick) { const r = a.onClick(close, el); if (r === false) return; }
        else close(a.value ?? a.label);
      }
    });
    layer.append(el);
    openModals.push(close);
    requestAnimationFrame(() => el.classList.add('show'));
    onMount?.(el, close);
  });
}
export function closeAllModals() { [...openModals].forEach((c) => c(null)); }

export function confirmDialog(message, { ok = 'OK', cancel = 'キャンセル', danger = false, title = '確認' } = {}) {
  return modal({
    title, body: `<p class="confirm-msg">${message}</p>`,
    actions: [{ label: cancel, value: false, cls: 'btn-soft' }, { label: ok, value: true, cls: danger ? 'btn-danger' : 'btn-primary' }],
  }).then((v) => v === true);
}

export function promptDialog({ title, label = '', value = '', placeholder = '', multiline = false, hint = '' }) {
  return modal({
    title,
    body: `<label class="field"><span>${label}</span>${multiline ? `<textarea class="input" rows="4" placeholder="${esc(placeholder)}">${esc(value)}</textarea>` : `<input class="input" value="${esc(value)}" placeholder="${esc(placeholder)}" autocapitalize="off" autocomplete="off">`}</label>${hint ? `<p class="small muted mt-8">${hint}</p>` : ''}`,
    actions: [{ label: 'キャンセル', value: null }, { label: 'OK', cls: 'btn-primary', onClick: (close, el) => close($('.input', el).value) }],
    onMount: (el) => setTimeout(() => $('.input', el)?.focus(), 250),
  });
}

// ---- 描画パーツ ----
let ringId = 0;
export function ring(pct, { size = 72, stroke = 8, label = '', sub = '', grad = ['#5b8cff', '#a855f7'], track = 'var(--ring-track)' } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = clamp(pct, 0, 1);
  const id = 'rg' + ++ringId;
  return `<div class="ring" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${grad[0]}"/><stop offset="1" stop-color="${grad[1]}"/></linearGradient></defs>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${track}" stroke-width="${stroke}" fill="none"/>
      <circle class="ring-val" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="url(#${id})" stroke-width="${stroke}" fill="none" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}" style="--c:${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg>
    ${label !== '' ? `<div class="ring-label"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</div>` : ''}
  </div>`;
}

export function bar(pct, cls = '') {
  return `<div class="bar ${cls}"><i style="width:${clamp(pct, 0, 1) * 100}%"></i></div>`;
}

export function countUp(el, to, ms = 900) {
  const start = performance.now();
  const from = 0;
  const step = (t) => {
    const k = Math.min(1, (t - start) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** 押した時の効果音を全体に付与 */
export function installTapSounds() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button, .tap');
    if (b && !b.disabled && !b.dataset.nosfx) sfx.play('tap');
  }, true);
}

export function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** AI の文章（■見出し・箇条書き・**太字**）を安全に HTML にする */
export function richText(text) {
  const lines = esc(String(text || '').trim()).split(/\r?\n/);
  let html = '', list = false;
  for (let ln of lines) {
    ln = ln.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');
    const li = ln.match(/^\s*(?:[-・*•]|\d+[.)])\s+(.*)/);
    if (li) { if (!list) { html += '<ul>'; list = true; } html += `<li>${li[1]}</li>`; continue; }
    if (list) { html += '</ul>'; list = false; }
    if (/^\s*#{1,4}\s+/.test(ln)) html += `<h4>${ln.replace(/^\s*#+\s+/, '')}</h4>`;
    else if (/^\s*[■◆●【]/.test(ln)) html += `<h4>${ln.trim()}</h4>`;
    else if (ln.trim()) html += `<p>${ln}</p>`;
  }
  if (list) html += '</ul>';
  return `<div class="rich">${html}</div>`;
}

export function emptyState({ emoji = '🗺️', title = '', text = '', actions = '', mood = '' }) {
  const top = mood ? `<div class="empty-mascot">${mascot(mood)}</div>` : `<div class="empty-emoji">${emoji}</div>`;
  return `<div class="empty">${top}<h3>${title}</h3><p class="muted">${text}</p><div class="row center gap-8 wrap">${actions}</div></div>`;
}
