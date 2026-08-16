const CACHE = 'my-plot-shell-v1';
const SHELL = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((url) => c.add(url).catch(() => {}))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Network-first for the app's own files, so an update is visible the very next time
// the app is opened with a live connection rather than lagging one visit behind.
// Falls back to the cached copy only when there's no connection at all (offline use).
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation requests (launching or reloading the app itself) get their own, more
  // reliable fallback: on failure, serve the known-cached shell directly rather than
  // relying on caches.match(e.request) to find an exact match — a fresh launch's own
  // request doesn't always match byte-for-byte what was cached during install, which
  // can otherwise leave the browser showing a generic offline error instead of the app.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request, {cache: 'no-store'})
        .then((res) => {
          caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  e.respondWith(
    fetch(e.request, {cache: 'no-store'})
      .then((res) => {
        caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
