// 効果音（Web Audio API で合成。音声ファイル不要・オフラインOK）
import { state } from './store.js';

let ctx = null;
let master = null;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  master.gain.value = state.settings.sfxVolume ?? 0.7;
  return ctx;
}

/** iOS は最初のタップで AudioContext を起こす必要がある */
export function unlockAudio() {
  const c = ac();
  if (!c) return;
  const b = c.createBuffer(1, 1, 22050);
  const s = c.createBufferSource();
  s.buffer = b; s.connect(master); s.start(0);
}

function tone(freq, { type = 'sine', dur = 0.14, vol = 0.25, delay = 0, attack = 0.006, slide = 0, filter = 0 } = {}) {
  const c = ctx; const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (filter) {
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter;
    o.connect(f); node = f;
  }
  node.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

function noise({ dur = 0.25, vol = 0.12, from = 800, to = 3000, delay = 0, q = 1.2 } = {}) {
  const c = ctx; const t = c.currentTime + delay;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource(); s.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
  f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t); s.stop(t + dur + 0.05);
}

const N = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI → Hz

/** ベルのような音（基音＋非整数倍音で「キラン」と響く） */
function bell(freq, { dur = 0.6, vol = 0.16, delay = 0 } = {}) {
  tone(freq, { type: 'sine', dur, vol, delay, attack: 0.003 });
  // 高すぎる倍音は耳障り・折り返しノイズになるので省く
  if (freq * 2.76 < 12000) tone(freq * 2.76, { type: 'sine', dur: dur * 0.45, vol: vol * 0.35, delay, attack: 0.002 });
  if (freq * 5.4 < 12000) tone(freq * 5.4, { type: 'sine', dur: dur * 0.25, vol: vol * 0.12, delay, attack: 0.002 });
}
/** ハープのようなグリッサンド */
function harp(notes, { step = 0.045, vol = 0.12, delay = 0 } = {}) {
  notes.forEach((n, i) => tone(N(n), { type: 'triangle', dur: 0.5, vol, delay: delay + i * step, attack: 0.004 }));
}
const PENTA = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96];

const SOUNDS = {
  tap() { tone(N(96), { dur: 0.04, vol: 0.05, type: 'sine' }); },
  select() { bell(N(88), { dur: 0.25, vol: 0.08 }); },
  flip() { noise({ dur: 0.2, vol: 0.06, from: 2000, to: 8000 }); bell(N(93), { dur: 0.3, vol: 0.05, delay: 0.05 }); },
  whoosh() { noise({ dur: 0.32, vol: 0.1, from: 400, to: 6000, q: 0.8 }); },
  correct() {
    bell(N(84), { dur: 0.45, vol: 0.15 });
    bell(N(91), { dur: 0.6, vol: 0.15, delay: 0.07 });
    [96, 100, 103].forEach((n, i) => tone(N(n), { dur: 0.12, vol: 0.035, delay: 0.14 + i * 0.04 }));
  },
  wrong() {
    tone(N(64), { dur: 0.22, vol: 0.13, type: 'sine', slide: 0.75 });
    tone(N(59), { dur: 0.3, vol: 0.1, type: 'triangle', delay: 0.14, slide: 0.8 });
  },
  soft() { bell(N(79), { dur: 0.35, vol: 0.09 }); bell(N(84), { dur: 0.4, vol: 0.08, delay: 0.08 }); },
  combo(n = 1) {
    const k = Math.min(n, 8);
    harp(PENTA.slice(k % 4, (k % 4) + 4), { step: 0.04, vol: 0.1 });
    bell(N(91 + (k % 5)), { dur: 0.5, vol: 0.1, delay: 0.16 });
  },
  levelup() {
    harp(PENTA.concat([98, 100, 103]), { step: 0.05, vol: 0.11 });
    [84, 88, 91, 96].forEach((n) => bell(N(n), { dur: 1.4, vol: 0.07, delay: 0.7 }));
  },
  badge() {
    for (let i = 0; i < 9; i++) tone(N(91 + ((i * 7) % 12)), { dur: 0.14, vol: 0.06, type: 'sine', delay: i * 0.05 });
    bell(N(96), { dur: 1, vol: 0.12, delay: 0.45 });
  },
  start() { harp([79, 84, 88, 91], { step: 0.06, vol: 0.1 }); },
  finish() {
    harp([72, 76, 79, 84, 88, 91], { step: 0.07, vol: 0.11 });
    bell(N(96), { dur: 1.1, vol: 0.12, delay: 0.45 });
    bell(N(91), { dur: 1.1, vol: 0.08, delay: 0.45 });
  },
  tick() { tone(N(98), { dur: 0.03, vol: 0.06, type: 'square', filter: 6000 }); },
  go() { bell(N(96), { dur: 0.6, vol: 0.16 }); },
  micOn() { bell(N(84), { dur: 0.18, vol: 0.08 }); bell(N(91), { dur: 0.22, vol: 0.08, delay: 0.06 }); },
  micOff() { bell(N(91), { dur: 0.18, vol: 0.07 }); bell(N(84), { dur: 0.22, vol: 0.07, delay: 0.06 }); },
  pop() { tone(N(86), { dur: 0.08, vol: 0.1, slide: 1.8 }); bell(N(98), { dur: 0.3, vol: 0.05, delay: 0.04 }); },
  message() { bell(N(88), { dur: 0.3, vol: 0.08 }); bell(N(93), { dur: 0.35, vol: 0.07, delay: 0.07 }); },
  goal() { harp([84, 88, 91, 96, 100], { step: 0.06, vol: 0.12 }); bell(N(103), { dur: 1, vol: 0.08, delay: 0.32 }); },
};

export const sfx = {
  play(name, arg) {
    if (!state.settings.sfx) return;
    try { if (!ac()) return; SOUNDS[name]?.(arg); } catch (e) { /* noop */ }
  },
};

export function haptic(ms = 12) {
  try { navigator.vibrate?.(ms); } catch {}
}
