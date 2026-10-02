// 発音トレーニング: 音読チェック / シャドーイング / 瞬間英作文
import { $, esc, emptyState, ring, countUp } from '../ui.js';
import { icon } from '../icons.js';
import { state } from '../store.js';
import { pool, scopeLabel } from '../content.js';
import { pickWeighted } from '../srs.js';
import { speak, stopSpeaking } from '../speech.js';
import { sfx } from '../sfx.js';
import { sessionBar, sayBtn, createMic, showResults, openItem } from '../components.js';
import { recordAnswer } from '../gamify.js';
import { scoreAgainst, diffHTML, scoreComment } from '../scoring.js';
import { go, handoff } from '../router.js';
import { aiReady, aiAudioProvider, judgeAnswer, assessPronunciation } from '../ai.js';
import { startRecording, blobToWavBase64, recorderSupported } from '../recorder.js';
import { sparkle } from '../fx.js';

const TITLES = { read: '音読チェック', shadow: 'シャドーイング', compose: '瞬間英作文' };
const DESC = {
  read: '英文を見ながら声に出して読みましょう',
  shadow: 'お手本を聞いて、すぐに真似して言いましょう',
  compose: '日本語を見て、英語で言ってみましょう',
};

export default {
  immersive: true,
  render(el, { params }) {
    const mode = params.mode || 'read';
    let items = handoff.take();
    if (!items?.length) {
      const kind = mode === 'compose' && !params.kind ? 'phrase' : params.kind || 'all';
      items = pickWeighted(pool({ scene: params.scene || 'all', kind }), +(params.count || 10));
    }
    if (!items.length) {
      el.innerHTML = `<div class="wrap narrow">${emptyState({ mood: 'think', title: '出題できる項目がありません', text: `「${scopeLabel(params.scene)}」に該当する項目が見つかりませんでした。`, actions: `<a class="btn btn-primary" href="#/study">学習メニューへ</a>` })}</div>`;
      return;
    }
    const pass = state.settings.passScore;
    let idx = 0, xpSum = 0, combo = 0;
    const log = [];
    const t0 = Date.now();
    let recording = null, myBlobUrl = null;
    el.innerHTML = `<div class="session speak-session"><div class="stage"></div></div>`;
    const bar = sessionBar($('.session', el), { title: TITLES[mode], onClose: () => finish(true) });
    const stage = $('.stage', el);

    function show() {
      if (idx >= items.length) return finish(false);
      const it = items[idx];
      bar.setProgress(idx, items.length);
      let attempts = 0, firstScore = null, hidden = mode === 'shadow';
      if (myBlobUrl) { URL.revokeObjectURL(myBlobUrl); myBlobUrl = null; }
      stage._blob = null;
      const canRec = recorderSupported && mode !== 'compose';
      const canAI = !!aiAudioProvider();
      stage.innerHTML = `
        <div class="speak-card pop-in ${mode}">
          <div class="qc-kicker">${DESC[mode]}</div>
          ${mode === 'compose'
            ? `<div class="sp-ja">${esc(it.ja)}</div><div class="sp-answer" hidden><div class="sp-en sm">${esc(it.en)}</div><div class="row center gap-8">${sayBtn(it.en, { size: 20 })}${sayBtn(it.en, { slow: true })}</div></div>`
            : `<div class="sp-en ${hidden ? 'blurred' : ''}">${esc(it.en)}</div>
               <div class="sp-ja small muted ${hidden ? 'blurred' : ''}">${esc(it.ja)}</div>
               <div class="row center gap-8 wrap">${sayBtn(it.en, { size: 20, cls: 'big', label: 'お手本' })}${sayBtn(it.en, { slow: true, cls: 'big', label: 'ゆっくり' })}${mode === 'shadow' ? `<button class="btn btn-sm btn-soft reveal">${icon('eye', 16)} テキスト表示</button>` : ''}</div>`}
          <div class="sp-result"></div>
        </div>
        <div class="sp-mic"></div>
        <div class="sp-tools">
          ${canRec ? `<button class="btn btn-soft btn-sm rec-btn">${icon('record', 14)} 録音して聞き比べ</button>` : ''}
          ${canRec && canAI ? `<button class="btn btn-ai btn-sm ai-pron" hidden>${icon('sparkles', 16)} AI発音診断</button>` : ''}
          <button class="btn btn-ghost btn-sm detail">${icon('info', 16)} 詳しく</button>
        </div>
        <div class="sp-ai"></div>
        <div class="sp-next"><button class="btn btn-ghost skip">スキップ</button><button class="btn btn-primary btn-xl next" disabled>次へ ${icon('chevR', 20)}</button></div>`;

      const mic = createMic($('.sp-mic', stage), {
        label: mode === 'compose' ? 'タップして英語で話す' : 'タップして読み上げる',
        onResult: ({ alts, typed }) => evaluate(alts, typed),
      });
      $('.reveal', stage)?.addEventListener('click', () => { $$blur(false); });
      $('.detail', stage).onclick = () => openItem(it);
      $('.skip', stage).onclick = () => { if (firstScore === null) log.push({ item: it, ok: false, note: 'スキップ' }); idx++; show(); };
      $('.next', stage).onclick = () => { idx++; show(); };
      const recBtn = $('.rec-btn', stage);
      if (recBtn) recBtn.onclick = () => toggleRecord(it, recBtn);
      $('.ai-pron', stage)?.addEventListener('click', () => aiPron(it));

      function $$blur(v) { stage.querySelectorAll('.blurred').forEach((x) => x.classList.toggle('blurred', v)); }
      if (mode === 'shadow' || (mode === 'read' && state.settings.autoPlay)) setTimeout(() => speak(it.en), 300);

      async function evaluate(alts, typed) {
        attempts++;
        const r = scoreAgainst(it.accepts || [it.en], alts);
        const cm = scoreComment(r.score, pass);
        const passed = r.score >= pass;
        if (mode === 'shadow') $$blur(false);
        if (mode === 'compose') $('.sp-answer', stage).hidden = false;
        $('.sp-result', stage).innerHTML = `
          <div class="score-big ${cm.cls}">
            ${ring(r.score / 100, { size: 92, stroke: 9, label: '<span class="cu">0</span>', sub: '点', grad: passed ? ['#2ed3a1', '#22d3ee'] : r.score >= pass - 20 ? ['#ffc24b', '#ff7a59'] : ['#ff5d73', '#ff7a59'] })}
            <div><div class="sb-label">${cm.emoji} ${cm.label}</div><div class="small muted">聞き取り: 「${esc(alts[0])}」${typed ? '（入力）' : ''}</div></div>
          </div>
          <div class="diff big">${diffHTML(r)}</div>
          ${mode === 'compose' && r.target !== it.en ? `<div class="small muted">別解「${esc(r.target)}」と比較しました</div>` : ''}
          ${!passed && mode === 'compose' ? `<div class="row center gap-8 wrap mt-8"><button class="btn btn-sm btn-soft self-ok">${icon('check', 16)} 意味は合っている（正解にする）</button>${aiReady('explain') ? `<button class="btn btn-sm btn-ai ai-judge">${icon('sparkles', 16)} AIに判定してもらう</button>` : ''}</div>` : ''}
          <div class="ai-judge-box"></div>`;
        countUp($('.cu', stage), r.score, 700);
        sfx.play(passed ? (r.score >= 95 ? 'combo' : 'correct') : 'soft', 6);
        if (passed) sparkle($('.score-big', stage));
        if (firstScore === null) {
          firstScore = r.score;
          commit(passed, r.score);
        }
        $('.next', stage).disabled = false;
        $('.ai-pron', stage)?.removeAttribute('hidden');
        $('.self-ok', stage)?.addEventListener('click', (e) => { upgrade(); e.target.closest('button').remove(); });
        $('.ai-judge', stage)?.addEventListener('click', async (e) => {
          const box = $('.ai-judge-box', stage);
          e.target.closest('button').disabled = true;
          box.innerHTML = `<div class="ai-loading"><span class="dots"><i></i><i></i><i></i></span> AIが判定中…</div>`;
          try {
            const { data } = await judgeAnswer({ ja: it.ja, expected: it.en, answer: alts[0] });
            box.innerHTML = `<div class="ai-verdict ${data.ok ? 'ok' : 'ng'}"><b>${data.ok ? '⭕ 通じます！' : '△ もう少し'}</b> <span class="muted">${data.score ?? ''}点</span><p>${esc(data.comment_ja || '')}</p>${data.better ? `<div class="ex-row">${sayBtn(data.better, { size: 16 })}<div class="en">${esc(data.better)}</div></div>` : ''}</div>`;
            if (data.ok) upgrade();
          } catch (err) { box.innerHTML = `<div class="ai-error">${esc(err.message)}</div>`; }
        });
        if (!passed && attempts === 1 && mode !== 'compose') mic.setLabel('もう一度チャレンジ！');
      }

      function commit(passed, score) {
        const xp = passed ? (score >= 95 ? 20 : 15) : 3;
        xpSum += xp;
        combo = passed ? combo + 1 : 0;
        bar.setCombo(combo);
        log.push({ item: it, ok: passed, note: `${score}点` });
        const g = passed ? (mode === 'compose' && score >= 95 ? 4 : 3) : score >= pass - 20 ? 2 : 1;
        recordAnswer(it, { ok: passed || g >= 2, grade: g, xp, anchor: $('.sp-result', stage), speak: true });
      }
      function upgrade() {
        const entry = log.find((l) => l.item === it);
        if (entry && !entry.ok) {
          entry.ok = true; entry.note = '判定OK';
          recordAnswer(it, { ok: true, grade: 3, xp: 10, speak: true });
          xpSum += 10;
          sfx.play('correct');
        }
      }
    }

    async function toggleRecord(it, btn) {
      if (recording) { recording.stop(); return; }
      stopSpeaking();
      try {
        recording = await startRecording({ autoStop: true, maxMs: 12000 });
        btn.classList.add('recording');
        btn.innerHTML = `${icon('stop', 14)} 録音停止`;
        const blob = await recording.done;
        recording = null;
        btn.classList.remove('recording');
        btn.innerHTML = `${icon('record', 14)} もう一度録音`;
        if (myBlobUrl) URL.revokeObjectURL(myBlobUrl);
        myBlobUrl = URL.createObjectURL(blob);
        stage.dataset.blob = '1';
        stage._blob = blob;
        const box = $('.sp-ai', stage);
        box.innerHTML = `<div class="compare card">
          <b>聞き比べ</b>
          <div class="row gap-8 wrap mt-8">
            <button class="btn btn-soft play-model">${icon('volume', 18)} お手本</button>
            <button class="btn btn-soft play-me">${icon('play', 16)} 自分の声</button>
            ${aiAudioProvider() ? `<button class="btn btn-ai ai-pron2">${icon('sparkles', 16)} AI発音診断</button>` : ''}
          </div></div>`;
        $('.play-model', box).onclick = () => speak(it.en);
        $('.play-me', box).onclick = () => { stopSpeaking(); new Audio(myBlobUrl).play(); };
        $('.ai-pron2', box)?.addEventListener('click', () => aiPron(it));
      } catch (e) {
        recording = null;
        btn.classList.remove('recording');
        $('.sp-ai', stage).innerHTML = `<div class="ai-error">録音できませんでした: ${esc(e.message || e)}</div>`;
      }
    }

    async function aiPron(it) {
      const box = $('.sp-ai', stage);
      let blob = stage._blob;
      if (!blob) {
        box.innerHTML = `<div class="notice">${icon('mic', 18)}<span>AI発音診断には録音が必要です。「録音して聞き比べ」で読み上げを録音してください。</span></div>`;
        return;
      }
      const prev = box.innerHTML;
      box.insertAdjacentHTML('beforeend', `<div class="ai-loading mt-8"><span class="dots"><i></i><i></i><i></i></span> AIが音声を分析中…</div>`);
      try {
        const { base64 } = await blobToWavBase64(blob);
        const d = await assessPronunciation({ base64, target: it.en });
        box.innerHTML = prev + `<div class="card ai-pron-result">
          <div class="score-big">${ring((d.score || 0) / 100, { size: 80, stroke: 8, label: d.score ?? '-', sub: 'AI', grad: ['#a855f7', '#ec4899'] })}<div><b>AI発音診断</b><div class="small muted">AIの聞き取り: 「${esc(d.transcript || '')}」</div></div></div>
          ${d.overall_ja ? `<p>${esc(d.overall_ja)}</p>` : ''}
          ${(d.issues || []).map((x) => `<div class="issue"><b>${esc(x.word)}</b><span>${esc(x.problem_ja)}</span><small>💡 ${esc(x.tip_ja)}</small></div>`).join('')}
          ${d.good_ja ? `<p class="small">👍 ${esc(d.good_ja)}</p>` : ''}
        </div>`;
        sfx.play('pop');
      } catch (e) {
        box.innerHTML = prev + `<div class="ai-error">${esc(e.message)}</div>`;
      }
    }

    function finish(early) {
      stopSpeaking();
      recording?.cancel?.();
      if (!log.length) return go('#/study');
      $('.sbar', el)?.remove();
      const correct = log.filter((l) => l.ok).length;
      const wrong = log.filter((l) => !l.ok).map((l) => l.item);
      showResults(stage, {
        title: early ? '練習を中断しました' : `${TITLES[mode]} 結果`, emoji: '🎤',
        correct, total: log.length, xp: xpSum, timeSec: (Date.now() - t0) / 1000, items: log, scoreLabel: '合格率',
        actions: [
          { label: `${icon('home', 18)} ホーム`, onClick: () => go('#/home') },
          ...(wrong.length ? [{ label: `${icon('repeat', 18)} 不合格${wrong.length}問を再挑戦`, cls: 'btn-primary', onClick: () => { handoff.items = wrong; go(`#/speak?mode=${mode}&retry=${Date.now()}`); } }] : []),
          { label: `${icon('refresh', 18)} 別の問題`, cls: 'btn-soft', onClick: () => go(`#/speak?mode=${mode}&scene=${params.scene || 'all'}&kind=${params.kind || 'all'}&count=${params.count || 10}&r=${Date.now()}`) },
        ],
      });
    }

    show();
    return () => { recording?.cancel?.(); if (myBlobUrl) URL.revokeObjectURL(myBlobUrl); };
  },
};
