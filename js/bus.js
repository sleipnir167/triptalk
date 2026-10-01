// 小さなイベントバス
const listeners = new Map();
export const bus = {
  on(ev, fn) {
    if (!listeners.has(ev)) listeners.set(ev, new Set());
    listeners.get(ev).add(fn);
    return () => listeners.get(ev)?.delete(fn);
  },
  emit(ev, data) {
    listeners.get(ev)?.forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } });
  },
};
