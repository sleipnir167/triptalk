// AI会話（ミッション型ロールプレイ）
import { $, $$, esc, modal, toast, fmtDate, ring, bar, confirmDialog } from '../ui.js';
import { icon } from '../icons.js';
import { mascot } from '../mascot.js';
import { state, save } from '../store.js';
import { sceneById } from '../content.js';
import { speak, stopSpeaking } from '../speech.js';
import { sfx } from '../sfx.js';
import { sessionBar, sayBtn, createMic, addToMyWords } from '../components.js';
import { addXP, bump, addStudyTime, flushCelebrations, dayBump } from '../gamify.js';
import { go } from '../router.js';
import { AI_SCENARIOS } from '../data/dialogues.js';
import { aiReady, chatTurn, chatStart, chatReport, aiWaitHint } from '../ai.js';
import { checkEnglish } from '../wcheck.js';
import { confetti } from '../fx.js';

const LEVELS = [['easy', 'やさしい', 'ゆっくり・簡単な単語'], ['normal', 'ふつう', '日常会話レベル'], ['hard', 'むずかしい', 'ネイティブ速度＋ハプニング']];
const MAX_TURNS = 12;

export function reportHTML(r, sc) {
  const s = r.scores || {};
  const labels = { grammar: '文法', vocabulary: '語彙', fluency: '流暢さ', politeness: '丁寧さ', task: 'ミッション' };
  return `
    <div class="report">
      <div class="report-hero">
        ${ring((r.overall || 0) / 100, { size: 150, stroke: 12, label: r.overall ?? '-', sub: '総合スコア', grad: ['#6366f1', '#ec4899'] })}
        <div class="report-side">
          <div class="mission-result ${r.mission_achieved ? 'ok' : 'ng'}">${r.mission_achieved ? '🎖️ ミッション達成！' : '🧭 ミッション未達成'}</div>
          ${Object.entries(labels).map(([k, l]) => s[k] != null ? `<div class="sub-score"><span>${l}</span>${bar((s[k] || 0) / 100)}<b>${s[k]}</b></div>` : '').join('')}
        </div>
      </div>
      ${r.summary_ja ? `<div class="card"><h4>📝 総評</h4><p>${esc(r.summary_ja)}</p>${r.good_ja ? `<p class="good-pt">👍 ${esc(r.good_ja)}</p>` : ''}</div>` : ''}
      ${r.corrections?.length ? `<div class="card"><h4>✏️ もっと自然な言い方</h4>${r.corrections.map((c) => `
        <div class="corr">
          <div class="corr-you">${esc(c.you)}</div>
          <div class="corr-better">${sayBtn(c.better, { size: 16 })}<span>${esc(c.better)}</span><button class="btn-icon sm soft add-word" data-en="${esc(c.better)}" data-ja="${esc(c.why_ja || '')}" title="単語帳に追加">${icon('plus', 16)}</button></div>
          <div class="small muted">${esc(c.why_ja || '')}</div>
        </div>`).join('')}</div>` : ''}
      ${r.phrases?.length ? `<div class="card"><h4>💬 このシーンで使えるフレーズ</h4>${r.phrases.map((p) => `
        <div class="ex-row">${sayBtn(p.en, { size: 16 })}<div class="grow"><div class="en">${esc(p.en)}</div><div class="small muted">${esc(p.ja)}</div></div><button class="btn-icon sm soft add-word" data-en="${esc(p.en)}" data-ja="${esc(p.ja)}" title="単語帳に追加">${icon('plus', 16)}</button></div>`).join('')}</div>` : ''}
      ${r.next_ja ? `<div class="tip-box">${icon('target', 18)}<span><b>次の目標:</b> ${esc(r.next_ja)}</span></div>` : ''}
    </div>`;
}

export function bindAddWords(root) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('.add-word');
    if (!b) return;
    if (addToMyWords({ en: b.dataset.en, ja: b.dataset.ja })) { b.innerHTML = icon('check', 16); b.disabled = true; }
  });
}

function picker(el) {
  const ready = aiReady('chat');
  const hist = state.history.filter((h) => h.type === 'chat').slice(0, 8);
  let level = state.settings.chatLevel || 'normal';
  el.innerHTML = `
    <div class="wrap">
      <header class="page-head with-back"><a class="btn-icon soft" href="#/study" aria-label="戻る">${icon('chevL')}</a><div><h1>AI会話</h1><p class="muted">AIが現地スタッフになりきります。ミッションを達成しよう！</p></div></header>
      ${!ready ? `<div class="notice warn">${icon('alert', 18)}<span>会話に使えるAIがオフになっています。<a href="#/settings?sec=ai">設定 &gt; AI</a> で内蔵AI（無料）をオンにするか、OpenRouter・自前サーバー等を追加してください。AIなしで練習するなら <a href="#/roleplay">台本ロールプレイ</a> がおすすめ。</span></div>` : ''}
      <div class="level-pick"><span class="muted small">相手の話し方</span><div class="seg">${LEVELS.map(([v, l, d]) => `<button class="${v === level ? 'active' : ''}" data-lv="${v}" title="${d}">${l}</button>`).join('')}</div></div>
      <div class="rp-grid">
        ${AI_SCENARIOS.map((s) => {
          const sc = sceneById(s.scene);
          return `<button class="rp-card ai tap" data-id="${s.id}" style="--g1:${sc.grad[0]};--g2:${sc.grad[1]}">
            <span class="rp-emoji">${s.emoji}</span>
            <span class="rp-body"><b>${esc(s.title)}</b><small>🎯 ${esc(s.mission)}</small></span>
          </button>`;
        }).join('')}
        <button class="rp-card ai custom tap" data-id="custom" style="--g1:#64748b;--g2:#a855f7">
          <span class="rp-emoji">✨</span>
          <span class="rp-body"><b>自由に設定</b><small>練習したい場面を日本語で入力すると、AIがその役を演じます</small></span>
        </button>
      </div>
      ${hist.length ? `<div class="section-head mt-24"><h2>📜 これまでのレポート</h2></div><div class="card hist-list">${hist.map((h, i) => `
        <div class="hist-row tap" data-h="${i}"><span class="hist-score">${h.report?.overall ?? '-'}</span><div class="grow"><b>${esc(h.title)}</b><div class="small muted">${fmtDate(h.t)} · ${h.turns}ターン ${h.report?.mission_achieved ? '· 🎖️達成' : ''}</div></div>${icon('chevR', 18)}</div>`).join('')}</div>` : ''}
    </div>`;
  el.onclick = async (e) => {
    const lv = e.target.closest('[data-lv]');
    if (lv) { level = lv.dataset.lv; state.settings.chatLevel = level; save('settings'); $$('[data-lv]', el).forEach((x) => x.classList.toggle('active', x === lv)); return; }
    const card = e.target.closest('[data-id]');
    if (card) {
      if (!aiReady('chat')) { toast('先に設定でAIプロバイダを追加してください', { type: 'error' }); return; }
      if (card.dataset.id === 'custom') {
        const v = await modal({
          title: '✨ 練習したい場面',
          body: `<label class="field"><span>場面（日本語でOK）</span><textarea class="input" rows="3" placeholder="例: ホテルで隣の部屋がうるさいので苦情を言う"></textarea></label>
                 <label class="field"><span>AIの役</span><input class="input role" placeholder="例: ホテルのフロント係"></label>`,
          actions: [{ label: 'キャンセル', value: null }, { label: 'はじめる', cls: 'btn-primary', onClick: (close, m) => {
            const sit = $('textarea', m).value.trim();
            if (!sit) return false;
            close({ sit, role: $('.role', m).value.trim() });
          } }],
        });
        if (!v) return;
        sessionStorage.setItem('tt-custom-sc', JSON.stringify(v));
        go(`#/aichat/custom?lv=${level}`);
      } else go(`#/aichat/${card.dataset.id}?lv=${level}`);
    }
    const hr = e.target.closest('[data-h]');
    if (hr) {
      const h = hist[+hr.dataset.h];
      const sc = AI_SCENARIOS.find((s) => s.id === h.sid) || { title: h.title };
      modal({ title: `${esc(h.title)} のレポート`, cls: 'sheet-lg', body: reportHTML(h.report, sc) + `<details class="mt-12"><summary>会話ログ</summary><pre class="log">${esc(h.transcript)}</pre></details>`, onMount: (m) => bindAddWords(m) });
    }
  };
}

export default {
  nav: 'study',
  render(el, { arg, params }) {
    if (!arg) { picker(el); return; }
    let sc;
    if (arg === 'custom') {
      let c = {};
      try { c = JSON.parse(sessionStorage.getItem('tt-custom-sc') || '{}'); } catch {}
      if (!c.sit) return go('#/aichat');
      sc = { id: 'custom', scene: 'basics', emoji: '✨', title: c.sit.slice(0, 24), role: c.role || 'a local person appropriate for the situation', mission: c.sit, missionEn: `Situation described by the learner (in Japanese): ${c.sit}. Help the learner accomplish it.`, opener: '' };
    } else sc = AI_SCENARIOS.find((s) => s.id === arg);
    if (!sc) return go('#/aichat');
    if (!aiReady('chat')) return go('#/aichat');
    el.closest('#app').classList.add('immersive');
    const level = params.lv || state.settings.chatLevel || 'normal';
    const scene = sceneById(sc.scene);
    const history = []; // {role, content}
    const transcript = [];
    let turns = 0, missionDone = false, busy = false, ended = false, ctl = null;
    const t0 = Date.now();

    el.innerHTML = `
      <div class="session aichat-session" style="--g1:${scene.grad[0]};--g2:${scene.grad[1]}">
        <div class="mission-banner"><span class="mb-icon">${sc.emoji}</span><div class="grow"><small>MISSION · ${LEVELS.find((l) => l[0] === level)[1]}</small><b>${esc(sc.mission)}</b></div><span class="mb-state">挑戦中</span></div>
        <div class="chat ai-chat"></div>
        <div class="hints"></div>
        <div class="composer">
          <div class="composer-row">
            <textarea class="input comp-input" rows="1" placeholder="英語で返事をしよう（マイクでもOK）" autocapitalize="sentences" autocomplete="off" spellcheck="false" enterkeyhint="send"></textarea>
            <button class="btn-icon primary send-btn" aria-label="送信">${icon('send', 20)}</button>
          </div>
          <div class="comp-mic"></div>
        </div>
      </div>`;
    const bar2 = sessionBar($('.session', el), { title: sc.title, onClose: () => endChat(true) });
    bar2.setCount(`0 / ${MAX_TURNS}`);
    bar2.el.querySelector('.sbar-right').insertAdjacentHTML('beforeend', `<button class="btn btn-sm btn-soft end-btn">終了して採点</button>`);
    $('.end-btn', bar2.el).onclick = () => endChat(false);
    const chat = $('.ai-chat', el);
    const input = $('.comp-input', el);
    const hintsEl = $('.hints', el);
    const scrollDown = () => chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });

    // JSON で返ってこなかったとき（小さなモデル等）は文章をそのまま相手のセリフとして使う
    function fromText(t) {
      const reply = String(t || '').replace(/^\s*(reply|staff|assistant)\s*[:：]\s*/i, '').replace(/^["“]|["”]$/g, '').trim().slice(0, 400);
      return { reply: reply || '...', reply_ja: '', feedback: null, hints: [], mission_done: false };
    }
    function aiBubble(d) {
      const b = document.createElement('div');
      b.className = 'bubble ai pop-in';
      b.innerHTML = `<span class="avatar">${sc.emoji}</span><div class="b-body"><div class="b-en">${esc(d.reply)}</div>${d.reply_ja ? `<div class="b-ja">${esc(d.reply_ja)}</div>` : ''}<div class="b-tools">${sayBtn(d.reply, { size: 16, gender: sc.g })}${sayBtn(d.reply, { slow: true, gender: sc.g })}${d.reply_ja ? '<button class="b-tr small">訳</button>' : ''}</div></div>`;
      $('.b-tr', b)?.addEventListener('click', () => b.classList.toggle('show-ja'));
      chat.append(b); scrollDown();
      sfx.play('message');
      speak(d.reply, { gender: sc.g });
    }
    function meBubble(text) {
      const b = document.createElement('div');
      b.className = 'bubble me pop-in';
      // 端末内の無料チェック（和製英語・よくあるミス）は AI の返事を待たずにすぐ出す
      const local = checkEnglish(text).issues.slice(0, 2);
      b.innerHTML = `<div class="b-body"><div class="b-en">${esc(text)}</div>${local.length ? `<div class="b-local">${local.map((x) => `<span>🔎 ${esc(x.text)} → ${esc(x.msg)}</span>`).join('')}</div>` : ''}<div class="b-fb"></div></div>`;
      chat.append(b); scrollDown();
      return b;
    }
    function typing(on) {
      $('.typing', chat)?.remove();
      if (on) { chat.insertAdjacentHTML('beforeend', `<div class="bubble ai typing"><span class="avatar">${sc.emoji}</span><div class="b-body"><span class="dots"><i></i><i></i><i></i></span>${aiWaitHint('chat') ? `<small class="muted">${aiWaitHint('chat')}</small>` : ''}</div></div>`); scrollDown(); }
    }
    function showHints(hints) {
      hintsEl.innerHTML = (hints || []).slice(0, 3).map((h) => `<button class="hint-chip" data-en="${esc(h.en)}" title="${esc(h.ja)}">💡 ${esc(h.ja || h.en)}</button>`).join('');
    }
    hintsEl.onclick = (e) => {
      const c = e.target.closest('.hint-chip');
      if (!c) return;
      if (c.classList.contains('open')) { input.value = c.dataset.en; input.focus(); autoGrow(); return; }
      c.classList.add('open');
      c.innerHTML = `${esc(c.dataset.en)} <small>タップで入力欄へ</small>`;
      speak(c.dataset.en);
    };

    const autoGrow = () => { input.style.height = 'auto'; input.style.height = Math.min(140, input.scrollHeight) + 'px'; };
    input.addEventListener('input', autoGrow);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
    $('.send-btn', el).onclick = () => send();
    const mic = createMic($('.comp-mic', el), {
      size: 'sm', label: 'タップして話す', allowType: false,
      onResult: ({ alts }) => {
        input.value = alts[0]; autoGrow();
        if (state.settings.chatAutoSend) send();
      },
    });

    async function send() {
      const text = input.value.trim();
      if (!text || busy || ended) return;
      busy = true; mic.setDisabled(true);
      input.value = ''; autoGrow();
      hintsEl.innerHTML = '';
      stopSpeaking();
      const meB = meBubble(text);
      history.push({ role: 'user', content: text });
      transcript.push(`Learner: ${text}`);
      turns++;
      bar2.setCount(`${turns} / ${MAX_TURNS}`);
      bar2.setProgress(turns - 1, MAX_TURNS);
      typing(true);
      ctl = new AbortController();
      try {
        const r = await chatTurn({ sc, level, history, signal: ctl.signal });
        const data = r.data || fromText(r.text);
        typing(false);
        const fb = data.feedback;
        if (fb && (fb.corrected || fb.tip_ja)) {
          const same = fb.corrected && fb.corrected.trim().toLowerCase().replace(/[^a-z ]/g, '') === text.toLowerCase().replace(/[^a-z ]/g, '');
          $('.b-fb', meB).innerHTML = fb.ok && (same || !fb.corrected)
            ? `<span class="fb-ok">✓ Good!</span>${fb.tip_ja ? ` <small>${esc(fb.tip_ja)}</small>` : ''}`
            : `<span class="fb-fix">✎ ${esc(fb.corrected || '')}</span>${fb.corrected ? sayBtn(fb.corrected, { size: 14 }) : ''}${fb.tip_ja ? `<small>${esc(fb.tip_ja)}</small>` : ''}`;
          if (fb.ok) addXP(5, meB); else addXP(2);
        }
        history.push({ role: 'assistant', content: data.reply });
        transcript.push(`Staff: ${data.reply}`);
        aiBubble(data);
        showHints(data.hints);
        if (data.mission_done && !missionDone) {
          missionDone = true;
          $('.mb-state', el).textContent = '達成！';
          $('.mission-banner', el).classList.add('done');
          sfx.play('levelup');
          confetti({ count: 120 });
          toast('ミッション達成！「終了して採点」でレポートを見よう', { emoji: '🎖️', type: 'success', ms: 4000 });
        }
        if (turns >= MAX_TURNS) {
          toast('ターン上限に達しました。レポートを作成します', { emoji: '🏁' });
          setTimeout(() => endChat(false), 2500);
        }
      } catch (e) {
        typing(false);
        history.pop(); transcript.pop(); turns--;
        bar2.setCount(`${turns} / ${MAX_TURNS}`);
        meB.classList.add('failed');
        $('.b-fb', meB).innerHTML = `<span class="fb-err">送信失敗: ${esc(e.message.split('\n')[0])}</span> <button class="btn btn-sm btn-soft retry">再送</button>`;
        $('.retry', meB).onclick = () => { meB.remove(); input.value = text; send(); };
      } finally {
        busy = false; mic.setDisabled(false);
      }
    }

    async function start() {
      if (sc.opener) {
        const d = { reply: sc.opener, reply_ja: '' };
        history.push({ role: 'assistant', content: sc.opener });
        transcript.push(`Staff: ${sc.opener}`);
        aiBubble(d);
      } else {
        typing(true);
        try {
          const r = await chatStart({ sc, level });
          const data = r.data || fromText(r.text);
          typing(false);
          history.push({ role: 'assistant', content: data.reply });
          transcript.push(`Staff: ${data.reply}`);
          aiBubble(data);
          showHints(data.hints);
        } catch (e) {
          typing(false);
          chat.insertAdjacentHTML('beforeend', `<div class="ai-error">${esc(e.message)}</div>`);
        }
      }
    }

    async function endChat(early) {
      if (ended) return;
      const userTurns = transcript.filter((l) => l.startsWith('Learner')).length;
      if (early && userTurns === 0) { ended = true; ctl?.abort(); stopSpeaking(); return go('#/aichat'); }
      if (early && !(await confirmDialog('会話を終了してAIの採点レポートを作成しますか？', { ok: '採点する', cancel: '続ける' }))) return;
      if (userTurns === 0) { toast('まだ会話していません'); return; }
      ended = true;
      ctl?.abort();
      stopSpeaking();
      $('.sbar', el)?.remove();
      const host = $('.session', el);
      host.innerHTML = `<div class="report-loading"><div class="lumi-loader">${mascot('think')}</div><p>ルミが魔法でレポートを作成中…${aiWaitHint('explain')}</p></div>`;
      addStudyTime((Date.now() - t0) / 1000);
      bump('aiChats');
      dayBump('chat');
      if (missionDone) bump('missions');
      try {
        const { data } = await chatReport({ sc, transcript: transcript.join('\n') });
        const xp = 30 + (data.mission_achieved || missionDone ? 30 : 0);
        addXP(xp);
        state.history.unshift({ type: 'chat', sid: sc.id, title: sc.title, t: Date.now(), turns: userTurns, report: data, transcript: transcript.join('\n') });
        state.history = state.history.slice(0, 60);
        save('history');
        host.innerHTML = `<div class="wrap narrow results">
          <div class="report-top"><a class="btn-icon soft" href="#/aichat" aria-label="閉じる">${icon('x', 20)}</a></div>
          <div class="results-hero"><div class="results-emoji">${sc.emoji}</div><h2>${esc(sc.title)} レポート</h2><p class="muted">+${xp} XP 獲得</p></div>
          ${reportHTML(data, sc)}
          <div class="results-actions">
            <button class="btn btn-soft btn-lg again">${icon('refresh', 18)} もう一度</button>
            <button class="btn btn-primary btn-lg other">${icon('list', 18)} 他のシナリオ</button>
          </div>
          <details class="card"><summary>会話ログ</summary><pre class="log">${esc(transcript.join('\n'))}</pre></details>
        </div>`;
        bindAddWords(host);
        $('.again', host).onclick = () => go(`#/aichat/${sc.id}?lv=${level}&r=${Date.now()}`);
        $('.other', host).onclick = () => go('#/aichat');
        sfx.play('finish');
        if ((data.overall || 0) >= 80) confetti();
        setTimeout(flushCelebrations, 1200);
      } catch (e) {
        host.innerHTML = `<div class="wrap narrow"><div class="ai-error">${esc(e.message)}</div><pre class="log">${esc(transcript.join('\n'))}</pre><a class="btn btn-primary mt-12" href="#/aichat">戻る</a></div>`;
      }
    }

    // iOSで最初の読み上げにはタップが必要なので「はじめる」ボタンを挟む
    chat.innerHTML = `<div class="rp-start pop-in"><div class="start-emoji">${sc.emoji}</div><p><b>${esc(sc.title)}</b><br>AIが「${esc(sc.role)}」として話しかけてきます。<br>ヒントボタンや「訳」も活用しよう。</p><button class="btn btn-primary btn-xl go">${icon('play', 18)} 会話をはじめる</button></div>`;
    $('.go', chat).onclick = () => { chat.innerHTML = ''; sfx.play('start'); start(); };

    return () => { ended = true; ctl?.abort(); stopSpeaking(); };
  },
};
