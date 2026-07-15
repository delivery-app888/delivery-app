const CACHE_NAME = 'delivery-log-v6';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

const APP_ORIGIN = self.location.origin;
const APP_SCOPE_PATH = new URL(self.registration.scope).pathname;

const isAppGetRequest = (request) => {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  return url.origin === APP_ORIGIN && url.pathname.startsWith(APP_SCOPE_PATH);
};

// Install: cache app shell & activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches & take control immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache only this app's own files. External API/map/weather URLs may contain location hints.
self.addEventListener('fetch', (event) => {
  if (!isAppGetRequest(event.request)) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
