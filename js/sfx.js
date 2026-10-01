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

const SOUNDS = {
  tap() { tone(N(84), { dur: 0.05, vol: 0.08, type: 'sine' }); },
  select() { tone(N(79), { dur: 0.07, vol: 0.12, type: 'triangle' }); },
  flip() { noise({ dur: 0.18, vol: 0.09, from: 600, to: 4000 }); },
  whoosh() { noise({ dur: 0.32, vol: 0.12, from: 300, to: 5000, q: 0.8 }); },
  correct() {
    tone(N(81), { dur: 0.12, vol: 0.22, type: 'triangle' });
    tone(N(88), { dur: 0.22, vol: 0.22, type: 'triangle', delay: 0.08 });
    tone(N(100), { dur: 0.18, vol: 0.05, type: 'sine', delay: 0.08 });
  },
  wrong() {
    tone(N(52), { dur: 0.16, vol: 0.18, type: 'sawtooth', filter: 900 });
    tone(N(48), { dur: 0.26, vol: 0.18, type: 'sawtooth', filter: 700, delay: 0.12 });
  },
  soft() { tone(N(72), { dur: 0.12, vol: 0.12, type: 'sine' }); tone(N(76), { dur: 0.16, vol: 0.1, type: 'sine', delay: 0.07 }); },
  combo(n = 1) {
    const base = 76 + Math.min(n, 12);
    [0, 4, 7].forEach((iv, i) => tone(N(base + iv), { dur: 0.1, vol: 0.14, type: 'square', filter: 3000, delay: i * 0.05 }));
  },
  levelup() {
    [72, 76, 79, 84, 88, 91, 96].forEach((n, i) => tone(N(n), { dur: 0.22, vol: 0.18, type: 'triangle', delay: i * 0.075 }));
    [84, 88, 91].forEach((n) => tone(N(n), { dur: 0.9, vol: 0.08, type: 'sine', delay: 0.55 }));
  },
  badge() {
    for (let i = 0; i < 8; i++) tone(N(88 + ((i * 5) % 12)), { dur: 0.12, vol: 0.09, type: 'sine', delay: i * 0.045 });
    tone(N(96), { dur: 0.6, vol: 0.1, type: 'triangle', delay: 0.38 });
  },
  start() { tone(N(67), { dur: 0.1, vol: 0.15, type: 'triangle' }); tone(N(74), { dur: 0.16, vol: 0.16, type: 'triangle', delay: 0.09 }); },
  finish() {
    [67, 72, 76].forEach((n, i) => tone(N(n), { dur: 0.16, vol: 0.16, type: 'triangle', delay: i * 0.11 }));
    tone(N(79), { dur: 0.5, vol: 0.18, type: 'triangle', delay: 0.33 });
    tone(N(84), { dur: 0.5, vol: 0.08, type: 'sine', delay: 0.33 });
  },
  tick() { tone(N(96), { dur: 0.03, vol: 0.08, type: 'square', filter: 5000 }); },
  go() { tone(N(84), { dur: 0.3, vol: 0.18, type: 'triangle' }); },
  micOn() { tone(N(76), { dur: 0.07, vol: 0.12 }); tone(N(83), { dur: 0.1, vol: 0.12, delay: 0.06 }); },
  micOff() { tone(N(83), { dur: 0.07, vol: 0.1 }); tone(N(76), { dur: 0.1, vol: 0.1, delay: 0.06 }); },
  pop() { tone(N(70), { dur: 0.08, vol: 0.15, slide: 2.2 }); },
  message() { tone(N(81), { dur: 0.08, vol: 0.1, type: 'sine' }); tone(N(86), { dur: 0.12, vol: 0.1, type: 'sine', delay: 0.06 }); },
  goal() {
    [72, 79, 84, 88].forEach((n, i) => tone(N(n), { dur: 0.18, vol: 0.15, type: 'triangle', delay: i * 0.09 }));
  },
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
