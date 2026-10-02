// 新しく覚える: 紹介カード → 確認クイズ（5個ずつ）
import { $, $$, esc, shuffle, emptyState } from '../ui.js';
import { icon } from '../icons.js';
import { state } from '../store.js';
import { pool, sceneById, allItems } from '../content.js';
import { speak, stopSpeaking } from '../speech.js';
import { sfx } from '../sfx.js';
import { sessionBar, sayBtn, createMic, showResults } from '../components.js';
import { recordAnswer, dayRec } from '../gamify.js';
import { scoreAgainst, diffHTML, scoreComment } from '../scoring.js';
import { go, handoff } from '../router.js';
import { shake } from '../fx.js';
import { SCENES } from '../data/scenes.js';

const ORDER = SCENES.map((s) => s.id).concat('custom');

export function distractors(it, n = 3, field = 'ja') {
  const all = allItems().filter((x) => x.id !== it.id && x[field] !== it[field]);
  const same = all.filter((x) => x.kind === it.kind && x.scene === it.scene);
  const kind = all.filter((x) => x.kind === it.kind);
  const picks = [];
  for (const src of [shuffle(same), shuffle(kind), shuffle(all)]) {
    for (const x of src) { if (picks.length >= n) break; if (!picks.some((p) => p[field] === x[field])) picks.push(x); }
  }
  return picks.slice(0, n);
}

export default {
  immersive: true,
  render(el, { params }) {
    const handed = handoff.take();
    let items;
    if (handed?.length) items = handed;
    else {
      const count = +(params.count || Math.max(5, state.settings.newPerDay - dayRec().newc) || 10);
      items = pool({ scene: params.scene || 'all', kind: params.kind || 'all' }).filter((it) => !state.progress[it.id]?.reps);
      items.sort((a, b) => ORDER.indexOf(a.scene) - ORDER.indexOf(b.scene));
      items = items.slice(0, count);
    }
    if (!items.length) {
      el.innerHTML = `<div class="wrap narrow">${emptyState({ mood: 'cheer', title: 'この範囲はすべて学習済みです！', text: '復習やスピード周回で記憶を定着させましょう。', actions: `<a class="btn btn-primary btn-lg" href="#/review">復習する</a><a class="btn btn-soft btn-lg" href="#/home">ホームへ</a>` })}</div>`;
      return;
    }

    const chunks = [];
    for (let i = 0; i < items.length; i += 5) chunks.push(items.slice(i, i + 5));
    const total = items.length * 2;
    let step = 0, xpSum = 0, combo = 0;
    const firstResult = new Map();
    const t0 = Date.now();
    el.innerHTML = `<div class="session learn-session"><div class="stage"></div></div>`;
    const bar = sessionBar($('.session', el), { title: '新しく覚える', onClose: () => finish(true) });
    const stage = $('.stage', el);
    let keyHandler = null;
    let stopped = false;
    const setKey = (fn) => {
      if (keyHandler) document.removeEventListener('keydown', keyHandler);
      keyHandler = fn;
      if (fn) document.addEventListener('keydown', fn);
    };

    async function run() {
      for (const chunk of chunks) {
        for (let i = 0; i < chunk.length; i++) { await intro(chunk[i], i, chunk.length); step++; }
        const q = shuffle(chunk).map((it) => ({ it }));
        while (q.length) {
          const cur = q.shift();
          const ok = await check(cur.it);
          if (!firstResult.has(cur.it.id)) { firstResult.set(cur.it.id, ok); step++; }
          if (!ok) q.splice(Math.min(2, q.length), 0, cur);
        }
      }
      finish(false);
    }

    function intro(it, idx, n) {
      return new Promise((resolve) => {
        bar.setProgress(step, total);
        const sc = sceneById(it.scene);
        stage.innerHTML = `
          <div class="learn-card pop-in" style="--g1:${sc?.grad[0]};--g2:${sc?.grad[1]}">
            <div class="lc-top"><span class="chip sm">${sc?.emoji} ${esc(sc?.name || '')}</span><span class="chip sm new">NEW</span><span class="dots-prog">${Array.from({ length: n }, (_, k) => `<i class="${k <= idx ? 'on' : ''}"></i>`).join('')}</span></div>
            <div class="lc-en">${esc(it.en)}</div>
            <div class="row center gap-8">${sayBtn(it.en, { size: 22, cls: 'big', label: '再生' })}${sayBtn(it.en, { slow: true, cls: 'big', label: 'ゆっくり' })}</div>
            <div class="lc-ja">${esc(it.ja)}</div>
            ${it.ex ? `<div class="fc-ex">${sayBtn(it.ex, { size: 16 })}<div><div>${esc(it.ex)}</div><small>${esc(it.exJa || '')}</small></div></div>` : ''}
            ${it.accepts?.length > 1 ? `<div class="small muted alt-line">別の言い方: ${it.accepts.slice(1, 3).map(esc).join(' / ')}</div>` : ''}
            ${it.note ? `<div class="tip-box sm">${icon('bulb', 16)}<span>${esc(it.note)}</span></div>` : ''}
            <div class="lc-mic"></div>
            <div class="speech-result"></div>
          </div>
          <div class="grade-area"><button class="btn btn-primary btn-xl next-btn">覚えた！次へ ${icon('chevR', 20)}</button></div>`;
        createMic($('.lc-mic', stage), {
          size: 'sm', label: '真似して言ってみよう',
          onResult: ({ alts }) => {
            const r = scoreAgainst(it.accepts || [it.en], alts);
            const cm = scoreComment(r.score, state.settings.passScore);
            $('.speech-result', stage).innerHTML = `<div class="score-line ${cm.cls}"><b>${r.score}</b><span>${cm.emoji} ${cm.label}</span></div><div class="diff">${diffHTML(r)}</div>`;
            sfx.play(r.score >= state.settings.passScore ? 'correct' : 'soft');
          },
        });
        if (state.settings.autoPlay) setTimeout(() => speak(it.en), 300);
        const next = () => { if (stopped) return; stopSpeaking(); setKey(null); resolve(); };
        setKey((e) => { if ((e.key === 'Enter' || e.code === 'Space') && !e.target?.closest?.('input')) { e.preventDefault(); next(); } });
        $('.next-btn', stage).onclick = next;
      });
    }

    function check(it) {
      return new Promise((resolve) => {
        bar.setProgress(step, total);
        const reverse = Math.random() < 0.4;
        const field = reverse ? 'en' : 'ja';
        const opts = shuffle([it, ...distractors(it, 3, field)]);
        const t1 = Date.now();
        stage.innerHTML = `
          <div class="quiz-card pop-in">
            <div class="qc-kicker">確認テスト · ${reverse ? '英語を選ぼう' : '意味を選ぼう'}</div>
            <div class="${reverse ? 'qc-ja' : 'qc-en'}">${esc(reverse ? it.ja : it.en)}</div>
            ${reverse ? '' : `<div class="row center">${sayBtn(it.en, { size: 22, cls: 'big' })}</div>`}
          </div>
          <div class="options">${opts.map((o, i) => `<button class="qopt ${reverse ? 'en' : ''}" data-id="${o.id}"><kbd>${i + 1}</kbd><span>${esc(o[field])}</span></button>`).join('')}</div>`;
        if (!reverse && state.settings.autoPlay) setTimeout(() => speak(it.en), 200);
        let answered = false;
        const answer = (btn) => {
          if (answered || stopped || !btn) return; answered = true;
          setKey(null);
          const ok = btn.dataset.id === it.id;
          $$('.qopt', stage).forEach((b) => { if (b.dataset.id === it.id) b.classList.add('correct'); });
          const first = !firstResult.has(it.id);
          if (ok) {
            combo++;
            const slow = Date.now() - t1 > 9000;
            const xp = first ? 10 : 3;
            xpSum += xp;
            if (first) recordAnswer(it, { ok: true, grade: slow ? 2 : 3, xp, anchor: btn });
            else recordAnswer(it, { ok: true, grade: 3, xp, anchor: btn });
            sfx.play(combo >= 3 ? 'combo' : 'correct', combo);
          } else {
            combo = 0;
            btn.classList.add('wrong'); shake(btn);
            sfx.play('wrong');
            if (first) recordAnswer(it, { ok: false, grade: 1, xp: 1 });
          }
          bar.setCombo(combo);
          if (reverse || !ok) speak(it.en);
          setTimeout(() => { if (!stopped) resolve(ok); }, ok ? 750 : 1700);
        };
        setKey((e) => { const n = +e.key; if (n >= 1 && n <= 4) answer($$('.qopt', stage)[n - 1]); });
        $('.options', stage).onclick = (e) => { const b = e.target.closest('.qopt'); if (b) answer(b); };
      });
    }

    function finish(early) {
      stopped = true;
      setKey(null);
      stopSpeaking();
      const list = items.filter((it) => firstResult.has(it.id)).map((it) => ({ item: it, ok: firstResult.get(it.id) }));
      if (!list.length) return go('#/home');
      const correct = list.filter((r) => r.ok).length;
      $('.sbar', el)?.remove();
      showResults(stage, {
        title: early ? 'ここまでの成果' : `${list.length}個のフレーズを覚えました！`, emoji: '🧠',
        correct, total: list.length, xp: xpSum, timeSec: (Date.now() - t0) / 1000, items: list,
        extraHTML: `<p class="center muted small">覚えた項目は忘却曲線に合わせて「今日の復習」に出てきます。</p>`,
        actions: [
          { label: `${icon('home', 18)} ホーム`, onClick: () => go('#/home') },
          { label: `${icon('mic', 18)} 発音練習する`, cls: 'btn-soft', onClick: () => { handoff.items = list.map((r) => r.item); go('#/speak?mode=read&handoff=1'); } },
          { label: `${icon('sparkles', 18)} さらに覚える`, cls: 'btn-primary', onClick: () => go('#/learn?r=' + Date.now()) },
        ],
      });
    }

    run();
    return () => { stopped = true; setKey(null); };
  },
};
