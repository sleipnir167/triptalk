// 設定
import { $, $$, esc, modal, toast, confirmDialog, download, fmtNum } from '../ui.js';
import { icon } from '../icons.js';
import { state, save, setSetting, exportData, importData, resetProgress, cacheCount, cacheClear } from '../store.js';
import { englishVoices, speak, browserSttSupported, initVoices, ttsSupported } from '../speech.js';
import { sfx } from '../sfx.js';
import { PRESETS, newProvider, testProvider, listModels, todayUsage, monthUsage, explainItem, aiReady, providers } from '../ai.js';
import { allItems, isWeak } from '../content.js';
import { getCard } from '../srs.js';
import { cacheGet } from '../store.js';
import { recorderSupported } from '../recorder.js';

const S = () => state.settings;

function sec(id, title, ic, body) {
  return `<section class="card set-sec" id="sec-${id}"><h2>${icon(ic, 20)} ${title}</h2>${body}</section>`;
}
function row(label, control, desc = '') {
  return `<div class="set-row"><div class="sr-text"><b>${label}</b>${desc ? `<small>${desc}</small>` : ''}</div><div class="sr-ctl">${control}</div></div>`;
}
const sw = (key, on) => `<input type="checkbox" class="switch" data-set="${key}" ${on ? 'checked' : ''}>`;
const seg = (key, cur, opts) => `<div class="seg sm" data-seg="${key}">${opts.map(([v, l]) => `<button class="${String(cur) === String(v) ? 'active' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`;

export default {
  nav: 'settings',
  async render(el, { params }) {
    const voices = englishVoices();
    const st = S();
    const cc = await cacheCount();
    el.innerHTML = `
      <div class="wrap narrow settings">
        <header class="page-head"><h1>設定</h1></header>
        <nav class="chips scroll-x set-nav">${[['learn', '学習'], ['trip', '旅行'], ['voice', '音声'], ['ai', 'AI'], ['look', '表示・効果音'], ['data', 'データ'], ['help', 'ヘルプ']].map(([k, l]) => `<a class="chip" href="#/settings?sec=${k}">${l}</a>`).join('')}</nav>

        ${sec('learn', '学習', 'study', `
          ${row('1日の目標XP', `<input type="range" min="30" max="500" step="10" value="${st.dailyGoalXP}" data-range="dailyGoalXP"><output>${st.dailyGoalXP}</output>`, '1問正解で約10XP')}
          ${row('1日の新規項目数', `<input type="range" min="3" max="40" step="1" value="${st.newPerDay}" data-range="newPerDay"><output>${st.newPerDay}</output>`)}
          ${row('目標の記憶保持率', `<input type="range" min="0.8" max="0.95" step="0.01" value="${st.retention}" data-range="retention"><output>${Math.round(st.retention * 100)}%</output>`, '高いほど復習回数が増え、忘れにくくなります（推奨 90%）')}
          ${row('復習の出題方向', seg('direction', st.direction, [['auto', '自動'], ['en2ja', '英→日'], ['ja2en', '日→英']]), '自動: 覚えたての項目は英→日、定着したら日→英（話す練習）')}
          ${row('発音の合格ライン', `<input type="range" min="60" max="95" step="5" value="${st.passScore}" data-range="passScore"><output>${st.passScore}点</output>`)}
          ${row('英語を自動で読み上げ', sw('autoPlay', st.autoPlay))}
        `)}

        ${sec('trip', '旅行の予定', 'plane', `
          ${row('行き先・旅行名', `<input class="input" data-text="trip.name" value="${esc(st.trip.name)}" placeholder="例: ハワイ旅行">`)}
          ${row('出発日', `<input class="input" type="date" data-text="trip.date" value="${esc(st.trip.date)}">`, 'ホームに出発までのカウントダウンと学習ペースを表示します')}
        `)}

        ${sec('voice', '音声', 'volume', `
          <div class="env-status">
            <span class="${ttsSupported ? 'ok' : 'ng'}">${icon(ttsSupported ? 'check' : 'x', 14)} 読み上げ</span>
            <span class="${browserSttSupported ? 'ok' : 'ng'}">${icon(browserSttSupported ? 'check' : 'x', 14)} ブラウザ音声認識</span>
            <span class="${recorderSupported ? 'ok' : 'ng'}">${icon(recorderSupported ? 'check' : 'x', 14)} 録音</span>
            <span class="${'LanguageModel' in self ? 'ok' : 'ng'}">${icon('LanguageModel' in self ? 'check' : 'x', 14)} Chrome内蔵AI</span>
          </div>
          ${row('アクセント', seg('accent', st.accent, [['en-US', '🇺🇸 米'], ['en-GB', '🇬🇧 英'], ['en-AU', '🇦🇺 豪']]), '読み上げと音声認識の言語')}
          ${row('読み上げの声', `<select class="input" data-select="ttsVoice"><option value="">自動（おすすめ）</option>${voices.map((v) => `<option value="${esc(v.voiceURI)}" ${v.voiceURI === st.ttsVoice ? 'selected' : ''}>${esc(v.name)} (${v.lang})</option>`).join('')}</select>`, 'iPad: 設定 > アクセシビリティ > 読み上げコンテンツ > 声 で「高品質」の声を追加すると自然になります')}
          ${row('読み上げ速度', `<input type="range" min="0.6" max="1.2" step="0.05" value="${st.ttsRate}" data-range="ttsRate"><output>${st.ttsRate}x</output>`)}
          <div class="row gap-8"><button class="btn btn-soft btn-sm test-tts">${icon('volume', 16)} テスト再生</button><button class="btn btn-ghost btn-sm reload-voices">${icon('refresh', 16)} 声を再読み込み</button></div>
          ${row('音声認識エンジン', seg('sttEngine', st.sttEngine, [['auto', '自動'], ['browser', 'ブラウザ'], ['ai', 'AI'], ['keyboard', '入力']]), 'ブラウザ: 無料（iPadはSiri音声入力、Pixel/ChromeはGoogle）／AI: Whisper等で文字起こし（少額課金）／入力: キーボードの🎤を使用')}
          ${row('オンデバイス認識を優先', sw('sttLocal', st.sttLocal), '対応するChrome（Pixel等）で端末内処理を使います')}
        `)}

        ${sec('ai', 'AI（解説・添削・会話）', 'bot', `
          <p class="small muted"><b>アプリ内蔵AI</b>（Modellix の無料モデル）は設定なし・APIキーなし・無料で使えます。自分のAIを使うときは下から追加してください。上から順に試し、失敗・タイムアウト時は次へ自動で切り替えます。生成結果はすべて端末に保存され、同じ内容は二度と呼び出しません。</p>
          <div class="prov-list"></div>
          <div class="row gap-8 wrap mt-12">${PRESETS.map((p) => `<button class="btn btn-soft btn-sm add-prov" data-preset="${p.key}">${icon('plus', 14)} ${esc(p.name)}</button>`).join('')}</div>
          ${row('1日の呼び出し上限', `<input type="range" min="0" max="300" step="10" value="${st.ai.dailyLimit}" data-range="ai.dailyLimit"><output>${st.ai.dailyLimit || '無制限'}</output>`, '0 = 無制限。使いすぎ防止に')}
          ${row('音声入力後に自動送信（AI会話）', sw('chatAutoSend', st.chatAutoSend))}
          <div class="usage-box">
            <div><small>今日</small><b>${todayUsage().calls}回</b></div>
            <div><small>今月</small><b>${monthUsage().calls}回</b></div>
            <div><small>今月の費用</small><b>$${monthUsage().cost.toFixed(4)}</b></div>
            <div><small>保存済みAI結果</small><b class="cache-n">${cc}件</b></div>
          </div>
          <div class="row gap-8 wrap mt-12">
            <button class="btn btn-soft btn-sm prefetch">${icon('download', 16)} AI解説の一括事前生成</button>
            <button class="btn btn-ghost btn-sm clear-cache">${icon('trash', 16)} 保存済みAI結果を削除</button>
          </div>
          <p class="small muted mt-8">一括事前生成: 自前サーバーなど遅い/無料のAIで、苦手・未学習の解説を先に作っておくと、学習中は待ち時間ゼロ・無料で表示できます。</p>
        `)}

        ${sec('look', '表示・効果音', 'sun', `
          ${row('テーマ', seg('theme', st.theme, [['auto', '自動'], ['dark', 'ダーク'], ['light', 'ライト']]))}
          ${row('タップでキラキラ', sw('sparkle', st.sparkle !== false), 'さわった所に小さな光が舞います（動きを減らす設定の端末では表示しません）')}
          ${row('オルゴールBGM', sw('bgm', !!st.bgm), 'ホーム・メニュー・記録・設定の画面で、オリジナルのワルツを小さく流します（学習中・読み上げ中は止まります）')}
          ${row('効果音', sw('sfx', st.sfx))}
          ${row('効果音の音量', `<input type="range" min="0.1" max="1" step="0.05" value="${st.sfxVolume}" data-range="sfxVolume"><output>${Math.round(st.sfxVolume * 100)}%</output>`)}
          <div class="row gap-8 wrap">${['correct', 'wrong', 'combo', 'levelup', 'badge'].map((s) => `<button class="btn btn-ghost btn-sm" data-sfx="${s}">${{ correct: '正解', wrong: '不正解', combo: 'コンボ', levelup: 'レベルアップ', badge: 'スタンプ' }[s]}</button>`).join('')}</div>
        `)}

        ${sec('data', 'データ', 'download', `
          <p class="small muted">学習データはこの端末のブラウザ内に保存されます。ホーム画面に追加して使うと消えにくくなります。機種変更や念のためにバックアップしましょう。</p>
          <div class="row gap-8 wrap">
            <button class="btn btn-soft export">${icon('download', 18)} バックアップを保存</button>
            <label class="btn btn-soft import">${icon('upload', 18)} 復元<input type="file" accept="application/json,.json" hidden></label>
          </div>
          <label class="check-row mt-8"><input type="checkbox" class="inc-keys"> APIキーもバックアップに含める（取り扱い注意）</label>
          <div class="row gap-8 wrap mt-16"><button class="btn btn-danger-soft reset">${icon('trash', 18)} 学習データをリセット</button></div>
        `)}

        ${sec('help', 'ヘルプ', 'info', `
          <div class="help">
            <details><summary>📱 iPadのホーム画面に追加するには</summary><p>Safariで共有ボタン（□↑）→「ホーム画面に追加」。全画面のアプリとして起動し、オフラインでも学習できます。</p></details>
            <details><summary>🎤 マイクが使えない</summary><p>① HTTPSのURLで開いているか確認（http は不可）② Safari の「ぁあ」/設定 > Safari > マイク で許可 ③ iPad の 設定 > 一般 > キーボード > 音声入力 をオン。<br>それでも使えない場合は 設定 > 音声 で「入力」を選び、キーボードの🎤で音声入力できます。</p></details>
            <details><summary>💰 AIのクレジットを節約するには</summary><p>① まずはアプリ内蔵AI（無料・設定不要）を使い、追加するなら無料のもの（自前Gemma・:free モデル）を上に並べる ② 自前サーバーは「解説」専用にして一括事前生成 ③ 会話は1ターン1回の呼び出しで返答・和訳・添削・ヒントをまとめて取得しています ④ 生成済みの結果は無料で再表示 ⑤ 1日の上限を設定。採点（発音・クイズ）はすべて端末内で行うのでAIを使いません。</p></details>
            <details><summary>🖥️ 自前サーバー（Oracle Cloud の Gemma）を使うには</summary><p>Ollama の場合: <code>OLLAMA_ORIGINS=*</code> を設定して起動し、Caddy や nginx で HTTPS 化してください。ベースURLは <code>https://あなたのドメイン/v1</code>、モデル名は <code>gemma3:12b</code> など。APIキー不要なら空欄でOK。</p></details>
            <details><summary>🧠 忘却曲線（SRS）の仕組み</summary><p>最新の記憶モデル FSRS をベースに、項目ごとの「記憶の安定度」と「難しさ」を推定し、保持率が目標（既定90%）を下回る直前に復習を出題します。間違えた項目は安定度が下がり、すぐに再出題されます。単語帳の詳細から各項目の忘却曲線を確認できます。</p></details>
          </div>
          <p class="small muted center mt-16">TripTalk v1.0 · 端末内で動作するオフライン対応PWA</p>
        `)}
      </div>`;

    drawProviders();
    if (params.sec) setTimeout(() => $(`#sec-${params.sec}`, el)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);

    // ---- 汎用バインド ----
    el.addEventListener('input', (e) => {
      const r = e.target.closest('[data-range]');
      if (r) {
        const k = r.dataset.range; const v = parseFloat(r.value);
        const out = r.nextElementSibling;
        if (out) out.textContent = k === 'retention' ? Math.round(v * 100) + '%' : k === 'ttsRate' ? v + 'x' : k === 'passScore' ? v + '点' : k === 'sfxVolume' ? Math.round(v * 100) + '%' : k === 'ai.dailyLimit' ? (v || '無制限') : v;
        setSetting(k, v);
      }
    });
    el.addEventListener('change', (e) => {
      const s = e.target.closest('[data-set]');
      if (s) { setSetting(s.dataset.set, s.checked); if (s.dataset.set === 'sfx' && s.checked) sfx.play('correct'); }
      const t = e.target.closest('[data-text]');
      if (t) { setSetting(t.dataset.text, t.value.trim()); toast('保存しました', { emoji: '✅', ms: 1200 }); }
      const sel = e.target.closest('[data-select]');
      if (sel) { setSetting(sel.dataset.select, sel.value); speak('Hello! Welcome to TripTalk.'); }
    });
    el.addEventListener('click', async (e) => {
      const t = e.target;
      const sg = t.closest('[data-seg] [data-v]');
      if (sg) {
        const g = sg.parentElement;
        $$('[data-v]', g).forEach((x) => x.classList.toggle('active', x === sg));
        setSetting(g.dataset.seg, sg.dataset.v);
        if (g.dataset.seg === 'accent') speak('Hello! How are you today?');
      }
      const sf = t.closest('[data-sfx]');
      if (sf) sfx.play(sf.dataset.sfx, 6);
      if (t.closest('.test-tts')) speak('Could I have a window seat, please? Thank you so much!');
      if (t.closest('.reload-voices')) { initVoices(); setTimeout(() => location.reload(), 300); }
      const ap = t.closest('.add-prov');
      if (ap) {
        const p = newProvider(ap.dataset.preset);
        if (await editProvider(p, true)) { st.ai.providers.push(p); save('settings'); drawProviders(); }
      }
      if (t.closest('.clear-cache')) {
        if (await confirmDialog('保存済みのAI解説・添削結果をすべて削除しますか？（再表示には再度AIを呼び出します）', { danger: true, ok: '削除' })) { await cacheClear(); $('.cache-n', el).textContent = '0件'; toast('削除しました'); }
      }
      if (t.closest('.prefetch')) prefetch();
      if (t.closest('.export')) {
        const data = await exportData({ includeKeys: $('.inc-keys', el).checked });
        download(`triptalk-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data));
        toast('バックアップを保存しました', { emoji: '💾' });
      }
      if (t.closest('.reset')) {
        if (await confirmDialog('学習履歴・XP・スタンプをすべてリセットします。この操作は取り消せません。', { danger: true, ok: 'リセット', title: '⚠️ 学習データのリセット' })) {
          await resetProgress(); toast('リセットしました'); setTimeout(() => location.reload(), 600);
        }
      }
    });
    $('.import input', el).addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!(await confirmDialog(`${data.exportedAt ? new Date(data.exportedAt).toLocaleString('ja-JP') + ' の' : ''}バックアップで現在のデータを上書きしますか？`, { ok: '復元する' }))) return;
        await importData(data);
        toast('復元しました。再読み込みします', { emoji: '✅' });
        setTimeout(() => location.reload(), 800);
      } catch (err) { toast('復元に失敗: ' + err.message, { type: 'error' }); }
      e.target.value = '';
    });

    // ---- プロバイダ一覧 ----
    function drawProviders() {
      const list = st.ai.providers;
      $('.prov-list', el).innerHTML = list.length ? list.map((p, i) => `
        <div class="prov ${p.enabled ? '' : 'off'} ${p.builtin ? 'builtin' : ''}">
          <div class="prov-order"><button class="btn-icon sm ghost up" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="上へ">${icon('chevU', 16)}</button><span>${i + 1}</span><button class="btn-icon sm ghost down" data-i="${i}" ${i === list.length - 1 ? 'disabled' : ''} aria-label="下へ">${icon('chevD', 16)}</button></div>
          <div class="prov-main">
            <b>${p.builtin ? '✈️ ' : ''}${esc(p.name)}</b>
            <small>${esc(p.type === 'chrome' ? 'ブラウザ内蔵' : p.model || 'モデル未設定')}${p.type !== 'chrome' && !p.baseUrl ? (p.builtin ? ' · 準備中' : ' · URL未設定') : ''}</small>
            <div class="prov-tags">${p.builtin ? '<span class="tag free">設定不要・無料</span>' : ''}${p.mergeSystem ? '<span class="tag">system不使用</span>' : ''}${p.useChat ? '<span class="tag">会話</span>' : ''}${p.useExplain ? '<span class="tag">解説・添削</span>' : ''}${p.audioModel ? '<span class="tag">音声</span>' : ''}${p.apiKey ? '<span class="tag">🔑</span>' : ''}</div>
          </div>
          <input type="checkbox" class="switch prov-on" data-i="${i}" ${p.enabled ? 'checked' : ''} aria-label="有効">
          <button class="btn-icon soft edit" data-i="${i}" aria-label="編集">${icon('edit', 18)}</button>
        </div>`).join('') : `<div class="prov-empty">${icon('bot', 28)}<p>AIプロバイダが未設定です。下のボタンから追加してください。<br><small>おすすめ: OpenRouter（低価格モデル <code>google/gemini-2.5-flash-lite</code> または無料の <code>:free</code> モデル）</small></p></div>`;
    }
    $('.prov-list', el).addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const i = +b.dataset.i;
      const list = st.ai.providers;
      if (b.classList.contains('up') && i > 0) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; }
      else if (b.classList.contains('down') && i < list.length - 1) { [list[i + 1], list[i]] = [list[i], list[i + 1]]; }
      else if (b.classList.contains('edit')) {
        const copy = { ...list[i] };
        const r = await editProvider(copy, false);
        if (r === 'delete') list.splice(i, 1);
        else if (r) list[i] = copy;
      } else return;
      save('settings'); drawProviders();
    });
    $('.prov-list', el).addEventListener('change', (e) => {
      const c = e.target.closest('.prov-on');
      if (c) { st.ai.providers[+c.dataset.i].enabled = c.checked; save('settings'); drawProviders(); }
    });

    async function editProvider(p, isNew) {
      if (p.builtin) return editBuiltin(p);
      const preset = PRESETS.find((x) => x.key === p.preset);
      const chrome = p.type === 'chrome';
      return modal({
        title: `${isNew ? '追加' : '編集'}: ${esc(p.name)}`, cls: 'sheet-lg',
        body: `
          ${preset?.desc ? `<p class="small muted">${esc(preset.desc)}</p>` : ''}
          <label class="field"><span>表示名</span><input class="input p-name" value="${esc(p.name)}"></label>
          ${chrome ? '' : `
          <label class="field"><span>ベースURL（OpenAI互換・/v1 まで）</span><input class="input p-url" value="${esc(p.baseUrl)}" placeholder="https://example.com/v1" autocapitalize="off" spellcheck="false"></label>
          <label class="field"><span>APIキー</span><div class="row gap-8"><input class="input p-key grow" type="password" value="${esc(p.apiKey)}" placeholder="不要なら空欄" autocapitalize="off" autocomplete="off" spellcheck="false"><button class="btn-icon soft eye" aria-label="表示">${icon('eye', 18)}</button></div><small class="muted">キーはこの端末内にのみ保存され、指定のURL以外には送信されません。</small></label>
          <label class="field"><span>モデル</span><div class="row gap-8"><input class="input p-model grow" value="${esc(p.model)}" placeholder="例: google/gemini-2.5-flash-lite" autocapitalize="off" spellcheck="false"><button class="btn btn-soft btn-sm list-models">一覧</button></div></label>
          <details ${p.audioModel || p.sttModel ? 'open' : ''}><summary class="small">音声機能（任意・OpenRouter等）</summary>
            <label class="field"><span>音声対応モデル（AI発音診断）</span><input class="input p-audio" value="${esc(p.audioModel || '')}" placeholder="例: google/gemini-2.5-flash-lite" autocapitalize="off" spellcheck="false"></label>
            <label class="field"><span>文字起こしモデル（AI音声認識）</span><input class="input p-stt" value="${esc(p.sttModel || '')}" placeholder="例: openai/whisper-1" autocapitalize="off" spellcheck="false"></label>
          </details>
          <label class="field"><span>タイムアウト（秒）</span><input class="input p-to" type="number" min="5" max="600" value="${p.timeout || 60}"></label>
          <label class="check-row mt-8"><input type="checkbox" class="p-merge" ${p.mergeSystem ? 'checked' : ''}> system を使わない（system ロール非対応のモデル・一部の Gemma サーバー向け）</label>`}
          <div class="row gap-16 wrap mt-8">
            <label class="check-row"><input type="checkbox" class="p-chat" ${p.useChat ? 'checked' : ''}> 会話に使う（速さ重視）</label>
            <label class="check-row"><input type="checkbox" class="p-exp" ${p.useExplain ? 'checked' : ''}> 解説・添削に使う</label>
          </div>
          <div class="row gap-8 mt-12"><button class="btn btn-soft test">${icon('zap', 16)} 接続テスト</button><span class="test-out small"></span></div>`,
        actions: [
          ...(!isNew ? [{ label: '削除', cls: 'btn-danger-soft', onClick: async (close) => { if (await confirmDialog('このプロバイダを削除しますか？', { danger: true, ok: '削除' })) close('delete'); return false; } }] : []),
          { label: 'キャンセル', value: null },
          { label: '保存', cls: 'btn-primary', onClick: (close, m) => { read(m); close(true); } },
        ],
        onMount: (m) => {
          $('.eye', m)?.addEventListener('click', () => { const k = $('.p-key', m); k.type = k.type === 'password' ? 'text' : 'password'; });
          $('.test', m).onclick = async () => {
            read(m);
            const out = $('.test-out', m);
            out.innerHTML = '<span class="dots"><i></i><i></i><i></i></span> テスト中…';
            const r = await testProvider(p);
            out.innerHTML = r.ok ? `<span class="ok-text">✅ OK（${r.ms}ms）: ${esc(r.text)}</span>` : `<span class="err-text">❌ ${esc(r.text)}</span>`;
          };
          $('.list-models', m)?.addEventListener('click', async () => {
            read(m);
            const id = await pickModel(p);
            if (id) $('.p-model', m).value = id;
          });
        },
      });
      function read(m) {
        p.name = $('.p-name', m).value.trim() || p.name;
        if (!chrome) {
          p.baseUrl = $('.p-url', m).value.trim().replace(/\/+$/, '');
          p.apiKey = $('.p-key', m).value.trim();
          p.model = $('.p-model', m).value.trim();
          p.audioModel = $('.p-audio', m).value.trim();
          p.sttModel = $('.p-stt', m).value.trim();
          p.timeout = +$('.p-to', m).value || 60;
          p.mergeSystem = $('.p-merge', m).checked;
        }
        p.useChat = $('.p-chat', m).checked;
        p.useExplain = $('.p-exp', m).checked;
      }
    }

    /** 内蔵AI：URL・モデルはアプリ側で固定。使う用途だけ選べる */
    async function editBuiltin(p) {
      return modal({
        title: '✈️ アプリ内蔵AI',
        body: `
          <p class="small">Modellix の無料モデル（<code>${esc(p.model)}</code>）を、APIキーを預かった中継サーバー（Cloudflare Worker）経由で使います。利用者の設定・料金はかかりません。</p>
          <ul class="small muted">
            <li>回答は端末に保存され、同じ質問では再利用されます</li>
            <li>無料モデルは中で考える工程があるため、返答に数秒〜20秒ほどかかることがあります</li>
            <li>短時間に使いすぎると1分ほど待つよう表示されます（悪用防止の回数制限）</li>
            <li>音声（AI発音診断・AI文字起こし）は使えません。必要なら OpenRouter を追加してください</li>
          </ul>
          <div class="row gap-16 wrap mt-8">
            <label class="check-row"><input type="checkbox" class="p-chat" ${p.useChat ? 'checked' : ''}> 会話に使う</label>
            <label class="check-row"><input type="checkbox" class="p-exp" ${p.useExplain ? 'checked' : ''}> 解説・添削に使う</label>
          </div>
          <div class="row gap-8 mt-12"><button class="btn btn-soft test">${icon('zap', 16)} 接続テスト</button><span class="test-out small"></span></div>`,
        actions: [{ label: 'キャンセル', value: null }, { label: '保存', cls: 'btn-primary', onClick: (close, m) => { p.useChat = $('.p-chat', m).checked; p.useExplain = $('.p-exp', m).checked; close(true); } }],
        onMount: (m) => {
          $('.test', m).onclick = async () => {
            const out = $('.test-out', m);
            out.innerHTML = '<span class="dots"><i></i><i></i><i></i></span> テスト中…';
            const r = await testProvider(p);
            out.innerHTML = r.ok ? `<span class="ok-text">✅ OK（${r.ms}ms）: ${esc(r.text)}</span>` : `<span class="err-text">❌ ${esc(r.text)}</span>`;
          };
        },
      });
    }

    async function pickModel(p) {
      let models = [];
      try { models = await listModels(p); } catch (e) { toast('モデル一覧を取得できません: ' + e.message, { type: 'error' }); return null; }
      let freeOnly = false, q = '', audioOnly = false;
      return modal({
        title: 'モデルを選ぶ', cls: 'sheet-lg',
        body: `<div class="row gap-8 wrap"><input class="input mq grow" placeholder="検索 (例: gemma, flash, llama)" autocapitalize="off"><label class="check-row"><input type="checkbox" class="mfree"> 無料のみ</label><label class="check-row"><input type="checkbox" class="maudio"> 音声入力対応</label></div>
               <p class="small muted">価格は100万トークンあたり（入力 / 出力）。安い順。</p><div class="model-list"></div>`,
        onMount: (m, close) => {
          const draw = () => {
            const list = models.filter((x) => (!freeOnly || x.free) && (!audioOnly || x.audio) && (!q || x.id.toLowerCase().includes(q))).sort((a, b) => a.pin + a.pout - (b.pin + b.pout)).slice(0, 200);
            $('.model-list', m).innerHTML = list.map((x) => `<button class="model-row" data-id="${esc(x.id)}"><b>${esc(x.id)}</b><small>${x.free ? '<span class="tag free">FREE</span>' : `$${x.pin.toFixed(2)} / $${x.pout.toFixed(2)}`}${x.audio ? ' <span class="tag">🎤</span>' : ''}${x.ctx ? ` · ${fmtNum(x.ctx)} ctx` : ''}</small></button>`).join('') || '<p class="muted">該当なし</p>';
          };
          draw();
          $('.mq', m).oninput = (e) => { q = e.target.value.toLowerCase(); draw(); };
          $('.mfree', m).onchange = (e) => { freeOnly = e.target.checked; draw(); };
          $('.maudio', m).onchange = (e) => { audioOnly = e.target.checked; draw(); };
          $('.model-list', m).onclick = (e) => { const b = e.target.closest('.model-row'); if (b) close(b.dataset.id); };
        },
      });
    }

    async function prefetch() {
      if (!aiReady('explain')) { toast('解説用のAIプロバイダを設定してください', { type: 'error' }); return; }
      const choice = await modal({
        title: 'AI解説の一括事前生成',
        body: `<p class="small muted">解説がまだ保存されていない項目を順番に生成します。生成済みの解説は学習中に無料・即時で表示されます。</p>
          <div class="seg pf-scope"><button class="active" data-v="weak">苦手・学習中</button><button data-v="cruise">🚢 クルーズ</button><button data-v="fav">⭐ お気に入り</button><button data-v="new">未学習</button><button data-v="all">すべて</button></div>
          <p class="small muted mt-8">🚢 船内のWi-Fiは有料のことが多いので、出航前に「クルーズ」を生成しておくと船の上でも解説を無料・オフラインで見られます。</p>
          <div class="seg pf-n mt-12"><button data-v="10">10件</button><button class="active" data-v="30">30件</button><button data-v="100">100件</button></div>
          <p class="small muted mt-8">※ 1件につきAIを1回呼び出します（上限設定の対象）。</p>`,
        actions: [{ label: 'キャンセル', value: null }, { label: '開始', cls: 'btn-primary', onClick: (close, m) => close({ scope: $('.pf-scope .active', m).dataset.v, n: +$('.pf-n .active', m).dataset.v }) }],
        onMount: (m) => m.addEventListener('click', (e) => { const b = e.target.closest('.seg [data-v]'); if (b) $$('[data-v]', b.parentElement).forEach((x) => x.classList.toggle('active', x === b)); }),
      });
      if (!choice) return;
      let cands = allItems();
      if (choice.scope === 'weak') cands = cands.filter((it) => isWeak(it) || getCard(it.id)?.st === 1);
      if (choice.scope === 'new') cands = cands.filter((it) => !getCard(it.id)?.reps);
      if (choice.scope === 'cruise') cands = cands.filter((it) => it.scene === 'cruise' || it.scene === 'shore');
      if (choice.scope === 'fav') cands = cands.filter((it) => state.favs[it.id]);
      const todo = [];
      for (const it of cands) { if (todo.length >= choice.n) break; if (!(await cacheGet('explain:' + it.id))) todo.push(it); }
      if (!todo.length) { toast('対象の項目はすべて生成済みです', { emoji: '✅' }); return; }
      let stop = false, done = 0, fail = 0;
      const prog = modal({
        title: '生成中…', dismissible: false,
        body: `<div class="pf-prog"><div class="bar"><i style="width:0%"></i></div><p class="pf-text small">0 / ${todo.length}</p></div>`,
        actions: [{ label: '中止', onClick: (close) => { stop = true; close(); } }],
      });
      // 内蔵AIは中継サーバーで1分12回までなので、間隔をあけて呼ぶ（429 のときは少し待ってやり直す）
      const viaBuiltin = providers().find((x) => x.enabled && x.useExplain)?.builtin;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      for (const it of todo) {
        if (stop) break;
        let ok = false;
        for (let k = 0; k < 2 && !ok && !stop; k++) {
          try { await explainItem(it); ok = true; done++; }
          catch (e) {
            if (/上限/.test(e.message)) { toast(e.message, { type: 'error' }); stop = true; break; }
            if (/429|使いすぎ/.test(e.message) && !k) { await wait(30000); continue; }
            fail++; break;
          }
        }
        const pe = document.querySelector('.pf-prog');
        if (pe) { pe.querySelector('.bar i').style.width = ((done + fail) / todo.length) * 100 + '%'; pe.querySelector('.pf-text').textContent = `${done + fail} / ${todo.length}（失敗 ${fail}）· ${it.en}`; }
        if (viaBuiltin && !stop) await wait(5500);
      }
      document.querySelector('.pf-prog')?.closest('.modal-backdrop')?.querySelector('[data-i]')?.click();
      await prog;
      toast(`${done}件の解説を生成しました${fail ? `（失敗 ${fail}件）` : ''}`, { emoji: '✨', type: 'success' });
      $('.cache-n', el).textContent = (await cacheCount()) + '件';
    }
  },
};
