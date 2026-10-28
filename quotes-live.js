// quotes-live.js — pengambil harga live saham IDX → quotes-live.json (diterbitkan ke gh-pages)
// Kenapa lewat cron, bukan fetch dari browser: endpoint Yahoo TIDAK mengirim header CORS
// (tanpa access-control-allow-origin), jadi fetch langsung dari halaman selalu gagal.
// Satu-satunya cara tanpa API key: unduh di sini (Node, tanpa batasan CORS), simpan ke file
// kecil, lalu halaman membacanya. Aturan main: TIDAK memfitnah data — file ini hanya berisi
// waktu Yahoo sendiri, bukan waktu unduh, dan halaman menandai harga basi.
const fs = require("fs");
const path = require("path");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const DIR = __dirname;
const OUT = path.join(DIR, "quotes-live.json");

async function getCrumb() {
  let cookie = "";
  for (const u of ["https://fc.yahoo.com/", "https://finance.yahoo.com/"]) {
    try {
      const r = await fetch(u, { headers: { "User-Agent": UA }, redirect: "manual" });
      const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
      if (sc.length) { cookie = sc.map(c => c.split(";")[0]).join("; "); break; }
    } catch (e) {}
  }
  const rc = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", { headers: { "User-Agent": UA, Cookie: cookie } });
  const crumb = (await rc.text()).trim();
  if (!crumb || crumb.length > 40) throw new Error("crumb tidak didapat");
  return { cookie, crumb };
}

async function ambilQuote(symbols) {
  const { cookie, crumb } = await getCrumb();
  const url = "https://query1.finance.yahoo.com/v7/finance/quote?symbols=" +
    encodeURIComponent(symbols.join(",")) + "&crumb=" + encodeURIComponent(crumb);
  for (let a = 0; a < 3; a++) {
    const r = await fetch(url, { headers: { "User-Agent": UA, Cookie: cookie } });
    if (r.status === 401 || r.status === 429) { await new Promise(x => setTimeout(x, 1200 * (a + 1))); continue; }
    if (!r.ok) throw new Error("quote HTTP " + r.status);
    const j = await r.json();
    return (j.quoteResponse && j.quoteResponse.result) || [];
  }
  throw new Error("quote ditolak Yahoo setelah 3 percobaan");
}

// Simbol yang dipakai halaman = yang ada di laporan terakhir
function daftarSimbol() {
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, "saham-screener.json"), "utf8"));
  const stocks = Array.isArray(raw) ? raw : raw.stocks;
  const out = [];
  const seen = new Set();
  for (const s of stocks) {
    if (s.market !== "IDX") continue;               // hanya IDX; kripto sudah live lewat Coinpaprika
    if (!s.symbol || seen.has(s.symbol)) continue;
    seen.add(s.symbol);
    out.push(s.symbol);
  }
  return out;
}

(async () => {
  const symbols = daftarSimbol();
  if (symbols.length < 50) {
    console.error("simbol cuma " + symbols.length + " — saham-screener.json belum siap");
    process.exit(1);
  }
  // Pecah per 100 simbol biar URL tidak kepanjangan
  const hasil = [];
  for (let i = 0; i < symbols.length; i += 100) {
    try {
      hasil.push(...await ambilQuote(symbols.slice(i, i + 100)));
    } catch (e) {
      console.error("  gagal bagian " + (i / 100 + 1) + ": " + e.message);
    }
  }
  if (hasil.length < symbols.length * 0.5) {
    console.error("hanya " + hasil.length + "/" + symbols.length + " quote — batal, file lama dipertahankan");
    process.exit(1);
  }

  // Bentuk ringkas: simbol → [harga, %perubahan, waktu Yahoo (detik), state]
  const q = {};
  for (const r of hasil) {
    if (!r.symbol) continue;
    let px = r.regularMarketPrice;
    let chg = r.regularMarketChangePercent;
    let ts = r.regularMarketTime;
    q[r.symbol] = [px != null ? +px.toFixed(6) : null, chg != null ? +chg.toFixed(4) : null, ts || null, r.marketState || null];
  }

  const sekarang = new Date();
  const isi = {
    generatedAt: sekarang.toISOString(),
    // Penanda jam bursa (WIB) supaya mudah dibaca; logika "jam bursa" asli tetap dari marketState Yahoo.
    serverHourWIB: +((sekarang.getUTCHours() + 7) % 24),
    source: "Yahoo Finance (v7/quote)",
    count: Object.keys(q).length,
    q,
  };
  fs.writeFileSync(OUT, JSON.stringify(isi));
  const kb = Math.round(fs.statSync(OUT).size / 1024);
  console.log("quotes-live.json: " + Object.keys(q).length + " simbol, " + kb + " KB");
})().catch(e => { console.error("gagal: " + e.message); process.exit(1); });
