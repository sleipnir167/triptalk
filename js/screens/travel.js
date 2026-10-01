// 旅行モード: 現地ですぐ使えるフレーズ集・提示モード・AI通訳・マイカード
import { $, $$, esc, h, modal, toast, confirmDialog, richText } from '../ui.js';
import { icon } from '../icons.js';
import { state, save } from '../store.js';
import { allItems, scenes, sceneById } from '../content.js';
import { speak, stopSpeaking, listen, sttEngine } from '../speech.js';
import { sfx } from '../sfx.js';
import { sayBtn, createMic, openPhraseGenerator } from '../components.js';
import { aiReady, translate, aiWaitHint } from '../ai.js';
import { go } from '../router.js';

const EMERGENCY = [
  ['Help!', '助けて！'],
  ['Please call the police!', '警察を呼んでください！'],
  ['Please call an ambulance!', '救急車を呼んでください！'],
  ['I need to see a doctor.', '医者に診てもらう必要があります。'],
  ['My wallet was stolen.', '財布を盗まれました。'],
  ['I lost my passport.', 'パスポートをなくしました。'],
  ['Could you contact the Japanese embassy?', '日本大使館に連絡していただけますか？'],
  ['I don\'t speak English well. Please speak slowly.', '英語があまり話せません。ゆっくり話してください。'],
];

export function showMode(en, ja = '') {
  stopSpeaking();
  const len = en.length;
  const size = len < 20 ? 'xl' : len < 45 ? 'lg' : len < 90 ? 'md' : 'sm';
  const el = h(`<div class="showmode" role="dialog" aria-label="提示モード">
    <div class="sm-top">
      <button class="btn-icon glass rot" aria-label="上下反転">${icon('rotate', 22)}</button>
      <span class="sm-label">相手に画面を見せてください</span>
      <button class="btn-icon glass close" aria-label="閉じる">${icon('x', 24)}</button>
    </div>
    <div class="sm-content">
      <div class="sm-en ${size}">${esc(en)}</div>
      ${ja ? `<div class="sm-ja">${esc(ja)}</div>` : ''}
    </div>
    <div class="sm-bottom">
      <button class="btn btn-glass btn-lg play">${icon('volume', 22)} 読み上げ</button>
      <button class="btn btn-glass btn-lg slow">🐢 ゆっくり</button>
    </div>
  </div>`);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  const close = () => { stopSpeaking(); el.classList.remove('show'); setTimeout(() => el.remove(), 250); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  $('.close', el).onclick = close;
  $('.rot', el).onclick = () => el.classList.toggle('flipped');
  $('.play', el).onclick = () => speak(en);
  $('.slow', el).onclick = () => speak(en, { slow: true });
  $('.sm-content', el).onclick = () => speak(en);
  speak(en);
}

export default {
  nav: 'travel',
  render(el, { params = {} } = {}) {
    let scene = 'fav';
    let q = '';
    const hasFav = () => Object.keys(state.favs).length > 0;
    if (!hasFav()) scene = 'basics';
    if (params.scene && scenes().some((x) => x.id === params.scene)) scene = params.scene;
    const ai = aiReady('chat');

    el.innerHTML = `
      <div class="wrap travel">
        <header class="page-head">
          <h1>✈️ 旅行モード</h1>
          <p class="muted">現地でそのまま使えるフレーズ集。タップで読み上げ、「見せる」で大きく表示します</p>
        </header>

        <div class="tool-grid">
          <div class="card tool-card t-say">
            <div class="tc-head">${icon('translate', 22)}<div><b>言いたいことを英語に</b><small>日本語で話す・入力 → 英語に${ai ? '' : '（AI設定が必要）'}</small></div></div>
            <div class="tc-input"><textarea class="input ja-in" rows="2" placeholder="例: 部屋に鍵を置いたまま出てしまいました"></textarea>
              <div class="row gap-8"><button class="btn-icon soft ja-mic" aria-label="日本語で話す">${icon('mic', 20)}</button><button class="btn btn-primary tr-go" ${ai ? '' : 'disabled'}>${icon('sparkles', 16)} 英訳</button></div></div>
            <div class="tc-out"></div>
          </div>
          <div class="card tool-card t-hear">
            <div class="tc-head">${icon('ear', 22)}<div><b>相手の英語を聞き取る</b><small>相手に話してもらい、文字起こし${ai ? '＋日本語訳' : ''}</small></div></div>
            <div class="hear-mic"></div>
            <div class="tc-out hear-out"></div>
          </div>
        </div>

        <section class="emergency">
          <div class="section-head"><h2>🆘 緊急フレーズ</h2><span class="small muted">米・加 911 / 英 999 / EU 112 / 豪 000</span></div>
          <div class="em-grid">${EMERGENCY.map(([en, ja], i) => `<button class="em-btn" data-em="${i}"><b>${esc(en)}</b><small>${esc(ja)}</small></button>`).join('')}</div>
        </section>

        <section>
          <div class="section-head"><h2>🪪 マイカード</h2><button class="btn btn-sm btn-soft add-memo">${icon('plus', 16)} 追加</button></div>
          <p class="small muted">ホテルの住所・アレルギー・予約番号などを登録して、タクシーやお店で見せられます。</p>
          <div class="memo-grid"></div>
        </section>

        <section>
          <div class="section-head"><h2>📖 フレーズ集</h2><button class="btn btn-sm btn-ai gen">${icon('sparkles', 16)} 自分の旅用にAIで作る</button></div>
          <label class="search">${icon('search', 18)}<input class="input tq" placeholder="フレーズを検索（日本語・英語）" autocapitalize="off" autocomplete="off"></label>
          <div class="chips scroll-x tr-scenes">
            <button class="chip ${scene === 'fav' ? 'active' : ''}" data-s="fav">⭐ お気に入り</button>
            ${scenes().map((s) => `<button class="chip ${scene === s.id ? 'active' : ''}" data-s="${s.id}">${s.emoji} ${esc(s.name)}</button>`).join('')}
          </div>
          <div class="phrase-list"></div>
        </section>
      </div>`;

    function drawMemos() {
      const g = $('.memo-grid', el);
      g.innerHTML = state.memos.length ? state.memos.map((m, i) => `
        <div class="memo-card">
          <b>${esc(m.title)}</b><p>${esc(m.text)}</p>
          <div class="row gap-8"><button class="btn btn-sm btn-primary show-memo" data-i="${i}">${icon('maximize', 16)} 見せる</button><button class="btn-icon sm soft edit-memo" data-i="${i}" aria-label="編集">${icon('edit', 16)}</button></div>
        </div>`).join('') : `<div class="memo-empty small muted">例:「ホテル住所」「Allergy: peanuts」「予約番号」など</div>`;
    }
    drawMemos();

    function drawPhrases() {
      let list = allItems();
      const qq = q.toLowerCase();
      if (qq) list = list.filter((it) => it.en.toLowerCase().includes(qq) || it.ja.includes(q));
      else if (scene === 'fav') list = list.filter((it) => state.favs[it.id]);
      else list = list.filter((it) => it.scene === scene && (it.kind === 'phrase' || scene === 'custom'));
      $('.phrase-list', el).innerHTML = list.length ? list.slice(0, 150).map((it) => `
        <div class="phrase-card" data-id="${it.id}">
          <div class="pc-main tap" data-play="${it.id}"><div class="pc-en">${esc(it.en)}</div><div class="pc-ja">${esc(it.ja)}</div>${it.note ? `<div class="pc-note">${esc(it.note)}</div>` : ''}</div>
          <div class="pc-acts">
            <button class="btn-icon soft show-btn" data-show="${it.id}" aria-label="見せる">${icon('maximize', 18)}</button>
            ${sayBtn(it.en, { slow: true })}
            <button class="star-btn ${state.favs[it.id] ? 'on' : ''}" data-fav="${it.id}" aria-label="お気に入り">${icon('star', 18)}</button>
          </div>
        </div>`).join('') : `<div class="empty small"><div class="empty-emoji">⭐</div><p class="muted">${scene === 'fav' && !q ? 'フレーズの★をタップすると、ここにお気に入りが集まります' : '該当なし'}</p></div>`;
    }
    drawPhrases();

    // ---- AI通訳: 日本語 → 英語 ----
    const jaIn = $('.ja-in', el);
    async function doTranslate() {
      const text = jaIn.value.trim();
      if (!text) return;
      const out = $('.t-say .tc-out', el);
      out.innerHTML = `<div class="ai-loading"><span class="dots"><i></i><i></i><i></i></span> 翻訳中…${aiWaitHint('chat')}</div>`;
      try {
        const r = await translate({ text, dir: 'ja2en' });
        if (!r.data) { out.innerHTML = `<div class="tr-result">${richText(r.text)}</div>`; return; }
        const data = r.data;
        out.innerHTML = `
          <div class="tr-result">
            <div class="tr-en">${esc(data.en)}</div>
            <div class="row gap-8 wrap">${sayBtn(data.en, { label: '再生' })}${sayBtn(data.en, { slow: true })}<button class="btn btn-sm btn-primary show-tr">${icon('maximize', 16)} 見せる</button></div>
            ${data.casual ? `<div class="tr-alt"><small>カジュアル</small> ${esc(data.casual)} ${sayBtn(data.casual, { size: 16 })}</div>` : ''}
            ${data.note_ja ? `<div class="small muted">💡 ${esc(data.note_ja)}</div>` : ''}
          </div>`;
        $('.show-tr', out).onclick = () => showMode(data.en, text);
        speak(data.en);
      } catch (e) { out.innerHTML = `<div class="ai-error">${esc(e.message)}</div>`; }
    }
    $('.tr-go', el).onclick = doTranslate;
    let jaSession = null;
    $('.ja-mic', el).onclick = async () => {
      const b = $('.ja-mic', el);
      if (jaSession) { jaSession.stop(); return; }
      if (sttEngine() !== 'browser') { jaIn.focus(); toast('キーボードの🎤ボタンで日本語の音声入力ができます'); return; }
      b.classList.add('listening'); sfx.play('micOn');
      jaSession = listen({ lang: 'ja-JP', engine: 'browser', onInterim: (t) => (jaIn.value = t) });
      const r = await jaSession.promise;
      jaSession = null; b.classList.remove('listening'); sfx.play('micOff');
      if (r.alts[0]) { jaIn.value = r.alts[0]; if (ai) doTranslate(); }
      else if (r.error) toast(r.error, { type: 'error' });
    };

    // ---- 聞き取り: 英語 → 文字起こし（＋日本語訳） ----
    createMic($('.hear-mic', el), {
      size: 'sm', label: '相手が話している間タップ', typePlaceholder: '聞こえた英語を入力',
      onResult: async ({ alts }) => {
        const text = alts[0];
        const out = $('.hear-out', el);
        out.innerHTML = `<div class="tr-result"><div class="tr-en">${esc(text)}</div><div class="row gap-8">${sayBtn(text, { label: 'もう一度聞く' })}${sayBtn(text, { slow: true })}</div><div class="tr-ja"></div></div>`;
        if (!ai) return;
        const jaBox = $('.tr-ja', out);
        jaBox.innerHTML = `<div class="ai-loading"><span class="dots"><i></i><i></i><i></i></span> 翻訳中…</div>`;
        try {
          const r = await translate({ text, dir: 'en2ja' });
          if (!r.data) { jaBox.innerHTML = richText(r.text); return; }
          const data = r.data;
          jaBox.innerHTML = `<p class="tr-jatext">${esc(data.ja)}</p>
            ${data.reply_en ? `<div class="tr-alt"><small>返事の例</small> ${esc(data.reply_en)} ${sayBtn(data.reply_en, { size: 16 })}<div class="small muted">${esc(data.reply_ja || '')}</div></div>` : ''}
            ${data.note_ja ? `<div class="small muted">💡 ${esc(data.note_ja)}</div>` : ''}`;
        } catch (e) { jaBox.innerHTML = `<div class="ai-error">${esc(e.message)}</div>`; }
      },
    });

    async function editMemo(i) {
      const m = i != null ? state.memos[i] : { title: '', text: '' };
      const r = await modal({
        title: i != null ? 'マイカードを編集' : 'マイカードを追加',
        body: `<label class="field"><span>タイトル</span><input class="input m-t" value="${esc(m.title)}" placeholder="例: ホテルの住所"></label>
               <label class="field"><span>見せる内容（英語推奨）</span><textarea class="input m-x" rows="4" placeholder="例: Hotel Sunshine, 123 Main St, Honolulu">${esc(m.text)}</textarea></label>`,
        actions: [
          ...(i != null ? [{ label: '削除', cls: 'btn-danger-soft', value: 'del' }] : []),
          { label: 'キャンセル', value: null },
          { label: '保存', cls: 'btn-primary', onClick: (close, mm) => close({ title: $('.m-t', mm).value.trim() || 'メモ', text: $('.m-x', mm).value.trim() }) },
        ],
      });
      if (r === 'del') { if (await confirmDialog('このカードを削除しますか？', { danger: true, ok: '削除' })) { state.memos.splice(i, 1); save('memos'); drawMemos(); } return; }
      if (!r || !r.text) return;
      if (i != null) state.memos[i] = r; else state.memos.push(r);
      save('memos'); drawMemos();
    }

    let tmr;
    $('.tq', el).addEventListener('input', (e) => { clearTimeout(tmr); tmr = setTimeout(() => { q = e.target.value.trim(); drawPhrases(); }, 150); });
    el.addEventListener('click', (e) => {
      const t = e.target;
      const s = t.closest('[data-s]');
      if (s) { scene = s.dataset.s; $$('[data-s]', el).forEach((x) => x.classList.toggle('active', x === s)); drawPhrases(); return; }
      const em = t.closest('[data-em]');
      if (em) { const [en, ja] = EMERGENCY[+em.dataset.em]; showMode(en, ja); return; }
      const pl = t.closest('[data-play]');
      if (pl) { const it = allItems().find((x) => x.id === pl.dataset.play); pl.classList.add('flash-play'); setTimeout(() => pl.classList.remove('flash-play'), 600); speak(it.en); return; }
      const sh = t.closest('[data-show]');
      if (sh) { const it = allItems().find((x) => x.id === sh.dataset.show); showMode(it.en, it.ja); return; }
      const fav = t.closest('[data-fav]');
      if (fav) { const id = fav.dataset.fav; if (state.favs[id]) delete state.favs[id]; else state.favs[id] = 1; save('favs'); fav.classList.toggle('on', !!state.favs[id]); sfx.play('pop'); return; }
      if (t.closest('.add-memo')) { editMemo(null); return; }
      if (t.closest('.gen')) { openPhraseGenerator({ onAdded: () => go(`#/travel?scene=custom&r=${Date.now()}`) }); return; }
      const sm = t.closest('.show-memo');
      if (sm) { const m = state.memos[+sm.dataset.i]; showMode(m.text, m.title); return; }
      const ed = t.closest('.edit-memo');
      if (ed) editMemo(+ed.dataset.i);
    });

    return () => { jaSession?.stop(); };
  },
};
