// ゲーミフィケーション: XP・レベル・連続記録・パスポートスタンプ（バッジ）
import { state, save } from './store.js';
import { bus } from './bus.js';
import { todayKey, modal, toast, esc } from './ui.js';
import { sfx } from './sfx.js';
import { confetti, floatText } from './fx.js';
import { review } from './srs.js';
import { scenes, sceneItems } from './content.js';

export const TITLES = [
  [1, '旅の準備中', '🧳'], [3, 'はじめての海外', '🎫'], [5, 'ツーリスト', '📸'], [8, 'バックパッカー', '🎒'],
  [12, 'トラベラー', '🧭'], [16, 'ワールドトラベラー', '🌏'], [20, 'グローバル・ノマド', '🛫'], [25, '旅の達人', '🗺️'],
  [30, '地球の住人', '🌍'], [40, '伝説の旅人', '👑'],
];

export const xpForLevel = (L) => 30 * (L - 1) * L; // 累計XP

export function levelInfo(xp = state.stats.xp || 0) {
  let L = 1;
  while (xp >= xpForLevel(L + 1)) L++;
  const cur = xp - xpForLevel(L);
  const need = xpForLevel(L + 1) - xpForLevel(L);
  const t = [...TITLES].reverse().find(([lv]) => L >= lv) || TITLES[0];
  return { level: L, cur, need, pct: cur / need, title: t[1], emoji: t[2] };
}

export function dayRec(key = todayKey()) {
  state.stats.days[key] ||= { xp: 0, n: 0, ok: 0, ng: 0, newc: 0, sp: 0, spOk: 0, t: 0 };
  return state.stats.days[key];
}

export function streak() {
  const days = state.stats.days;
  const d = new Date();
  let n = 0;
  if (!(days[todayKey(d)]?.xp > 0)) d.setDate(d.getDate() - 1);
  while (days[todayKey(d)]?.xp > 0) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

const queue = [];
export function queueCelebration(fn) { queue.push(fn); }
export async function flushCelebrations() {
  checkBadges();
  while (queue.length) { const fn = queue.shift(); await fn(); }
}

export function addXP(n, anchor) {
  if (!n) return;
  const before = levelInfo().level;
  const d = dayRec();
  const goal = state.settings.dailyGoalXP;
  const wasBelow = d.xp < goal;
  d.xp += n;
  state.stats.xp = (state.stats.xp || 0) + n;
  save('stats');
  if (anchor) floatText(`+${n} XP`, anchor, 'xp');
  const after = levelInfo();
  if (after.level > before) queueCelebration(() => celebrateLevel(after));
  if (wasBelow && d.xp >= goal) {
    sfx.play('goal');
    toast('今日の目標を達成しました！', { emoji: '🎯', type: 'success' });
    state.stats.counters.goals = (state.stats.counters.goals || 0) + 1;
  }
  bus.emit('xp');
}

export function bump(counter, n = 1) {
  state.stats.counters[counter] = (state.stats.counters[counter] || 0) + n;
  save('stats');
}

export function addStudyTime(sec) {
  if (!(sec > 0)) return;
  // 開いたまま放置した時間を数えすぎないよう、1回あたり30分まで
  dayRec().t += Math.round(Math.min(sec, 1800));
  save('stats');
}

/** 回答を記録（SRS更新 + 統計 + XP） */
export function recordAnswer(item, { ok, grade, xp = 0, anchor, speak = false } = {}) {
  const g = grade ?? (ok ? 3 : 1);
  const { wasNew } = review(item.id, g, { ok });
  const d = dayRec();
  d.n++;
  ok ? d.ok++ : d.ng++;
  if (wasNew) d.newc++;
  if (speak) { d.sp++; if (ok) { d.spOk++; bump('speakPass'); } }
  bump('answers');
  if (ok) bump('correct');
  save('stats');
  addXP(xp, anchor);
}

async function celebrateLevel(info) {
  sfx.play('levelup');
  confetti({ count: 180 });
  await modal({
    cls: 'celebrate',
    body: `<div class="celebrate-box">
      <div class="celebrate-kicker">LEVEL UP!</div>
      <div class="celebrate-level"><span>Lv.</span>${info.level}</div>
      <div class="celebrate-title">${info.emoji} ${esc(info.title)}</div>
      <p class="muted">この調子で旅の準備を続けましょう！</p>
    </div>`,
    actions: [{ label: 'やったね！', cls: 'btn-primary btn-block', value: true }],
  });
}

// ---- パスポートスタンプ ----
const sceneMastered = (sid) => {
  const items = sceneItems(sid);
  if (!items.length) return false;
  const good = items.filter((it) => (state.progress[it.id]?.s || 0) >= 7).length;
  return good / items.length >= 0.8;
};
const seenCount = () => Object.values(state.progress).filter((c) => c?.reps).length;
const C = (k) => state.stats.counters[k] || 0;

export function badgeDefs() {
  const list = [
    { id: 'first', emoji: '🛫', name: 'First Flight', desc: 'はじめて学習した', color: '#5b8cff', test: () => C('answers') >= 1 },
    { id: 'streak3', emoji: '🔥', name: '3-Day Trip', desc: '3日連続で学習', color: '#ff7a59', test: () => streak() >= 3 },
    { id: 'streak7', emoji: '🗓️', name: 'One Week', desc: '7日連続で学習', color: '#f43f5e', test: () => streak() >= 7 },
    { id: 'streak30', emoji: '🏆', name: 'Long Stay', desc: '30日連続で学習', color: '#eab308', test: () => streak() >= 30 },
    { id: 'seen50', emoji: '📗', name: '50 Words', desc: '50項目を学習', color: '#10b981', test: () => seenCount() >= 50 },
    { id: 'seen200', emoji: '📚', name: '200 Words', desc: '200項目を学習', color: '#0ea5e9', test: () => seenCount() >= 200 },
    { id: 'seenAll', emoji: '🎓', name: 'Completed', desc: 'すべての項目を学習', color: '#a855f7', test: () => seenCount() >= 450 },
    { id: 'speak20', emoji: '🎤', name: 'First Words', desc: 'スピーキング合格 20回', color: '#ec4899', test: () => C('speakPass') >= 20 },
    { id: 'speak100', emoji: '🗣️', name: 'Speaker', desc: 'スピーキング合格 100回', color: '#8b5cf6', test: () => C('speakPass') >= 100 },
    { id: 'blitz', emoji: '⚡', name: 'Speed Runner', desc: 'スピード周回で30枚以上', color: '#f59e0b', test: () => (state.stats.best.blitzCards || 0) >= 30 },
    { id: 'blitzq', emoji: '🎯', name: 'Sharp Shooter', desc: '4択タイムアタックで300点', color: '#06b6d4', test: () => (state.stats.best.blitzQuiz || 0) >= 300 },
    { id: 'perfect', emoji: '💯', name: 'Perfect', desc: 'クイズで全問正解', color: '#22c55e', test: () => C('perfect') >= 1 },
    { id: 'roleplay', emoji: '🎭', name: 'Actor', desc: '台本ロールプレイを5つクリア', color: '#14b8a6', test: () => Object.keys(state.stats.roleplay || {}).length >= 5 },
    { id: 'aichat', emoji: '🤖', name: 'Conversation', desc: 'AI会話を完了', color: '#6366f1', test: () => C('aiChats') >= 1 },
    { id: 'mission', emoji: '🎖️', name: 'Mission Clear', desc: 'AI会話のミッションを5回達成', color: '#d946ef', test: () => C('missions') >= 5 },
    { id: 'writer', emoji: '✍️', name: 'Writer', desc: 'AI添削を10回受けた', color: '#84cc16', test: () => C('aiWrites') >= 10 },
    { id: 'goal10', emoji: '🎯', name: 'On Target', desc: '1日の目標を10回達成', color: '#fb7185', test: () => C('goals') >= 10 },
    { id: 'night', emoji: '🌙', name: 'Red-eye', desc: '23時以降に学習', color: '#64748b', test: () => C('night') >= 1 },
    { id: 'early', emoji: '🌅', name: 'Early Bird', desc: '朝6時台までに学習', color: '#f97316', test: () => C('early') >= 1 },
  ];
  for (const sc of scenes({ withCustom: false })) {
    list.push({ id: 'scene-' + sc.id, emoji: sc.emoji, name: sc.en.toUpperCase(), desc: `「${sc.name}」の80%を定着`, color: sc.grad[0], scene: true, test: () => sceneMastered(sc.id) });
  }
  return list;
}

export function checkBadges() {
  const h = new Date().getHours();
  if (dayRec().n > 0) {
    if (h >= 23 && !C('night')) bump('night');
    if (h < 7 && h >= 3 && !C('early')) bump('early');
  }
  const got = state.stats.badges;
  for (const b of badgeDefs()) {
    if (got[b.id]) continue;
    let ok = false;
    try { ok = b.test(); } catch {}
    if (ok) {
      got[b.id] = Date.now();
      save('stats');
      queueCelebration(() => celebrateBadge(b));
    }
  }
}

export function stampHTML(b, earned, i = 0) {
  const rot = ((i * 37) % 17) - 8;
  return `<div class="stamp ${earned ? '' : 'locked'}" style="--c:${earned ? b.color : 'var(--muted)'};--r:${rot}deg" title="${esc(b.desc)}">
    <div class="stamp-inner">
      <small>${earned ? 'TRIPTALK' : 'LOCKED'}</small>
      <span class="stamp-emoji">${earned ? b.emoji : '？'}</span>
      <b>${esc(b.name)}</b>
      ${earned ? `<small>${new Date(earned).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}</small>` : ''}
    </div>
  </div>`;
}

async function celebrateBadge(b) {
  sfx.play('badge');
  confetti({ count: 90, spread: 0.7 });
  await modal({
    cls: 'celebrate',
    body: `<div class="celebrate-box">
      <div class="celebrate-kicker">NEW STAMP!</div>
      <div class="stamp-drop">${stampHTML(b, Date.now())}</div>
      <div class="celebrate-title">${esc(b.desc)}</div>
      <p class="muted">パスポートにスタンプが押されました</p>
    </div>`,
    actions: [{ label: 'OK', cls: 'btn-primary btn-block', value: true }],
  });
}
