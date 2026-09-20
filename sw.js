const CACHE = 'my-plot-shell-v2';
const SHELL = ['./', './index.html', './manifest.json'];
// How long to wait for a real response before giving up and using whatever's already cached.
// Airplane mode fails instantly, so the old network-first fetch fell back to cache straight away
// and felt fine; a weak signal at the allotment doesn't fail outright, it just hangs, so without
// a limit the app would sit waiting on a request that might never clearly succeed or fail. The
// original fetch keeps running in the background regardless, and still updates the cache if it
// eventually comes through.
const NETWORK_TIMEOUT_MS = 3000;

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

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (err) => { clearTimeout(t); reject(err); }
    );
  });
}

// Network-first for the app's own files, so an update is visible the very next time the app is
// opened with a live connection - but capped at NETWORK_TIMEOUT_MS, so a slow or flaky connection
// (rather than a clean no-connection-at-all) falls back to the cached copy just as quickly as
// airplane mode already does, instead of leaving the app looking stuck.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  // Started once, shared by both branches below - whether or not it wins the race against the
  // timeout, it keeps running and still refreshes the cache the moment it does complete.
  const fetchAndCache = fetch(e.request, {cache: 'no-store'}).then((res) => {
    caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
    return res;
  });

  // Navigation requests (launching or reloading the app itself) get their own, more reliable
  // fallback: on failure, serve the known-cached shell directly rather than relying on
  // caches.match(e.request) to find an exact match — a fresh launch's own request doesn't always
  // match byte-for-byte what was cached during install, which can otherwise leave the browser
  // showing a generic offline error instead of the app.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      withTimeout(fetchAndCache, NETWORK_TIMEOUT_MS).catch(() => caches.match('./index.html'))
    );
    return;
  }

  e.respondWith(
    withTimeout(fetchAndCache, NETWORK_TIMEOUT_MS).catch(() => caches.match(e.request))
  );
});
