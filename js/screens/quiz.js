// 4択クイズ: 英→日 / 日→英 / リスニング / 例文穴埋め
import { $, $$, esc, shuffle, emptyState } from '../ui.js';
import { icon } from '../icons.js';
import { state } from '../store.js';
import { pool, scopeLabel, allItems } from '../content.js';
import { pickWeighted } from '../srs.js';
import { speak, stopSpeaking } from '../speech.js';
import { sfx } from '../sfx.js';
import { sessionBar, sayBtn, showResults, openItem } from '../components.js';
import { recordAnswer } from '../gamify.js';
import { go, handoff } from '../router.js';
import { distractors } from './learn.js';
import { shake } from '../fx.js';

const TITLES = { en2ja: '意味を選ぶ', ja2en: '英語を選ぶ', listen: 'リスニング4択', cloze: '例文の穴埋め' };

function clozeOf(it) {
  if (!it.ex) return null;
  const re = new RegExp(`\\b${it.en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  if (!re.test(it.ex)) return null;
  return it.ex.replace(re, '<span class="blank">＿＿＿＿</span>');
}

export default {
  immersive: true,
  render(el, { params }) {
    const mode = params.mode || 'en2ja';
    const count = +(params.count || 10);
    let items = handoff.take();
    if (!items?.length) {
      let p = pool({ scene: params.scene || 'all', kind: mode === 'cloze' ? 'word' : params.kind || 'all' });
      if (mode === 'cloze') p = p.filter((it) => clozeOf(it));
      items = pickWeighted(p, count);
    }
    if (!items.length) {
      el.innerHTML = `<div class="wrap narrow">${emptyState({ emoji: '🔍', title: '出題できる項目がありません', text: `「${scopeLabel(params.scene)}」に該当する項目が見つかりませんでした。`, actions: `<a class="btn btn-primary" href="#/study">学習メニューへ</a>` })}</div>`;
      return;
    }
    const field = mode === 'ja2en' || mode === 'cloze' ? 'en' : 'ja';
    let idx = 0, combo = 0, xpSum = 0, correct = 0;
    const log = [];
    const t0 = Date.now();
    let keyFn = null;
    el.innerHTML = `<div class="session quiz-session"><div class="stage"></div></div>`;
    const bar = sessionBar($('.session', el), { title: TITLES[mode], onClose: () => finish(true) });
    const stage = $('.stage', el);

    function ask() {
      if (idx >= items.length) return finish(false);
      const it = items[idx];
      bar.setProgress(idx, items.length);
      const opts = shuffle([it, ...distractors(it, 3, field)]);
      const t1 = Date.now();
      let prompt = '';
      if (mode === 'en2ja') prompt = `<div class="qc-kicker">この英語の意味は？</div><div class="qc-en">${esc(it.en)}</div><div class="row center">${sayBtn(it.en, { size: 22, cls: 'big' })}</div>`;
      else if (mode === 'ja2en') prompt = `<div class="qc-kicker">英語でなんと言う？</div><div class="qc-ja">${esc(it.ja)}</div>`;
      else if (mode === 'listen') prompt = `<div class="qc-kicker">聞こえた英語の意味は？</div><button class="listen-big" data-nosfx="1">${icon('volume', 46)}</button><div class="row center gap-8">${sayBtn(it.en, { slow: true, cls: 'big', label: 'ゆっくり' })}</div>`;
      else prompt = `<div class="qc-kicker">空欄に入る語は？</div><div class="qc-cloze">${clozeOf(it)}</div><div class="small muted center">${esc(it.exJa || '')}</div>`;
      stage.innerHTML = `
        <div class="quiz-card pop-in">${prompt}</div>
        <div class="options">${opts.map((o, i) => `<button class="qopt ${field === 'en' ? 'en' : ''}" data-id="${o.id}"><kbd>${i + 1}</kbd><span>${esc(o[field])}</span></button>`).join('')}</div>
        <div class="feedback"></div>`;
      const play = () => speak(it.en);
      $('.listen-big', stage)?.addEventListener('click', play);
      if ((mode === 'listen' || (mode === 'en2ja' && state.settings.autoPlay))) setTimeout(play, 250);
      let answered = false;
      const answer = (btn) => {
        if (answered || !btn) return; answered = true;
        const ok = btn.dataset.id === it.id;
        $$('.qopt', stage).forEach((b) => { b.disabled = true; if (b.dataset.id === it.id) b.classList.add('correct'); });
        const slow = Date.now() - t1 > 10000;
        log.push({ item: it, ok });
        if (ok) {
          correct++; combo++;
          const xp = 10 + (combo >= 5 ? 5 : 0);
          xpSum += xp;
          recordAnswer(it, { ok: true, grade: slow ? 2 : 3, xp, anchor: btn });
          sfx.play(combo >= 3 ? 'combo' : 'correct', combo);
        } else {
          combo = 0;
          btn.classList.add('wrong'); shake(btn);
          recordAnswer(it, { ok: false, grade: 1, xp: 1 });
          sfx.play('wrong');
        }
        bar.setCombo(combo);
        const fb = $('.feedback', stage);
        fb.innerHTML = `<div class="fb-card ${ok ? 'ok' : 'ng'}">
            <div class="fb-head">${ok ? '⭕ 正解！' : '❌ 不正解'}</div>
            <div class="fb-body">${sayBtn(it.en, { size: 18 })}<div><div class="en">${esc(it.en)}</div><div class="small muted">${esc(it.ja)}</div></div><button class="btn btn-sm btn-soft more">${icon('info', 16)} 詳しく</button></div>
          </div>
          <button class="btn btn-primary btn-xl next">${idx + 1 >= items.length ? '結果を見る' : '次へ'} ${icon('chevR', 20)}</button>`;
        $('.more', fb).onclick = () => openItem(it);
        $('.next', fb).onclick = next;
        if (mode !== 'en2ja' || !ok) speak(it.en);
        if (ok) setTimeout(() => { if (items[idx] === it) next(); }, 1300);
      };
      const next = () => { if (items[idx] !== it) return; idx++; ask(); };
      keyFn = (e) => {
        const n = +e.key;
        if (!answered && n >= 1 && n <= 4) answer($$('.qopt', stage)[n - 1]);
        else if (answered && (e.key === 'Enter' || e.code === 'Space')) { e.preventDefault(); next(); }
      };
      $('.options', stage).onclick = (e) => answer(e.target.closest('.qopt'));
    }

    const onKey = (e) => keyFn?.(e);
    document.addEventListener('keydown', onKey);

    function finish(early) {
      document.removeEventListener('keydown', onKey);
      stopSpeaking();
      if (!log.length) return go('#/study');
      $('.sbar', el)?.remove();
      const wrong = log.filter((l) => !l.ok).map((l) => l.item);
      showResults(stage, {
        title: early ? 'クイズを中断しました' : `${TITLES[mode]} 結果`, emoji: correct === log.length ? '💯' : '🎯',
        correct, total: log.length, xp: xpSum, timeSec: (Date.now() - t0) / 1000, items: log,
        actions: [
          { label: `${icon('home', 18)} ホーム`, onClick: () => go('#/home') },
          ...(wrong.length ? [{ label: `${icon('repeat', 18)} 間違えた${wrong.length}問を再挑戦`, cls: 'btn-primary', onClick: () => { handoff.items = wrong; go(`#/quiz?mode=${mode}&retry=${Date.now()}`); } }] : []),
          { label: `${icon('refresh', 18)} 別の問題`, cls: wrong.length ? 'btn-soft' : 'btn-primary', onClick: () => go(`#/quiz?mode=${mode}&scene=${params.scene || 'all'}&kind=${params.kind || 'all'}&count=${count}&r=${Date.now()}`) },
        ],
      });
    }

    ask();
    return () => document.removeEventListener('keydown', onKey);
  },
};
