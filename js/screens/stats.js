// 学習記録: ヒートマップ・XP推移・習熟度・予定・パスポート
import { $, esc, todayKey, fmtNum, bar } from '../ui.js';
import { icon } from '../icons.js';
import { state } from '../store.js';
import { allItems, scenes, isWeak } from '../content.js';
import { getCard, mastery, MASTERY_LABEL, forecast, avgRetention } from '../srs.js';
import { levelInfo, streak, badgeDefs, stampHTML, xpForLevel } from '../gamify.js';
import { sayBtn, openItem, masteryDot } from '../components.js';
import { sceneStats } from './home.js';
import { monthUsage, todayUsage, providers } from '../ai.js';

const DOW = ['日', '月', '火', '水', '木', '金', '土'];

function heatmap(weeks = 20) {
  const days = state.stats.days;
  const end = new Date(); end.setHours(0, 0, 0, 0);
  const start = new Date(end); start.setDate(start.getDate() - (weeks * 7 - 1) - end.getDay());
  const cell = 15, gap = 3;
  let cells = '', months = '';
  let lastMonth = -1;
  for (let w = 0; w < weeks + 1; w++) {
    for (let d = 0; d < 7; d++) {
      const dt = new Date(start); dt.setDate(start.getDate() + w * 7 + d);
      if (dt > end) continue;
      const rec = days[todayKey(dt)];
      const xp = rec?.xp || 0;
      const lv = xp === 0 ? 0 : xp < 40 ? 1 : xp < 100 ? 2 : xp < 200 ? 3 : 4;
      cells += `<rect x="${24 + w * (cell + gap)}" y="${16 + d * (cell + gap)}" width="${cell}" height="${cell}" rx="3" class="hm l${lv}" data-tip="${dt.getMonth() + 1}/${dt.getDate()}（${DOW[dt.getDay()]}）: ${xp} XP${rec?.n ? ` · ${rec.n}問` : ''}"/>`;
      if (d === 0 && dt.getMonth() !== lastMonth) { lastMonth = dt.getMonth(); months += `<text x="${24 + w * (cell + gap)}" y="10" class="axis">${dt.getMonth() + 1}月</text>`; }
    }
  }
  const labels = [1, 3, 5].map((d) => `<text x="0" y="${16 + d * (cell + gap) + 11}" class="axis">${DOW[d]}</text>`).join('');
  const W = 24 + (weeks + 1) * (cell + gap);
  return `<svg class="heatmap" viewBox="0 0 ${W} ${16 + 7 * (cell + gap)}" role="img" aria-label="学習カレンダー">${months}${labels}${cells}</svg>
    <div class="hm-legend"><span>少</span>${[0, 1, 2, 3, 4].map((l) => `<i class="hm l${l}"></i>`).join('')}<span>多</span></div>`;
}

function columns(values, labels, { unit = '', tipFn } = {}) {
  const W = 560, H = 170, pad = { l: 34, r: 8, t: 16, b: 24 };
  const max = Math.max(1, ...values);
  const nice = max <= 5 ? 5 : max <= 10 ? 10 : Math.ceil(max / 50) * 50;
  const bw = Math.min(24, ((W - pad.l - pad.r) / values.length) * 0.6);
  const step = (W - pad.l - pad.r) / values.length;
  const Y = (v) => pad.t + (1 - v / nice) * (H - pad.t - pad.b);
  const grid = [0, 0.5, 1].map((k) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(nice * k)}" y2="${Y(nice * k)}" class="grid"/><text x="${pad.l - 6}" y="${Y(nice * k) + 4}" class="axis" text-anchor="end">${Math.round(nice * k)}</text>`).join('');
  const maxI = values.indexOf(Math.max(...values));
  const bars = values.map((v, i) => {
    const x = pad.l + i * step + (step - bw) / 2;
    const y = Y(v), h = Math.max(0, Y(0) - y);
    const r = Math.min(4, h);
    const path = h > 0 ? `M${x},${Y(0)}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${Y(0)}Z` : '';
    return `<g class="col" data-tip="${tipFn ? tipFn(i, v) : `${labels[i]}: ${v}${unit}`}"><rect x="${pad.l + i * step}" y="${pad.t}" width="${step}" height="${H - pad.t - pad.b}" fill="transparent"/>${path ? `<path d="${path}" class="colbar"/>` : ''}${i === maxI && v > 0 ? `<text x="${x + bw / 2}" y="${y - 5}" class="axis strong" text-anchor="middle">${v}</text>` : ''}</g>
      ${i % 2 === 0 || values.length <= 8 ? `<text x="${x + bw / 2}" y="${H - 6}" class="axis" text-anchor="middle">${labels[i]}</text>` : ''}`;
  }).join('');
  return `<svg class="cols" viewBox="0 0 ${W} ${H}" role="img">${grid}${bars}</svg>`;
}

function masteryStack() {
  const counts = [0, 0, 0, 0];
  allItems().forEach((it) => counts[mastery(getCard(it.id))]++);
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  const segs = counts.map((c, i) => (c ? `<div class="ms-seg m${i}" style="flex:${c}" data-tip="${MASTERY_LABEL[i]}: ${c}項目（${Math.round((c / total) * 100)}%）"></div>` : '')).join('');
  return `<div class="ms-bar">${segs}</div>
    <div class="ms-legend">${counts.map((c, i) => `<div><i class="sw m${i}"></i><span>${MASTERY_LABEL[i]}</span><b>${c}</b></div>`).join('')}</div>`;
}

function tooltip(root) {
  let tip = document.querySelector('.viz-tip');
  if (!tip) { tip = document.createElement('div'); tip.className = 'viz-tip'; document.body.append(tip); }
  const show = (e) => {
    const t = e.target.closest('[data-tip]');
    if (!t) { tip.classList.remove('show'); return; }
    tip.textContent = t.dataset.tip;
    const r = t.getBoundingClientRect();
    tip.style.left = Math.min(innerWidth - 10, Math.max(10, r.left + r.width / 2)) + 'px';
    tip.style.top = r.top - 8 + 'px';
    tip.classList.add('show');
  };
  root.addEventListener('pointerover', show);
  root.addEventListener('click', show);
  root.addEventListener('pointerleave', () => tip.classList.remove('show'));
  return () => tip.classList.remove('show');
}

export default {
  nav: 'stats',
  render(el) {
    const L = levelInfo();
    const st = streak();
    const all = allItems();
    const seen = all.filter((it) => getCard(it.id)?.reps).length;
    const c = state.stats.counters;
    const acc = c.answers ? Math.round(((c.correct || 0) / c.answers) * 100) : 0;
    const totalSec = Object.values(state.stats.days).reduce((a, d) => a + (d.t || 0), 0);
    const ret = avgRetention();
    const last14 = [], lbl14 = [];
    for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); last14.push(state.stats.days[todayKey(d)]?.xp || 0); lbl14.push(`${d.getMonth() + 1}/${d.getDate()}`); }
    const fc = forecast(14);
    const fcl = fc.map((_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return i === 0 ? '今日' : `${d.getMonth() + 1}/${d.getDate()}`; });
    const weak = all.filter((it) => isWeak(it)).sort((a, b) => (getCard(b.id).ng || 0) - (getCard(a.id).ng || 0)).slice(0, 10);
    const badges = badgeDefs();
    const got = state.stats.badges;
    const earned = badges.filter((b) => got[b.id]).length;
    const mu = monthUsage(), tu = todayUsage();

    el.innerHTML = `
      <div class="wrap stats">
        <header class="page-head"><h1>学習記録</h1><p class="muted">あなたの旅の準備状況</p></header>

        <section class="profile-card">
          <div class="pc-level"><div class="lv-big">Lv.<b>${L.level}</b></div><div><div class="pc-title">${L.emoji} ${esc(L.title)}</div><div class="small muted">次のレベルまで ${L.need - L.cur} XP</div>${bar(L.pct, 'bar-xp')}</div></div>
          <div class="kpis">
            <div class="kpi"><small>連続学習</small><b>${st}<span>日</span></b></div>
            <div class="kpi"><small>累計XP</small><b>${fmtNum(state.stats.xp || 0)}</b></div>
            <div class="kpi"><small>学習済み</small><b>${seen}<span>/${all.length}</span></b></div>
            <div class="kpi"><small>正答率</small><b>${acc}<span>%</span></b></div>
            <div class="kpi"><small>記憶保持率</small><b>${Math.round(ret * 100)}<span>%</span></b></div>
            <div class="kpi"><small>学習時間</small><b>${Math.floor(totalSec / 3600)}<span>h</span>${Math.round((totalSec % 3600) / 60)}<span>m</span></b></div>
          </div>
        </section>

        <div class="stats-grid">
          <section class="card viz"><h3>学習カレンダー</h3><p class="small muted">1日の獲得XP</p><div class="hm-wrap">${heatmap(20)}</div></section>
          <section class="card viz"><h3>XPの推移</h3><p class="small muted">直近14日の獲得XP</p>${columns(last14, lbl14, { unit: ' XP' })}</section>
          <section class="card viz"><h3>習熟度</h3><p class="small muted">全${all.length}項目の記憶の状態</p>${masteryStack()}</section>
          <section class="card viz"><h3>復習の予定</h3><p class="small muted">今後14日間に復習が来る項目数</p>${columns(fc, fcl, { unit: '件' })}</section>
        </div>

        <section class="card">
          <h3>シーン別の進み具合</h3>
          <div class="scene-progress">
            ${scenes().map((s) => { const x = sceneStats(s.id); return `<div class="sp-row"><span class="sp-name">${s.emoji} ${esc(s.name)}</span>${bar(x.pct)}<span class="sp-num">${x.learned}/${x.total}</span></div>`; }).join('')}
          </div>
        </section>

        <section class="card">
          <div class="section-head in-card"><h3>🩹 苦手ランキング</h3>${weak.length ? `<a class="btn btn-sm btn-soft" href="#/quiz?mode=en2ja&scene=weak&count=10">まとめて練習</a>` : ''}</div>
          ${weak.length ? `<div class="mini-list">${weak.map((it, i) => { const cc = getCard(it.id); return `<div class="ml-row tap" data-id="${it.id}"><span class="rank">${i + 1}</span>${masteryDot(it)}<div class="ml-text"><div class="en">${esc(it.en)}</div><div class="small muted">${esc(it.ja)} · ✕${cc.ng || 0} ✓${cc.ok || 0}</div></div>${sayBtn(it.en)}</div>`; }).join('')}</div>` : '<p class="muted small">まだ苦手な項目はありません。</p>'}
        </section>

        <section class="pinboard">
          <div class="pinboard-head">
            <div class="pb-title"><small>✦ MAGICAL PIN COLLECTION ✦</small><h3>ピンコレクション</h3></div>
            <div class="pb-count"><b>${earned}</b><span>/ ${badges.length}</span></div>
          </div>
          ${bar(earned / badges.length, 'bar-xp')}
          <div class="pin-grid">${badges.map((b, i) => stampHTML(b, got[b.id], i)).join('')}</div>
        </section>

        <section class="card">
          <h3>🤖 AIの利用状況</h3>
          <div class="kpis small-kpis">
            <div class="kpi"><small>今日の呼び出し</small><b>${tu.calls}<span>/${state.settings.ai.dailyLimit || '∞'}</span></b></div>
            <div class="kpi"><small>今月の呼び出し</small><b>${mu.calls}</b></div>
            <div class="kpi"><small>キャッシュで節約</small><b>${mu.cached}<span>回</span></b></div>
            <div class="kpi"><small>今月のトークン</small><b>${fmtNum(mu.inTok + mu.outTok)}</b></div>
            <div class="kpi"><small>今月の費用(目安)</small><b>$${mu.cost.toFixed(4)}</b></div>
          </div>
          <p class="small muted">${providers().length ? '費用は OpenRouter が返す実費のみ集計しています。' : 'AIは未設定です（設定 > AI）。'}</p>
        </section>
      </div>`;

    el.addEventListener('click', (e) => {
      const row = e.target.closest('.ml-row');
      if (row && !e.target.closest('[data-say]')) { const it = all.find((x) => x.id === row.dataset.id); if (it) openItem(it); }
    });
    return tooltip(el);
  },
};
