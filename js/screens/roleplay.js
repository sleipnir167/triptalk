// 台本ロールプレイ（オフライン・無料）
import { $, esc, sleep } from '../ui.js';
import { icon } from '../icons.js';
import { state, save } from '../store.js';
import { sceneById } from '../content.js';
import { speak, stopSpeaking } from '../speech.js';
import { sfx } from '../sfx.js';
import { sessionBar, sayBtn, createMic, showResults } from '../components.js';
import { addXP, bump, addStudyTime } from '../gamify.js';
import { scoreAgainst, diffHTML } from '../scoring.js';
import { go } from '../router.js';
import { DIALOGUES, AI_SCENARIOS } from '../data/dialogues.js';
import { confetti } from '../fx.js';

const stars = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
const starOf = (avg) => (avg >= 90 ? 3 : avg >= 75 ? 2 : avg > 0 ? 1 : 0);

function list(el) {
  const rp = state.stats.roleplay || {};
  el.innerHTML = `
    <div class="wrap">
      <header class="page-head with-back"><a class="btn-icon soft" href="#/study" aria-label="戻る">${icon('chevL')}</a><div><h1>台本ロールプレイ</h1><p class="muted">相手のセリフを聞いて、あなたのパートを声に出して演じよう。完全無料・オフラインOK</p></div></header>
      <div class="rp-grid">
        ${DIALOGUES.map((d) => {
          const sc = sceneById(d.scene);
          const best = rp[d.id]?.best || 0;
          const you = d.lines.filter((l) => l[0] === 'you').length;
          return `<a class="rp-card tap" href="#/roleplay/${d.id}" style="--g1:${sc.grad[0]};--g2:${sc.grad[1]}">
            <span class="rp-emoji">${d.emoji}</span>
            <span class="rp-body"><b>${esc(d.title)}</b><small>${sc.emoji} ${esc(sc.name)} · 相手: ${esc(d.partner)} · あなたのセリフ ${you}つ</small></span>
            <span class="rp-stars ${best ? '' : 'none'}">${best ? stars(starOf(best)) : 'NEW'}</span>
          </a>`;
        }).join('')}
      </div>
    </div>`;
}

export default {
  nav: 'study',
  render(el, { arg }) {
    if (!arg) { list(el); return; }
    const d = DIALOGUES.find((x) => x.id === arg);
    if (!d) return go('#/roleplay');
    el.closest('#app').classList.add('immersive');
    const sc = sceneById(d.scene);
    const pass = state.settings.passScore - 10;
    let showScript = true, stopped = false, xpSum = 0;
    const scores = [];
    const t0 = Date.now();
    const youTotal = d.lines.filter((l) => l[0] === 'you').length;

    el.innerHTML = `
      <div class="session rp-session" style="--g1:${sc.grad[0]};--g2:${sc.grad[1]}">
        <div class="rp-head"><span class="rp-emoji sm">${d.emoji}</span><div><b>${esc(d.title)}</b><small>相手: ${d.avatar} ${esc(d.partner)}</small></div>
          <label class="switch-row compact"><span>相手のセリフを表示</span><input type="checkbox" class="switch script-tg" checked></label></div>
        <div class="chat rp-chat"></div>
        <div class="rp-dock"></div>
      </div>`;
    const bar = sessionBar($('.session', el), { title: 'ロールプレイ', onClose: () => { stopped = true; stopSpeaking(); go('#/roleplay'); } });
    const chat = $('.rp-chat', el);
    const dock = $('.rp-dock', el);
    $('.script-tg', el).onchange = (e) => { showScript = e.target.checked; chat.classList.toggle('hide-script', !showScript); };

    const scrollDown = () => chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });

    async function staffLine(en, ja) {
      const b = document.createElement('div');
      b.className = 'bubble ai pop-in';
      b.innerHTML = `<span class="avatar">${d.avatar}</span><div class="b-body"><div class="b-en">${esc(en)}</div><div class="b-ja">${esc(ja)}</div><div class="b-tools">${sayBtn(en, { size: 16, gender: d.g })}${sayBtn(en, { slow: true, gender: d.g })}<button class="b-reveal small">文字を見る</button></div></div>`;
      $('.b-reveal', b).onclick = () => b.classList.add('revealed');
      chat.append(b); scrollDown();
      sfx.play('message');
      await speak(en, { gender: d.g });
    }

    function youTurn(line, n) {
      return new Promise((resolve) => {
        const accepts = line[1].split('|');
        let attempts = 0, best = 0, hintShown = false;
        dock.innerHTML = `
          <div class="rp-prompt pop-in">
            <div class="rp-say"><small>あなたのセリフ（${n}/${youTotal}）</small><b>「${esc(line[2])}」</b><span>を英語で言おう</span></div>
            <div class="rp-hint" hidden>${esc(accepts[0])} ${sayBtn(accepts[0], { size: 16 })}</div>
            <div class="rp-res"></div>
            <div class="rp-mic"></div>
            <div class="row center gap-8"><button class="btn btn-sm btn-soft hint-btn">${icon('bulb', 16)} 英語のヒント</button><button class="btn btn-sm btn-ghost skip-btn">スキップ</button></div>
          </div>`;
        $('.hint-btn', dock).onclick = () => { hintShown = true; $('.rp-hint', dock).hidden = false; speak(accepts[0]); };
        const done = (text, score, ok) => {
          const b = document.createElement('div');
          b.className = 'bubble me pop-in';
          b.innerHTML = `<div class="b-body"><div class="b-en">${esc(text)}</div><div class="b-score ${ok ? 'ok' : 'ng'}">${ok ? '✓' : '△'} ${score}点${hintShown ? ' · ヒント使用' : ''}</div></div>`;
          chat.append(b); scrollDown();
          dock.innerHTML = '';
          scores.push(score);
          bar.setProgress(scores.length, youTotal);
          resolve();
        };
        $('.skip-btn', dock).onclick = () => { sfx.play('soft'); done(accepts[0], 0, false); };
        createMic($('.rp-mic', dock), {
          size: 'sm', label: 'タップして話す',
          onResult: ({ alts }) => {
            attempts++;
            const r = scoreAgainst(accepts, alts);
            best = Math.max(best, r.score);
            if (r.score >= pass) {
              const penalty = hintShown ? 15 : 0;
              const sc2 = Math.max(0, r.score - penalty - (attempts - 1) * 5);
              const xp = hintShown ? 6 : attempts === 1 ? 15 : 10;
              xpSum += xp; addXP(xp, $('.rp-mic', dock));
              bump('speakPass');
              sfx.play('correct');
              done(alts[0], sc2, true);
            } else {
              sfx.play('wrong');
              $('.rp-res', dock).innerHTML = `<div class="diff">${diffHTML(r)}</div><div class="small muted">${r.score}点 · 聞き取り: 「${esc(alts[0])}」${attempts >= 2 ? ' — ヒントを見てもOK！' : ''}</div>`;
              if (attempts >= 3) {
                $('.rp-res', dock).insertAdjacentHTML('beforeend', `<button class="btn btn-sm btn-soft mt-8 give">この答えで進む</button>`);
                $('.give', dock).onclick = () => done(alts[0], Math.max(0, best - 20), false);
              }
            }
          },
        });
      });
    }

    async function run() {
      bar.setProgress(0, youTotal);
      dock.innerHTML = `<div class="rp-start pop-in"><p>${d.avatar} <b>${esc(d.partner)}</b> との会話です。<br>相手のセリフは自動で読み上げられます。</p><button class="btn btn-primary btn-xl go">${icon('play', 18)} はじめる</button></div>`;
      await new Promise((r) => ($('.go', dock).onclick = r));
      dock.innerHTML = '';
      sfx.play('start');
      let n = 0;
      for (const line of d.lines) {
        if (stopped) return;
        if (line[0] === 'staff') { await staffLine(line[1], line[2]); await sleep(250); }
        else { n++; await youTurn(line, n); await sleep(300); }
      }
      if (stopped) return;
      end();
    }

    function end() {
      const avg = Math.round(scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length));
      const st = starOf(avg);
      state.stats.roleplay ||= {};
      const prev = state.stats.roleplay[d.id]?.best || 0;
      state.stats.roleplay[d.id] = { best: Math.max(prev, avg), last: Date.now(), plays: (state.stats.roleplay[d.id]?.plays || 0) + 1 };
      save('stats');
      bump('roleplays');
      const bonus = st * 10;
      xpSum += bonus; addXP(bonus);
      if (st === 3) confetti();
      const ai = AI_SCENARIOS.find((s) => s.scene === d.scene);
      $('.sbar', el)?.remove();
      const host = $('.session', el);
      showResults(host, {
        title: `${d.title} クリア！`, emoji: d.emoji, score: avg / 100, scoreLabel: '平均スコア',
        xp: xpSum, timeSec: (Date.now() - t0) / 1000,
        extraHTML: `<div class="center rp-stars-big">${stars(st)}</div>${avg > prev && prev ? '<p class="center">🏅 ベストスコア更新！</p>' : ''}`,
        actions: [
          { label: `${icon('refresh', 18)} もう一度`, cls: 'btn-soft', onClick: () => go(`#/roleplay/${d.id}?r=${Date.now()}`) },
          { label: `${icon('list', 18)} 他のシナリオ`, cls: 'btn-soft', onClick: () => go('#/roleplay') },
          ...(ai ? [{ label: `${icon('bot', 18)} AIで自由に会話`, cls: 'btn-primary', onClick: () => go(`#/aichat/${ai.id}`) }] : []),
        ],
      });
      addStudyTime(0);
    }

    run();
    return () => { stopped = true; stopSpeaking(); };
  },
};
