// 画面共通のコンポーネント
import { $, $$, esc, h, modal, toast, ring, bar, fmtSpan, countUp, confirmDialog, richText } from './ui.js';
import { icon } from './icons.js';
import { state, save } from './store.js';
import { speak, stopSpeaking, listen, sttEngine } from './speech.js';
import { sfx } from './sfx.js';
import { confetti, fireworks, balloons } from './fx.js';
import { mascot } from './mascot.js';
import { getCard, retrievability, mastery, MASTERY_LABEL, resetCard, DAY, intervalDays } from './srs.js';
import { sceneById, scenes, allItems, hash, reindex, getItem } from './content.js';
import { aiReady, explainItem, askFollowup, aiWaitHint, generatePhrases } from './ai.js';
import { bump, flushCelebrations, addStudyTime } from './gamify.js';

// ---- 読み上げボタン（イベント委譲） ----
export function sayBtn(text, { slow = false, size = 18, cls = '', label = '', gender = '' } = {}) {
  return `<button class="say-btn ${slow ? 'slow' : ''} ${cls}" data-say="${esc(text)}" ${slow ? 'data-slow="1"' : ''} ${gender ? `data-gender="${gender}"` : ''} aria-label="${slow ? 'ゆっくり再生' : '再生'}" data-nosfx="1">${slow ? '<span class="turtle">🐢</span>' : icon('volume', size)}${label ? `<span>${label}</span>` : ''}</button>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-say]');
  if (!b) return;
  e.stopPropagation();
  b.classList.add('playing');
  speak(b.dataset.say, { slow: !!b.dataset.slow, gender: b.dataset.gender || undefined }).then(() => b.classList.remove('playing'));
});

// ---- マイク ----
export function createMic(host, { lang = 'en-US', label = 'タップして話す', onResult, onStart, size = 'lg', allowType = true, typePlaceholder = 'ここに英語を入力' } = {}) {
  host.innerHTML = `
    <div class="mic-wrap ${size}">
      <div class="mic-interim" aria-live="polite"></div>
      <div class="mic-row">
        ${allowType ? `<button class="btn-icon soft kbd-btn" title="キーボードで入力" aria-label="キーボードで入力">${icon('keyboard', 20)}</button>` : '<span class="mic-spacer"></span>'}
        <button class="mic-btn" aria-label="${esc(label)}" data-nosfx="1"><span class="mic-ring r1"></span><span class="mic-ring r2"></span>${icon('mic', size === 'lg' ? 34 : 26)}</button>
        <span class="mic-spacer"></span>
      </div>
      <div class="mic-label">${esc(label)}</div>
    </div>`;
  const btn = $('.mic-btn', host);
  const interim = $('.mic-interim', host);
  const lab = $('.mic-label', host);
  let session = null;
  let disabled = false;

  async function typeInstead() {
    const engine = sttEngine();
    const v = await modal({
      title: 'テキストで回答',
      body: `<input class="input big-input" placeholder="${esc(typePlaceholder)}" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="done">
        <p class="small muted mt-8">${engine === 'keyboard' ? 'この環境ではブラウザ音声認識が使えません。' : ''}iPadではキーボードの 🎤 ボタンで音声入力もできます。</p>`,
      actions: [{ label: 'キャンセル', value: null }, { label: '決定', cls: 'btn-primary', onClick: (close, el) => close($('input', el).value.trim()) }],
      onMount: (el, close) => {
        const inp = $('input', el);
        setTimeout(() => inp.focus(), 250);
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) close(inp.value.trim()); });
      },
    });
    if (v) { interim.textContent = v; onResult?.({ alts: [v], typed: true }); }
  }

  async function start() {
    if (disabled) return;
    if (session) { session.stop(); return; }
    const engine = sttEngine();
    if (engine === 'keyboard') return typeInstead();
    stopSpeaking();
    sfx.play('micOn');
    btn.classList.add('listening');
    lab.textContent = '聞いています…（タップで終了）';
    interim.textContent = '';
    onStart?.();
    session = listen({ lang, engine, onInterim: (t) => (interim.textContent = t), onLevel: (l) => btn.style.setProperty('--lvl', l.toFixed(2)) });
    const res = await session.promise;
    session = null;
    btn.classList.remove('listening');
    btn.style.removeProperty('--lvl');
    sfx.play('micOff');
    lab.textContent = label;
    if (!res.alts.length) {
      interim.innerHTML = `<span class="err">${esc(res.error || '聞き取れませんでした')}</span>`;
      return;
    }
    interim.textContent = res.alts[0];
    onResult?.(res);
  }
  btn.addEventListener('click', start);
  $('.kbd-btn', host)?.addEventListener('click', typeInstead);
  return {
    start,
    stop: () => session?.stop(),
    setDisabled(v) { disabled = v; btn.disabled = v; },
    clear() { interim.textContent = ''; },
    setLabel(t) { lab.textContent = t; },
  };
}

// ---- セッション上部バー ----
export function sessionBar(host, { title = '', onClose } = {}) {
  const el = h(`<header class="sbar">
    <button class="btn-icon ghost sbar-x" aria-label="終了">${icon('x', 22)}</button>
    <div class="sbar-mid"><div class="sbar-title">${esc(title)}</div>${bar(0, 'sbar-bar')}</div>
    <div class="sbar-right"><span class="combo" hidden></span><span class="sbar-count"></span></div>
  </header>`);
  host.prepend(el);
  $('.sbar-x', el).onclick = () => (onClose ? onClose() : history.back());
  const comboEl = $('.combo', el);
  return {
    el,
    setProgress(done, total) {
      $('.sbar-bar i', el).style.width = `${Math.min(100, (done / Math.max(1, total)) * 100)}%`;
      $('.sbar-count', el).textContent = `${Math.min(done + 1, total)} / ${total}`;
    },
    setCount(text) { $('.sbar-count', el).textContent = text; },
    setCombo(n) {
      if (n >= 3) {
        comboEl.hidden = false;
        comboEl.innerHTML = `🔥 ${n} <small>COMBO</small>`;
        comboEl.classList.remove('pop'); void comboEl.offsetWidth; comboEl.classList.add('pop');
      } else comboEl.hidden = true;
    },
  };
}

// ---- 出題範囲ピッカー ----
export function pickScope({ title = '出題範囲を選ぶ', showKind = true, showCount = true, counts = [10, 20, 30], defaultKind = 'all', extraHTML = '', startLabel = 'スタート', allowNew = false } = {}) {
  let last = {};
  try { last = JSON.parse(localStorage.getItem('tt-scope') || '{}'); } catch {}
  let scene = last.scene || 'all';
  let kind = showKind ? last.kind || defaultKind : defaultKind;
  let count = counts.includes(last.count) ? last.count : counts[0];
  const chip = (v, label, cur) => `<button class="chip ${v === cur ? 'active' : ''}" data-v="${v}">${label}</button>`;
  const body = `
    <div class="scope">
      <div class="scope-label">範囲</div>
      <div class="chips wrap" data-g="scene">
        ${chip('all', '🌐 すべて', scene)}${chip('weak', '🩹 苦手', scene)}${chip('fav', '⭐ お気に入り', scene)}${allowNew ? chip('new', '🆕 未学習', scene) : ''}
        ${scenes().map((s) => chip(s.id, `${s.emoji} ${s.name}`, scene)).join('')}
      </div>
      ${showKind ? `<div class="scope-label">種類</div><div class="seg" data-g="kind">${[['all', 'すべて'], ['word', '単語'], ['phrase', 'フレーズ']].map(([v, l]) => `<button class="${v === kind ? 'active' : ''}" data-v="${v}">${l}</button>`).join('')}</div>` : ''}
      ${showCount ? `<div class="scope-label">問題数</div><div class="seg" data-g="count">${counts.map((c) => `<button class="${c === count ? 'active' : ''}" data-v="${c}">${c}問</button>`).join('')}</div>` : ''}
      ${extraHTML}
    </div>`;
  return modal({
    title, body,
    actions: [{ label: 'キャンセル', value: null }, { label: `${icon('play', 16)} ${startLabel}`, cls: 'btn-primary', onClick: (close, el) => {
      const extra = {};
      $$('[data-x]', el).forEach((g) => { const a = $('.active', g); if (a) extra[g.dataset.x] = a.dataset.v; });
      localStorage.setItem('tt-scope', JSON.stringify({ scene, kind, count }));
      close({ scene, kind, count, ...extra });
    } }],
    onMount: (el) => {
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-g] [data-v], [data-x] [data-v]');
        if (!b) return;
        const g = b.parentElement;
        $$('[data-v]', g).forEach((x) => x.classList.toggle('active', x === b));
        if (g.dataset.g === 'scene') scene = b.dataset.v;
        if (g.dataset.g === 'kind') kind = b.dataset.v;
        if (g.dataset.g === 'count') count = +b.dataset.v;
      });
    },
  });
}

// ---- 習熟度の小さなインジケータ ----
export function masteryDot(item) {
  const c = getCard(item.id);
  const m = mastery(c);
  return `<span class="mdot m${m}" title="${MASTERY_LABEL[m]}"></span>`;
}

// ---- 忘却曲線 ----
export function curveSVG(card, w = 520, hgt = 150) {
  if (!card?.reps) return '';
  const now = Date.now();
  const tNow = (now - card.last) / DAY;
  const tDue = (card.due - card.last) / DAY;
  const T = Math.max(tDue * 1.6, tNow * 1.3, 3);
  const pad = { l: 34, r: 10, t: 12, b: 24 };
  const X = (t) => pad.l + (t / T) * (w - pad.l - pad.r);
  const Y = (r) => pad.t + (1 - r) * (hgt - pad.t - pad.b);
  const R = (t) => Math.pow(1 + (19 / 81) * t / card.s, -0.5);
  let d = '';
  for (let i = 0; i <= 60; i++) { const t = (i / 60) * T; d += `${i ? 'L' : 'M'}${X(t).toFixed(1)},${Y(R(t)).toFixed(1)}`; }
  const area = `${d}L${X(T)},${Y(0)}L${X(0)},${Y(0)}Z`;
  const ret = state.settings.retention;
  const rNow = R(tNow);
  return `<svg class="curve" viewBox="0 0 ${w} ${hgt}" role="img" aria-label="忘却曲線">
    ${[0, 0.5, 1].map((r) => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${Y(r)}" y2="${Y(r)}" class="grid"/><text x="${pad.l - 6}" y="${Y(r) + 4}" class="axis" text-anchor="end">${r * 100}%</text>`).join('')}
    <line x1="${pad.l}" x2="${w - pad.r}" y1="${Y(ret)}" y2="${Y(ret)}" class="target"/>
    <path d="${area}" class="area"/><path d="${d}" class="line"/>
    <line x1="${X(tDue)}" x2="${X(tDue)}" y1="${pad.t}" y2="${Y(0)}" class="due"/>
    <text x="${X(tDue)}" y="${hgt - 6}" class="axis" text-anchor="middle">次の復習</text>
    <circle cx="${X(Math.min(tNow, T))}" cy="${Y(rNow)}" r="5" class="now"/>
    <text x="${Math.min(X(Math.min(tNow, T)) + 8, w - 60)}" y="${Y(rNow) < 26 ? Y(rNow) + 18 : Y(rNow) - 8}" class="axis strong">今 ${Math.round(rNow * 100)}%</text>
  </svg>`;
}

// ---- AI解説 ----
export function explainHTML(d) {
  if (!d) return '';
  return `<div class="ai-explain">
    ${d.meaning_ja ? `<div class="ax"><b>意味</b><p>${esc(d.meaning_ja)}</p></div>` : ''}
    ${d.nuance_ja ? `<div class="ax"><b>ニュアンス</b><p>${esc(d.nuance_ja)}</p></div>` : ''}
    ${d.examples?.length ? `<div class="ax"><b>例文</b>${d.examples.map((x) => `<div class="ex-row">${sayBtn(x.en, { size: 16 })}<div><div class="en">${esc(x.en)}</div><div class="small muted">${esc(x.ja)}</div></div></div>`).join('')}</div>` : ''}
    ${d.similar?.length ? `<div class="ax"><b>似た表現</b>${d.similar.map((x) => `<div class="ex-row">${sayBtn(x.en, { size: 16 })}<div><div class="en">${esc(x.en)}</div><div class="small muted">${esc(x.diff_ja)}</div></div></div>`).join('')}</div>` : ''}
    ${d.pronunciation_ja ? `<div class="ax"><b>発音</b><p>${esc(d.pronunciation_ja)}</p></div>` : ''}
    ${d.culture_ja ? `<div class="ax"><b>豆知識</b><p>${esc(d.culture_ja)}</p></div>` : ''}
  </div>`;
}

export async function loadExplain(item, box, { auto = false } = {}) {
  const { cacheGet } = await import('./store.js');
  const body = (r) => (r.data ? explainHTML(r.data) : richText(r.text));
  const hit = await cacheGet('explain:' + item.id);
  if (hit?.data || hit?.text) {
    box.innerHTML = body(hit) + `<div class="ai-meta">${icon('bot', 14)} ${esc(hit.provider || 'AI')}（保存済み・無料）</div>`;
    followupForm(item, box);
    return;
  }
  if (!aiReady('explain')) {
    box.innerHTML = `<div class="ai-cta muted small">${icon('bot', 16)} AI解説を使うには <a href="#/settings?sec=ai">設定 &gt; AI</a> で内蔵AIをオンにするか、プロバイダを追加してください。</div>`;
    return;
  }
  const run = async () => {
    box.innerHTML = `<div class="ai-loading"><span class="lumi-mini">${mascot('think')}</span> ルミが解説を準備中…${aiWaitHint('explain')}</div>`;
    try {
      const r = await explainItem(item);
      box.innerHTML = body(r) + `<div class="ai-meta">${icon('bot', 14)} ${esc(r.provider)}${r.cached ? '（保存済み）' : '・次回からは保存済みの解説を無料で表示'}</div>`;
      followupForm(item, box);
      sfx.play('pop');
    } catch (e) {
      box.innerHTML = `<div class="ai-error">${esc(e.message)}</div><button class="btn btn-soft btn-sm mt-8 retry">再試行</button>`;
      $('.retry', box).onclick = run;
    }
  };
  if (auto) return run();
  box.innerHTML = `<button class="btn btn-ai btn-block">${icon('sparkles', 18)} AIにくわしく解説してもらう</button><p class="small muted center mt-8">一度生成した解説は保存され、次回から無料で表示されます</p>`;
  $('button', box).onclick = run;
}

/** 解説のあとに「AI先生に質問」（同じ質問は保存済みの回答を再利用） */
function followupForm(item, box) {
  const form = h(`<form class="ai-ask">
    <div class="ai-qa-list"></div>
    <div class="row gap-8"><input class="input" placeholder="この表現について質問（例: 店員さんにも使える？）" enterkeyhint="send" autocomplete="off"><button class="btn btn-ai btn-sm" type="submit">${icon('send', 16)} 質問</button></div>
    <div class="chips wrap mt-8">${['もっと丁寧に言うと？', 'カジュアルに言うと？', '返事としてよく言われる英語は？', '間違えやすいポイントは？'].map((q) => `<button type="button" class="chip sm ask-chip">${q}</button>`).join('')}</div>
  </form>`);
  box.append(form);
  const input = $('input', form);
  const list = $('.ai-qa-list', form);
  const ask = async (q) => {
    if (!q) return;
    const b = $('button[type="submit"]', form);
    b.disabled = true;
    const row = h(`<div class="ai-qa"><p class="ai-q">🙋 ${esc(q)}</p><div class="ai-loading"><span class="dots"><i></i><i></i><i></i></span> 考えています…${aiWaitHint('explain')}</div></div>`);
    list.append(row);
    try {
      const context = $('.ai-explain, .rich', box)?.innerText || '';
      const r = await askFollowup({ item, context, question: q });
      $('.ai-loading', row).outerHTML = richText(r.text) + (r.cached ? '<div class="ai-meta">💾 保存済みの回答（無料）</div>' : '');
      input.value = '';
    } catch (e) {
      $('.ai-loading', row).outerHTML = `<div class="ai-error">${esc(e.message)}</div>`;
    } finally { b.disabled = false; }
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); ask(input.value.trim()); });
  form.addEventListener('click', (e) => { const c = e.target.closest('.ask-chip'); if (c) ask(c.textContent); });
}

// ---- アイテム詳細シート ----
export function openItem(item, { onChange } = {}) {
  const c = getCard(item.id);
  const sc = sceneById(item.scene);
  const acc = c ? Math.round(((c.ok || 0) / Math.max(1, (c.ok || 0) + (c.ng || 0))) * 100) : 0;
  const fav = !!state.favs[item.id];
  const body = `
    <div class="item-detail">
      <div class="item-hero" style="--g1:${sc?.grad[0]};--g2:${sc?.grad[1]}">
        <div class="item-chips"><span class="chip sm">${sc?.emoji} ${esc(sc?.name || '')}</span><span class="chip sm">${item.kind === 'word' ? '単語' : 'フレーズ'}</span>${masteryDot(item)}<span class="small">${MASTERY_LABEL[mastery(c)]}</span></div>
        <div class="item-en">${esc(item.en)}</div>
        <div class="item-ja">${esc(item.ja)}</div>
        <div class="row gap-8 mt-12">${sayBtn(item.en, { size: 20, cls: 'big', label: '再生' })}${sayBtn(item.en, { slow: true, cls: 'big', label: 'ゆっくり' })}</div>
      </div>
      ${item.accepts?.length > 1 ? `<div class="detail-sec"><b>こうも言えます</b>${item.accepts.slice(1).map((a) => `<div class="ex-row">${sayBtn(a, { size: 16 })}<div class="en">${esc(a)}</div></div>`).join('')}</div>` : ''}
      ${item.ex ? `<div class="detail-sec"><b>例文</b><div class="ex-row">${sayBtn(item.ex, { size: 16 })}<div><div class="en">${esc(item.ex)}</div><div class="small muted">${esc(item.exJa || '')}</div></div></div></div>` : ''}
      ${item.note ? `<div class="tip-box">${icon('bulb', 18)}<span>${esc(item.note)}</span></div>` : ''}
      <div class="detail-sec">
        <b>発音チェック</b>
        <div class="mini-mic"></div>
        <div class="mini-result"></div>
      </div>
      ${c?.reps ? `
        <div class="detail-sec">
          <b>学習データ</b>
          <div class="kv-grid">
            <div><small>学習回数</small><b>${c.reps}</b></div>
            <div><small>正解率</small><b>${acc}%</b></div>
            <div><small>次の復習</small><b>${c.due <= Date.now() ? '今すぐ' : fmtSpan(c.due - Date.now()) + '後'}</b></div>
            <div><small>記憶の安定度</small><b>${c.s >= 1 ? Math.round(c.s) + '日' : '1日未満'}</b></div>
          </div>
          <div class="curve-wrap">${curveSVG(c)}<p class="small muted">記憶の保持率は時間とともに下がります。点線（目標 ${Math.round(state.settings.retention * 100)}%）を下回る前に復習するのが最も効率的です。</p></div>
        </div>` : ''}
      <div class="detail-sec"><b>${icon('sparkles', 16)} AI解説</b><div class="ai-box"></div></div>
      <div class="row gap-8 wrap mt-12">
        <button class="btn btn-soft fav-btn">${icon('star', 18)} ${fav ? 'お気に入り解除' : 'お気に入り'}</button>
        ${c?.reps ? `<button class="btn btn-soft reset-btn">${icon('refresh', 18)} 学習リセット</button>` : ''}
        ${item.scene === 'custom' ? `<button class="btn btn-danger-soft del-btn">${icon('trash', 18)} 削除</button>` : ''}
      </div>
    </div>`;
  return modal({
    cls: 'sheet-lg', title: '', body,
    headerHTML: `<div class="modal-head floating"><span></span><button class="btn-icon ghost modal-x" aria-label="閉じる">${icon('x')}</button></div>`,
    onMount: (el, close) => {
      loadExplain(item, $('.ai-box', el));
      const res = $('.mini-result', el);
      createMic($('.mini-mic', el), {
        size: 'sm', label: 'タップして読み上げてみよう',
        onResult: async ({ alts }) => {
          const { scoreAgainst, diffHTML, scoreComment } = await import('./scoring.js');
          const r = scoreAgainst(item.accepts || [item.en], alts);
          const cm = scoreComment(r.score, state.settings.passScore);
          res.innerHTML = `<div class="score-line ${cm.cls}"><b>${r.score}</b><span>${cm.emoji} ${cm.label}</span></div><div class="diff">${diffHTML(r)}</div>`;
          sfx.play(r.score >= state.settings.passScore ? 'correct' : 'soft');
        },
      });
      $('.fav-btn', el).onclick = () => {
        if (state.favs[item.id]) delete state.favs[item.id]; else state.favs[item.id] = 1;
        save('favs');
        toast(state.favs[item.id] ? 'お気に入りに追加しました' : 'お気に入りを解除しました', { emoji: '⭐' });
        $('.fav-btn', el).innerHTML = `${icon('star', 18)} ${state.favs[item.id] ? 'お気に入り解除' : 'お気に入り'}`;
        onChange?.();
      };
      $('.reset-btn', el)?.addEventListener('click', async () => {
        if (!(await confirmDialog('この項目の学習データをリセットしますか？'))) return;
        resetCard(item.id); onChange?.(); close();
      });
      $('.del-btn', el)?.addEventListener('click', async () => {
        if (!(await confirmDialog('このマイ単語を削除しますか？', { danger: true, ok: '削除' }))) return;
        state.custom = state.custom.filter((x) => x.id !== item.id);
        resetCard(item.id);
        save('custom'); reindex(); onChange?.(); close();
      });
    },
  });
}

// ---- マイ単語への追加 ----
export function addToMyWords({ en, ja, ex = '', exJa = '', note = '' }, { quiet = false } = {}) {
  en = (en || '').trim(); ja = (ja || '').trim();
  if (!en) return false;
  const norm = (t) => t.toLowerCase().replace(/[^a-z0-9' ]/g, '').replace(/\s+/g, ' ').trim();
  const key = en.toLowerCase();
  const existing = allItems().find((it) => (it.accepts || [it.en]).some((a) => norm(a) === norm(en)));
  if (existing) {
    state.favs[existing.id] = 1; save('favs');
    if (!quiet) toast('すでに収録済みのためお気に入りに追加しました', { emoji: '⭐' });
    return 'fav';
  }
  state.custom.push({ id: 'c' + hash(key), en, ja: ja || '（訳なし）', ex, exJa, note, created: Date.now() });
  save('custom');
  reindex();
  if (!quiet) {
    toast('マイ単語に追加しました。復習に出題されます', { emoji: '📥', type: 'success' });
    sfx.play('pop');
  }
  return 'added';
}

// ---- AIで旅のフレーズを作る ----
const GEN_TOPICS = ['ディズニークルーズの船内で', '寄港地・プライベートアイランドで', 'キャラクターグリーティングで', 'レンタカーを借りて運転する', 'ダイビング・シュノーケリング', '子連れでレストラン', 'スポーツ観戦', 'ワイナリー・酒蔵見学', 'ヘアサロン・ネイル', 'ホームステイ先の家族と', 'ビジネスの会食', 'ヴィーガン・食事制限', '遊園地・テーマパーク'];
export async function openPhraseGenerator({ onAdded } = {}) {
  const trip = state.settings.trip?.name || '';
  let items = [];
  await modal({
    title: '✨ AIで旅のフレーズを作る', cls: 'sheet-lg',
    body: `
      <p class="small muted">旅の予定や、やりたいことを入れると、その場面で使う英語フレーズをAIが作ります。選んだものはマイ単語に入り、忘却曲線に合わせて復習に出てきます。</p>
      <label class="field"><span>場面・やりたいこと</span><input class="input gen-topic" placeholder="例: ハワイでシュノーケリングツアーに参加する" value="${esc(trip ? `${trip}で` : '')}"></label>
      <div class="chips wrap mt-8">${GEN_TOPICS.map((t) => `<button type="button" class="chip sm gen-chip">${t}</button>`).join('')}</div>
      <div class="row gap-12 wrap mt-12"><div class="seg sm gen-n">${[5, 8, 12].map((n) => `<button type="button" class="${n === 8 ? 'active' : ''}" data-n="${n}">${n}個</button>`).join('')}</div>
        <button type="button" class="btn btn-ai gen-go">${icon('sparkles', 16)} フレーズを作る</button></div>
      <div class="gen-out mt-12"></div>`,
    actions: [{ label: '閉じる', value: null }, { label: `${icon('plus', 16)} 選んだものを追加`, cls: 'btn-primary', onClick: (close, el) => {
      const picked = $$('.gen-row input:checked', el).map((c) => items[+c.dataset.i]);
      if (!picked.length) { toast('追加するフレーズを選んでください'); return false; }
      let added = 0, fav = 0;
      picked.forEach((x) => { const r = addToMyWords({ en: x.en, ja: x.ja, note: x.note_ja || '' }, { quiet: true }); if (r === 'added') added++; else if (r === 'fav') fav++; });
      toast(`${added}個をマイ単語に追加しました${fav ? `（${fav}個は収録済みのためお気に入りに）` : ''}`, { emoji: '📥', type: 'success' });
      sfx.play('pop');
      onAdded?.();
      close(true);
    } }],
    onMount: (el) => {
      const topic = $('.gen-topic', el);
      const out = $('.gen-out', el);
      el.addEventListener('click', (e) => {
        const c = e.target.closest('.gen-chip');
        if (c) topic.value = (trip ? `${trip}で` : '') + c.textContent;
        const n = e.target.closest('.gen-n [data-n]');
        if (n) $$('.gen-n [data-n]', el).forEach((x) => x.classList.toggle('active', x === n));
      });
      $('.gen-go', el).onclick = async (e) => {
        const t = topic.value.trim();
        if (!t) { toast('場面を入力してください'); topic.focus(); return; }
        if (!aiReady('explain')) { toast('AIがオフです（設定 > AI）', { type: 'error' }); return; }
        const btn = e.currentTarget; btn.disabled = true;
        out.innerHTML = `<div class="ai-loading"><span class="dots"><i></i><i></i><i></i></span> AIがフレーズを作成中…${aiWaitHint('explain')}</div>`;
        try {
          const count = +$('.gen-n .active', el).dataset.n;
          const r = await generatePhrases({ topic: t, count, trip });
          items = r.data.slice(0, count);
          out.innerHTML = `<div class="gen-list">${items.map((x, i) => `
            <label class="gen-row"><input type="checkbox" data-i="${i}" checked>
              <div class="grow"><div class="en">${esc(x.en)}</div><div class="small muted">${esc(x.ja)}${x.note_ja ? ` · ${esc(x.note_ja)}` : ''}</div></div>
              ${sayBtn(x.en, { size: 16 })}</label>`).join('')}</div>
            <p class="small muted mt-8">${icon('bot', 14)} ${esc(r.provider)}${r.cached ? '（保存済み・無料）' : ''} — AIの英語は念のため確認してから使いましょう</p>`;
          sfx.play('pop');
        } catch (err) {
          out.innerHTML = `<div class="ai-error">${esc(err.message)}</div>`;
        } finally { btn.disabled = false; }
      };
    },
  });
}

// ---- 結果画面 ----
export function showResults(host, { title = 'おつかれさま！', emoji = '🎉', correct = 0, total = 0, xp = 0, timeSec = 0, items = [], extraHTML = '', actions = [], scoreLabel = '正答率', score } = {}) {
  stopSpeaking();
  const pct = score ?? (total ? correct / total : 0);
  if (timeSec) addStudyTime(timeSec);
  if (total >= 5 && correct === total) bump('perfect');
  const msg = pct >= 0.95 ? '完璧！ルミもびっくりの魔法だね✨' : pct >= 0.8 ? 'すばらしい！どんどん魔法が上達しているよ' : pct >= 0.6 ? 'いい調子！間違えたところに、もう一度魔法をかけよう' : 'だいじょうぶ、間違いは成長の魔法。もう一度いこう！';
  const sorted = [...items].sort((a, b) => (a.ok === b.ok ? 0 : a.ok ? 1 : -1));
  host.innerHTML = `
    <div class="results">
      <div class="results-hero">
        <div class="results-mascot">${mascot(pct >= 0.9 ? 'cheer' : pct >= 0.7 ? 'happy' : pct >= 0.5 ? 'normal' : 'sad')}<span class="results-emoji">${emoji}</span></div>
        <h2>${esc(title)}</h2>
        <p class="muted">${msg}</p>
        <div class="results-ring">${ring(pct, { size: 150, stroke: 12, label: `<span class="cu">0</span>%`, sub: scoreLabel, grad: pct >= 0.8 ? ['#2ed3a1', '#22d3ee'] : pct >= 0.6 ? ['#5b8cff', '#a855f7'] : ['#ff7a59', '#ffc24b'] })}</div>
        <div class="stat-tiles">
          ${total ? `<div class="stat-tile"><small>正解</small><b>${correct}<span>/${total}</span></b></div>` : ''}
          <div class="stat-tile"><small>獲得XP</small><b>+${xp}</b></div>
          ${timeSec ? `<div class="stat-tile"><small>時間</small><b>${Math.floor(timeSec / 60)}:${String(Math.round(timeSec % 60)).padStart(2, '0')}</b></div>` : ''}
        </div>
      </div>
      ${extraHTML}
      <div class="results-actions">${actions.map((a, i) => `<button class="btn ${a.cls || 'btn-soft'} btn-lg" data-a="${i}">${a.label}</button>`).join('')}</div>
      ${sorted.length ? `<div class="card results-list"><h3>今回の問題</h3>${sorted.map(({ item, ok, note }) => `
        <div class="rl-row tap" data-id="${item.id}">
          <span class="rl-mark ${ok ? 'ok' : 'ng'}">${icon(ok ? 'check' : 'x', 16)}</span>
          <div class="rl-text"><div class="en">${esc(item.en)}</div><div class="small muted">${esc(item.ja)}${note ? ` · ${esc(note)}` : ''}</div></div>
          ${sayBtn(item.en, { size: 18 })}
        </div>`).join('')}</div>` : ''}
    </div>`;
  countUp($('.cu', host), Math.round(pct * 100));
  host.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]');
    if (a) actions[+a.dataset.a].onClick?.();
    const row = e.target.closest('.rl-row');
    if (row && !e.target.closest('[data-say]')) { const it = getItem(row.dataset.id); if (it) openItem(it); }
  });
  sfx.play('finish');
  if (pct >= 0.95) setTimeout(() => { fireworks({ bursts: 4 }); balloons(); }, 250);
  else if (pct >= 0.8) setTimeout(() => confetti({ count: 110 }), 250);
  setTimeout(() => { if (host.isConnected && $('.results', host)) flushCelebrations(); }, 1200);
}
