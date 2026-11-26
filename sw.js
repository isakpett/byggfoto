// Offline support: try the network first so updates arrive, fall back to the saved copy.
const CACHE = 'byggfoto-v3';
const FILES = [
  './', './index.html', './styles.css', './manifest.json', './version.json', './icon-180.png', './icon-512.png',
  './js/core.js', './js/dialogs.js', './js/photos.js', './js/send.js', './js/editor.js',
  './js/settings.js', './js/camera.js', './js/main.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    // cache: 'no-cache' asks the server every time instead of using a copy up to 10 minutes old.
    fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
