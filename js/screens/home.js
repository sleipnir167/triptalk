import { $, esc, ring, bar, modal, todayKey } from '../ui.js';
import { icon } from '../icons.js';
import { state } from '../store.js';
import { dueCount, mastery, getCard } from '../srs.js';
import { scenes, sceneItems, pool, allItems, isWeak } from '../content.js';
import { levelInfo, streak, dayRec, flushCelebrations } from '../gamify.js';
import { go } from '../router.js';
import { TIPS } from '../data/scenes.js';
import { DIALOGUES } from '../data/dialogues.js';
import { masteryDot, sayBtn, openItem } from '../components.js';

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return ['こんばんは', '🌙'];
  if (h < 11) return ['おはようございます', '☀️'];
  if (h < 18) return ['こんにちは', '👋'];
  return ['こんばんは', '🌆'];
}

function tripInfo() {
  const t = state.settings.trip;
  if (!t?.date) return null;
  const d = new Date(t.date + 'T00:00:00');
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const days = Math.round((d - now) / 864e5);
  const unlearned = allItems().filter((it) => !getCard(it.id)?.reps).length;
  const perDay = days > 0 ? Math.ceil(unlearned / days) : unlearned;
  return { name: t.name || '旅行', days, perDay, unlearned };
}

export function sceneStats(sid) {
  const items = sceneItems(sid);
  let learned = 0, good = 0;
  items.forEach((it) => { const m = mastery(getCard(it.id)); if (m > 0) learned++; if (m >= 2) good++; });
  return { total: items.length, learned, good, pct: items.length ? (learned + good) / (items.length * 2) : 0 };
}

export async function openScene(sc) {
  const st = sceneStats(sc.id);
  const dlg = DIALOGUES.filter((d) => d.scene === sc.id);
  await modal({
    cls: 'scene-sheet',
    headerHTML: `<div class="scene-head" style="--g1:${sc.grad[0]};--g2:${sc.grad[1]}">
      <button class="btn-icon ghost modal-x light" aria-label="閉じる">${icon('x')}</button>
      <div class="scene-emoji">${sc.emoji}</div>
      <div><small>${esc(sc.en.toUpperCase())}</small><h3>${esc(sc.name)}</h3><p>${st.total}項目 · 学習済み ${st.learned} · 定着 ${st.good}</p></div>
    </div>`,
    body: `
      ${bar(st.pct, 'bar-scene')}
      <div class="scene-actions">
        <a class="sa tap" href="#/learn?scene=${sc.id}">${icon('sparkles', 22)}<b>新しく覚える</b><small>未学習から${state.settings.newPerDay}個</small></a>
        <a class="sa tap" href="#/quiz?mode=en2ja&scene=${sc.id}&count=10">${icon('target', 22)}<b>4択クイズ</b><small>意味を選ぶ</small></a>
        <a class="sa tap" href="#/speak?mode=read&scene=${sc.id}&count=10">${icon('mic', 22)}<b>音読チェック</b><small>発音を判定</small></a>
        <a class="sa tap" href="#/speak?mode=compose&scene=${sc.id}&count=10&kind=phrase">${icon('zap', 22)}<b>瞬間英作文</b><small>日本語→英語で話す</small></a>
        ${dlg.length ? `<a class="sa tap" href="#/roleplay">${icon('users', 22)}<b>ロールプレイ</b><small>${dlg.length}シナリオ</small></a>` : ''}
        <a class="sa tap" href="#/library?scene=${sc.id}">${icon('book', 22)}<b>一覧を見る</b><small>単語帳</small></a>
      </div>`,
    onMount: (el, close) => el.addEventListener('click', (e) => { if (e.target.closest('a.sa')) close(); }),
  });
}

export default {
  nav: 'home',
  async render(el) {
    const [greet, gEmoji] = greeting();
    const due = dueCount();
    const newLeft = Math.max(0, state.settings.newPerDay - dayRec().newc);
    const unlearned = pool({ scene: 'new' }).length;
    const L = levelInfo();
    const st = streak();
    const today = dayRec();
    const goal = state.settings.dailyGoalXP;
    const trip = tripInfo();
    const tip = TIPS[(new Date().getDate() + new Date().getMonth() * 3) % TIPS.length];
    const weak = allItems().filter((it) => isWeak(it)).slice(0, 6);
    const flight = 'TT' + todayKey().replace(/-/g, '').slice(2);

    el.innerHTML = `
    <div class="wrap home">
      <header class="home-head">
        <div>
          <p class="muted">${gEmoji} ${greet}</p>
          <h1>今日も旅の英語を<br class="sm-only">磨きましょう</h1>
        </div>
        <div class="head-badges">
          <div class="hb ${st ? 'flame' : ''}" title="連続学習日数">${icon('flame', 18)}<b>${st}</b><small>日連続</small></div>
          <div class="hb" title="レベル"><span class="lv-mini">Lv.${L.level}</span><small>${esc(L.title)}</small></div>
          <a class="btn-icon soft head-settings" href="#/settings" aria-label="設定">${icon('settings', 20)}</a>
        </div>
      </header>

      ${trip ? `
      <div class="trip-banner ${trip.days < 0 ? 'past' : ''}">
        <div class="trip-plane">✈️</div>
        <div class="trip-text">
          ${trip.days > 0 ? `<b>${esc(trip.name)}まで あと <span class="trip-days">${trip.days}</span> 日</b><small>${trip.unlearned ? `出発までに全範囲を終えるには 1日 <b>${trip.perDay}</b> 項目のペースがおすすめ` : '全項目を学習済み！復習で記憶を定着させましょう'}</small>`
            : trip.days === 0 ? `<b>今日は ${esc(trip.name)} の出発日！🎉</b><small>旅行モードで現地フレーズをすぐ使えます</small>`
            : `<b>${esc(trip.name)} 楽しんでいますか？</b><small>旅行モードでフレーズをすぐ再生・提示できます</small>`}
        </div>
        <a class="btn btn-sm btn-glass" href="#/travel">${icon('plane', 16)} 旅行モード</a>
      </div>` : `
      <a class="trip-banner unset tap" href="#/settings?sec=trip">
        <div class="trip-plane">🗓️</div>
        <div class="trip-text"><b>旅行の予定日を登録しよう</b><small>出発までのカウントダウンと、1日の学習ペースを提案します</small></div>
        ${icon('chevR', 20)}
      </a>`}

      <section class="boarding">
        <div class="bp-main">
          <div class="bp-top"><span>✈ TRIPTALK AIR</span><span>FLIGHT ${flight}</span></div>
          <div class="bp-route">
            <div class="bp-city"><small>FROM</small><b>JPN</b><span>いまの自分</span></div>
            <div class="bp-path"><span class="bp-dash"></span><span class="bp-icon">${icon('plane', 22)}</span><span class="bp-dash"></span></div>
            <div class="bp-city right"><small>TO</small><b>ENG</b><span>話せる自分</span></div>
          </div>
          <div class="bp-info">
            <div><small>復習</small><b>${due}</b></div>
            <div><small>新規</small><b>${Math.min(newLeft, unlearned)}</b></div>
            <div><small>XP</small><b>${today.xp}</b></div>
            <div><small>BOARDING</small><b>NOW</b></div>
          </div>
          <div class="bp-cta">
            ${due ? `<a class="btn btn-accent btn-lg" href="#/review">${icon('repeat', 20)} 復習をはじめる <span class="pill">${due}</span></a>` : ''}
            ${unlearned ? `<a class="btn ${due ? 'btn-glass' : 'btn-accent'} btn-lg" href="#/learn">${icon('sparkles', 20)} 新しく覚える</a>` : ''}
            ${!due && !unlearned ? `<a class="btn btn-accent btn-lg" href="#/blitz">${icon('zap', 20)} スピード周回</a>` : ''}
          </div>
        </div>
        <div class="bp-stub">
          <small>TODAY'S GOAL</small>
          ${ring(today.xp / goal, { size: 112, stroke: 11, label: today.xp, sub: `/ ${goal} XP`, grad: ['#ffb347', '#ff7a59'], track: 'rgba(255,255,255,.18)' })}
          <div class="barcode"></div>
        </div>
      </section>

      <section class="quick-modes">
        <a class="qm tap" href="#/blitz" style="--g1:#f59e0b;--g2:#ef4444">${icon('zap', 26)}<b>スピード周回</b><small>60秒で大量に回す</small></a>
        <a class="qm tap" href="#/speak?mode=read&scene=all&count=10" style="--g1:#ec4899;--g2:#8b5cf6">${icon('mic', 26)}<b>発音チェック</b><small>マイクで音読判定</small></a>
        <a class="qm tap" href="#/roleplay" style="--g1:#14b8a6;--g2:#3b82f6">${icon('users', 26)}<b>ロールプレイ</b><small>台本で会話練習</small></a>
        <a class="qm tap" href="#/aichat" style="--g1:#6366f1;--g2:#a855f7">${icon('bot', 26)}<b>AI会話</b><small>ミッションに挑戦</small></a>
      </section>

      <div class="section-head"><h2>🌍 デスティネーション</h2><a class="link" href="#/library">すべて見る ${icon('chevR', 16)}</a></div>
      <section class="scene-grid">
        ${scenes().map((sc) => {
          const s = sceneStats(sc.id);
          return `<button class="scene-tile" data-scene="${sc.id}" style="--g1:${sc.grad[0]};--g2:${sc.grad[1]}">
            <span class="st-emoji">${sc.emoji}</span>
            <span class="st-name">${esc(sc.name)}</span>
            <span class="st-en">${esc(sc.en)}</span>
            <span class="st-bar"><i style="width:${Math.round(s.pct * 100)}%"></i></span>
            <span class="st-count">${s.learned}/${s.total}</span>
          </button>`;
        }).join('')}
      </section>

      <div class="home-cols">
        <section class="card">
          <div class="section-head in-card"><h3>🩹 苦手なフレーズ</h3>${weak.length ? `<a class="btn btn-sm btn-soft" href="#/quiz?mode=en2ja&scene=weak&count=10">克服する</a>` : ''}</div>
          ${weak.length ? `<div class="mini-list">${weak.map((it) => `
            <div class="ml-row tap" data-id="${it.id}">${masteryDot(it)}<div class="ml-text"><div class="en">${esc(it.en)}</div><div class="small muted">${esc(it.ja)}</div></div>${sayBtn(it.en)}</div>`).join('')}</div>`
            : `<p class="muted small">間違えた項目がここに集まります。今のところ苦手はありません 👏</p>`}
        </section>
        <section class="card tip-card">
          <div class="section-head in-card"><h3>💡 今日の旅英語Tips</h3></div>
          <p>${esc(tip)}</p>
          <div class="tip-deco">✈</div>
        </section>
      </div>
    </div>`;

    el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-scene]');
      if (t) { const sc = scenes().find((s) => s.id === t.dataset.scene); openScene(sc); }
      const row = e.target.closest('.ml-row');
      if (row && !e.target.closest('[data-say]')) { const it = allItems().find((x) => x.id === row.dataset.id); if (it) openItem(it); }
    });
    setTimeout(() => flushCelebrations(), 600);
  },
};
