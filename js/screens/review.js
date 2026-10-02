// 今日の復習（SRS フラッシュカード）
import { $, esc, fmtSpan, emptyState } from '../ui.js';
import { icon } from '../icons.js';
import { state } from '../store.js';
import { dueItems, preview, getCard, nextDueTime, GRADE } from '../srs.js';
import { sceneById, pool } from '../content.js';
import { speak, stopSpeaking } from '../speech.js';
import { sfx } from '../sfx.js';
import { sessionBar, sayBtn, createMic, showResults, loadExplain } from '../components.js';
import { recordAnswer } from '../gamify.js';
import { scoreAgainst, diffHTML, scoreComment } from '../scoring.js';
import { go } from '../router.js';
import { sparkle } from '../fx.js';

const GRADES = [
  { g: 1, label: 'もう一度', key: '1', cls: 'g-again' },
  { g: 2, label: '難しい', key: '2', cls: 'g-hard' },
  { g: 3, label: '正解', key: '3', cls: 'g-good' },
  { g: 4, label: '簡単', key: '4', cls: 'g-easy' },
];

export default {
  immersive: true,
  render(el, { params }) {
    const items = dueItems().slice(0, +(params.limit || 150));
    if (!items.length) {
      const next = nextDueTime();
      const unlearned = pool({ scene: 'new' }).length;
      el.innerHTML = `<div class="wrap narrow">${emptyState({
        mood: 'cheer', title: '今日の復習はすべて完了！',
        text: next < Infinity ? `次の復習は約 ${fmtSpan(next - Date.now())} 後です。` : 'まずは新しいフレーズを覚えましょう。',
        actions: `${unlearned ? `<a class="btn btn-primary btn-lg" href="#/learn">${icon('sparkles', 18)} 新しく覚える</a>` : ''}<a class="btn btn-soft btn-lg" href="#/blitz">${icon('zap', 18)} スピード周回</a><a class="btn btn-ghost btn-lg" href="#/home">ホームへ</a>`,
      })}</div>`;
      return;
    }

    const queue = items.map((it) => ({ it, again: false }));
    const total = items.length;
    const results = new Map();
    let doneUnique = 0, combo = 0, xpSum = 0, cur = null, revealed = false, spokenScore = null, firstTry = true;
    const t0 = Date.now();

    el.innerHTML = `<div class="session review-session"><div class="stage"></div></div>`;
    const bar = sessionBar($('.session', el), { title: '今日の復習', onClose: () => finish(true) });
    const stage = $('.stage', el);

    function direction(it) {
      const d = state.settings.direction;
      if (d === 'en2ja' || d === 'ja2en') return d;
      const c = getCard(it.id);
      return (c?.s || 0) >= 4 && it.kind === 'phrase' ? 'ja2en' : (c?.s || 0) >= 8 ? 'ja2en' : 'en2ja';
    }

    function show() {
      if (!queue.length) return finish(false);
      cur = queue.shift();
      revealed = false; spokenScore = null; firstTry = !cur.again;
      const it = cur.it;
      const dir = direction(it);
      const sc = sceneById(it.scene);
      const pv = preview(getCard(it.id));
      bar.setProgress(doneUnique, total);
      stage.innerHTML = `
        <div class="flash ${dir}" style="--g1:${sc?.grad[0]};--g2:${sc?.grad[1]}">
          <div class="flash-inner">
            <div class="face front">
              <div class="fc-top"><span class="chip sm">${sc?.emoji} ${esc(sc?.name || '')}</span>${cur.again ? '<span class="chip sm warn">再出題</span>' : ''}</div>
              <div class="fc-main">
                ${dir === 'en2ja'
                  ? `<div class="fc-en">${esc(it.en)}</div><div class="row center gap-8">${sayBtn(it.en, { size: 22, cls: 'big' })}${sayBtn(it.en, { slow: true, cls: 'big' })}</div><p class="fc-hint">意味を思い浮かべてから答えを見よう</p>`
                  : `<div class="fc-ja">${esc(it.ja)}</div><p class="fc-hint">英語で言ってみよう（マイクで判定できます）</p>`}
              </div>
              <div class="fc-mic"></div>
            </div>
            <div class="face back">
              <div class="fc-top"><span class="chip sm">${sc?.emoji} ${esc(sc?.name || '')}</span></div>
              <div class="fc-main">
                <div class="fc-en sm">${esc(it.en)}</div>
                <div class="row center gap-8">${sayBtn(it.en, { size: 20 })}${sayBtn(it.en, { slow: true })}</div>
                <div class="fc-ja sm">${esc(it.ja)}</div>
                ${it.ex ? `<div class="fc-ex">${sayBtn(it.ex, { size: 16 })}<div><div>${esc(it.ex)}</div><small>${esc(it.exJa || '')}</small></div></div>` : ''}
                ${it.note ? `<div class="tip-box sm">${icon('bulb', 16)}<span>${esc(it.note)}</span></div>` : ''}
                <div class="speech-result"></div>
                <details class="ai-details"><summary>${icon('sparkles', 16)} AI解説</summary><div class="ai-box"></div></details>
              </div>
            </div>
          </div>
        </div>
        <div class="grade-area">
          <button class="btn btn-primary btn-xl reveal-btn">答えを見る <kbd>Space</kbd></button>
          <div class="grades" hidden>
            ${GRADES.map((g) => `<button class="grade ${g.cls}" data-g="${g.g}"><b>${g.label}</b><small>${fmtSpan(pv[g.g])}</small><kbd>${g.key}</kbd></button>`).join('')}
          </div>
        </div>`;

      createMic($('.fc-mic', stage), {
        size: 'sm', label: dir === 'ja2en' ? '英語で答える' : '発音してみる',
        onResult: ({ alts }) => {
          const r = scoreAgainst(it.accepts || [it.en], alts);
          spokenScore = r.score;
          const cm = scoreComment(r.score, state.settings.passScore);
          reveal();
          $('.speech-result', stage).innerHTML = `<div class="score-line ${cm.cls}"><b>${r.score}</b><span>${cm.emoji} ${cm.label}</span></div><div class="diff">${diffHTML(r)}</div><div class="small muted">聞き取り: ${esc(alts[0])}</div>`;
          sfx.play(r.score >= state.settings.passScore ? 'correct' : 'soft');
          // 発話結果から評価をおすすめ
          const rec = r.score >= 95 ? 4 : r.score >= state.settings.passScore ? 3 : r.score >= 50 ? 2 : 1;
          stage.querySelector(`.grade[data-g="${rec}"]`)?.classList.add('suggest');
        },
      });

      $('.reveal-btn', stage).onclick = reveal;
      $('.grades', stage).onclick = (e) => { const b = e.target.closest('.grade'); if (b) grade(+b.dataset.g, b); };
      if (dir === 'en2ja' && state.settings.autoPlay) setTimeout(() => speak(it.en), 250);
    }

    function reveal() {
      if (revealed) return;
      revealed = true;
      sfx.play('flip');
      const fl = $('.flash', stage);
      fl.classList.add('flipping');
      setTimeout(() => fl.classList.add('flipped'), 250);
      setTimeout(() => fl.classList.remove('flipping'), 520);
      $('.reveal-btn', stage).hidden = true;
      $('.grades', stage).hidden = false;
      const it = cur.it;
      if (direction(it) === 'ja2en' && state.settings.autoPlay && spokenScore === null) setTimeout(() => speak(it.en), 350);
      const det = $('.ai-details', stage);
      det.addEventListener('toggle', () => { if (det.open && !det.dataset.loaded) { det.dataset.loaded = 1; loadExplain(it, $('.ai-box', det)); } });
    }

    function grade(g, btnEl) {
      stopSpeaking();
      const it = cur.it;
      const ok = g >= 2;
      const xp = g >= 3 ? (cur.again ? 4 : 10) : g === 2 ? 6 : 2;
      xpSum += xp;
      recordAnswer(it, { ok, grade: g, xp, anchor: btnEl, speak: spokenScore !== null });
      if (!results.has(it.id)) results.set(it.id, { item: it, ok: g >= 3 });
      if (g === GRADE.AGAIN) {
        sfx.play('soft');
        combo = 0;
        queue.splice(Math.min(queue.length, 4), 0, { it, again: true });
      } else {
        doneUnique++;
        combo = g >= 3 ? combo + 1 : 0;
        if (combo >= 3 && combo % 5 === 0) { sfx.play('combo', combo); sparkle($('.combo', el)); }
        else sfx.play('correct');
      }
      bar.setCombo(combo);
      setTimeout(show, 120);
    }

    function finish(early) {
      cleanupKeys();
      stopSpeaking();
      const list = [...results.values()];
      if (!list.length) return go('#/home');
      const correct = list.filter((r) => r.ok).length;
      showResults(stage, {
        title: early ? '復習を中断しました' : '今日の復習 完了！', emoji: early ? '🛬' : '🏁',
        correct, total: list.length, xp: xpSum, timeSec: (Date.now() - t0) / 1000, items: list,
        actions: [
          { label: `${icon('home', 18)} ホーム`, cls: 'btn-soft', onClick: () => go('#/home') },
          { label: `${icon('sparkles', 18)} 新しく覚える`, cls: 'btn-primary', onClick: () => go('#/learn') },
        ],
      });
      $('.sbar', el)?.remove();
    }

    const onKey = (e) => {
      if (e.target?.closest?.('input, textarea')) return;
      if ((e.code === 'Space' || e.key === 'Enter') && !revealed) { e.preventDefault(); reveal(); }
      else if (revealed && ['1', '2', '3', '4'].includes(e.key)) grade(+e.key, stage.querySelector(`.grade[data-g="${e.key}"]`));
    };
    document.addEventListener('keydown', onKey);
    const cleanupKeys = () => document.removeEventListener('keydown', onKey);

    show();
    return cleanupKeys;
  },
};
