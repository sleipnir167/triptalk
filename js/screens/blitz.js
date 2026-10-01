// スピード周回: スワイプ（自己判定）/ 4択タイムアタック
import { $, $$, esc, shuffle } from '../ui.js';
import { icon } from '../icons.js';
import { state, save } from '../store.js';
import { pool, scenes } from '../content.js';
import { pickWeighted } from '../srs.js';
import { speak, stopSpeaking } from '../speech.js';
import { sfx, haptic } from '../sfx.js';
import { sessionBar, showResults } from '../components.js';
import { recordAnswer, bump } from '../gamify.js';
import { go, handoff } from '../router.js';
import { distractors } from './learn.js';
import { confetti, shake, floatText } from '../fx.js';

export default {
  immersive: true,
  render(el) {
    let last = {};
    try { last = JSON.parse(localStorage.getItem('tt-blitz') || '{}'); } catch {}
    const cfg = { type: last.type || 'swipe', time: last.time || 60, scene: last.scene || 'all', dir: last.dir || 'en2ja', audio: !!last.audio };
    let cleanupFn = null;

    function setup() {
      const best = state.stats.best;
      const seg = (key, opts) => `<div class="seg" data-k="${key}">${opts.map(([v, l]) => `<button class="${String(cfg[key]) === String(v) ? 'active' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`;
      el.innerHTML = `
        <div class="session blitz-setup">
          <div class="wrap narrow">
            <div class="blitz-hero">
              <div class="bh-icon">${icon('zap', 44)}</div>
              <h1>スピード周回</h1>
              <p class="muted">短時間で大量のカードを回して、知っている単語は一瞬で答えられるように。<br>わからなかったものは自動で復習に回ります。</p>
              <div class="best-row">
                <div><small>スワイプ最高</small><b>${best.blitzCards || 0}<span>枚</span></b></div>
                <div><small>タイムアタック最高</small><b>${best.blitzQuiz || 0}<span>点</span></b></div>
              </div>
            </div>
            <div class="card setup-card">
              <label class="field-label">モード</label>
              <div class="type-cards">
                <button class="type-card ${cfg.type === 'swipe' ? 'active' : ''}" data-type="swipe"><span>👆</span><b>スワイプ</b><small>わかる→右 / わからない→左。自己判定で爆速周回</small></button>
                <button class="type-card ${cfg.type === 'quiz' ? 'active' : ''}" data-type="quiz"><span>🎯</span><b>4択タイムアタック</b><small>1問6秒。連続正解でスコア倍率アップ</small></button>
              </div>
              <label class="field-label">制限時間</label>
              ${seg('time', [[60, '60秒'], [120, '120秒'], [180, '180秒']])}
              <label class="field-label">出題方向</label>
              ${seg('dir', [['en2ja', '英 → 日'], ['ja2en', '日 → 英']])}
              <label class="field-label">範囲（苦手・忘れかけを優先して出題）</label>
              <div class="chips wrap" data-k="scene">
                <button class="chip ${cfg.scene === 'all' ? 'active' : ''}" data-v="all">🌐 すべて</button>
                <button class="chip ${cfg.scene === 'learned' ? 'active' : ''}" data-v="learned">📗 学習済み</button>
                <button class="chip ${cfg.scene === 'weak' ? 'active' : ''}" data-v="weak">🩹 苦手</button>
                ${scenes().map((s) => `<button class="chip ${cfg.scene === s.id ? 'active' : ''}" data-v="${s.id}">${s.emoji} ${esc(s.name)}</button>`).join('')}
              </div>
              <label class="switch-row"><span>英語を自動で読み上げる</span><input type="checkbox" class="switch" data-k="audio" ${cfg.audio ? 'checked' : ''}></label>
            </div>
            <div class="row center gap-12 mt-16">
              <a class="btn btn-ghost btn-lg" href="#/study">戻る</a>
              <button class="btn btn-accent btn-xl start-btn">${icon('zap', 22)} スタート</button>
            </div>
          </div>
        </div>`;
      el.onclick = (e) => {
        const t = e.target.closest('[data-type]');
        if (t) { cfg.type = t.dataset.type; $$('[data-type]', el).forEach((x) => x.classList.toggle('active', x === t)); }
        const b = e.target.closest('[data-k] [data-v]');
        if (b) {
          const g = b.parentElement;
          cfg[g.dataset.k] = g.dataset.k === 'time' ? +b.dataset.v : b.dataset.v;
          $$('[data-v]', g).forEach((x) => x.classList.toggle('active', x === b));
        }
        if (e.target.closest('.start-btn')) start();
      };
      $('[data-k="audio"]', el).onchange = (e) => (cfg.audio = e.target.checked);
    }

    function deck() {
      let p = pool({ scene: cfg.scene });
      if (p.length < 8) p = pool({ scene: 'all' });
      return pickWeighted(p, Math.min(p.length, 400));
    }

    async function countdown() {
      el.onclick = null;
      el.innerHTML = `<div class="session countdown"><div class="cd-num">3</div></div>`;
      const n = $('.cd-num', el);
      for (const v of ['3', '2', '1']) { n.textContent = v; n.classList.remove('go'); void n.offsetWidth; n.classList.add('go'); sfx.play('tick'); await new Promise((r) => setTimeout(r, 650)); }
      n.textContent = 'GO!'; n.classList.remove('go'); void n.offsetWidth; n.classList.add('go'); sfx.play('go');
      await new Promise((r) => setTimeout(r, 450));
    }

    async function start() {
      localStorage.setItem('tt-blitz', JSON.stringify(cfg));
      await countdown();
      if (cfg.type === 'swipe') runSwipe(); else runQuiz();
    }

    // ---------- スワイプ ----------
    function runSwipe() {
      const cards = deck();
      let i = 0, known = 0, unknown = 0, combo = 0, xpSum = 0, ended = false;
      const log = [];
      const startAt = Date.now();
      const endAt = startAt + cfg.time * 1000;
      el.innerHTML = `<div class="session blitz">
        <div class="timer-bar"><i></i></div>
        <div class="blitz-score"><div><small>わかる</small><b class="k">0</b></div><div class="blitz-time"><b>${cfg.time}</b><small>秒</small></div><div><small>わからない</small><b class="u">0</b></div></div>
        <div class="deck"></div>
        <div class="last-strip" hidden></div>
        <div class="swipe-btns">
          <button class="sw-btn no" aria-label="わからない">${icon('x', 30)}<small>わからない</small></button>
          <button class="sw-btn yes" aria-label="わかる">${icon('check', 30)}<small>わかる</small></button>
        </div>
        <p class="center small muted kbd-hint">← → キーでも操作できます</p>
      </div>`;
      const bar = sessionBar($('.session', el), { title: 'スピード周回', onClose: () => end() });
      bar.setCount('');
      const deckEl = $('.deck', el);
      const tbar = $('.timer-bar i', el);
      const tnum = $('.blitz-time b', el);
      const strip = $('.last-strip', el);

      const text = (it) => (cfg.dir === 'en2ja' ? it.en : it.ja);
      const back = (it) => (cfg.dir === 'en2ja' ? it.ja : it.en);
      function renderCard() {
        if (i >= cards.length) i = 0;
        const it = cards[i];
        deckEl.innerHTML = `
          <div class="swipe-card under"><div class="sc-text">${esc(text(cards[(i + 1) % cards.length]))}</div></div>
          <div class="swipe-card top"><div class="sc-kind">${it.kind === 'word' ? 'WORD' : 'PHRASE'}</div><div class="sc-text ${cfg.dir}">${esc(text(it))}</div><div class="sc-stamp yes">KNOW</div><div class="sc-stamp no">AGAIN</div></div>`;
        attachDrag($('.swipe-card.top', deckEl));
        if (cfg.audio && cfg.dir === 'en2ja') speak(it.en, { rate: 1.05 });
      }
      function decide(knowIt) {
        if (ended) return;
        const it = cards[i];
        const card = $('.swipe-card.top', deckEl);
        card.classList.add(knowIt ? 'fly-right' : 'fly-left');
        haptic(8);
        if (knowIt) {
          known++; combo++;
          const xp = 2 + (combo >= 10 ? 2 : combo >= 5 ? 1 : 0);
          xpSum += xp;
          recordAnswer(it, { ok: true, grade: 3, xp });
          sfx.play(combo % 10 === 0 ? 'combo' : 'select', combo);
        } else {
          unknown++; combo = 0;
          recordAnswer(it, { ok: false, grade: 1, xp: 0 });
          sfx.play('soft');
        }
        log.push({ item: it, ok: knowIt });
        bar.setCombo(combo);
        $('.k', el).textContent = known; $('.u', el).textContent = unknown;
        // 直前のカードを確認できるストリップ（間違って「わかる」を押した場合の取り消し付き）
        strip.hidden = false;
        strip.className = 'last-strip ' + (knowIt ? 'ok' : 'ng');
        strip.innerHTML = `<span class="ls-en">${esc(text(it))}</span><span class="ls-ja">${esc(back(it))}</span>${knowIt ? '<button class="ls-undo">やっぱり×</button>' : ''}`;
        const undo = $('.ls-undo', strip);
        if (undo) undo.onclick = () => {
          const entry = log[log.length - 1];
          if (entry?.item !== it || !entry.ok) return;
          entry.ok = false; known--; unknown++; combo = 0;
          recordAnswer(it, { ok: false, grade: 1, xp: 0 });
          $('.k', el).textContent = known; $('.u', el).textContent = unknown;
          strip.className = 'last-strip ng'; undo.remove(); bar.setCombo(0);
        };
        i++;
        setTimeout(renderCard, 160);
      }
      function attachDrag(card) {
        let sx = 0, dx = 0, dragging = false;
        card.addEventListener('pointerdown', (e) => { dragging = true; sx = e.clientX; card.setPointerCapture(e.pointerId); card.style.transition = 'none'; });
        card.addEventListener('pointermove', (e) => {
          if (!dragging) return;
          dx = e.clientX - sx;
          card.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
          card.style.setProperty('--yes', Math.max(0, Math.min(1, dx / 120)));
          card.style.setProperty('--no', Math.max(0, Math.min(1, -dx / 120)));
        });
        const up = () => {
          if (!dragging) return; dragging = false;
          card.style.transition = '';
          if (Math.abs(dx) > 90) decide(dx > 0);
          else { card.style.transform = ''; card.style.setProperty('--yes', 0); card.style.setProperty('--no', 0); }
          dx = 0;
        };
        card.addEventListener('pointerup', up);
        card.addEventListener('pointercancel', up);
      }
      $('.sw-btn.yes', el).onclick = () => decide(true);
      $('.sw-btn.no', el).onclick = () => decide(false);
      const onKey = (e) => { if (e.key === 'ArrowRight') decide(true); if (e.key === 'ArrowLeft') decide(false); };
      document.addEventListener('keydown', onKey);
      const tick = setInterval(() => {
        const left = Math.max(0, endAt - Date.now());
        tbar.style.width = (left / (cfg.time * 1000)) * 100 + '%';
        const s = Math.ceil(left / 1000);
        if (tnum.textContent !== String(s)) { tnum.textContent = s; if (s <= 5 && s > 0) sfx.play('tick'); }
        if (!left) end();
      }, 100);
      cleanupFn = () => { clearInterval(tick); document.removeEventListener('keydown', onKey); };
      renderCard();

      function end() {
        if (ended) return; ended = true;
        cleanupFn();
        stopSpeaking();
        const total = known + unknown;
        const elapsed = Math.max(1, Math.min(cfg.time, (Date.now() - startAt) / 1000));
        const isBest = known > (state.stats.best.blitzCards || 0);
        if (isBest) { state.stats.best.blitzCards = known; save('stats'); }
        bump('blitz');
        $('.sbar', el)?.remove();
        const wrong = log.filter((l) => !l.ok).map((l) => l.item);
        const stage = $('.session', el);
        showResults(stage, {
          title: isBest && known ? '自己ベスト更新！' : 'スピード周回 終了', emoji: isBest && known ? '🏆' : '⚡',
          correct: known, total, xp: xpSum, timeSec: elapsed, items: log, scoreLabel: '知ってた率',
          extraHTML: `<div class="blitz-summary"><div><b>${total}</b><small>枚</small></div><div><b>${Math.round((total / elapsed) * 60)}</b><small>枚/分</small></div><div><b>${state.stats.best.blitzCards || 0}</b><small>最高記録</small></div></div>`,
          actions: [
            { label: `${icon('refresh', 18)} もう一度`, cls: 'btn-soft', onClick: () => setup() },
            ...(wrong.length ? [{ label: `${icon('sparkles', 18)} わからない${wrong.length}個を覚える`, cls: 'btn-primary', onClick: () => { handoff.items = [...new Map(wrong.map((w) => [w.id, w])).values()].slice(0, 20); go('#/learn?handoff=1'); } }] : []),
          ],
        });
        if (isBest && known) setTimeout(() => confetti({ count: 200 }), 300);
      }
    }

    // ---------- 4択タイムアタック ----------
    function runQuiz() {
      const cards = deck();
      let i = 0, score = 0, combo = 0, correct = 0, answered = 0, xpSum = 0, ended = false, qTimer = null;
      const log = [];
      const startAt = Date.now();
      const endAt = startAt + cfg.time * 1000;
      const Q_MS = 6000;
      const field = cfg.dir === 'en2ja' ? 'ja' : 'en';
      el.innerHTML = `<div class="session blitz tq">
        <div class="timer-bar"><i></i></div>
        <div class="blitz-score"><div><small>SCORE</small><b class="sc">0</b></div><div class="blitz-time"><b>${cfg.time}</b><small>秒</small></div><div><small>倍率</small><b class="mul">×1.0</b></div></div>
        <div class="tq-stage"></div>
      </div>`;
      const bar = sessionBar($('.session', el), { title: '4択タイムアタック', onClose: () => end() });
      bar.setCount('');
      const stage = $('.tq-stage', el);
      const tbar = $('.timer-bar i', el);
      const tnum = $('.blitz-time b', el);
      const mult = () => 1 + Math.min(2, Math.floor(combo / 5) * 0.5);

      function ask() {
        if (ended) return;
        const it = cards[i++ % cards.length];
        const opts = shuffle([it, ...distractors(it, 3, field)]);
        const t1 = Date.now();
        stage.innerHTML = `
          <div class="quiz-card pop-in"><div class="${cfg.dir === 'en2ja' ? 'qc-en' : 'qc-ja'}">${esc(cfg.dir === 'en2ja' ? it.en : it.ja)}</div><div class="q-timer"><i></i></div></div>
          <div class="options">${opts.map((o, k) => `<button class="qopt ${field === 'en' ? 'en' : ''}" data-id="${o.id}"><kbd>${k + 1}</kbd><span>${esc(o[field])}</span></button>`).join('')}</div>`;
        if (cfg.audio && cfg.dir === 'en2ja') speak(it.en, { rate: 1.05 });
        const qbar = $('.q-timer i', stage);
        qbar.style.transition = `width ${Q_MS}ms linear`;
        requestAnimationFrame(() => requestAnimationFrame(() => (qbar.style.width = '0%')));
        let done = false;
        const answer = (btn) => {
          if (done || ended) return; done = true;
          clearTimeout(qTimer);
          answered++;
          const ok = !!btn && btn.dataset.id === it.id;
          $$('.qopt', stage).forEach((b) => { if (b.dataset.id === it.id) b.classList.add('correct'); });
          log.push({ item: it, ok });
          if (ok) {
            correct++; combo++;
            const speed = Math.max(0, 1 - (Date.now() - t1) / Q_MS);
            const pts = Math.round((10 + speed * 10) * mult());
            score += pts;
            xpSum += 3;
            recordAnswer(it, { ok: true, grade: 3, xp: 3 });
            floatText(`+${pts}`, btn, 'pts');
            sfx.play(combo >= 5 && combo % 5 === 0 ? 'combo' : 'correct', combo);
          } else {
            combo = 0;
            if (btn) { btn.classList.add('wrong'); shake(btn); }
            recordAnswer(it, { ok: false, grade: 1, xp: 0 });
            sfx.play('wrong');
          }
          bar.setCombo(combo);
          $('.sc', el).textContent = score;
          $('.mul', el).textContent = '×' + mult().toFixed(1);
          setTimeout(ask, ok ? 350 : 1100);
        };
        qTimer = setTimeout(() => answer(null), Q_MS);
        stage.onclick = (e) => { const b = e.target.closest('.qopt'); if (b) answer(b); };
        onKeyQ = (e) => { const n = +e.key; if (n >= 1 && n <= 4) answer($$('.qopt', stage)[n - 1]); };
      }
      let onKeyQ = () => {};
      const keyProxy = (e) => onKeyQ(e);
      document.addEventListener('keydown', keyProxy);
      const tick = setInterval(() => {
        const left = Math.max(0, endAt - Date.now());
        tbar.style.width = (left / (cfg.time * 1000)) * 100 + '%';
        const s = Math.ceil(left / 1000);
        if (tnum.textContent !== String(s)) { tnum.textContent = s; if (s <= 5 && s > 0) sfx.play('tick'); }
        if (!left) end();
      }, 100);
      cleanupFn = () => { clearInterval(tick); clearTimeout(qTimer); document.removeEventListener('keydown', keyProxy); };
      ask();

      function end() {
        if (ended) return; ended = true;
        cleanupFn();
        stopSpeaking();
        const isBest = score > (state.stats.best.blitzQuiz || 0);
        if (isBest) { state.stats.best.blitzQuiz = score; save('stats'); }
        bump('blitz');
        $('.sbar', el)?.remove();
        const wrong = log.filter((l) => !l.ok).map((l) => l.item);
        showResults($('.session', el), {
          title: isBest && score ? '自己ベスト更新！' : 'タイムアタック 終了', emoji: isBest && score ? '🏆' : '🎯',
          correct, total: answered, xp: xpSum, timeSec: Math.min(cfg.time, (Date.now() - startAt) / 1000), items: log,
          extraHTML: `<div class="blitz-summary"><div><b>${score}</b><small>スコア</small></div><div><b>${correct}</b><small>正解</small></div><div><b>${state.stats.best.blitzQuiz || 0}</b><small>最高記録</small></div></div>`,
          actions: [
            { label: `${icon('refresh', 18)} もう一度`, cls: 'btn-soft', onClick: () => setup() },
            ...(wrong.length ? [{ label: `${icon('sparkles', 18)} 間違えた${wrong.length}個を覚える`, cls: 'btn-primary', onClick: () => { handoff.items = [...new Map(wrong.map((w) => [w.id, w])).values()].slice(0, 20); go('#/learn?handoff=1'); } }] : []),
          ],
        });
        if (isBest && score) setTimeout(() => confetti({ count: 200 }), 300);
      }
    }

    setup();
    return () => cleanupFn?.();
  },
};
