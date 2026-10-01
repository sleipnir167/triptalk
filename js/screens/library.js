// 単語帳（検索・フィルタ・詳細・マイ単語追加）
import { $, $$, esc, modal, toast } from '../ui.js';
import { icon } from '../icons.js';
import { state, save } from '../store.js';
import { allItems, scenes, sceneById, isWeak } from '../content.js';
import { getCard, mastery, retrievability } from '../srs.js';
import { sayBtn, openItem, masteryDot, addToMyWords, openPhraseGenerator } from '../components.js';
import { aiReady, fillItem } from '../ai.js';
import { handoff, go } from '../router.js';

const STATUS = [['all', 'すべて'], ['new', '未学習'], ['learning', '学習中'], ['mastered', '定着・習得'], ['weak', '苦手'], ['fav', '★']];

export default {
  nav: 'library',
  render(el, { params }) {
    const f = { q: '', scene: params.scene || 'all', kind: 'all', status: 'all' };
    let shown = 120;
    el.innerHTML = `
      <div class="wrap">
        <header class="page-head row between wrap gap-12">
          <div><h1>単語帳</h1><p class="muted">収録 <b class="total"></b> 項目 · タップで詳細・AI解説・発音チェック</p></div>
          <div class="row gap-8 wrap"><button class="btn btn-ai gen">${icon('sparkles', 18)} AIで旅のフレーズを作る</button><button class="btn btn-primary add">${icon('plus', 18)} マイ単語を追加</button></div>
        </header>
        <div class="lib-tools">
          <label class="search">${icon('search', 18)}<input class="input q" placeholder="英語・日本語で検索" autocapitalize="off" autocomplete="off" spellcheck="false"></label>
          <div class="seg kind">${[['all', 'すべて'], ['word', '単語'], ['phrase', 'フレーズ']].map(([v, l]) => `<button class="${v === 'all' ? 'active' : ''}" data-kind="${v}">${l}</button>`).join('')}</div>
        </div>
        <div class="chips scroll-x scenes-f">
          <button class="chip ${f.scene === 'all' ? 'active' : ''}" data-scene="all">🌐 すべて</button>
          ${scenes().map((s) => `<button class="chip ${f.scene === s.id ? 'active' : ''}" data-scene="${s.id}">${s.emoji} ${esc(s.name)}</button>`).join('')}
        </div>
        <div class="chips status-f">${STATUS.map(([v, l]) => `<button class="chip sm ${v === 'all' ? 'active' : ''}" data-status="${v}">${l}</button>`).join('')}</div>
        <div class="lib-summary small muted"></div>
        <div class="lib-list"></div>
        <div class="center mt-16"><button class="btn btn-soft more" hidden>もっと見る</button></div>
      </div>`;

    $('.total', el).textContent = allItems().length;

    function filtered() {
      const q = f.q.toLowerCase();
      return allItems().filter((it) => {
        if (f.scene !== 'all' && it.scene !== f.scene) return false;
        if (f.kind !== 'all' && it.kind !== f.kind) return false;
        if (q && !(it.en.toLowerCase().includes(q) || it.ja.includes(f.q) || (it.accepts || []).some((a) => a.toLowerCase().includes(q)))) return false;
        if (f.status !== 'all') {
          const m = mastery(getCard(it.id));
          if (f.status === 'new' && m !== 0) return false;
          if (f.status === 'learning' && m !== 1) return false;
          if (f.status === 'mastered' && m < 2) return false;
          if (f.status === 'weak' && !isWeak(it)) return false;
          if (f.status === 'fav' && !state.favs[it.id]) return false;
        }
        return true;
      });
    }

    function draw() {
      const list = filtered();
      $('.lib-summary', el).innerHTML = `${list.length} 件${list.length ? ` · <button class="link-btn practice">${icon('target', 14)} この${Math.min(list.length, 20)}件でクイズ</button> · <button class="link-btn speakp">${icon('mic', 14)} 音読練習</button>` : ''}`;
      const now = Date.now();
      $('.lib-list', el).innerHTML = list.length ? list.slice(0, shown).map((it) => {
        const c = getCard(it.id);
        const r = c?.reps ? Math.round(retrievability(c, now) * 100) : null;
        return `<div class="lib-row tap" data-id="${it.id}">
          ${masteryDot(it)}
          <div class="lr-text"><div class="en">${esc(it.en)}</div><div class="small muted">${esc(it.ja)}</div></div>
          ${r !== null ? `<span class="lr-ret" title="現在の記憶保持率">${r}%</span>` : ''}
          <button class="star-btn ${state.favs[it.id] ? 'on' : ''}" data-fav="${it.id}" aria-label="お気に入り">${icon('star', 18)}</button>
          ${sayBtn(it.en)}
        </div>`;
      }).join('') : `<div class="empty small"><div class="empty-emoji">🔎</div><p class="muted">該当する項目がありません</p></div>`;
      $('.more', el).hidden = list.length <= shown;
    }
    draw();

    let tmr;
    $('.q', el).addEventListener('input', (e) => { clearTimeout(tmr); tmr = setTimeout(() => { f.q = e.target.value.trim(); shown = 120; draw(); }, 160); });
    el.addEventListener('click', async (e) => {
      const t = e.target;
      const sc = t.closest('[data-scene]');
      if (sc) { f.scene = sc.dataset.scene; $$('[data-scene]', el).forEach((x) => x.classList.toggle('active', x === sc)); shown = 120; draw(); return; }
      const k = t.closest('[data-kind]');
      if (k) { f.kind = k.dataset.kind; $$('[data-kind]', el).forEach((x) => x.classList.toggle('active', x === k)); draw(); return; }
      const s = t.closest('[data-status]');
      if (s) { f.status = s.dataset.status; $$('[data-status]', el).forEach((x) => x.classList.toggle('active', x === s)); draw(); return; }
      const fav = t.closest('[data-fav]');
      if (fav) {
        const id = fav.dataset.fav;
        if (state.favs[id]) delete state.favs[id]; else state.favs[id] = 1;
        save('favs'); fav.classList.toggle('on', !!state.favs[id]);
        return;
      }
      if (t.closest('.more')) { shown += 200; draw(); return; }
      if (t.closest('.practice')) { handoff.items = filtered().sort(() => Math.random() - 0.5).slice(0, 20); go('#/quiz?mode=en2ja&handoff=1'); return; }
      if (t.closest('.speakp')) { handoff.items = filtered().sort(() => Math.random() - 0.5).slice(0, 10); go('#/speak?mode=read&handoff=1'); return; }
      if (t.closest('.add')) { addDialog(); return; }
      if (t.closest('.gen')) { openPhraseGenerator({ onAdded: () => { $('.total', el).textContent = allItems().length; draw(); } }); return; }
      const row = t.closest('.lib-row');
      if (row && !t.closest('[data-say]')) {
        const it = allItems().find((x) => x.id === row.dataset.id);
        if (it) openItem(it, { onChange: draw });
      }
    });

    async function addDialog() {
      const useAI = aiReady('explain');
      await modal({
        title: '📥 マイ単語を追加',
        body: `
          <p class="small muted">現地で見かけた表現や、覚えたいフレーズを登録しましょう。SRSで復習に出題されます。</p>
          ${useAI ? `<div class="ai-fill"><input class="input seed" placeholder="英語 or 日本語を入力して自動入力 →"><button class="btn btn-ai fill">${icon('sparkles', 16)} AIで自動入力</button></div>` : ''}
          <label class="field"><span>英語 *</span><input class="input f-en" autocapitalize="off" spellcheck="false"></label>
          <label class="field"><span>日本語 *</span><input class="input f-ja"></label>
          <label class="field"><span>例文（英）</span><input class="input f-ex" autocapitalize="off" spellcheck="false"></label>
          <label class="field"><span>例文（日）</span><input class="input f-exja"></label>
          <label class="field"><span>メモ</span><input class="input f-note"></label>`,
        actions: [{ label: 'キャンセル', value: null }, {
          label: '追加', cls: 'btn-primary', onClick: (close, m) => {
            const en = $('.f-en', m).value.trim(), ja = $('.f-ja', m).value.trim();
            if (!en || !ja) { toast('英語と日本語は必須です'); return false; }
            addToMyWords({ en, ja, ex: $('.f-ex', m).value.trim(), exJa: $('.f-exja', m).value.trim(), note: $('.f-note', m).value.trim() });
            $('.total', el).textContent = allItems().length;
            close(true);
            draw();
          },
        }],
        onMount: (m) => {
          $('.fill', m)?.addEventListener('click', async (ev) => {
            const seed = $('.seed', m).value.trim() || $('.f-en', m).value.trim() || $('.f-ja', m).value.trim();
            if (!seed) { toast('英語か日本語を入力してください'); return; }
            const b = ev.target.closest('button'); b.disabled = true; b.textContent = '生成中…';
            try {
              const { data } = await fillItem(seed);
              $('.f-en', m).value = data.en || ''; $('.f-ja', m).value = data.ja || '';
              $('.f-ex', m).value = data.ex || ''; $('.f-exja', m).value = data.exJa || ''; $('.f-note', m).value = data.note_ja || '';
            } catch (err) { toast(err.message, { type: 'error' }); }
            b.disabled = false; b.innerHTML = `${icon('sparkles', 16)} AIで自動入力`;
          });
        },
      });
    }
  },
};
