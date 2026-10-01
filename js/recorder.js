// 録音（MediaRecorder）と WAV 変換（AI音声機能用）
let sharedStream = null;

export const recorderSupported = !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

function pickMime() {
  const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg'];
  for (const m of cands) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch {} }
  return '';
}

/**
 * 録音を開始。onLevel(0..1) で音量、autoStop で無音検出による自動停止。
 * 戻り値: { stop(): Promise<Blob>, cancel() , done: Promise<Blob> }
 */
export async function startRecording({ onLevel, autoStop = false, maxMs = 15000, silenceMs = 1400 } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  sharedStream = stream;
  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  const AC = window.AudioContext || window.webkitAudioContext;
  const actx = new AC();
  const src = actx.createMediaStreamSource(stream);
  const an = actx.createAnalyser();
  an.fftSize = 1024;
  src.connect(an);
  const buf = new Float32Array(an.fftSize);
  let raf = 0, spoke = false, lastLoud = performance.now();
  const started = performance.now();

  let resolveDone;
  const done = new Promise((r) => (resolveDone = r));
  let stopped = false;

  const cleanup = () => {
    cancelAnimationFrame(raf);
    stream.getTracks().forEach((t) => t.stop());
    actx.close().catch(() => {});
    sharedStream = null;
  };
  rec.onstop = () => {
    cleanup();
    resolveDone(new Blob(chunks, { type: rec.mimeType || mime || 'audio/mp4' }));
  };
  const stop = () => {
    if (stopped) return done;
    stopped = true;
    try { rec.stop(); } catch { cleanup(); resolveDone(new Blob(chunks)); }
    return done;
  };

  const loop = () => {
    an.getFloatTimeDomainData ? an.getFloatTimeDomainData(buf) : null;
    let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    const lvl = Math.min(1, rms * 8);
    onLevel?.(lvl);
    const now = performance.now();
    if (rms > 0.02) { spoke = true; lastLoud = now; }
    if (autoStop && spoke && now - lastLoud > silenceMs) return stop();
    if (now - started > maxMs) return stop();
    raf = requestAnimationFrame(loop);
  };
  rec.start(250);
  raf = requestAnimationFrame(loop);
  return { stop, done, cancel: () => { chunks.length = 0; stop(); } };
}

export function stopAnyRecording() {
  try { sharedStream?.getTracks().forEach((t) => t.stop()); } catch {}
}

/** 録音 Blob → 16kHz モノラル WAV の base64 */
export async function blobToWavBase64(blob) {
  const ab = await blob.arrayBuffer();
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  const audio = await new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej));
  ctx.close().catch(() => {});
  const rate = 16000;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const off = new OAC(1, Math.max(1, Math.ceil(audio.duration * rate)), rate);
  const s = off.createBufferSource();
  s.buffer = audio; s.connect(off.destination); s.start();
  const rendered = await off.startRendering();
  const pcm = rendered.getChannelData(0);
  const wav = encodeWav(pcm, rate);
  return { base64: abToBase64(wav), seconds: audio.duration };
}

function encodeWav(samples, rate) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, samples.length * 2, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++, o += 2) {
    const x = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return buf;
}

function abToBase64(ab) {
  const bytes = new Uint8Array(ab);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
