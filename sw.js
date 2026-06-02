/* Service worker for the Insect Order Identifier.
   Lets the app load offline in the field after the first online visit.
   Bump CACHE when you change app files so clients pick up the update. */
'use strict';

const CACHE = 'insect-id-v2';
const MEDIA = 'insect-id-media-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE && k !== MEDIA).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  // Same-origin: app shell + assets
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') {
      // Network-first for the page so online users always get the latest,
      // with a cached fallback when offline.
      e.respondWith(
        fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('./index.html', copy));
            return res;
          })
          .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
      );
    } else {
      // Cache-first for static assets (icon, manifest, etc.)
      e.respondWith(
        caches.match(req).then((cached) =>
          cached || fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          })
        )
      );
    }
    return;
  }

  // Wikipedia/Wikimedia photos: stale-while-revalidate so seen photos work offline.
  if (/(^|\.)wikipedia\.org$/.test(url.hostname) || /(^|\.)wikimedia\.org$/.test(url.hostname)) {
    e.respondWith(
      caches.open(MEDIA).then((c) =>
        c.match(req).then((cached) => {
          const net = fetch(req)
            .then((res) => { c.put(req, res.clone()); return res; })
            .catch(() => cached);
          return cached || net;
        })
      )
    );
  }
});
