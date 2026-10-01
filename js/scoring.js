// 発話・入力の採点（正規化 → 単語アラインメント → スコア）
import { esc } from './ui.js';

const CONTR = {
  "i'm": 'i am', "you're": 'you are', "we're": 'we are', "they're": 'they are', "he's": 'he is', "she's": 'she is', "it's": 'it is',
  "that's": 'that is', "what's": 'what is', "where's": 'where is', "there's": 'there is', "here's": 'here is', "how's": 'how is',
  "who's": 'who is', "let's": 'let us', "i've": 'i have', "you've": 'you have', "we've": 'we have', "they've": 'they have',
  "i'll": 'i will', "you'll": 'you will', "we'll": 'we will', "they'll": 'they will', "it'll": 'it will', "that'll": 'that will',
  "i'd": 'i would', "you'd": 'you would', "we'd": 'we would', "they'd": 'they would', "don't": 'do not', "doesn't": 'does not',
  "didn't": 'did not', "can't": 'can not', cannot: 'can not', "won't": 'will not', "isn't": 'is not', "aren't": 'are not',
  "wasn't": 'was not', "weren't": 'were not', "haven't": 'have not', "hasn't": 'has not', "hadn't": 'had not',
  "couldn't": 'could not', "wouldn't": 'would not', "shouldn't": 'should not', "mustn't": 'must not', "o'clock": 'oclock',
  gonna: 'going to', wanna: 'want to', gotta: 'got to',
};
const NUM = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
  forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const SYN = {
  okay: 'ok', colour: 'color', centre: 'center', theatre: 'theater', cancelled: 'canceled', travelling: 'traveling',
  favourite: 'favorite', grey: 'gray', programme: 'program', mr: 'mister', mrs: 'missus', st: 'street', ave: 'avenue',
  tshirt: 't shirt', percent: 'percent', '%': 'percent', 'e-mail': 'email', alright: 'all right', till: 'until',
};
const FILLERS = new Set(['um', 'uh', 'er', 'ah', 'hmm', 'erm', 'uhm', 'mm']);
const NUMWORD_RE = /^\d+$/;
// "the" に誤認されやすい "a"/"an" などはそのまま扱う

function normWord(w) {
  let s = w.toLowerCase().replace(/[’‘`´]/g, "'");
  s = s.replace(/^\$(\d+)/, '$1 dollars').replace(/(\d+)%/, '$1 percent');
  s = s.replace(/a\.m\.?/g, 'am').replace(/p\.m\.?/g, 'pm').replace(/wi-?fi/g, 'wifi').replace(/e-mail/g, 'email');
  s = s.replace(/(\d+):00/g, '$1').replace(/(\d+):(\d\d)/g, '$1 $2');
  s = s.replace(/[^a-z0-9'\s-]/g, ' ').replace(/-/g, ' ');
  const out = [];
  for (let t of s.split(/\s+/)) {
    if (!t) continue;
    t = t.replace(/^'+|'+$/g, '');
    if (!t) continue;
    if (CONTR[t]) { out.push(...CONTR[t].split(' ')); continue; }
    if (t.endsWith("'s")) t = t.slice(0, -2); // 所有格
    t = t.replace(/'/g, '');
    if (SYN[t] !== undefined) { if (SYN[t]) out.push(...SYN[t].split(' ')); continue; }
    if (NUM[t] !== undefined) { out.push(String(NUM[t])); continue; }
    out.push(t);
  }
  return out;
}

/** テキスト → {words(表示用), toks(正規化トークン), map(トークン→表示語index配列)} */
export function tokenize(text) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  let toks = [], map = [];
  words.forEach((w, i) => normWord(w).forEach((t) => { toks.push(t); map.push([i]); }));
  // 数字の結合: twenty five → 25、wi fi → wifi
  const t2 = [], m2 = [];
  for (let i = 0; i < toks.length; i++) {
    const a = toks[i], b = toks[i + 1];
    if (NUMWORD_RE.test(a) && b && NUMWORD_RE.test(b) && +a >= 20 && +a % 10 === 0 && +a < 100 && +b > 0 && +b < 10) {
      t2.push(String(+a + +b)); m2.push([...map[i], ...map[i + 1]]); i++; continue;
    }
    if (a === 'wi' && b === 'fi') { t2.push('wifi'); m2.push([...map[i], ...map[i + 1]]); i++; continue;}
    if (FILLERS.has(a)) continue;
    t2.push(a); m2.push(map[i]);
  }
  return { words, toks: t2, map: m2 };
}

function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
export function similarity(a, b) {
  if (!a && !b) return 1;
  return 1 - lev(a, b) / Math.max(a.length, b.length);
}

/** 単語レベルのアラインメント */
export function align(target, said) {
  const n = target.length, m = said.length;
  const D = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  const subCost = (i, j) => {
    const a = target[i], b = said[j];
    if (a === b) return 0;
    const sim = similarity(a, b);
    return sim >= 0.75 && a.length > 2 ? 0.35 : 1.1;
  };
  for (let i = 0; i <= n; i++) D[i][0] = i;
  for (let j = 0; j <= m; j++) D[0][j] = j * 0.8;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 0.8, D[i - 1][j - 1] + subCost(i - 1, j - 1));
    }
  }
  const ops = new Array(n);
  let extras = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const diag = i > 0 && j > 0 ? D[i - 1][j - 1] + subCost(i - 1, j - 1) : Infinity;
    const del = i > 0 ? D[i - 1][j] + 1 : Infinity;
    const ins = j > 0 ? D[i][j - 1] + 0.8 : Infinity;
    const best = Math.min(diag, del, ins);
    if (best === diag) {
      const c = subCost(i - 1, j - 1);
      ops[i - 1] = { t: c === 0 ? 'ok' : c < 1 ? 'near' : 'sub', said: said[j - 1] };
      i--; j--;
    } else if (best === del) {
      ops[i - 1] = { t: 'miss' };
      i--;
    } else {
      extras.unshift(said[j - 1]);
      j--;
    }
  }
  return { ops, extras };
}

function scoreOne(targetText, heardText) {
  const T = tokenize(targetText);
  const H = tokenize(heardText);
  if (!T.toks.length) return { score: 0, ops: [], extras: [], T, heard: heardText, target: targetText };
  const { ops, extras } = align(T.toks, H.toks);
  const ok = ops.filter((o) => o.t === 'ok').length;
  const near = ops.filter((o) => o.t === 'near').length;
  let score = ((ok + near * 0.6) / T.toks.length) * 100;
  score -= Math.min(15, extras.length * 4);
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, ops, extras, T, heard: heardText, target: targetText };
}

/** 複数の正解候補 × 複数の認識候補 から最良のスコアを返す */
export function scoreAgainst(targets, heards) {
  let best = null;
  for (const t of targets) for (const h of heards) {
    if (!h) continue;
    const r = scoreOne(t, h);
    if (!best || r.score > best.score) best = r;
  }
  return best || scoreOne(targets[0], '');
}

/** 正解文を、単語ごとに色分けした HTML にする */
export function diffHTML(res) {
  if (!res?.T) return '';
  const status = res.T.words.map(() => 'ok');
  const heardOf = res.T.words.map(() => '');
  const rank = { ok: 0, near: 1, sub: 2, miss: 3 };
  res.ops.forEach((op, k) => {
    if (!op) return;
    res.T.map[k].forEach((wi) => {
      if (rank[op.t] > rank[status[wi]]) { status[wi] = op.t; heardOf[wi] = op.said || ''; }
    });
  });
  const words = res.T.words.map((w, i) => {
    const st = status[i];
    const tip = st === 'near' || st === 'sub' ? ` title="聞こえた: ${esc(heardOf[i])}"` : st === 'miss' ? ' title="聞き取れず"' : '';
    return `<span class="dw ${st}"${tip}>${esc(w)}</span>`;
  }).join(' ');
  return words;
}

export function scoreComment(score, pass) {
  if (score >= 98) return { label: 'Perfect!', emoji: '🌟', cls: 'great' };
  if (score >= 90) return { label: 'Excellent!', emoji: '🎉', cls: 'great' };
  if (score >= pass) return { label: 'Good!', emoji: '👍', cls: 'good' };
  if (score >= pass - 20) return { label: 'あと少し！', emoji: '💪', cls: 'close' };
  return { label: 'もう一度！', emoji: '🔁', cls: 'bad' };
}

/** 2つの文の差分（添削表示用）: ユーザー文 → 修正文 */
export function textDiffHTML(from, to) {
  const A = String(from).trim().split(/\s+/).filter(Boolean);
  const B = String(to).trim().split(/\s+/).filter(Boolean);
  const key = (w) => w.toLowerCase().replace(/[^a-z0-9']/g, '');
  const n = A.length, m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = key(A[i]) === key(B[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (key(A[i]) === key(B[j])) { out.push(`<span class="tw same">${esc(B[j])}</span>`); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { out.push(`<span class="tw del">${esc(A[i])}</span>`); i++; }
    else { out.push(`<span class="tw add">${esc(B[j])}</span>`); j++; }
  }
  while (i < n) out.push(`<span class="tw del">${esc(A[i++])}</span>`);
  while (j < m) out.push(`<span class="tw add">${esc(B[j++])}</span>`);
  return out.join(' ');
}
