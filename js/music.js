// オルゴールBGM（このアプリのためのオリジナルのワルツ。Web Audio で合成）
//  ホーム・記録などの画面だけで流し、学習中（読み上げ・マイク）は止める
import { state } from './store.js';

// [MIDIノート, 拍] （3/4拍子、0 は休符）
const MELODY = [
  [76, 1], [79, 1], [84, 1], [83, 2], [79, 1], [81, 1], [84, 1], [88, 1], [86, 3],
  [84, 1], [81, 1], [77, 1], [76, 2], [79, 1], [74, 1], [77, 1], [83, 1], [84, 3],
  [79, 1], [88, 1], [86, 1], [84, 2], [81, 1], [77, 1], [81, 1], [86, 1], [83, 3],
  [81, 1], [79, 1], [77, 1], [76, 1], [79, 1], [84, 1], [86, 1], [83, 1], [79, 1], [84, 3],
];
// 各小節の和音（ベース, 3度, 5度）
const CHORDS = [
  [48, 64, 67], [55, 62, 67], [57, 64, 69], [55, 62, 67], [53, 65, 69], [48, 64, 67], [55, 62, 65], [48, 64, 67],
  [52, 64, 67], [57, 64, 69], [50, 65, 69], [55, 62, 67], [53, 65, 69], [48, 64, 67], [55, 62, 65], [48, 64, 67],
];
const BEAT = 0.5; // 秒
const N = (n) => 440 * Math.pow(2, (n - 69) / 12);

let ctx = null, out = null, timer = null, playing = false, nextTime = 0, mi = 0, beatInBar = 0, bar = 0, pausedBy = new Set();

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    out = ctx.createGain();
    out.gain.value = 0;
    out.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// オルゴールの音（短く減衰する金属的な音）
function pluck(freq, t, vol) {
  for (const [mult, v, dur] of [[1, 1, 1.6], [2, 0.25, 0.7], [3.01, 0.08, 0.35]]) {
    if (freq * mult > 9000) continue;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq * mult;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.05);
  }
}

function schedule() {
  while (nextTime < ctx.currentTime + 0.6) {
    const [note, beats] = MELODY[mi];
    if (note) pluck(N(note), nextTime, 0.5);
    // 小節の頭でベース、2・3拍目で和音
    for (let b = 0; b < beats; b++) {
      const t = nextTime + b * BEAT;
      const ch = CHORDS[bar % CHORDS.length];
      if (beatInBar === 0) pluck(N(ch[0]), t, 0.3);
      else { pluck(N(ch[1]), t, 0.12); pluck(N(ch[2]), t, 0.12); }
      beatInBar++;
      if (beatInBar === 3) { beatInBar = 0; bar++; }
    }
    nextTime += beats * BEAT;
    mi = (mi + 1) % MELODY.length;
    if (mi === 0) { bar = 0; beatInBar = 0; nextTime += BEAT * 2; }
  }
}

function fade(to, sec = 0.8) {
  if (!ctx) return;
  const g = out.gain;
  g.cancelScheduledValues(ctx.currentTime);
  g.setValueAtTime(g.value, ctx.currentTime);
  g.linearRampToValueAtTime(to, ctx.currentTime + sec);
}

const volume = () => 0.09 * (state.settings.sfxVolume ?? 0.7) / 0.7;

export const bgm = {
  get on() { return !!state.settings.bgm; },
  get playing() { return playing; },
  start() {
    if (!this.on || playing || pausedBy.size) return;
    if (!ensure()) return;
    playing = true;
    nextTime = ctx.currentTime + 0.1;
    schedule();
    timer = setInterval(schedule, 200);
    fade(volume(), 1.2);
  },
  stop(sec = 0.6) {
    if (!playing) return;
    playing = false;
    fade(0, sec);
    clearInterval(timer);
    setTimeout(() => { if (!playing) { mi = 0; bar = 0; beatInBar = 0; } }, sec * 1000);
  },
  /** iOS は最初のタップまで音を出せないので、タップのたびに起こす */
  kick() {
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (wantBgm && this.on && !playing && !pausedBy.size) this.start();
  },
  /** 読み上げ・マイクのあいだは一時停止 */
  pause(reason) { pausedBy.add(reason); this.stop(0.3); },
  resume(reason) { pausedBy.delete(reason); if (!pausedBy.size && wantBgm) this.start(); },
};

// 画面ごとに流すかどうか（router から呼ぶ）
let wantBgm = false;
export function setBgmScreen(allowed) {
  wantBgm = allowed;
  if (allowed) bgm.start(); else bgm.stop();
}
