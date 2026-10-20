// sw.js — service worker minimal: agar PWA bisa dipasang & tahan offline (network-first untuk halaman)
const CACHE = "screener-v2";
const ASSETS = ["./saham-laporan.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

// Berkas yang HARUS selalu dari jaringan: harganya berubah tiap 5 menit.
// Dulu berkas ini ikut cache-first → harga live terkunci di nilai pertama kali dibuka.
const SELALU_SEGAR = [/quotes-live\.json$/, /saham-laporan\.html$/, /sw\.js$/];

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

  const segar = SELALU_SEGAR.some(re => re.test(url.pathname));

  if (req.mode === "navigate" || segar) {
    // halaman & data harga: coba jaringan dulu (biar selalu ter-update), fallback ke cache saat offline
    e.respondWith(
      fetch(req).then(r => {
        if (segar && !/quotes-live\.json$/.test(url.pathname)) {
          const cp = r.clone();
          caches.open(CACHE).then(c => c.put(req, cp)).catch(() => {});
        }
        return r;
      }).catch(() => caches.match(req).then(m => m || (req.mode === "navigate" ? caches.match("./saham-laporan.html") : undefined)))
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
