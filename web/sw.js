// sw.js — service worker minimal: agar PWA bisa dipasang & tahan offline (network-first untuk halaman)
const CACHE = "screener-v1";
const ASSETS = ["./saham-laporan.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== location.origin) return;                    // biarkan sumber luar apa adanya

  if (req.mode === "navigate" || /saham-laporan\.html$/.test(url.pathname)) {
    // halaman: coba jaringan dulu (biar selalu ter-update), fallback ke cache saat offline
    e.respondWith(
      fetch(req).then(r => {
        const cp = r.clone();
        caches.open(CACHE).then(c => c.put(req, cp)).catch(() => {});
        return r;
      }).catch(() => caches.match(req).then(m => m || caches.match("./saham-laporan.html")))
    );
    return;
  }
  // aset lain: cache dulu, kalau tidak ada baru jaringan
  e.respondWith(caches.match(req).then(m => m || fetch(req).then(r => {
    const cp = r.clone();
    caches.open(CACHE).then(c => c.put(req, cp)).catch(() => {});
    return r;
  })));
});
