const CACHE = 'my-plot-shell-v5';
// The header's own logo (apple-mark.png) and the three manifest/home-screen icons were missing
// from this list. The fetch handler below does cache everything it's asked for as it's used, so
// these could still end up saved eventually - but only once something has actually requested them
// while a service worker was there to intercept it, which the very first launch after an install
// or update often isn't. Listing them here means they're guaranteed to be saved for offline use
// the moment the app updates, rather than depending on that happening to occur first.
const SHELL = ['./', './index.html', './manifest.json', './apple-mark.png', './apple-touch-icon.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  // cache:'reload' makes the install fetch skip the browser's own HTTP cache - GitHub Pages
  // sends max-age=600, so without this a brand-new worker could quietly file away a copy of the
  // app that was up to ten minutes old.
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((url) => c.add(new Request(url, {cache: 'reload'})).catch(() => {}))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Cache-first with background revalidation. Every request that's already cached is answered
// from the cache immediately, with no race against the network at all - this is what actually
// fixes the poor-reception hang, since there's no JS timeout to lose if the connection stalls at
// the native layer before any timer gets a chance to run (which is what defeated the previous
// network-first-with-timeout approach). The real network request still goes out in parallel and
// refreshes the cache for the *next* load, so the app quietly catches up a moment later rather
// than staying stale forever - including at home on a good connection, not just at the allotment.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  const isNav = e.request.mode === 'navigate';
  // Launching the app is always answered from the one './index.html' entry (see below), so the
  // fresh copy has to be filed under that same entry. It used to be filed under whatever address
  // the launch happened to use - "/Allotmate74/" typed into Safari, for instance, rather than
  // ".../index.html" - which meant the entry actually being served was never replaced, and the
  // app could stay on an old version indefinitely.
  const cacheKey = isNav ? new Request('./index.html') : e.request;

  const revalidate = caches.open(CACHE).then((c) =>
    fetch(e.request, {cache: 'no-store'}).then((res) => {
      // Only a good response replaces what's saved - a GitHub error page while a deploy is
      // mid-flight must never overwrite a working copy of the app.
      if (res && res.ok) c.put(cacheKey, res.clone());
      return res;
    }).catch(() => null)
  );
  // Without this, the browser is free to shut the worker down as soon as the page has been
  // answered - which can be before this background download has finished.
  e.waitUntil(revalidate);

  // Navigation requests (launching or reloading the app itself) fall back to the known-cached
  // shell by name rather than relying on caches.match(e.request) finding an exact match - a
  // fresh launch's own request doesn't always match byte-for-byte what was cached during
  // install, which can otherwise leave the browser showing a generic offline error instead of
  // the app.
  if (isNav) {
    e.respondWith(
      caches.match('./index.html', {cacheName: CACHE}).then((cached) => cached || revalidate)
    );
    return;
  }

  e.respondWith(
    caches.match(e.request, {cacheName: CACHE}).then((cached) => cached || revalidate)
  );
});
