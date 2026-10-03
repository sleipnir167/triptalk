// ハッシュルーター
import { $ } from './ui.js';
import { stopSpeaking } from './speech.js';
import { closeAllModals } from './ui.js';
import { bus } from './bus.js';
import { stopAnyRecording } from './recorder.js';
import { setBgmScreen } from './music.js';

const ROUTES = {
  home: () => import('./screens/home.js'),
  study: () => import('./screens/study.js'),
  review: () => import('./screens/review.js'),
  learn: () => import('./screens/learn.js'),
  blitz: () => import('./screens/blitz.js'),
  quiz: () => import('./screens/quiz.js'),
  speak: () => import('./screens/speak.js'),
  dictation: () => import('./screens/dictation.js'),
  roleplay: () => import('./screens/roleplay.js'),
  aichat: () => import('./screens/aichat.js'),
  aiwrite: () => import('./screens/aiwrite.js'),
  library: () => import('./screens/library.js'),
  travel: () => import('./screens/travel.js'),
  stats: () => import('./screens/stats.js'),
  settings: () => import('./screens/settings.js'),
};

/** 画面間でアイテムを受け渡す（例: 間違えたものだけ復習） */
export const handoff = { items: null, take() { const x = this.items; this.items = null; return x; } };

export function parse() {
  const raw = location.hash.replace(/^#\/?/, '') || 'home';
  const [path, qs] = raw.split('?');
  const [name, arg] = path.split('/');
  return { name: ROUTES[name] ? name : 'home', arg: arg ? decodeURIComponent(arg) : '', params: Object.fromEntries(new URLSearchParams(qs || '')) };
}

export function go(path) {
  const target = path.startsWith('#') ? path : '#/' + path;
  if (location.hash === target) route();
  else location.hash = target;
}

let current = null;
let seq = 0;
export async function route() {
  const my = ++seq;
  const { name, arg, params } = parse();
  try { current?.cleanup?.(); } catch (e) { console.error(e); }
  current = null;
  stopSpeaking();
  stopAnyRecording();
  closeAllModals();
  document.querySelectorAll('.showmode, .viz-tip').forEach((e) => e.remove());
  let mod;
  try { mod = await ROUTES[name](); } catch (e) {
    console.error(e);
    $('#view').innerHTML = `<div class="wrap narrow"><div class="empty"><div class="empty-emoji">📡</div><h3>画面を読み込めませんでした</h3><p class="muted">通信状態を確認して、再読み込みしてください。</p><div class="row center"><button class="btn btn-primary" onclick="location.reload()">再読み込み</button></div></div></div>`;
    return;
  }
  if (my !== seq) return;
  const scr = mod.default;
  // 画面ごとに #view を作り直す（前の画面のイベントリスナーを確実に破棄）
  const old = $('#view');
  const view = old.cloneNode(false);
  old.replaceWith(view);
  const app = $('#app');
  app.classList.toggle('immersive', !!scr.immersive);
  view.className = 'view ' + (scr.cls || '');
  window.scrollTo(0, 0);
  view.scrollTop = 0;
  bus.emit('route', scr.nav || name);
  // オルゴールBGMは学習の邪魔にならない画面だけで流す
  setBgmScreen(['home', 'study', 'stats', 'settings'].includes(name) && !scr.immersive);
  view.classList.add('enter');
  setTimeout(() => view.classList.remove('enter'), 400);
  let cleanup;
  try {
    cleanup = await scr.render(view, { arg, params });
  } catch (e) {
    // 画面の表示に失敗しても、アプリ全体は止めずにホームへ戻れるようにする
    console.error(e);
    app.classList.remove('immersive');
    view.innerHTML = `<div class="wrap narrow"><div class="empty"><div class="empty-emoji">🛠️</div><h3>この画面を表示できませんでした</h3>
      <p class="muted">${String(e?.message || e).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</p>
      <div class="row center gap-8 wrap"><a class="btn btn-primary" href="#/study">学習メニューへ</a><button class="btn btn-soft" onclick="location.reload()">再読み込み</button></div></div></div>`;
  }
  if (my !== seq) { try { cleanup?.(); } catch {} return; }
  current = { cleanup };
}
