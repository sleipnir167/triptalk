// TripTalk Service Worker（scripts/build-sw.mjs で自動生成）
const VERSION = 'd16118a54d';
const CACHE = 'triptalk-' + VERSION;
const RUNTIME = 'triptalk-runtime';
const ASSETS = [
  "./",
  "./css/app.css",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon.svg",
  "./icons/maskable-512.png",
  "./index.html",
  "./js/ai.js",
  "./js/bus.js",
  "./js/components.js",
  "./js/config.js",
  "./js/content.js",
  "./js/data/dialogues.js",
  "./js/data/scenes.js",
  "./js/deco.js",
  "./js/fx.js",
  "./js/gamify.js",
  "./js/icons.js",
  "./js/main.js",
  "./js/mascot.js",
  "./js/music.js",
  "./js/nav.js",
  "./js/recorder.js",
  "./js/router.js",
  "./js/scoring.js",
  "./js/screens/aichat.js",
  "./js/screens/aiwrite.js",
  "./js/screens/blitz.js",
  "./js/screens/dictation.js",
  "./js/screens/home.js",
  "./js/screens/learn.js",
  "./js/screens/library.js",
  "./js/screens/quiz.js",
  "./js/screens/review.js",
  "./js/screens/roleplay.js",
  "./js/screens/settings.js",
  "./js/screens/speak.js",
  "./js/screens/stats.js",
  "./js/screens/study.js",
  "./js/screens/travel.js",
  "./js/sfx.js",
  "./js/speech.js",
  "./js/srs.js",
  "./js/store.js",
  "./js/ui.js",
  "./js/wcheck.js",
  "./manifest.webmanifest"
];
const DEV = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => { if (!self.registration.active) return self.skipWaiting(); }));
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

  // 画面遷移: index.html を返す（オフラインでも起動）
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./index.html').then((hit) => hit || fetch(req)).catch(() => fetch(req)));
    return;
  }

  // 静的ファイル: キャッシュ優先
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(RUNTIME).then((c) => c.put(req, copy)); }
    return res;
  })));
});
