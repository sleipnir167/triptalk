// 間隔反復（FSRS-4.5 ベース）— 忘却曲線に合わせて次の復習日を決める
import { state, save } from './store.js';
import { allItems } from './content.js';

export const DAY = 864e5;
const MIN = 6e4;
const W = [0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0234, 1.616, 0.1544, 1.0824, 1.9813, 0.0953, 0.2975, 2.2042, 0.2407, 2.9466];
const DECAY = -0.5;
const FACTOR = 19 / 81; // R(S) = 0.9 となる係数

// st: 0=新規, 1=学習中, 2=復習, 3=再学習
export const GRADE = { AGAIN: 1, HARD: 2, GOOD: 3, EASY: 4 };

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const initD = (g) => clamp(W[4] - (g - 3) * W[5], 1, 10);
const initS = (g) => W[g - 1];

function nextD(d, g) {
  const d1 = d - W[6] * (g - 3);
  return clamp(W[7] * initD(4) + (1 - W[7]) * d1, 1, 10);
}
function recallS(d, s, r, g) {
  const hard = g === 2 ? W[15] : 1;
  const easy = g === 4 ? W[16] : 1;
  return s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp((1 - r) * W[10]) - 1) * hard * easy);
}
function forgetS(d, s, r) {
  return Math.min(s, W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp((1 - r) * W[14]));
}

/** 保持率（忘れていない確率）0..1 */
export function retrievability(card, now = Date.now()) {
  if (!card || !card.s || !card.last) return 0;
  const t = Math.max(0, (now - card.last) / DAY);
  return Math.pow(1 + FACTOR * t / card.s, DECAY);
}

/** 保持率 r に下がるまでの日数 */
export function intervalDays(s, r = state.settings.retention || 0.9) {
  return (s / FACTOR) * (Math.pow(r, 1 / DECAY) - 1);
}

/** カードに評価 g を適用した新しいカードを返す（純関数） */
export function schedule(card, g, now = Date.now()) {
  const c = card ? { ...card } : { st: 0, reps: 0, lapses: 0, ok: 0, ng: 0 };
  const isNew = !c.reps || !c.s;
  if (isNew) {
    c.s = initS(g);
    c.d = initD(g);
  } else {
    const r = retrievability(c, now);
    c.d = nextD(c.d, g);
    if (g === 1) {
      c.s = Math.max(0.1, forgetS(c.d, c.s, r));
      c.lapses = (c.lapses || 0) + 1;
    } else {
      c.s = recallS(c.d, c.s, r, g);
    }
  }
  c.reps = (c.reps || 0) + 1;
  c.last = now;
  if (g === 1) {
    c.st = isNew || c.st < 2 ? 1 : 3;
    c.due = now + MIN; // セッション内で再出題
  } else if (g === 2 && isNew) {
    c.st = 1;
    c.due = now + 10 * MIN;
  } else {
    c.st = 2;
    const ivl = Math.min(36500, Math.max(1, Math.round(intervalDays(c.s))));
    // 同じ日に一斉に来ないよう小さな揺らぎを入れる
    const fuzz = ivl >= 3 ? Math.round((Math.random() - 0.5) * Math.min(ivl * 0.1, 4)) : 0;
    c.due = now + (ivl + fuzz) * DAY;
  }
  return c;
}

/** 各評価ボタンを押したときの次回までの時間(ms) */
export function preview(card, now = Date.now()) {
  const out = {};
  for (const g of [1, 2, 3, 4]) out[g] = schedule(card, g, now).due - now;
  return out;
}

/** 評価を記録して保存 */
export function review(id, g, { ok = g >= 2 } = {}) {
  const now = Date.now();
  const prev = state.progress[id];
  const wasNew = !prev?.reps;
  const c = schedule(prev, g, now);
  if (ok) c.ok = (c.ok || 0) + 1;
  else { c.ng = (c.ng || 0) + 1; c.lastNg = now; }
  c.streak = ok ? (c.streak || 0) + 1 : 0;
  state.progress[id] = c;
  save('progress');
  return { card: c, wasNew };
}

export function resetCard(id) {
  delete state.progress[id];
  save('progress');
}

export function getCard(id) {
  return state.progress[id];
}

function endOfToday(now) {
  const d = new Date(now); d.setHours(23, 59, 59, 999);
  return d.getTime();
}
/** 期限判定: 学習中は時刻どおり、復習カードは「期限日が今日以前」なら出題（朝にまとめて復習できる） */
export function isDue(c, now = Date.now()) {
  if (!c?.reps) return false;
  if (c.due <= now) return true;
  return c.st === 2 && c.due <= endOfToday(now) && now - c.last > 12 * 3600e3;
}

/** 期限が来ている復習アイテム（忘れかけている順） */
export function dueItems(now = Date.now()) {
  return allItems()
    .filter((it) => isDue(state.progress[it.id], now))
    .sort((a, b) => retrievability(state.progress[a.id], now) - retrievability(state.progress[b.id], now));
}

export function dueCount(now = Date.now()) {
  let n = 0;
  for (const it of allItems()) if (isDue(state.progress[it.id], now)) n++;
  return n;
}

export function nextDueTime() {
  let t = Infinity;
  for (const c of Object.values(state.progress)) if (c?.reps && c.due < t) t = c.due;
  return t;
}

/** 習熟度: 0未学習 1学習中 2定着中 3習得 */
export function mastery(card) {
  if (!card?.reps) return 0;
  if (card.st === 1 || card.st === 3 || card.s < 3) return 1;
  if (card.s < 21) return 2;
  return 3;
}
export const MASTERY_LABEL = ['未学習', '学習中', '定着中', '習得'];

/** 出題の重み — 不正解が多い・忘れかけているものほど大きい */
export function weight(it, now = Date.now()) {
  const c = state.progress[it.id];
  if (!c?.reps) return 1.2;
  const r = retrievability(c, now);
  const err = ((c.ng || 0) + 1) / ((c.ok || 0) + (c.ng || 0) + 2);
  let w = 0.35 + (1 - r) * 2.2 + err * 2.5 + Math.min(c.lapses || 0, 5) * 0.35;
  if (c.lastNg && now - c.lastNg < 3 * DAY) w += 1.2;
  if (c.s > 60) w *= 0.5;
  return w;
}

/** 重み付きランダム抽出（重複なし） */
export function pickWeighted(items, n, now = Date.now()) {
  return items
    .map((it) => ({ it, k: Math.pow(Math.random(), 1 / Math.max(0.01, weight(it, now))) }))
    .sort((a, b) => b.k - a.k)
    .slice(0, n)
    .map((x) => x.it);
}

/** 今後 n 日間の復習予定数 */
export function forecast(days = 14, now = Date.now()) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const out = new Array(days).fill(0);
  for (const c of Object.values(state.progress)) {
    if (!c?.reps) continue;
    const idx = Math.max(0, Math.floor((c.due - start.getTime()) / DAY));
    if (idx < days) out[idx]++;
  }
  return out;
}

/** 学習済みアイテムの平均保持率 */
export function avgRetention(now = Date.now()) {
  const cs = Object.values(state.progress).filter((c) => c?.reps);
  if (!cs.length) return 0;
  return cs.reduce((a, c) => a + retrievability(c, now), 0) / cs.length;
}
