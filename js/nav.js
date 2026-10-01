// サイドバー / タブバー
import { $, $$, esc, bar } from './ui.js';
import { icon } from './icons.js';
import { bus } from './bus.js';
import { levelInfo, streak, dayRec } from './gamify.js';
import { state } from './store.js';

const ITEMS = [
  ['home', 'ホーム', 'home'],
  ['study', '学習', 'study'],
  ['library', '単語帳', 'book'],
  ['travel', '旅行モード', 'plane'],
  ['stats', '記録', 'chart'],
  ['settings', '設定', 'settings'],
];

export function renderNav() {
  const side = $('.sidebar');
  side.innerHTML = `
    <a class="brand" href="#/home">
      <img src="icons/icon.svg" alt="" width="40" height="40">
      <div><b>TripTalk</b><small>旅の英会話トレーナー</small></div>
    </a>
    <nav class="side-nav">
      ${ITEMS.map(([k, label, ic]) => `<a href="#/${k}" data-nav="${k}" class="side-link">${icon(ic, 20)}<span>${label}</span></a>`).join('')}
    </nav>
    <div class="side-profile"></div>`;
  const tab = $('.tabbar');
  tab.innerHTML = ITEMS.filter(([k]) => k !== 'settings').map(([k, label, ic]) => `<a href="#/${k}" data-nav="${k}" class="tab-link">${icon(ic, 22)}<span>${label.replace('モード', '')}</span></a>`).join('');
  updateProfile();
  bus.on('xp', updateProfile);
  bus.on('route', (name) => {
    $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === name));
    updateProfile();
  });
}

export function updateProfile() {
  const el = $('.side-profile');
  if (!el) return;
  const L = levelInfo();
  const st = streak();
  const today = dayRec().xp;
  const goal = state.settings.dailyGoalXP;
  el.innerHTML = `
    <div class="sp-row">
      <div class="lv-badge">Lv.${L.level}</div>
      <div class="sp-title"><b>${L.emoji} ${esc(L.title)}</b><small>${L.cur} / ${L.need} XP</small></div>
    </div>
    ${bar(L.pct, 'bar-xp')}
    <div class="sp-stats">
      <span class="${st ? 'streak-on' : ''}">${icon('flame', 16)} ${st}日連続</span>
      <span>${icon('target', 16)} ${today}/${goal}</span>
    </div>`;
}
