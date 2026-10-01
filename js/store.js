// 永続化（IndexedDB）とアプリ全体の状態
import { bus } from './bus.js';

const DB_NAME = 'triptalk';
const KV = 'kv';
const CACHE = 'aicache';

export const DEFAULT_SETTINGS = {
  dailyGoalXP: 120,
  newPerDay: 10,
  retention: 0.9,
  direction: 'auto', // auto | en2ja | ja2en
  passScore: 80,
  autoPlay: true,
  ttsVoice: '',
  ttsRate: 0.95,
  accent: 'en-US',
  sttEngine: 'auto', // auto | browser | ai | keyboard
  sttLocal: false,
  sfx: true,
  sfxVolume: 0.7,
  sparkle: true, // タップでキラキラ
  theme: 'auto',
  chatAutoSend: true,
  chatLevel: 'normal',
  trip: { name: '', date: '' },
  ai: {
    dailyLimit: 60,
    providers: [],
  },
};

export const state = {
  settings: structuredClone(DEFAULT_SETTINGS),
  progress: {}, // itemId -> card
  favs: {},
  stats: { days: {}, xp: 0, counters: {}, best: {}, badges: {}, roleplay: {} },
  custom: [],
  history: [], // AI会話/添削レポート
  memos: [], // 旅行モードの「マイカード」
  aiUsage: {},
};

const KEYS = ['settings', 'progress', 'favs', 'stats', 'custom', 'history', 'memos', 'aiUsage'];
let db = null;
let memoryOnly = false;

function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('no idb'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(KV)) d.createObjectStore(KV);
      if (!d.objectStoreNames.contains(CACHE)) d.createObjectStore(CACHE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const r = fn(s);
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function deepMerge(base, over) {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return over ?? base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(over)) {
    const bv = base?.[k];
    const ov = over[k];
    out[k] = bv && typeof bv === 'object' && !Array.isArray(bv) && ov && typeof ov === 'object' && !Array.isArray(ov) ? deepMerge(bv, ov) : ov;
  }
  return out;
}

export async function initStore() {
  try {
    db = await openDB();
    const values = await Promise.all(KEYS.map((k) => tx(KV, 'readonly', (s) => s.get(k))));
    KEYS.forEach((k, i) => {
      const v = values[i];
      if (v === undefined) return;
      if (k === 'settings') state.settings = deepMerge(DEFAULT_SETTINGS, v);
      else if (k === 'stats') state.stats = deepMerge(state.stats, v);
      else state[k] = v;
    });
  } catch (e) {
    console.warn('IndexedDB unavailable, fallback to localStorage', e);
    memoryOnly = true;
    try {
      const raw = localStorage.getItem('triptalk');
      if (raw) {
        const data = JSON.parse(raw);
        KEYS.forEach((k) => {
          if (data[k] === undefined) return;
          state[k] = k === 'settings' ? deepMerge(DEFAULT_SETTINGS, data[k]) : data[k];
        });
      }
    } catch {}
  }
  if (!state.settings.ai.providers.length) state.settings.ai.providers = [];
  // ホーム画面アプリとして使うときに学習データが消されにくくする
  //（ブラウザによっては確認が出るので起動を待たせない）
  try { navigator.storage?.persisted?.().then((p) => { if (!p) navigator.storage.persist(); }).catch(() => {}); } catch {}
}

const pending = new Set();
let timer = null;
export function save(...keys) {
  keys.forEach((k) => pending.add(k));
  clearTimeout(timer);
  timer = setTimeout(flush, 400);
}

export async function flush() {
  clearTimeout(timer);
  const keys = [...pending];
  pending.clear();
  if (!keys.length) return;
  if (memoryOnly || !db) {
    try {
      const all = {};
      KEYS.forEach((k) => (all[k] = state[k]));
      localStorage.setItem('triptalk', JSON.stringify(all));
    } catch {}
    return;
  }
  try {
    await tx(KV, 'readwrite', (s) => { keys.forEach((k) => s.put(JSON.parse(JSON.stringify(state[k])), k)); });
  } catch (e) {
    console.error('save failed', e);
  }
}
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

export function setSetting(path, value) {
  const parts = path.split('.');
  let o = state.settings;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
  o[parts.at(-1)] = value;
  save('settings');
  bus.emit('settings', path);
}

// ---- AIキャッシュ ----
const memCache = new Map();
export async function cacheGet(key) {
  if (memCache.has(key)) return memCache.get(key);
  if (!db) return undefined;
  try {
    const v = await tx(CACHE, 'readonly', (s) => s.get(key));
    if (v !== undefined) memCache.set(key, v);
    return v;
  } catch { return undefined; }
}
export async function cacheSet(key, value) {
  memCache.set(key, value);
  if (!db) return;
  try { await tx(CACHE, 'readwrite', (s) => s.put(value, key)); } catch {}
}
export async function cacheCount() {
  if (!db) return memCache.size;
  try { return await tx(CACHE, 'readonly', (s) => s.count()); } catch { return 0; }
}
export async function cacheClear() {
  memCache.clear();
  if (!db) return;
  try { await tx(CACHE, 'readwrite', (s) => s.clear()); } catch {}
}
export async function cacheAll() {
  if (!db) return Object.fromEntries(memCache);
  return new Promise((resolve) => {
    const out = {};
    const t = db.transaction(CACHE, 'readonly');
    const req = t.objectStore(CACHE).openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (c) { out[c.key] = c.value; c.continue(); } else resolve(out);
    };
    req.onerror = () => resolve(out);
  });
}

// ---- バックアップ ----
export async function exportData({ includeKeys = false, includeCache = true } = {}) {
  const data = { app: 'TripTalk', version: 1, exportedAt: new Date().toISOString() };
  KEYS.forEach((k) => (data[k] = state[k]));
  if (!includeKeys) {
    data.settings = JSON.parse(JSON.stringify(state.settings));
    data.settings.ai.providers.forEach((p) => (p.apiKey = ''));
  }
  if (includeCache) data.aicache = await cacheAll();
  return data;
}

export async function importData(data) {
  if (!data || data.app !== 'TripTalk') throw new Error('TripTalkのバックアップファイルではありません');
  KEYS.forEach((k) => {
    if (data[k] === undefined) return;
    if (k === 'settings') {
      const keep = state.settings.ai.providers;
      state.settings = deepMerge(DEFAULT_SETTINGS, data.settings);
      // キーが空ならば現在のキーを引き継ぐ
      state.settings.ai.providers.forEach((p) => {
        if (!p.apiKey) { const old = keep.find((o) => o.id === p.id); if (old) p.apiKey = old.apiKey; }
      });
    } else state[k] = data[k];
  });
  if (data.aicache && db) {
    await tx(CACHE, 'readwrite', (s) => { Object.entries(data.aicache).forEach(([k, v]) => s.put(v, k)); });
  }
  KEYS.forEach((k) => pending.add(k));
  await flush();
}

export async function resetProgress() {
  state.progress = {};
  state.stats = { days: {}, xp: 0, counters: {}, best: {}, badges: {}, roleplay: {} };
  state.history = [];
  save('progress', 'stats', 'history');
  await flush();
}
