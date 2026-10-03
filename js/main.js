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
  // 更新の仕組みは最初に用意する（画面の表示で問題が起きても、修正版を受け取れるように）
  registerSW();
  try {
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
  } finally {
    // うまく起動できなかったときも、起動画面で止まったままにしない
    document.body.classList.add('ready');
    setTimeout(() => document.getElementById('splash')?.remove(), 700);
  }
}

let pendingReload = false;
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const onUpdate = (w) => {
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(w);
      });
    };
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => onUpdate(reg.installing));
    reg.update().catch(() => {});
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch((e) => console.warn('SW register failed', e));
  // 新しい版が有効になったら読み込み直す（学習中なら、その画面を出たときに）
  const reloadIfIdle = () => { if (pendingReload && !document.getElementById('app')?.classList.contains('immersive')) location.reload(); };
  const hadController = !!navigator.serviceWorker.controller; // 初回インストール時は読み込み直さない
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (pendingReload || !hadController) return;
    pendingReload = true;
    reloadIfIdle();
  });
  bus.on('route', () => setTimeout(reloadIfIdle, 0));
}

function showUpdate(worker) {
  if ($('.update-bar')) return;
  const el = h(`<div class="update-bar"><span>✨ 新しいバージョンがあります</span><button class="btn btn-sm btn-primary">更新</button></div>`);
  el.querySelector('button').onclick = () => worker.postMessage('skipWaiting');
  document.body.append(el);
}

/** 起動に失敗したときの画面（起動画面より手前に出す） */
export function showBootError(e) {
  if (document.querySelector('.boot-error')) return;
  const msg = String(e?.message || e || '不明なエラー');
  const el = h(`<div class="boot-error" role="alert">
    <div class="be-card">
      <div class="be-emoji">🛠️</div>
      <h2>うまく起動できませんでした</h2>
      <p>学習データは消えていません。下のボタンをお試しください。</p>
      <pre>${msg.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</pre>
      <button class="btn btn-primary btn-lg be-reload">もう一度読み込む</button>
      <button class="btn btn-soft be-clean">アプリを最新に入れ直す（データは残ります）</button>
    </div>
  </div>`);
  el.querySelector('.be-reload').onclick = () => location.reload();
  el.querySelector('.be-clean').onclick = async () => {
    try { for (const r of (await navigator.serviceWorker?.getRegistrations?.()) || []) await r.unregister(); } catch {}
    try { for (const k of await caches.keys()) await caches.delete(k); } catch {}
    location.reload();
  };
  document.body.append(el);
}

window.addEventListener('error', (e) => console.error(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => { console.error(e.reason); });

boot().then(() => { window.__ttBooted = true; }).catch((e) => {
  console.error(e);
  showBootError(e);
});
