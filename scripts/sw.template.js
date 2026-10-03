// TripTalk Service Worker（scripts/build-sw.mjs で自動生成）
const VERSION = '__VERSION__';
const CACHE = 'triptalk-' + VERSION;
const RUNTIME = 'triptalk-runtime';
const ASSETS = __ASSETS__;
const DEV = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);

// 新しい版はダウンロードが済んだらすぐ有効にする（アプリ側は、学習中でなければ自動で読み込み直す）。
// こうしておくと、古い版で不具合が起きていても、アプリを開き直すだけで修正版に切り替わる
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('triptalk-') && k !== CACHE && k !== RUNTIME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: stale-while-revalidate
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(RUNTIME).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return; // API などはそのまま

  // 開発中（localhost）はネット優先
  if (DEV) {
    e.respondWith(fetch(req).then((res) => { caches.open(CACHE).then((c) => c.put(req, res.clone())); return res; }).catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }

  // 画面遷移: いまの版の index.html を返す（オフラインでも起動）
  if (req.mode === 'navigate') {
    e.respondWith(caches.open(CACHE).then((c) => c.match('./index.html')).then((hit) => hit || fetch(req)).catch(() => fetch(req)));
    return;
  }

  // 静的ファイル: いまの版のキャッシュを優先（古い版のファイルが混ざらないように）
  e.respondWith(caches.open(CACHE).then((c) => c.match(req, { ignoreSearch: true })).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(RUNTIME).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }))));
});
