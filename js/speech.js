// 音声合成（TTS）と音声認識（STT）
import { state } from './store.js';
import { startRecording, blobToWavBase64, recorderSupported } from './recorder.js';
import { aiTranscribe, aiSttReady } from './ai.js';
import { bgm } from './music.js';

// ================= TTS =================
const synth = window.speechSynthesis;
let voices = [];
export const ttsSupported = !!synth;

export function initVoices() {
  if (!synth) return;
  const load = () => { voices = synth.getVoices(); };
  load();
  synth.addEventListener?.('voiceschanged', load);
  synth.onvoiceschanged = load;
}

const NOVELTY = /(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Junior|Ralph|Fred|Kathy|Hysterical|Deranged|Grandma|Grandpa|Rocko|Shelley|Flo|Eddy|Reed|Sandy)/i;

export function englishVoices() {
  return voices.filter((v) => /^en[-_]/i.test(v.lang)).sort((a, b) => voiceScore(b) - voiceScore(a));
}

function voiceScore(v) {
  let s = 0;
  if (/premium|enhanced|natural|neural/i.test(v.name)) s += 4;
  if (/Samantha|Ava|Allison|Susan|Zoe|Evan|Nathan|Daniel|Karen|Moira|Google US English|Google UK English/i.test(v.name)) s += 2;
  if (v.localService) s += 1;
  if (NOVELTY.test(v.name)) s -= 10;
  return s;
}

export function pickVoice(lang = state.settings.accent) {
  if (!voices.length && synth) voices = synth.getVoices();
  const pref = state.settings.ttsVoice;
  if (pref) { const v = voices.find((x) => x.voiceURI === pref); if (v) return v; }
  const norm = (l) => l.replace('_', '-').toLowerCase();
  const cands = voices.filter((v) => norm(v.lang).startsWith(lang.toLowerCase()));
  const pool = cands.length ? cands : voices.filter((v) => /^en/i.test(v.lang));
  return pool.sort((a, b) => voiceScore(b) - voiceScore(a))[0] || null;
}

// 会話の相手役は性別に合う声で話す（見つからなければ同じ声で高さを変える）
const MALE = /aaron|alex\b|arthur|daniel|gordon|oliver|rishi|\bmale|guy|david|mark|james|george|tom\b|evan|nathan|thomas|lee\b|christopher|eric|roger|brian|andrew|ryan|guy/i;
const FEMALE = /samantha|karen|moira|tessa|victoria|nicky|allison|ava|susan|zoe|female|zira|aria|jenny|serena|kate|fiona|martha|catherine|joanna|salli|kendra|emma|libby|sonia|natasha|michelle|clara|olivia|google us english/i;

export function voiceFor(gender = 'F', lang = state.settings.accent) {
  if (!voices.length && synth) voices = synth.getVoices();
  const norm = (l) => l.replace('_', '-').toLowerCase();
  const en = voices.filter((v) => /^en/i.test(v.lang) && !NOVELTY.test(v.name));
  const local = en.filter((v) => norm(v.lang).startsWith(lang.toLowerCase()));
  const re = gender === 'M' ? MALE : FEMALE;
  for (const pool of [local, en]) {
    const cand = pool.filter((v) => re.test(v.name)).sort((a, b) => voiceScore(b) - voiceScore(a));
    if (cand.length) return { voice: cand[0], pitch: 1 };
  }
  return { voice: pickVoice(lang), pitch: gender === 'M' ? 0.8 : 1.1 };
}

let speakSeq = 0;
/** 英文を読み上げる。完了で resolve（gender: 'M' | 'F' で会話の相手役の声に） */
export function speak(text, { rate, lang, slow = false, voice, gender } = {}) {
  return new Promise((resolve) => {
    if (!synth || !text) return resolve();
    const my = ++speakSeq;
    try { synth.cancel(); } catch {}
    const u = new SpeechSynthesisUtterance(text);
    const l = lang || state.settings.accent || 'en-US';
    u.lang = l;
    let v = voice, pitch = 1;
    if (!v && gender && l.startsWith('en')) ({ voice: v, pitch } = voiceFor(gender, l));
    if (!v) v = l.startsWith('en') ? pickVoice(l) : voices.find((x) => x.lang.replace('_', '-').startsWith(l));
    if (v) u.voice = v;
    u.rate = slow ? 0.62 : rate || state.settings.ttsRate || 0.95;
    u.pitch = pitch;
    let finished = false;
    bgm.pause('tts');
    const fin = () => { if (finished) return; finished = true; clearTimeout(guard); bgm.resume('tts'); resolve(); };
    u.onend = fin; u.onerror = fin;
    // iOS で onend が来ないことがある対策
    const guard = setTimeout(fin, 1500 + text.length * 140 / (u.rate || 1));
    setTimeout(() => { if (my === speakSeq) synth.speak(u); }, 30);
  });
}

export function stopSpeaking() {
  speakSeq++;
  try { synth?.cancel(); } catch {}
}

// ================= STT =================
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const browserSttSupported = !!SR;

export function sttEngine() {
  const e = state.settings.sttEngine;
  if (e === 'browser' && SR) return 'browser';
  if (e === 'ai' && recorderSupported && aiSttReady()) return 'ai';
  if (e === 'keyboard') return 'keyboard';
  if (SR) return 'browser';
  if (recorderSupported && aiSttReady()) return 'ai';
  return 'keyboard';
}

const ERR = {
  'not-allowed': 'マイクの使用が許可されていません。ブラウザの設定でマイクを許可してください。',
  'service-not-allowed': '音声認識が使えません。iPadの「設定 > Siriと検索 / キーボード > 音声入力」を有効にしてください。',
  'no-speech': '声が聞き取れませんでした。もう少し大きな声でどうぞ。',
  'audio-capture': 'マイクが見つかりません。',
  network: '音声認識にはネット接続が必要です。',
  aborted: '聞き取れませんでした。もう一度どうぞ。',
  start: '音声認識を開始できませんでした。',
};

/**
 * 音声を聞き取る。
 * 戻り値: { promise: Promise<{alts:string[], error?:string}>, stop() }
 */
export function listen({ lang = 'en-US', onInterim, onLevel, engine = sttEngine() } = {}) {
  if (engine === 'browser') return listenBrowser({ lang, onInterim });
  if (engine === 'ai') return listenAI({ lang, onInterim, onLevel });
  return { promise: Promise.resolve({ alts: [], error: 'keyboard' }), stop() {} };
}

// Safari の continuous モードは結果が累積で返ることがあるので、重なりを除いてつなぐ
function joinResults(list) {
  let acc = '';
  for (const t of list) {
    const s = String(t || '').trim();
    if (!s) continue;
    if (!acc) acc = s;
    else if (s.toLowerCase().startsWith(acc.toLowerCase())) acc = s;
    else if (!acc.toLowerCase().endsWith(s.toLowerCase())) acc += ` ${s}`;
  }
  return acc;
}

/**
 * ブラウザの音声認識（continuous＋無音検出）。
 * 途中で息つぎしても切れず、話し終わって silenceMs だまると自動で終了する。
 */
function listenBrowser({ lang, onInterim, silenceMs = 1800, maxMs = 20000 }) {
  const rec = new SR();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = true;
  rec.maxAlternatives = 5;
  try { if (state.settings.sttLocal && 'processLocally' in rec) rec.processLocally = true; } catch {}
  let finals = [], interim = '', lastAlts = [], heard = false, error = '', settled = false, silence = null;
  const text = () => joinResults([...finals, interim]);
  const stop = () => { try { rec.stop(); } catch {} };
  const promise = new Promise((resolve) => {
    const hard = setTimeout(stop, maxMs);
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(silence); clearTimeout(hard);
      const main = text();
      const alts = main ? [main] : [];
      // 最後の区切りの別候補も採点に使う（認識ミスの救済）
      if (lastAlts.length > 1) {
        const head = joinResults(finals.slice(0, -1));
        lastAlts.slice(1).forEach((a) => alts.push(joinResults([head, a])));
      }
      const uniq = [...new Set(alts.map((a) => a.trim()).filter(Boolean))];
      resolve({ alts: uniq, error: uniq.length ? '' : ERR[error || 'no-speech'] ?? `音声認識エラー（${error}）` });
    };
    rec.onresult = (e) => {
      heard = true;
      finals = []; interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          finals.push(r[0].transcript);
          lastAlts = Array.from({ length: r.length }, (_, k) => r[k].transcript);
        } else interim += r[0].transcript;
      }
      onInterim?.(text());
      clearTimeout(silence);
      silence = setTimeout(stop, silenceMs);
    };
    rec.onspeechend = () => { if (heard) { clearTimeout(silence); silence = setTimeout(stop, 600); } };
    rec.onerror = (e) => { if (!error || e.error !== 'aborted') error = e.error || 'error'; };
    rec.onend = finish;
    try { rec.start(); } catch { error = 'start'; finish(); }
  });
  return { promise, stop };
}

function listenAI({ lang, onInterim, onLevel }) {
  let recorder = null;
  let stopFn = () => recorder?.stop();
  const promise = (async () => {
    try {
      recorder = await startRecording({ onLevel, autoStop: true, maxMs: 15000 });
      onInterim?.('（録音中… 話し終わると自動で止まります）');
      const blob = await recorder.done;
      onInterim?.('（AIで文字起こし中…）');
      const { base64, seconds } = await blobToWavBase64(blob);
      if (seconds < 0.3) return { alts: [], error: '録音が短すぎます。' };
      const text = await aiTranscribe(base64, lang);
      return { alts: text ? [text] : [], error: text ? '' : '聞き取れませんでした。' };
    } catch (e) {
      if (e?.name === 'NotAllowedError') return { alts: [], error: ERR['not-allowed'] };
      return { alts: [], error: e?.message || String(e) };
    }
  })();
  return { promise, stop: () => stopFn() };
}
