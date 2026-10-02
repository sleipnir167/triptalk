// エントリーポイント
import { initStore, state } from './store.js';
import { buildContent } from './content.js';
import { unlockAudio } from './sfx.js';
import { renderNav } from './nav.js';
import { route } from './router.js';
import { initVoices } from './speech.js';
import { installTapSounds, toast, h, $ } from './ui.js';
import { bus } from './bus.js';
import { ensureBuiltin } from './ai.js';
import { initSky } from './deco.js';
import { bgm, setBgmScreen } from './music.js';
import { pixieDust } from './fx.js';

export function applyTheme() {
  const t = state.settings.theme;
  const root = document.documentElement;
  if (t === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0d0b33' : '#f6f1ff');
}

async function boot() {
  await initStore();
  buildContent();
  ensureBuiltin();
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
  bus.on('settings', (k) => {
    if (k === 'theme') applyTheme();
    if (k === 'bgm') { if (state.settings.bgm) setBgmScreen(true); else bgm.stop(); }
  });
  renderNav();
  initVoices();
  installTapSounds();
  initSky();
  const unlock = () => { unlockAudio(); bgm.kick(); };
  document.addEventListener('pointerdown', unlock, { passive: true });
  // タップした所に小さなきらきら（設定でオフにできる）
  document.addEventListener('pointerdown', (e) => { if (state.settings.sparkle !== false && e.pointerType !== 'pen') pixieDust(e.clientX, e.clientY); }, { passive: true });
  document.addEventListener('keydown', unlock);
  window.addEventListener('hashchange', route);
  await route();
  document.body.classList.add('ready');
  setTimeout(() => document.getElementById('splash')?.remove(), 700);
  registerSW();
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const onUpdate = (w) => {
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(w);
      });
    };
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => onUpdate(reg.installing));
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch((e) => console.warn('SW register failed', e));
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
}

function showUpdate(worker) {
  if ($('.update-bar')) return;
  const el = h(`<div class="update-bar"><span>✨ 新しいバージョンがあります</span><button class="btn btn-sm btn-primary">更新</button></div>`);
  el.querySelector('button').onclick = () => worker.postMessage('skipWaiting');
  document.body.append(el);
}

window.addEventListener('error', (e) => console.error(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => { console.error(e.reason); });

boot().catch((e) => {
  console.error(e);
  toast('起動に失敗しました: ' + (e?.message || e), { type: 'error', ms: 8000 });
});
