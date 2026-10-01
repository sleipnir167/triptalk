import { esc } from '../ui.js';
import { icon } from '../icons.js';
import { dueCount } from '../srs.js';
import { pool } from '../content.js';
import { pickScope } from '../components.js';
import { go } from '../router.js';
import { aiReady } from '../ai.js';
import { browserSttSupported } from '../speech.js';

const GROUPS = [
  {
    title: '記憶する', sub: '忘却曲線に合わせた間隔反復（SRS）', modes: [
      { id: 'review', icon: 'repeat', title: '今日の復習', desc: '忘れかけた項目を最適なタイミングで出題', g: ['#ff7a59', '#ffb347'], href: '#/review', badge: () => dueCount() || '' },
      { id: 'learn', icon: 'sparkles', title: '新しく覚える', desc: '音声つきで覚えて、すぐ確認テスト', g: ['#5b8cff', '#22d3ee'], scope: { showKind: true, showCount: true, counts: [5, 10, 20] }, path: 'learn' },
      { id: 'blitz', icon: 'zap', title: 'スピード周回', desc: '60秒で大量に回す高速フラッシュ／タイムアタック', g: ['#f59e0b', '#ef4444'], href: '#/blitz' },
    ],
  },
  {
    title: 'クイズ', sub: '不正解の多いものほど多めに出題', modes: [
      { id: 'en2ja', icon: 'target', title: '意味を選ぶ', desc: '英語 → 日本語の4択', g: ['#10b981', '#3b82f6'], quiz: 'en2ja' },
      { id: 'ja2en', icon: 'translate', title: '英語を選ぶ', desc: '日本語 → 英語の4択', g: ['#06b6d4', '#6366f1'], quiz: 'ja2en' },
      { id: 'listen', icon: 'headphones', title: 'リスニング4択', desc: '音声だけで意味を当てる', g: ['#8b5cf6', '#ec4899'], quiz: 'listen' },
      { id: 'cloze', icon: 'edit', title: '例文の穴埋め', desc: '例文に合う単語を選ぶ', g: ['#84cc16', '#14b8a6'], quiz: 'cloze', kind: 'word' },
    ],
  },
  {
    title: '話す・聞く', sub: 'マイクで発音を判定（無料・端末の音声認識）', modes: [
      { id: 'read', icon: 'mic', title: '音読チェック', desc: '英文を読み上げて発音を採点', g: ['#ec4899', '#f43f5e'], speak: 'read' },
      { id: 'shadow', icon: 'wave', title: 'シャドーイング', desc: 'お手本を聞いてすぐ真似する', g: ['#a855f7', '#6366f1'], speak: 'shadow' },
      { id: 'compose', icon: 'zap', title: '瞬間英作文', desc: '日本語を見て英語で話す', g: ['#f97316', '#e11d48'], speak: 'compose', kind: 'phrase' },
      { id: 'dictation', icon: 'ear', title: 'ディクテーション', desc: '聞こえた英語を書き取る', g: ['#0ea5e9', '#22c55e'], path: 'dictation', scope: { showKind: true, counts: [10, 20] } },
    ],
  },
  {
    title: '実践トレーニング', sub: '本番を想定した会話練習', modes: [
      { id: 'roleplay', icon: 'users', title: '台本ロールプレイ', desc: '12の旅行シーンを音声で演じる（無料）', g: ['#14b8a6', '#3b82f6'], href: '#/roleplay' },
      { id: 'aichat', icon: 'bot', title: 'AI会話', desc: 'AIが店員役。ミッション達成で採点', g: ['#6366f1', '#a855f7'], href: '#/aichat', ai: true },
      { id: 'aiwrite', icon: 'pen', title: 'AI添削', desc: '英作文・スピーキングを点数化して添削', g: ['#d946ef', '#f43f5e'], href: '#/aiwrite', ai: true },
    ],
  },
];

export default {
  nav: 'study',
  render(el) {
    const ai = aiReady('explain') || aiReady('chat');
    el.innerHTML = `
      <div class="wrap">
        <header class="page-head"><h1>学習メニュー</h1><p class="muted">目的に合わせてトレーニングを選びましょう</p></header>
        ${!browserSttSupported ? `<div class="notice">${icon('info', 18)}<span>このブラウザは音声認識に未対応です。発音練習はキーボード入力（iPadはキーボードの🎤で音声入力）または AI文字起こし で行えます。</span></div>` : ''}
        ${GROUPS.map((g) => `
          <section class="mode-group">
            <div class="section-head"><h2>${g.title}</h2><span class="muted small">${g.sub}</span></div>
            <div class="mode-grid">
              ${g.modes.map((m) => {
                const b = m.badge?.();
                return `<button class="mode-card" data-id="${m.id}" style="--g1:${m.g[0]};--g2:${m.g[1]}">
                  <span class="mc-icon">${icon(m.icon, 26)}</span>
                  <span class="mc-text"><b>${m.title}</b><small>${m.desc}</small></span>
                  ${b ? `<span class="mc-badge">${b}</span>` : ''}
                  ${m.ai ? `<span class="mc-tag ${ai ? '' : 'off'}">AI</span>` : '<span class="mc-tag free">無料</span>'}
                </button>`;
              }).join('')}
            </div>
          </section>`).join('')}
      </div>`;

    el.addEventListener('click', async (e) => {
      const b = e.target.closest('.mode-card');
      if (!b) return;
      const m = GROUPS.flatMap((g) => g.modes).find((x) => x.id === b.dataset.id);
      if (m.href) return go(m.href);
      if (m.quiz) {
        const s = await pickScope({ title: m.title, showKind: !m.kind, defaultKind: m.kind || 'all' });
        if (s) go(`#/quiz?mode=${m.quiz}&scene=${s.scene}&kind=${s.kind}&count=${s.count}`);
        return;
      }
      if (m.speak) {
        const s = await pickScope({ title: m.title, showKind: !m.kind, defaultKind: m.kind || 'all', counts: [5, 10, 20] });
        if (s) go(`#/speak?mode=${m.speak}&scene=${s.scene}&kind=${s.kind}&count=${s.count}`);
        return;
      }
      if (m.path) {
        const s = await pickScope({ title: m.title, ...(m.scope || {}), allowNew: m.path === 'learn' });
        if (s) go(`#/${m.path}?scene=${s.scene}&kind=${s.kind}&count=${s.count}`);
      }
    });
  },
};
