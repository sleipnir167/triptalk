// ディクテーション（聞き取って書く）
import { $, esc, emptyState } from '../ui.js';
import { icon } from '../icons.js';
import { pool, scopeLabel } from '../content.js';
import { pickWeighted } from '../srs.js';
import { speak, stopSpeaking } from '../speech.js';
import { sfx } from '../sfx.js';
import { sessionBar, sayBtn, showResults, openItem } from '../components.js';
import { recordAnswer } from '../gamify.js';
import { scoreAgainst, diffHTML } from '../scoring.js';
import { go, handoff } from '../router.js';
import { shake } from '../fx.js';

export default {
  immersive: true,
  render(el, { params }) {
    let items = handoff.take();
    if (!items?.length) items = pickWeighted(pool({ scene: params.scene || 'all', kind: params.kind || 'all' }), +(params.count || 10));
    if (!items.length) {
      el.innerHTML = `<div class="wrap narrow">${emptyState({ emoji: '🔍', title: '出題できる項目がありません', text: `「${scopeLabel(params.scene)}」に該当する項目がありません。`, actions: `<a class="btn btn-primary" href="#/study">学習メニューへ</a>` })}</div>`;
      return;
    }
    let idx = 0, xpSum = 0, combo = 0;
    const log = [];
    const t0 = Date.now();
    el.innerHTML = `<div class="session dict-session"><div class="stage"></div></div>`;
    const bar = sessionBar($('.session', el), { title: 'ディクテーション', onClose: () => finish(true) });
    const stage = $('.stage', el);

    function show() {
      if (idx >= items.length) return finish(false);
      const it = items[idx];
      bar.setProgress(idx, items.length);
      let hintLevel = 0, checked = false, plays = 0;
      stage.innerHTML = `
        <div class="quiz-card pop-in dict-card">
          <div class="qc-kicker">聞こえた英語を書き取ろう</div>
          <div class="row center gap-12">
            <button class="listen-big" data-nosfx="1" aria-label="再生">${icon('volume', 46)}</button>
          </div>
          <div class="row center gap-8 mt-8">${sayBtn(it.en, { slow: true, cls: 'big', label: 'ゆっくり' })}<button class="btn btn-sm btn-soft hint">${icon('bulb', 16)} ヒント</button></div>
          <div class="hint-box small muted"></div>
          <input class="input big-input dict-input" placeholder="ここに入力（Enterで答え合わせ）" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="done">
          <div class="dict-result"></div>
        </div>
        <div class="sp-next"><button class="btn btn-ghost skip">わからない</button><button class="btn btn-primary btn-xl check">答え合わせ</button></div>`;
      const inp = $('.dict-input', stage);
      const play = () => { plays++; speak(it.en); };
      $('.listen-big', stage).onclick = play;
      setTimeout(play, 300);
      setTimeout(() => inp.focus({ preventScroll: true }), 350);
      $('.hint', stage).onclick = () => {
        hintLevel++;
        const words = it.en.split(/\s+/);
        $('.hint-box', stage).textContent = hintLevel === 1
          ? `${words.length}語 · 日本語: ${it.ja}`
          : words.map((w) => w[0] + w.slice(1).replace(/[A-Za-z]/g, '＿')).join(' ');
      };
      const check = (giveUp = false) => {
        if (checked) { idx++; show(); return; }
        const v = inp.value.trim();
        if (!v && !giveUp) { shake(inp); return; }
        checked = true;
        const r = scoreAgainst(it.accepts || [it.en], [v || '']);
        const ok = !giveUp && r.score >= 90;
        const close = !giveUp && r.score >= 70;
        const xp = ok ? (hintLevel ? 8 : 14) : close ? 4 : 1;
        xpSum += xp;
        combo = ok ? combo + 1 : 0;
        bar.setCombo(combo);
        log.push({ item: it, ok, note: giveUp ? 'スキップ' : `${r.score}点` });
        recordAnswer(it, { ok: ok || close, grade: ok ? (hintLevel || plays > 3 ? 2 : 3) : close ? 2 : 1, xp, anchor: inp });
        sfx.play(ok ? 'correct' : close ? 'soft' : 'wrong');
        inp.disabled = true;
        $('.dict-result', stage).innerHTML = `
          <div class="score-line ${ok ? 'great' : close ? 'close' : 'bad'}"><b>${giveUp ? '-' : r.score}</b><span>${ok ? '⭕ 正解！' : close ? '△ おしい！' : '❌ 不正解'}</span></div>
          <div class="diff big">${diffHTML(r)}</div>
          <div class="row center gap-8">${sayBtn(it.en, { size: 18 })}<span class="small muted">${esc(it.ja)}</span><button class="btn btn-sm btn-ghost more">${icon('info', 16)}</button></div>`;
        $('.more', stage).onclick = () => openItem(it);
        $('.check', stage).innerHTML = `次へ ${icon('chevR', 20)}`;
        $('.skip', stage).hidden = true;
      };
      $('.check', stage).onclick = () => check();
      $('.skip', stage).onclick = () => check(true);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); check(); } });
      stage.onkeydown = (e) => { if (checked && e.key === 'Enter') { idx++; show(); } };
    }

    function finish(early) {
      stopSpeaking();
      if (!log.length) return go('#/study');
      $('.sbar', el)?.remove();
      const correct = log.filter((l) => l.ok).length;
      const wrong = log.filter((l) => !l.ok).map((l) => l.item);
      showResults(stage, {
        title: early ? '中断しました' : 'ディクテーション 結果', emoji: '🎧',
        correct, total: log.length, xp: xpSum, timeSec: (Date.now() - t0) / 1000, items: log,
        actions: [
          { label: `${icon('home', 18)} ホーム`, onClick: () => go('#/home') },
          ...(wrong.length ? [{ label: `${icon('repeat', 18)} 間違えた${wrong.length}問を再挑戦`, cls: 'btn-primary', onClick: () => { handoff.items = wrong; go(`#/dictation?retry=${Date.now()}`); } }] : []),
        ],
      });
    }
    show();
  },
};
