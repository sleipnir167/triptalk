// コンテンツのインデックス化とプール抽出
import { SCENES, CUSTOM_SCENE } from './data/scenes.js';
import { state } from './store.js';

export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

let base = [];
const byId = new Map();

export function buildContent() {
  base = [];
  for (const sc of SCENES) {
    sc.words.forEach(([en, ja, ex, exJa, note]) => {
      base.push({ id: 'w' + hash(en.toLowerCase()), kind: 'word', scene: sc.id, en, ja, ex, exJa, note: note || '', accepts: [en] });
    });
    sc.phrases.forEach(([enAll, ja, note]) => {
      const accepts = [...new Set(enAll.split('|').map((s) => s.trim()).filter(Boolean))];
      base.push({ id: 'p' + hash(accepts[0].toLowerCase()), kind: 'phrase', scene: sc.id, en: accepts[0], ja, note: note || '', accepts });
    });
  }
  reindex();
}

export function reindex() {
  byId.clear();
  base.forEach((it) => byId.set(it.id, it));
  customItems().forEach((it) => byId.set(it.id, it));
}

function customItems() {
  return (state.custom || []).map((c) => ({
    ...c,
    scene: 'custom',
    kind: c.kind || (c.en.trim().split(/\s+/).length > 3 ? 'phrase' : 'word'),
    accepts: [c.en, ...(c.alts || [])],
  }));
}

export function allItems() {
  return base.concat(customItems());
}

export function getItem(id) {
  return byId.get(id);
}

export function scenes({ withCustom = true } = {}) {
  const list = [...SCENES];
  if (withCustom && state.custom?.length) list.push(CUSTOM_SCENE);
  return list;
}

export function sceneById(id) {
  return SCENES.find((s) => s.id === id) || (id === 'custom' ? CUSTOM_SCENE : null);
}

export function sceneItems(sceneId) {
  return allItems().filter((it) => it.scene === sceneId);
}

export function isWeak(it, now = Date.now()) {
  const c = state.progress[it.id];
  if (!c || !c.reps) return false;
  if (c.st === 3) return true;
  if ((c.ng || 0) > 0 && (c.ng || 0) >= (c.ok || 0) * 0.5) return true;
  if ((c.lapses || 0) >= 2) return true;
  if (c.lastNg && now - c.lastNg < 3 * 864e5) return true;
  return false;
}

/** 出題範囲からアイテムを抽出 */
export function pool({ scene = 'all', kind = 'all' } = {}) {
  let arr = allItems();
  if (scene === 'weak') arr = arr.filter((it) => isWeak(it));
  else if (scene === 'fav') arr = arr.filter((it) => state.favs[it.id]);
  else if (scene === 'new') arr = arr.filter((it) => !state.progress[it.id]?.reps);
  else if (scene === 'learned') arr = arr.filter((it) => state.progress[it.id]?.reps);
  else if (scene && scene !== 'all') arr = arr.filter((it) => it.scene === scene);
  if (kind && kind !== 'all') arr = arr.filter((it) => it.kind === kind);
  return arr;
}

export function scopeLabel(scene) {
  if (scene === 'all') return 'すべて';
  if (scene === 'weak') return '苦手';
  if (scene === 'fav') return 'お気に入り';
  if (scene === 'new') return '未学習';
  const s = sceneById(scene);
  return s ? `${s.emoji} ${s.name}` : scene;
}
