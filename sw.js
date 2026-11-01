/*
 * sw.js — Caches every app file so the game works offline after first load.
 */
const CACHE = "walled-city-v27";
const FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./tiles.js",
  "./game.js",
  "./render.js",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(FILES);
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) {
          return k.indexOf("walled-city-") === 0 && k !== CACHE;
        }).map(function (k) {
          return caches.delete(k);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener("fetch", function (event) {
  event.respondWith(
    caches.match(event.request, { ignoreSearch: event.request.mode === "navigate" }).then(function (hit) {
      if (hit) return hit;
      return fetch(event.request).then(function (res) {
        const copy = res.clone();
        caches.open(CACHE).then(function (cache) {
          cache.put(event.request, copy);
        });
        return res;
      }).catch(function () {
        if (event.request.mode === "navigate") {
          return caches.match("./index.html");
        }
      });
    })
  );
});
