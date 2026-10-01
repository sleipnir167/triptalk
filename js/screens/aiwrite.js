// AI添削（英作文・スピーキングの点数化）
import { $, $$, esc, ring, bar, fmtDate, promptDialog, toast } from '../ui.js';
import { icon } from '../icons.js';
import { state, save } from '../store.js';
import { sceneById, scenes } from '../content.js';
import { speak, stopSpeaking } from '../speech.js';
import { sfx } from '../sfx.js';
import { sayBtn, createMic, addToMyWords } from '../components.js';
import { addXP, bump, flushCelebrations } from '../gamify.js';
import { WRITE_PROMPTS } from '../data/dialogues.js';
import { aiReady, correctText, aiWaitHint } from '../ai.js';
import { checkEnglish, checkHTML } from '../wcheck.js';
import { scoreAgainst, diffHTML, textDiffHTML } from '../scoring.js';
import { bindAddWords } from './aichat.js';
import { confetti } from '../fx.js';

export default {
  nav: 'study',
  render(el) {
    let sceneFilter = 'all';
    let cur = WRITE_PROMPTS[Math.floor(Math.random() * WRITE_PROMPTS.length)];
    let inputMode = 'write';
    const ready = aiReady('explain');

    el.innerHTML = `
      <div class="wrap narrow">
        <header class="page-head with-back"><a class="btn-icon soft" href="#/study" aria-label="戻る">${icon('chevL')}</a><div><h1>AI添削</h1><p class="muted">状況に合った英語を書く／話すと、AIが100点満点で採点・添削します</p></div></header>
        ${!ready ? `<div class="notice warn">${icon('alert', 18)}<span>AIが未設定のため、模範解答との比較（簡易採点）で練習できます。<a href="#/settings?sec=ai">設定 &gt; AI</a> でプロバイダを追加すると詳細な添削が使えます。</span></div>` : ''}
        <div class="chips wrap scene-filter">
          <button class="chip active" data-sc="all">🌐 すべて</button>
          ${scenes({ withCustom: false }).filter((s) => WRITE_PROMPTS.some((p) => p.scene === s.id)).map((s) => `<button class="chip" data-sc="${s.id}">${s.emoji} ${esc(s.name)}</button>`).join('')}
        </div>
        <div class="card prompt-card">
          <div class="pc-top"><span class="pc-scene"></span><div class="row gap-8"><button class="btn btn-sm btn-soft shuffle">${icon('shuffle', 16)} 別のお題</button><button class="btn btn-sm btn-ghost own">${icon('edit', 16)} 自分で書く</button></div></div>
          <div class="pc-ja"></div>
          <button class="pc-hint-btn small">${icon('bulb', 14)} キーワードのヒント</button>
          <div class="pc-hint small muted" hidden></div>
        </div>
        <div class="seg input-mode"><button class="active" data-m="write">${icon('pen', 16)} 書く</button><button data-m="speak">${icon('mic', 16)} 話す</button></div>
        <div class="write-box">
          <textarea class="input answer" rows="4" placeholder="ここに英語で書いてください" autocapitalize="sentences" spellcheck="false"></textarea>
          <div class="speak-box" hidden></div>
        </div>
        <div class="row center gap-8 mt-12"><button class="btn btn-primary btn-xl submit">${icon('sparkles', 20)} ${ready ? '添削してもらう' : '模範解答と比べる'}</button></div>
        <div class="write-result"></div>
        <div class="write-hist"></div>
      </div>`;

    const ta = $('.answer', el);
    function renderPrompt() {
      const sc = sceneById(cur.scene) || { emoji: '✏️', name: 'カスタム' };
      $('.pc-scene', el).innerHTML = `<span class="chip sm">${sc.emoji} ${esc(sc.name)}</span>`;
      $('.pc-ja', el).textContent = cur.ja;
      $('.pc-hint', el).textContent = cur.hint || '';
      $('.pc-hint', el).hidden = true;
      $('.pc-hint-btn', el).hidden = !cur.hint;
      $('.write-result', el).innerHTML = '';
    }
    function nextPrompt() {
      const list = WRITE_PROMPTS.filter((p) => (sceneFilter === 'all' || p.scene === sceneFilter) && p !== cur);
      cur = list[Math.floor(Math.random() * list.length)] || cur;
      ta.value = '';
      renderPrompt();
    }
    renderPrompt();
    renderHist();

    createMic($('.speak-box', el), {
      label: 'タップして英語で話す', allowType: false,
      onResult: ({ alts }) => { ta.value = alts[0]; },
    });

    el.addEventListener('click', async (e) => {
      const c = e.target.closest('[data-sc]');
      if (c) { sceneFilter = c.dataset.sc; $$('[data-sc]', el).forEach((x) => x.classList.toggle('active', x === c)); nextPrompt(); return; }
      const m = e.target.closest('[data-m]');
      if (m) {
        inputMode = m.dataset.m;
        $$('[data-m]', el).forEach((x) => x.classList.toggle('active', x === m));
        $('.speak-box', el).hidden = inputMode !== 'speak';
        ta.placeholder = inputMode === 'speak' ? '話した内容がここに入ります（修正もOK）' : 'ここに英語で書いてください';
        return;
      }
      if (e.target.closest('.shuffle')) nextPrompt();
      if (e.target.closest('.pc-hint-btn')) $('.pc-hint', el).hidden = false;
      if (e.target.closest('.own')) {
        const v = await promptDialog({ title: '自分でお題を作る', label: '状況（日本語）', placeholder: '例: 空港でスーツケースが壊れていたと伝える', multiline: true });
        if (v?.trim()) { cur = { scene: 'custom', ja: v.trim(), hint: '', model: '' }; ta.value = ''; renderPrompt(); }
      }
      if (e.target.closest('.submit')) submit();
      const h = e.target.closest('[data-hi]');
      if (h) {
        const rec = state.history.filter((x) => x.type === 'write')[+h.dataset.hi];
        if (rec) { $('.write-result', el).innerHTML = resultHTML(rec.result, rec.text, rec.prompt); bindAddWords($('.write-result', el)); $('.write-result', el).scrollIntoView({ behavior: 'smooth' }); }
      }
    });

    async function submit() {
      const text = ta.value.trim();
      if (!text) { toast('英語を入力してください'); ta.focus(); return; }
      const out = $('.write-result', el);
      stopSpeaking();
      // まず端末内の無料チェック（一瞬・AIなし）
      const free = checkHTML(checkEnglish(text, { writing: inputMode === 'write' }), esc);
      if (!ready) {
        const r = cur.model ? scoreAgainst([cur.model], [text]) : null;
        out.innerHTML = `<div class="card result-card">${free}
          ${r ? `<h3 class="mt-16">模範解答との比較</h3>
          <div class="score-big">${ring(r.score / 100, { size: 90, stroke: 9, label: r.score, sub: '一致度' })}<p class="small muted">表現が違っても正しい場合があります。AIを使うと意味ベースで採点されます。</p></div>
          <div class="diff big">${diffHTML(r)}</div>
          <div class="ex-row">${sayBtn(cur.model, { size: 18 })}<div class="en">${esc(cur.model)}</div></div>` : '<p class="small muted mt-8">自作のお題の採点・添削にはAIが必要です。</p>'}</div>`;
        addXP(5);
        return;
      }
      out.innerHTML = `<div class="card result-card">${free}</div><div class="report-loading"><div class="plane-loader">✈️</div><p>AIが添削中…${aiWaitHint('explain')}</p></div>`;
      $('.submit', el).disabled = true;
      try {
        const { data, cached } = await correctText({ situation: cur.ja, text, mode: inputMode === 'speak' ? 'speaking' : 'writing' });
        const prompt = { ...cur };
        out.innerHTML = resultHTML(data, text, prompt);
        bindAddWords(out);
        out.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (!cached) {
          const xp = 15 + Math.round((data.total || 0) / 10);
          addXP(xp);
          bump('aiWrites');
          state.history.unshift({ type: 'write', t: Date.now(), text, prompt, result: data });
          state.history = state.history.slice(0, 60);
          save('history');
          renderHist();
        }
        sfx.play((data.total || 0) >= 80 ? 'finish' : 'pop');
        if ((data.total || 0) >= 90) confetti({ count: 120 });
        setTimeout(flushCelebrations, 1000);
      } catch (e) {
        $('.report-loading', out)?.remove();
        out.insertAdjacentHTML('beforeend', `<div class="ai-error mt-12">${esc(e.message)}</div>`);
      } finally {
        $('.submit', el).disabled = false;
      }
    }

    function resultHTML(d, text, prompt) {
      const s = d.scores || {};
      const labels = { grammar: '文法', vocabulary: '語彙', naturalness: '自然さ', task: '伝達度' };
      return `<div class="card result-card pop-in">
        <div class="report-hero">
          ${ring((d.total || 0) / 100, { size: 140, stroke: 12, label: d.total ?? '-', sub: '/ 100', grad: (d.total || 0) >= 80 ? ['#2ed3a1', '#22d3ee'] : ['#d946ef', '#f43f5e'] })}
          <div class="report-side">${Object.entries(labels).map(([k, l]) => (s[k] != null ? `<div class="sub-score"><span>${l}</span>${bar((s[k] || 0) / 100)}<b>${s[k]}</b></div>` : '')).join('')}</div>
        </div>
        <h4>✏️ 添削</h4>
        <div class="text-diff">${textDiffHTML(text, d.corrected || text)}</div>
        <div class="ex-row mt-8">${sayBtn(d.corrected || text, { size: 16 })}<div class="en">${esc(d.corrected || text)}</div></div>
        ${d.mistakes?.length ? `<h4>🔍 ポイント</h4>${d.mistakes.map((m) => `<div class="mistake"><span class="m-wrong">${esc(m.wrong)}</span> → <span class="m-right">${esc(m.right)}</span><div class="small muted">${esc(m.why_ja)}</div></div>`).join('')}` : '<p class="good-pt">👏 大きなミスはありません！</p>'}
        ${d.natural?.length ? `<h4>🌟 ネイティブならこう言う</h4>${d.natural.map((n) => `<div class="ex-row">${sayBtn(n.en, { size: 16 })}<div class="grow"><div class="en">${esc(n.en)}</div><div class="small muted">${esc(n.note_ja || '')}</div></div><button class="btn-icon sm soft add-word" data-en="${esc(n.en)}" data-ja="${esc(prompt.ja)}" title="単語帳に追加">${icon('plus', 16)}</button></div>`).join('')}` : ''}
        ${d.good_ja ? `<p class="good-pt">👍 ${esc(d.good_ja)}</p>` : ''}
        ${d.advice_ja ? `<div class="tip-box">${icon('target', 18)}<span>${esc(d.advice_ja)}</span></div>` : ''}
        ${checkHTML(checkEnglish(text), esc, { title: '無料チェック（和製英語・よくあるミス）' })}
        ${prompt.model ? `<details class="mt-12"><summary>模範解答（例）</summary><div class="ex-row">${sayBtn(prompt.model, { size: 16 })}<div class="en">${esc(prompt.model)}</div></div></details>` : ''}
      </div>`;
    }

    function renderHist() {
      const list = state.history.filter((x) => x.type === 'write').slice(0, 10);
      $('.write-hist', el).innerHTML = list.length ? `<div class="section-head mt-24"><h2>📜 添削履歴</h2></div><div class="card hist-list">${list.map((h, i) => `
        <div class="hist-row tap" data-hi="${i}"><span class="hist-score">${h.result?.total ?? '-'}</span><div class="grow"><b>${esc(h.prompt.ja.slice(0, 40))}${h.prompt.ja.length > 40 ? '…' : ''}</b><div class="small muted">${fmtDate(h.t)} · ${esc(h.text.slice(0, 50))}</div></div>${icon('chevR', 18)}</div>`).join('')}</div>` : '';
    }
  },
};
