const CACHE = "asthma-buddy-v2"; // bump when you update files
const ASSETS = [
  "./","./index.html","./style.css","./script.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
      caches.open(CACHE).then(c => c.put(e.request, resp.clone()));
      return resp;
    }).catch(() => r))
  );
});
