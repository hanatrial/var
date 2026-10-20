// stock-scraper.js — screener multi-pasar (IDX / US / Crypto) via Yahoo Finance
// Menghitung: valuasi, teknikal (MA/RSI/MFI/breakout), heuristik "bandar" (akumulasi/OBV/volume), dan berita (Google News).
// Output: saham-screener.json + saham-screener.csv
const fs = require("fs");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const IDX = [
  // LQ45 / blue chip
  "BBCA","BBRI","BMRI","BBNI","BRIS","BBTN","ARTO","BJTM","BJBR","BNGA","BDMN","NISP","MEGA","PNBN","BTPS","BFIN","SDRA",
  "TLKM","ISAT","EXCL","TOWR","TBIG","MTEL",
  "ASII","UNTR","HRUM","PTBA","ADRO","ITMG","BUMI","BYAN","MEDC","PGAS","AKRA","ADMR","AMMN","NCKL","MBMA","BRMS","ANTM","INCO","TINS","MDKA","PSAB","INDY","GGRM","HEAL",
  "ICBP","INDF","MYOR","UNVR","KLBF","SIDO","TSPC","HMSP","MIKA","HEAL","SILO","PRDA","EMTK",
  "INTP","SMGR","ARNA","SMRA","BSDE","CTRA","PWON","LPKR","DILD","GOTO","BUKA","TPIA","BRPT","DSNG","PANI","AVIA","BRIS",
  "CPIN","JPFA","MAIN","AALI","LSIP","SSMS","ACES","MAPI","MAPA","ERAA","SCMA","MNCN","PGEO","JSMR","POWR","CUAN","GJTL","AUTO","INKP","TKIM","LPPF","SRTG","MPMX","AGII","ASSA","SMSM","BEEF","PBRX","RAJA","SMDR","ZBRA","LAJU","TAPG","AKSI","BUDI","KONI","LION","POLY","PTSP","SRAJ","UCID","VINS","WIIM","INTD","KARW","HRTA","MBSS","MSIN","NICK","SAPX","TALF","TRIS","UANG","WIFI","WMPP","UNSP"
,
  // tambahan: saham aktif & likuid dari daftar 912 (nilai transaksi 20 hari >= Rp2 M, harga >= Rp200, listing > 1 tahun; dipilih 18 Okt 2026)
  "AADI","AGAR","ALKA","AMRT","ARCI","ARKO","ASGR","ASLI","ASPI","AYAM","BAIK","BIKE","BINA","BREN",
  "BSML","BSSR","BULL","BUVA","CARE","CBDK","CBRE","CCSI","CDIA","CLEO","CMNT","CMRY","COIN","CSMI",
  "CYBR","DAAZ","DEWA","DEWI","DGWG","DKFT","DOOH","DSSA","ELIT","ELSA","ENRG","ESSA","EURO","FAST",
  "FILM","FORE","FPNI","GEMS","GPSO","GULA","HATM","HEXA","HOPE","IDEA","IMPC","IRSX","JARR","KDTN",
  "KEEN","KETR","KICI","KING","MARK","MGLV","MGRO","MITI","MKAP","MLPT","MMIX","MOLI","MPXL","MSJA",
  "NEST","NICL","NOBU","NRCA","OILS","OMED","PACK","PBSA","PKPK","PTRO","PTSN","RATU","RISE","RMKE",
  "RSCH","SEMA","SGER","SIMP","SINI","SMAR","SMIL","SMLE","SMMT","SNLK","SOCI","SSIA","STAA","TCPI",
  "TEBE","TOBA","TOTL","TUGU","UDNG","ULTJ","VERN","VICI","VISI","VKTR"
];
const US = [
  "AAPL","MSFT","NVDA","AMZN","GOOGL","META","TSLA","AMD","NFLX","INTC","JPM","BAC","XOM","PFE","DIS",
  "BA","KO","PEP","WMT","VZ","PLTR","UBER","SHOP","COIN","SOFI","MCD","NKE","SBUX",
  "AVGO","CRM","ORCL","ADBE","QCOM","TXN","CSCO","AMAT","MU","ABNB","PYPL","GS","MS","CAT","GE","HON","UNH","JNJ","PG","CVX","NEE"
];
const CRYPTO = [
  "BTC-USD","ETH-USD","SOL-USD","BNB-USD","XRP-USD","ADA-USD","DOGE-USD","AVAX-USD","DOT-USD","LINK-USD","LTC-USD","TRX-USD",
  "BCH-USD","XLM-USD","TON-USD","NEAR-USD","AAVE-USD","HBAR-USD","ARB-USD","OP-USD","INJ-USD",
  // Tiga koin ini TIDAK punya simbol "-USD" polos di Yahoo (404 "delisted"); bentuknya pakai
  // nomor id CoinPaprika/CoinGecko. Ditulis lengkap supaya jelas asalnya.
  "APT21794-USD","UNI7083-USD","SUI20947-USD"
];
// Ticker yang dipakai di laporan: "APT21794-USD" → "APT", "BTC-USD" → "BTC"
const cryptoTicker = s => s.replace(/USD$/, "").replace(/-$/, "").replace(/\d+$/, "");

// Crypto opsional: halaman sudah punya harga live (Coinpaprika), jadi screener tidak perlu
// menarik kripto. Set SKIP_CRYPTO=1 untuk melewati pasar kripto.
const SKIP_CRYPTO = process.env.SKIP_CRYPTO === "1";

const UNIVERSE = [
  ...[...new Set(IDX)].map(t => ({ symbol: t + ".JK", market: "IDX", ticker: t })),
  ...[...new Set(US)].map(t => ({ symbol: t, market: "US", ticker: t })),
  ...(SKIP_CRYPTO ? [] : [...new Set(CRYPTO)].map(t => ({ symbol: t, market: "CRYPTO", ticker: cryptoTicker(t) }))),
];

const CRYPTO_NAMES = { BTC:"Bitcoin", ETH:"Ethereum", SOL:"Solana", BNB:"BNB", XRP:"XRP", ADA:"Cardano", DOGE:"Dogecoin", AVAX:"Avalanche", DOT:"Polkadot", LINK:"Chainlink", LTC:"Litecoin", TRX:"TRON" };

let COOKIE = "";
const cache = {};
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getCrumb() {
  for (const u of ["https://fc.yahoo.com/", "https://finance.yahoo.com/"]) {
    try {
      const r = await fetch(u, { headers: { "User-Agent": UA }, redirect: "manual" });
      const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
      if (sc.length) { COOKIE = sc.map(c => c.split(";")[0]).join("; "); break; }
    } catch (e) {}
  }
  const rc = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", { headers: { "User-Agent": UA, Cookie: COOKIE } });
  return (await rc.text()).trim();
}

async function jget(url) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Cookie: COOKIE } });
      if (r.status === 429) { await sleep(900 * (a + 1)); continue; }
      if (!r.ok) return null;
      return await r.json();
    } catch (e) { await sleep(500); }
  }
  return null;
}

// kurs antar mata uang (untuk konversi laporan keuangan non-IDR → IDR), cache
const fxCache = {};
async function fxRate(from, to) {
  const key = from + to;
  if (key in fxCache) return fxCache[key];
  try {
    const j = await jget(`https://query1.finance.yahoo.com/v8/finance/chart/${from}${to}=X?range=5d&interval=1d`);
    const r = j?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
    fxCache[key] = (typeof r === "number" && r > 0) ? r : null;
  } catch (e) { fxCache[key] = null; }
  await sleep(150);
  return fxCache[key];
}

async function batchQuote(symbols) {
  const out = [];
  for (let i = 0; i < symbols.length; i += 50) {
    const chunk = symbols.slice(i, i + 50);
    const j = await jget(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${chunk.join(",")}&crumb=${encodeURIComponent(cache.crumb || "")}`);
    if (j?.quoteResponse?.result) out.push(...j.quoteResponse.result);
    await sleep(300);
  }
  return out;
}

async function chartFull(sym, range = "1y") {
  const j = await jget(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=${range}&interval=1d&events=div%2Csplit`);
  const r = j?.chart?.result?.[0];
  if (!r || !r.timestamp) return null;
  const q = r.indicators.quote[0];
  const rows = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    if (q.close[i] == null) continue;
    rows.push({ t: r.timestamp[i], c: q.close[i], h: q.high[i], l: q.low[i], v: q.volume[i] || 0 });
  }
  const ev = r.events || {};
  const dividends = Object.values(ev.dividends || {})
    .map(d => ({ date: new Date(d.date * 1000).toISOString().slice(0, 10), amount: d.amount }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const splits = Object.values(ev.splits || {})
    .map(s => ({ date: new Date(s.date * 1000).toISOString().slice(0, 10), num: s.numerator, den: s.denominator }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const firstTrade = r.meta && r.meta.firstTradeDate ? new Date(r.meta.firstTradeDate * 1000).toISOString().slice(0, 10) : null;
  return { rows, dividends, splits, firstTrade };
}

// riwayat fundamental tahunan (untuk tren laba/omzet/ekuitas) — sumber gratis Yahoo
async function fundHistory(sym) {
  const types = "annualDilutedEPS,annualTotalRevenue,annualStockholdersEquity,annualNetIncome,annualOrdinarySharesNumber";
  const url = `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(sym)}?symbol=${encodeURIComponent(sym)}&type=${types}&period1=1136073600&period2=${Math.floor(Date.now() / 1000)}`;
  const j = await jget(url);
  const res = j && j.timeseries && j.timeseries.result;
  if (!res) return null;
  const pick = k => { const n = res.find(x => x[k]); if (!n) return []; return n[k].filter(x => x && x.asOfDate && x.reportedValue && x.reportedValue.raw != null).map(x => [x.asOfDate.slice(0, 4), x.reportedValue.raw]).sort((a, b) => (a[0] < b[0] ? -1 : 1)); };
  const o = { eps: pick("annualDilutedEPS"), rev: pick("annualTotalRevenue"), eq: pick("annualStockholdersEquity"), ni: pick("annualNetIncome"), shares: pick("annualOrdinarySharesNumber") };
  if (!o.eps.length && !o.rev.length && !o.eq.length) return null;
  return o;
}
async function chart(sym, range = "1y") { const f = await chartFull(sym, range); return f ? f.rows : null; }

async function summary(sym) {
  const mods = "summaryDetail,defaultKeyStatistics,financialData,assetProfile";
  const j = await jget(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=${mods}&crumb=${encodeURIComponent(cache.crumb || "")}`);
  return j?.quoteSummary?.result?.[0] || null;
}

// ---------- Indikator ----------
const sma = (a, n) => { const s = a.slice(-n); return s.length < n ? null : s.reduce((x, y) => x + y, 0) / n; };

function rsi(closes, n = 14) {
  if (closes.length < n + 1) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = closes[i] - closes[i - 1]; d >= 0 ? g += d : l -= d; }
  g /= n; l /= n;
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    g = (g * (n - 1) + (d > 0 ? d : 0)) / n;
    l = (l * (n - 1) + (d < 0 ? -d : 0)) / n;
  }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}

function obvSlope(closes, vols) {
  const obv = [0];
  for (let i = 1; i < closes.length; i++) obv.push(obv[i - 1] + (closes[i] > closes[i - 1] ? vols[i] : closes[i] < closes[i - 1] ? -vols[i] : 0));
  const y = obv.slice(-20);
  const n = y.length, mx = (n - 1) / 2, my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  y.forEach((v, i) => { num += (i - mx) * (v - my); den += (i - mx) ** 2; });
  return (num / den) / (Math.abs(my) || 1) * 100;
}

function mfi(highs, lows, closes, vols, n = 14) {
  if (closes.length < n + 1) return null;
  let pos = 0, neg = 0;
  for (let i = closes.length - n; i < closes.length; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    const p = (highs[i - 1] + lows[i - 1] + closes[i - 1]) / 3;
    const m = tp * vols[i];
    tp > p ? pos += m : neg += m;
  }
  return neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
}

function accumulation(closes, vols, n = 20) {
  let up = 0, down = 0;
  for (let i = Math.max(1, closes.length - n); i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) up += vols[i];
    else if (closes[i] < closes[i - 1]) down += vols[i];
  }
  return (up + down) ? up / (up + down) : 0.5;
}

// ---------- Berita (Google News RSS) ----------
const dec = s => String(s).replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").trim();

async function fetchNews(q) {
  try {
    const u = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=id&gl=ID&ceid=ID:id`;
    const r = await fetch(u, { headers: { "User-Agent": UA } });
    if (!r.ok) return [];
    const xml = await r.text();
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]).slice(0, 5).map(it => {
      const g = re => { const x = it.match(re); return x ? dec(x[1]) : ""; };
      const title = g(/<title>([\s\S]*?)<\/title>/).replace(/\s+-\s+[^-]+$/, "").trim();
      const src = g(/<source[^>]*>([\s\S]*?)<\/source>/);
      const date = g(/<pubDate>([\s\S]*?)<\/pubDate>/);
      const link = g(/<link>([\s\S]*?)<\/link>/);
      return { title, src, date: date ? new Date(date).toISOString().slice(0, 10) : "", link };
    }).filter(n => n.title && !/^Google/i.test(n.title));
  } catch (e) { return []; }
}

const num = (x, k) => (x && x[k] && typeof x[k].raw === "number") ? x[k].raw : (typeof x?.[k] === "number" ? x[k] : null);

// ---------- Batas ARA/ARB BEI (berlaku s/d 31 Des 2026) ----------
// Mulai 1 Jan 2027: ARB Rp11-200 → 35%, Rp200-5.000 → 25%, >Rp5.000 → 20% (saham bisa jatuh lebih dalam).
function arbRule(px) {
  if (px == null || !isFinite(px)) return null;
  if (px <= 10) return { araPct: null, arbPct: null, araRp: 1, arbRp: 1 }; // batas absolut Rp1
  if (px <= 200) return { araPct: 35, arbPct: 15 };
  if (px <= 5000) return { araPct: 25, arbPct: 15 };
  return { araPct: 20, arbPct: 15 };
}
function hitArb(prevClose, close) {
  if (!prevClose || close == null) return false;
  const r = arbRule(prevClose);
  if (!r) return false;
  if (r.arbPct == null) return (prevClose - close) >= (r.arbRp - 0.005);
  return (close / prevClose - 1) * 100 <= -(r.arbPct - 0.5);
}

// ---------- Aksi korporasi (kamus kata kunci Keterbukaan Informasi) ----------
const CA_KEYS = {
  buyback: ["pembelian kembali saham", "buyback", "buy back", "buy-back"],
  tender: ["penawaran tender", "tender offer", "go private", "voluntary delisting", "penawaran sukarela"],
  insider: ["laporan kepemilikan", "perubahan kepemilikan", "direksi membeli", "pembelian saham oleh direksi", "insider"],
  rightsIssue: ["hmetd", "penambahan modal dengan memberikan hak", "rights issue", "penawaran umum terbatas"],
  privatePlacement: ["pmthmetd", "tanpa memberikan hak", "private placement", "penambahan modal tanpa memberikan hak"],
  waran: ["waran seri", "warran"],
  split: ["pemecahan nilai nominal", "stock split"],
  reverse: ["penggabungan nilai nominal", "reverse split", "reverse stock"],
  pengendali: ["perubahan pengendali", "pengambilalihan", "backdoor", "perubahan kegiatan usaha", "perubahan bidang usaha"],
  gadai: ["gadai saham", "penjaminan saham"],
  rups: ["panggilan rups", "hasil rups", "rupslb", "rapat umum pemegang saham"],
  bahaya: ["pkpu", "pailit", "suspensi", "penghentian sementara", "penghapusan saham", "delisting", "pembatalan pencatatan"],
  fca: ["papan pemantauan khusus", "notasi khusus", "unusual market activity", "full call auction", "uma"],
};
const CA_STRATEGIS = ["strategis", "asing", "global", "raksasa", "internasional", "temasek", "softbank"];
const CA_UTANG = ["bayar utang", "membayar utang", "restrukturisasi", "lunasi utang", "pelunasan utang"];
// pencocokan dgn batas kata (hindari "uma" cocok di dalam "rumah", dsb.)
function caHit(all, keys) {
  return keys.some(k => { try { return new RegExp("\\b" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(all); } catch (e) { return all.indexOf(k) >= 0; } });
}

// ---------- Kamus kata kunci AS & crypto ----------
// AS: padanan "KI" versi SEC EDGAR + Earnings + corporate actions (lihat panduan di laporan)
const US_KEYS = {
  offering: ["secondary offering", "follow-on offering", "follow on offering", "public offering", "prices offering", "priced offering", "offering of common stock"],
  atm: ["at-the-market", "atm program", "atm offering", "424b5", "sales agreement"],
  convertible: ["convertible notes", "convertible senior notes", "convertible bonds"],
  lockup: ["lock-up expir", "lockup expir", "lock up expir"],
  spac: ["spac merger", "de-spac", "despac", "blank-check"],
  buyback: ["buyback", "buy back", "share repurchase", "repurchase program", "repurchase authorization"],
  divraise: ["raises dividend", "raise its dividend", "dividend increase", "dividend aristocrat", "hikes dividend"],
  split: ["stock split"],
  insiderBuy: ["insider buy", "insider buying", "cluster buy", "ceo buys", "cfo buys", "director buys", "form 4"],
  sp500: ["join s&p 500", "joins s&p 500", "added to s&p", "addition to s&p", "s&p 500 inclusion"],
  activist: ["activist investor", "activist stake", "takes stake", "13d filing", "schedule 13d"],
  target: ["to be acquired", "buyout", "takeover bid", "acquisition target", "take-private"],
  acquirer: ["to acquire", "agrees to acquire", "acquisition of", "to buy "],
  bahaya: ["chapter 11", "bankruptcy", "going concern", "restatement", "auditor resign", "delisting warning", "bid price deficiency", "non-compliant", "noncompliant", "otc market", "pink sheets", "pink sheet"],
};
const US_SUB1 = ["under $1", "below $1", "under a dollar", "below one dollar"];
// Crypto: padanan "aksi korporasi" (tokenomics, listing, keamanan)
const CR_KEYS = {
  unlock: ["token unlock", "tokens unlock", "unlock event", "vesting unlock", "cliff unlock"],
  monitoring: ["monitoring tag", "monitoring list", "delisting", "to delist", "delist"],
  hack: ["hack", "hacked", "exploit", "bridge exploit", "stolen"],
  depeg: ["depeg", "loses peg", "lost its peg"],
  listing: ["lists on binance", "list on binance", "coinbase listing", "lists on coinbase", "upbit listing", "lists on upbit", "kraken listing"],
  burn: ["token burn", "burns tokens", "buyback and burn", "buyback-and-burn"],
  etf: ["etf approval", "etf approved", "spot etf", "etf inflow", "etf inflows"],
  upgrade: ["network upgrade", "hard fork", "mainnet launch", "mainnet upgrade"],
  airdrop: ["airdrop"],
  honeypot: ["honeypot", "rug pull", "rugpull", "cannot sell", "sell tax"],
};

function classifyCA(s) {
  // US/crypto: hanya berita yg menyebut ticker/nama perusahaan (Google News sering mengembalikan judul sampah)
  let newsList = s.news || [];
  if (s.market !== "IDX") {
    const stop = new Set(["inc", "corp", "corporation", "company", "companies", "group", "holdings", "holding", "technology", "technologies", "limited", "plc", "sa", "ltd", "nv", "ag", "co", "intl", "international", "global", "digital", "capital", "financial", "systems", "network", "networks", "labs", "energy", "therapeutics", "pharma", "bio", "platforms", "communication", "consumer", "services"]);
    const subj = new Set();
    String(s.ticker || "").toLowerCase().split(/[^a-z0-9]+/).forEach(w => { if (w.length >= 2) subj.add(w); });
    String(s.name || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).forEach(w => { if (w.length >= 5 && !stop.has(w)) subj.add(w); });
    newsList = newsList.filter(n => { const t = (n.title || "").toLowerCase(); return [...subj].some(w => t.includes(w)); });
  }
  const all = newsList.map(n => (n.title || "").toLowerCase()).join(" | ");
  const hit = k => caHit(all, CA_KEYS[k]);
  const notes = [], flags = [];
  let score = 0, exclude = false, spekulatif = false;

  // HARD EXCLUDE: hanya sinyal berat & spesifik (kata kunci longgar → banyak salah tangkap)
  if (caHit(all, ["pkpu", "pailit", "dinyatakan pailit", "gagal bayar", "suspensi saham", "suspensi efek", "penghapusan pencatatan", "pembatalan pencatatan", "delisting dari bursa", "dihapus dari bursa"])) {
    exclude = true; notes.push("Ada berita PKPU/pailit/gagal bayar/suspensi/penghapusan pencatatan → dikecualikan dari rekomendasi.");
  }
  // WASPADA (bukan exclude): pengawasan bursa — terlalu berisik untuk dijadikan hard-exclude dari berita
  if (hit("fca")) {
    score -= 5; flags.push("waspada_bursa");
    notes.push("Ada indikasi pengawasan bursa (suspensi/UMA/papan pemantauan khusus/notasi khusus) — verifikasi di idx.co.id. Skor dipotong 5.");
  }
  if (hit("buyback")) { score += 8; notes.push("Buyback (+8) — cek besar dana vs kapitalisasi; di atas 2% sinyalnya kuat."); flags.push("buyback"); }
  if (hit("tender")) { score += 10; notes.push("Tender offer / go private (+10) — umumnya ada premium di atas harga pasar."); flags.push("tender"); }
  if (hit("insider")) { score += 8; notes.push("Indikasi insider/direksi membeli (+8)."); flags.push("insider_beli"); }
  if (hit("privatePlacement")) {
    if (caHit(all, CA_STRATEGIS)) { score += 5; notes.push("Private placement ke investor strategis (+5)."); flags.push("pp_strategis"); }
    else { score -= 5; notes.push("Private placement tanpa pembeli strategis (−5) → potensi dilusi."); flags.push("dilusi_potensial"); }
  }
  if (hit("rightsIssue")) {
    const utang = caHit(all, CA_UTANG);
    score -= utang ? 15 : 10;
    notes.push("Rights issue/HMETD (" + (utang ? "−15, untuk bayar utang" : "−10") + ") → waspada dilusi & tekanan pasca ex-date.");
    flags.push("dilusi_potensial");
  }
  if (hit("waran")) { score -= 5; notes.push("Waran (−5) → dilusi saat konversi bila in-the-money."); flags.push("dilusi_potensial"); }
  if (hit("gadai")) { score -= 10; notes.push("Gadai saham pengendali (−10) → risiko forced sell & ARB beruntun."); flags.push("gadai"); }
  if (hit("pengendali")) {
    spekulatif = true; flags.push("spekulatif");
    if (s.mcap && s.mcap < 1e12) { score -= 5; notes.push("Perubahan pengendali/backdoor listing di emiten kecil (< Rp1 T) → spekulatif, tidak masuk top pick."); }
    else notes.push("Ada isu perubahan pengendali/kegiatan usaha.");
  }
  if (hit("rups")) notes.push("Ada agenda RUPS — pantau agenda RI/PMTHMETD/split (±3 minggu sebelum rapat).");

  // ---------- Pasar AS (kamus English: EDGAR/earnings/corporate actions) ----------
  if (s.market === "US") {
    // gabung sinyal EDGAR faktual (filing resmi, bukan sekadar berita)
    if (s.edgar) {
      score += s.edgar.score || 0;
      (s.edgar.notes || []).forEach(n => notes.push(n));
      (s.edgar.flags || []).forEach(f => { if (!flags.includes(f)) flags.push(f); });
      if (s.edgar.exclude) exclude = true;
    }
    const uhit = k => caHit(all, US_KEYS[k]);
    if (uhit("bahaya") || caHit(all, US_SUB1)) { exclude = true; notes.push("Sinyal bahaya AS (Chapter 11/going concern/restatement/auditor mundur/peringatan delisting/OTC/harga <$1) → dikecualikan."); }
    if (s.px != null && s.px < 1) { exclude = true; notes.push("Harga di bawah $1 → risiko surat peringatan delisting Nasdaq/NYSE (aturan $1, 30 hari)."); flags.push("subdollar"); }
    if (uhit("offering")) { score -= 8; notes.push("Secondary/follow-on offering (−8) → dilusi; harga biasanya turun 5–15% saat pricing."); flags.push("dilusi_potensial"); }
    if (uhit("atm")) { score -= 10; notes.push("Program ATM/shelf (−10) → saham baru menetes ke pasar berbulan-bulan, menekan harga."); flags.push("dilusi_potensial"); }
    if (uhit("convertible")) { score -= 5; notes.push("Convertible notes (−5) → dilusi masa depan + potensi short hedging pembeli obligasi."); flags.push("dilusi_potensial"); }
    if (uhit("lockup")) { score -= 5; notes.push("Lock-up expiry (−5) → insider boleh menjual (90–180 hari pasca IPO), tekanan menjelang tanggalnya."); }
    if (uhit("spac")) { spekulatif = true; flags.push("spekulatif"); notes.push("SPAC/de-SPAC → rekam jejak buruk, flag spekulatif."); }
    if (uhit("buyback")) { score += 8; notes.push("Buyback AS (+8) — cek pengurangan saham beredar >2%/tahun = positif."); flags.push("buyback"); }
    if (uhit("divraise")) { score += 5; notes.push("Kenaikan dividen (+5) — dividend aristocrat (10–25 thn naik) cenderung stabil."); }
    if (uhit("split")) notes.push("Stock split — netral secara nilai, tapi sering ada pop ritel di sekitar pengumuman.");
    if (uhit("insiderBuy")) { score += 8; notes.push("Indikasi insider membeli (+8) — cluster buy sinyal kuat; penjualan insider (10b5-1) bobotnya lemah."); flags.push("insider_beli"); }
    if (uhit("sp500")) { score += 8; notes.push("Masuk S&P 500 (+8) — harga biasanya naik antara pengumuman & tanggal efektif."); }
    if (uhit("activist")) { score += 5; notes.push("Investor aktivis masuk (+5) — sering positif jangka pendek (13D)."); }
    if (uhit("target")) { score += 10; notes.push("Target akuisisi (+10) — harga mendekati harga penawaran."); flags.push("tender"); }
    if (uhit("acquirer")) { score -= 5; notes.push("Saham pengakuisisi (−5) — pembeli sering turun pasca pengumuman."); }
    // risiko earnings gap (3 hari sebelum laporan)
    if (s.earnInDays != null && s.earnInDays >= 0 && s.earnInDays <= 3) {
      flags.push("earnings_dekat");
      notes.push("Laporan laba " + (s.earnInDays === 0 ? "hari ini" : s.earnInDays + " hari lagi") + " (" + s.earnDate + ") — jangan buka posisi baru: risiko gap semalam besar, saham AS bisa ±50%.");
    }
    // short interest: >20% = squeeze bila ada katalis, bahaya bila tidak
    const sp = s.shortPct != null ? (s.shortPct > 1 ? s.shortPct : s.shortPct * 100) : null;
    if (sp != null && sp > 20) { flags.push("short_tinggi"); notes.push("Short interest " + sp.toFixed(0) + "% dari float — di atas 20%: peluang short squeeze bila ada katalis positif, tapi artinya pasar melihat masalah bila tidak ada katalis."); }
    if (s.daysToCover != null && s.daysToCover > 5) notes.push("Days to cover " + s.daysToCover.toFixed(1) + " hari (>5 = tinggi).");
  }

  // ---------- Crypto (tokenomics, listing, keamanan) ----------
  if (s.market === "CRYPTO") {
    const chit = k => caHit(all, CR_KEYS[k]);
    if (chit("hack") || chit("depeg") || chit("honeypot")) { exclude = true; notes.push("Hack/depeg/honeypot-rugpull terdeteksi di berita → dikecualikan."); }
    if (chit("monitoring")) { exclude = true; notes.push("Tag Monitoring / kandidat delisting bursa → dikecualikan."); }
    if (chit("unlock")) { score -= 15; notes.push("Token unlock besar (−15) → tekanan jual; harga sering turun 1–4 minggu sebelumnya. Cek Tokenomist/DefiLlama."); flags.push("dilusi_potensial"); }
    if (chit("listing")) notes.push("Listing bursa besar — sering pump sesaat lalu turun; jangan kejar bila sudah naik >30%.");
    if (chit("burn")) { score += 5; notes.push("Buyback & burn (+5) — mirip buyback saham."); flags.push("buyback"); }
    if (chit("etf")) { score += 5; notes.push("Isu ETF/institusi (+5) — positif sebelum persetujuan, sering sell-the-news sesudahnya."); }
    if (chit("upgrade")) notes.push("Upgrade jaringan besar — pola sama: naik sebelum, turun sesudah.");
    if (chit("airdrop")) notes.push("Airdrop — penerima biasanya langsung menjual setelah listing.");
  }

  // struktural (dari data harga Yahoo)
  if (s.reverseSplit) {
    const extra = (s.market === "US" && s.mcap != null && s.mcap < 2e9) ? -15 : -10;
    score += extra; notes.push("Reverse stock split (" + extra + ")" + (extra === -15 ? " — di saham kecil AS hampir selalu sinyal buruk." : " — umumnya sinyal merah.")); flags.push("reverse_split");
  }
  if (s.stockSplit) { notes.push("Baru stock split — harga historis wajib di-adjust; harga tampak 'murah' semu."); flags.push("stock_split"); }
  if (s.ipoBaru) { notes.push("IPO < 12 bulan → skor teknikal belum valid (riwayat harga terlalu pendek)."); flags.push("ipo_baru"); }
  if (s.exDivDays != null && s.exDivDays <= 7) notes.push("Baru/sedang ex-dividen (" + s.lastDiv + ") — sebagian penurunan harga berasal dari dividen, bukan crash.");

  return { score: Math.max(-25, Math.min(25, score)), notes, flags, exclude, spekulatif };
}

// ---------- Skor ----------
const COMMODITY_SECTORS = ["Energy", "Basic Materials"];
// industri komoditas sejati (perkebunan/agrikultur dkk) — Consumer Defensive BUKAN komoditas
const COMMODITY_INDUSTRY = /agricultur|farm product|plantation|palm|poultry|metals|mining|oil|gas|coal|steel|gold|silver|copper|nickel|aluminum|lumber|specialty.*mining/i;
// batas winsorisasi pertumbuhan (basis rendah bikin angka ekstrem, mis. +11.194%)
const clamp = (x, lo, hi) => (x == null ? null : Math.max(lo, Math.min(hi, x)));

// ---------- SKOR ----------
// Tahap 1 (per simbol, saat data diambil): teknikal saja.
// Tahap 2 (setelah semua simbol ada): valuasi relatif sektor, kualitas, kekuatan relatif,
//   pengali rezim, penalti ARB/likuiditas → total.
function techScore(s) {
  let trend = 0, mom = 0, bandar = 0;
  const add = (c, p) => c ? p : 0;
  const CR = s.market === "CRYPTO";

  // crash_penalty: jatuh tajam 1 hari (<= -7%) atau 5 hari (<= -15%); dikecualikan bila ex-div ≤3 hari
  const exDivNow = s.exDivDays != null && s.exDivDays <= 3;
  const crash = !exDivNow && ((s.chg1d != null && s.chg1d <= -7) || (s.ret1d != null && s.ret1d <= -7) || (s.ret5d != null && s.ret5d <= -15));
  // commodity_flag: PER rendah di sektor KOMODITAS SEJATI (energi/material/perkebunan) = puncak siklus
  const commodity = !CR && (COMMODITY_SECTORS.includes(s.sector) || COMMODITY_INDUSTRY.test(s.industry || ""));
  // liquidity_filter: nilai transaksi harian < Rp 5 miliar (hanya IDX)
  const illiquid = s.market === "IDX" && s.turnover != null && s.turnover < 5e9;

  trend += add(s.px && s.ma20 && s.px > s.ma20, 8);
  trend += add(s.ma20 && s.ma50 && s.ma20 > s.ma50, 8);
  trend += add(s.ma50 && s.ma200 && s.ma50 > s.ma200, 6);
  trend += add(s.ma200 && s.px > s.ma200, 6);
  trend = Math.min(trend, 28);

  mom += add(s.rsi != null && s.rsi >= 45 && s.rsi <= 68, 10);
  mom += add(s.rsi != null && s.rsi > 68, -6);
  mom += add(s.ret1m != null && s.ret1m > 0, 5);
  mom += add(s.ret3m != null && s.ret3m > 5, 5);
  mom = Math.max(0, Math.min(mom, 20));

  // aliran volume: volume besar HANYA positif bila harga naik/flat — saat turun = distribusi
  bandar += add(s.accum != null && s.accum > 0.55, 8);
  bandar += add(s.accum != null && s.accum > 0.60, 4);
  bandar += add(s.obv > 0, 5);
  bandar += add(s.mfi != null && s.mfi > 50 && s.mfi < 85, 5);
  const spike = s.volSpike != null && s.volSpike > 1.4;
  bandar += spike ? ((s.chg1d == null || s.chg1d > -1) ? 4 : -4) : 0;
  bandar = Math.max(0, Math.min(bandar, 26));

  if (crash) { trend = 0; mom = 0; }

  return { val: 0, qual: 0, rel: 0, trend, mom, bandar, total: trend + mom + bandar,
           flags: { crash, exdiv: exDivNow, suspect: !!s.suspect, mislead: !!s.mislead, illiquid, commodity, arb: !!(s.arb && s.arb.excludeArb), arbToday: !!(s.arb && s.arb.isArb) } };
}

// Tahap 2: finalisasi skor (butuh data sektor & indeks sudah lengkap)
function finalizeScores(list, ctx) {
  // statistik sektor (median PER/PBV) per pasar — valuasi jadi RELATIF, bukan ambang absolut
  const med = (a) => { const x = a.filter(v => v != null && v > 0).sort((p, q) => p - q); return x.length ? x[Math.floor(x.length / 2)] : null; };
  const stats = {};
  list.forEach(s => {
    if (s.market === "CRYPTO") return;
    const k = s.market + "|" + (s.sector || "?");
    (stats[k] = stats[k] || { pe: [], pb: [], n: 0 });
    stats[k].pe.push(s.pe); stats[k].pb.push(s.pb); stats[k].n++;
  });
  Object.values(stats).forEach(x => { x.medPe = med(x.pe); x.medPb = med(x.pb); });

  list.forEach(s => {
    const sc = s.score, CR = s.market === "CRYPTO";
    const st = stats[s.market + "|" + (s.sector || "?")] || {};

    // --- VALUASI RELATIF SEKTOR (maks 36) ---
    let v = 0;
    if (!CR) {
      if (s.pe != null && s.pe > 0) {
        const r = st.medPe ? s.pe / st.medPe : null;
        v += r == null ? (s.pe < 12 ? 12 : 0) : r < 0.6 ? 18 : r < 0.85 ? 14 : r < 1.1 ? 10 : r < 1.5 ? 6 : r < 2 ? 2 : 0;
      }
      if (s.pb != null && s.pb > 0) {
        const r = st.medPb ? s.pb / st.medPb : null;
        v += r == null ? (s.pb < 1 ? 8 : 0) : r < 0.6 ? 12 : r < 0.85 ? 9 : r < 1.1 ? 6 : r < 1.5 ? 3 : 0;
      }
      if (s.divYield != null) {
        const base = s.divYield > 0.05 ? 6 : s.divYield > 0.03 ? 4 : s.divYield > 0.015 ? 2 : 0;
        const stability = s.divYears != null ? Math.min(1, s.divYears / 4) : 1;
        v += Math.round(base * stability);
      }
      if (sc.flags.commodity) v = Math.round(v * 0.5);
    } else {
      // VALUASI KRIPTO (proxy jaringan, maks 36): NVT = mcap / turnover harian USD + drawdown dari puncak 52 mg
      const usdVol = (s.avgVol && s.px) ? s.avgVol * s.px : (s.turnover || null);
      const nvt = (s.mcap && usdVol) ? s.mcap / usdVol : null;
      if (nvt != null) v += nvt < 25 ? 16 : nvt < 50 ? 11 : nvt < 100 ? 6 : 0;
      const dd = (s.high52 && s.px) ? (s.px / s.high52 - 1) * 100 : null;
      if (dd != null) v += dd <= -70 ? 14 : dd <= -50 ? 10 : dd <= -30 ? 6 : dd <= -15 ? 3 : 0;
      if (s.fdvMcap != null) v -= s.fdvMcap > 2 ? 8 : s.fdvMcap > 1.5 ? 5 : s.fdvMcap > 1.2 ? 2 : 0;   // dilusi masa depan menekan valuasi
      v = Math.max(0, v);
    }
    sc.val = Math.min(v, 36);

    // --- KUALITAS / ANTI VALUE TRAP (maks 14) ---
    let q = 0;
    if (!CR) {
      q += s.roe != null ? (s.roe > 0.15 ? 6 : s.roe > 0.08 ? 4 : s.roe > 0 ? 2 : 0) : 0;
      q += s.earnGrowth != null ? (s.earnGrowth > 0.15 ? 4 : s.earnGrowth > 0 ? 2 : 0) : 0;
      q += s.debtToEquity != null ? (s.debtToEquity < 100 ? 4 : s.debtToEquity < 200 ? 2 : 0) : 0;
      const valueTrap = s.pe != null && s.pe < 12 && (s.earnGrowth ?? 0) < 0 && (s.revGrowth ?? 0) < 0;
      if (valueTrap) { sc.val = Math.round(sc.val * 0.5); sc.flags.valueTrap = true; }
    } else {
      // KUALITAS KRIPTO (proxy, maks 14): likuiditas (velocity) + ukuran mcap + umur token
      const usdVol = (s.avgVol && s.px) ? s.avgVol * s.px : (s.turnover || null);
      const vel = (s.mcap && usdVol) ? usdVol / s.mcap : null;
      q += vel != null ? (vel > 0.15 ? 6 : vel > 0.05 ? 4 : vel > 0.02 ? 2 : 0) : 0;
      q += s.mcap != null ? (s.mcap > 5e10 ? 4 : s.mcap > 1e10 ? 3 : s.mcap > 1e9 ? 2 : 1) : 0;
      if (s.ipo) { const yrs = (Date.now() - new Date(s.ipo).getTime()) / 31557600000; q += yrs >= 6 ? 4 : yrs >= 3 ? 3 : yrs >= 1.5 ? 2 : 1; }
      if (s.fdvMcap != null) q += s.fdvMcap <= 1.1 ? 2 : s.fdvMcap <= 1.5 ? 1 : 0;   // tokenomics sehat (dilusi kecil)
    }
    sc.qual = Math.min(q, 14);

    // --- KEKUATAN RELATIF vs INDEKS (1 bulan) (maks 12) — tetap bernilai saat crash/rezim bearish
    let rel = 0;
    const bench = ctx.benchRet1m[s.market];
    if (s.ret1m != null && bench != null) {
      const d = s.ret1m - bench;
      rel = d > 10 ? 12 : d > 3 ? 9 : d > 0 ? 6 : d > -5 ? 3 : 0;
    }
    sc.rel = rel;

    let total = sc.val + sc.qual + sc.trend + sc.mom + sc.bandar + rel;

    // --- PENALTI & PENGALI ---
    if (sc.flags.illiquid) total = Math.round(total * 0.7);
    if (sc.flags.arbToday) { total = Math.max(0, total - 15); s.caNotesExtra = "Menyentuh ARB hari ini → tidak bisa dijual dengan wajar; diskon −15 & jangan dibuka posisi baru."; }
    if (ctx.bearish && s.market === "IDX") { total = Math.round(total * 0.85); sc.flags.bearishRegime = true; }
    if (ctx.usRiskOff && s.market !== "IDX") { total = Math.round(total * 0.9); sc.flags.usRiskOff = true; }
    sc.total = Math.max(0, total);
  });
}

(async () => {
  console.log("→ Ambil cookie & crumb…");
  cache.crumb = await getCrumb();
  console.log("  crumb:", cache.crumb ? "ok" : "TIDAK");

  const symbols = UNIVERSE.map(u => u.symbol);
  console.log(`→ Snapshot ${symbols.length} instrumen (IDX ${IDX.length} · US ${US.length} · Crypto ${CRYPTO.length})…`);
  const quotes = await batchQuote(symbols);
  const qmap = Object.fromEntries(quotes.map(q => [q.symbol, q]));
  console.log("  dapat", quotes.length, "quote");

  const results = [];
  const idx = { i: 0 };
  let done = 0;
  const CONC = 8;
  const gagal = [];   // simbol yang tidak menghasilkan baris (Yahoo menolak/timeout)

  // Olah SATU simbol → dorong ke results. Return true bila berhasil.
  // Dipisah dari worker() supaya simbol yang gagal bisa dicoba ulang apa adanya.
  async function proses(e) {
    const q = qmap[e.symbol];
    try {
      const full = await chartFull(e.symbol, "20y");
      const rows = full ? full.rows : null;
      if (q && rows && rows.length > 60) {
        const closes = rows.map(r => r.c), highs = rows.map(r => r.h), lows = rows.map(r => r.l), vols = rows.map(r => r.v);
        const last = rows[rows.length - 1];
        // pakai harga live dari kutipan bila ada (seri harian Yahoo sering tertinggal 1 hari)
        const px = (q.regularMarketPrice != null && q.regularMarketPrice > 0) ? q.regularMarketPrice : closes[closes.length - 1];
        const todayISO = new Date().toISOString().slice(0, 10);
        const lastBarDay = new Date(last.t * 1000).toISOString().slice(0, 10);
        // Bila bar terakhir = hari ini, keluarkan; lalu harga live dijadikan bar "hari ini" yg seragam.
        // Semua indikator (MA/RSI/MFI/OBV) jadi konsisten antar-unduhan, tak lagi bergantung pada
        // apakah Yahoo sudah memuat bar hari berjalan atau belum (penyebab hasil berubah-ubah).
        const useToday = lastBarDay === todayISO && closes.length > 1;
        const refCloses = useToday ? closes.slice(0, -1) : closes;
        const refHighs = useToday ? highs.slice(0, -1) : highs;
        const refLows = useToday ? lows.slice(0, -1) : lows;
        const refVols = useToday ? vols.slice(0, -1) : vols;
        const volToday = q.regularMarketVolume ?? last.v ?? 0;
        const indC = refCloses.concat(px);
        const indH = refHighs.concat(Math.max(px, refHighs[refHighs.length - 1] ?? px));
        const indL = refLows.concat(Math.min(px, refLows[refLows.length - 1] ?? px));
        const indV = refVols.concat(volToday);
        const volMA20 = sma(refVols, 20);
        const hi20 = Math.max(...refHighs.slice(-20)), lo20 = Math.min(...refLows.slice(-20));
        const ret = n => refCloses.length > n ? (px / refCloses[refCloses.length - n] - 1) * 100 : null;
        const name = e.market === "CRYPTO" ? (CRYPTO_NAMES[e.ticker] || (q.shortName || e.ticker).replace(/\s*USD$/, "")) : (q.shortName || q.longName || e.ticker);

        // --- bahan sinyal backtest (dipakai penuh hanya untuk IDX, lihat run8.js) ---
        // puncak close 252 bar SEBELUM hari ini → dasar uji breakout 52 minggu (tanpa look-ahead)
        const hi55 = refHighs.length >= 55 ? Math.max.apply(null, refHighs.slice(-55)) : null;   // high tertinggi 55 bar SEBELUM hari ini (breakout 55 hari)
        const ma200Prev = indC.length >= 221 ? sma(indC.slice(0, -20), 200) : null;                   // MA200 dua puluh bar lalu (cek MA200 naik)
        const hi252 = refCloses.length >= 63 ? Math.max.apply(null, refCloses.slice(-252)) : null;
        let atr14 = null;
        if (indC.length >= 15) {
          let acc = 0;
          for (let i = indC.length - 14; i < indC.length; i++) {
            const pc = indC[i - 1];
            const tr = Math.max(indH[i] - indL[i], pc != null ? Math.abs(indH[i] - pc) : 0, pc != null ? Math.abs(indL[i] - pc) : 0);
            acc += tr;
            }
          atr14 = acc / 14;
          }

        const s = {
          ticker: e.ticker, symbol: e.symbol, market: e.market, cur: q.currency || (e.market === "IDX" ? "IDR" : "USD"),
          name,
          px, chg1d: q.regularMarketChangePercent ?? null,
          pe: q.trailingPE ?? null, fwdPe: q.forwardPE ?? null, pb: q.priceToBook ?? null,
          mcap: q.marketCap ?? null, divYield: q.trailingAnnualDividendYield ?? null,
          high52: q.fiftyTwoWeekHigh ?? null, low52: q.fiftyTwoWeekLow ?? null,
          avgVol: q.averageDailyVolume3Month ?? volMA20,
          ma20: sma(indC, 20), ma50: sma(indC, 50), ma100: sma(indC, 100), ma200: sma(indC, 200), ma200Prev, hi55,
          rsi: rsi(indC, 14), mfi: mfi(indH, indL, indC, indV, 14), obv: obvSlope(indC, indV),
          accum: accumulation(indC, indV, 20), volSpike: volMA20 ? volToday / volMA20 : null,
          ret1d: ret(1), ret5d: ret(5), ret1m: ret(21), ret3m: ret(63), ret6m: ret(126), ret120: ret(120), hi20, lo20,
          offHigh: hi20 ? (px / hi20 - 1) * 100 : null, volToday, hi252, atr14,
          };
        // aksi korporasi struktural (dari riwayat dividen/split Yahoo)
        const nowMs = Date.now();
        const daysAgo = d => (nowMs - new Date(d).getTime()) / 86400000;
        const lastDiv = full.dividends[full.dividends.length - 1] || null;
        s.lastDiv = lastDiv ? lastDiv.date : null;
        s.exDivDays = lastDiv ? Math.round(daysAgo(lastDiv.date)) : null;
        s.divYears = new Set(full.dividends.map(d => d.date.slice(0, 4))).size;
        const splitRecent = full.splits.filter(x => daysAgo(x.date) <= 550);
        s.reverseSplit = splitRecent.some(x => x.num < x.den);
        s.stockSplit = splitRecent.some(x => x.num > x.den);
        s.ipoBaru = full.firstTrade ? daysAgo(full.firstTrade) < 365 : false;
        // batas ARA/ARB + deteksi ARB beruntun
        const rule = arbRule(px);
        const prevCloseLive = (s.chg1d != null && px) ? px / (1 + s.chg1d / 100) : (refCloses[refCloses.length - 1] || null);
        const isArbToday = s.chg1d != null && hitArb(prevCloseLive, px);
        let arbStreak = 0;
        for (let i = refCloses.length - 1; i > 0; i--) { if (hitArb(refCloses[i - 1], refCloses[i])) arbStreak++; else break; }
        const arbStreakNow = arbStreak + (isArbToday ? 1 : 0);
        s.arb = {
          limitPct: rule ? rule.arbPct : null, limitRp: rule ? rule.arbRp : null,
          araPct: rule ? rule.araPct : null, araRp: rule ? rule.araRp : null,
          isArb: isArbToday, streak: arbStreakNow, excludeArb: arbStreakNow >= 2,
          };

        // nilai transaksi harian (mata uang lokal) sebagai proxy likuiditas
        s.turnover = s.avgVol ? px * s.avgVol : null;
        // data_sanity: lonjakan >25% tapi volume tidak naik → curiga data salah/bug dividen
        s.suspect = Math.abs(s.chg1d ?? 0) > 25 && !((s.volSpike ?? 0) > 1.2);
        // kutipan harian vs seri harian tidak konsisten → tandai
        s.mislead = s.chg1d != null && s.ret1d != null && Math.abs(s.chg1d - s.ret1d) > 8;

        const sm = await summary(e.symbol);
        if (sm) {
          s.sector = sm.assetProfile?.sector || null;
          s.industry = sm.assetProfile?.industry || null;
          s.roe = clamp(num(sm.financialData, "returnOnEquity"), -1, 0.6);
          s.margin = num(sm.financialData, "profitMargins");
          s.revGrowth = clamp(num(sm.financialData, "revenueGrowth"), -1, 2);
          s.earnGrowth = clamp(num(sm.financialData, "earningsGrowth"), -1, 2);
          s.debtToEquity = num(sm.financialData, "debtToEquity");
          s.currentRatio = num(sm.financialData, "currentRatio");
          s.eps = num(sm.defaultKeyStatistics, "trailingEps");
          s.bvps = num(sm.defaultKeyStatistics, "bookValue");
          s.floatShares = num(sm.defaultKeyStatistics, "floatShares");
          s.sharesOut = num(sm.defaultKeyStatistics, "sharesOutstanding");
          s.floatPct = (s.floatShares && s.sharesOut) ? s.floatShares / s.sharesOut : null;
          s.exDiv = sm.summaryDetail?.exDividendDate && sm.summaryDetail.exDividendDate.raw ? new Date(sm.summaryDetail.exDividendDate.raw * 1000).toISOString().slice(0, 10) : null;
          // short interest (pengganti sebagian "short interest % float" & days to cover)
          s.shortPct = num(sm.defaultKeyStatistics, "shortPercentOfFloat");
          s.daysToCover = num(sm.defaultKeyStatistics, "shortRatio");
          // --- PERBAIKAN MATA UANG LAPORAN ---
          // Beberapa emiten IDX (PGAS/ADRO/BYAN/ITMG/BUMI dkk) melaporkan laporan keuangan dalam USD.
          // Yahoo membagi harga (IDR) dgn bvps (USD) → PBV 10.000×+ palsu & valuasi jadi 0.
          // Catatan: trailingEps dari Yahoo SUDAH dalam mata uang kutipan, jadi jangan dikonversi —
          // yang perlu dikonversi hanya bookValue (bvps).
          const finCur = sm.financialData?.financialCurrency || sm.defaultKeyStatistics?.financialCurrency || null;
          s.finCur = finCur;
          if (finCur && s.cur && finCur !== s.cur) {
            const rate = await fxRate(finCur, s.cur);
            if (rate != null) {
              s.fxConverted = true;
              if (s.bvps != null) s.bvps = s.bvps * rate;
              }
            }
          // PBV & PER dihitung ulang dari px/bvps & px/eps (konsisten mata uang) bila tersedia
          if (s.bvps != null && s.bvps > 0) s.pb = px / s.bvps;
          if (s.eps != null && s.eps > 0) s.pe = px / s.eps;
          // data sanity: bila masih tak masuk akal → buang, jangan dipakai skor
          if (s.pb != null && (s.pb < 0.01 || s.pb > 100)) { s.pb = null; s.pbSuspect = true; }
          if (s.pe != null && (s.pe < 0.5 || s.pe > 500)) { s.pe = null; s.peSuspect = true; }
          }
        // tanggal earnings dari kutipan (khusus AS: risiko gap; jangan beli ≤3 hari sebelumnya)
        const earnTs = q.earningsTimestamp;
        s.earnDate = earnTs ? new Date(earnTs * 1000).toISOString().slice(0, 10) : null;
        s.earnInDays = earnTs ? Math.round((earnTs * 1000 - Date.now()) / 86400000) : null;
        s.ret12m = ret(252);
        s.mom121 = (s.ret12m != null && s.ret1m != null) ? ((1 + s.ret12m / 100) / (1 + s.ret1m / 100) - 1) * 100 : null;
        s.score = techScore(s);

        // grafik: pakai ~1 tahun terakhir saja (walau data mentah 5 tahun)
        const dispRows = rows.slice(-251);
        const step = Math.max(1, Math.ceil(dispRows.length / 64));
        s.series = [];
        for (let k = 0; k < dispRows.length; k += step) s.series.push({ d: new Date(dispRows[k].t * 1000).toISOString().slice(0, 10), c: Math.round(dispRows[k].c * 10000) / 10000, v: dispRows[k].v });
        const lastP = s.series[s.series.length - 1];
        if (!lastP || lastP.c !== Math.round(px * 10000) / 10000) s.series.push({ d: todayISO, c: Math.round(px * 10000) / 10000, v: volToday });
        // seri sepanjang riwayat (bulanan) untuk grafik "Semua" + penanda stock split
        const stepA = Math.max(1, Math.ceil(rows.length / 150));
        s.seriesAll = [];
        for (let k = 0; k < rows.length; k += stepA) s.seriesAll.push({ d: new Date(rows[k].t * 1000).toISOString().slice(0, 10), c: Math.round(rows[k].c * 10000) / 10000 });
        const lastA = s.seriesAll[s.seriesAll.length - 1];
        if (!lastA || lastA.c !== Math.round(px * 10000) / 10000) s.seriesAll.push({ d: todayISO, c: Math.round(px * 10000) / 10000 });
        s.splits = (full.splits || []).slice(-12).map(x => ({ d: x.date, ratio: x.num + ":" + x.den }));
        s.ipo = full.firstTrade || null;
        try { s.fundHist = await fundHistory(e.symbol); } catch (e2) {}
        // volatilitas tahunan dari 252 hari terakhir (untuk ukuran posisi)
        { const rr = refCloses.slice(-253); let sq = 0, n = 0;
          for (let i = 1; i < rr.length; i++) { const d = Math.log(rr[i] / rr[i - 1]); if (isFinite(d)) { sq += d * d; n++; } }
          s.volAnn = n > 20 ? Math.sqrt(sq / n * 252) * 100 : null; }

        results.push(s);
        return true;
      }
      return false;
    } catch (err) { return false; }
  }

  async function worker() {
    while (idx.i < UNIVERSE.length) {
      const e = UNIVERSE[idx.i++];
      if (!(await proses(e))) gagal.push(e.symbol);
      done++;
      if (done % 20 === 0) console.log(`   …${done}/${UNIVERSE.length}`);
      await sleep(90);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));

  // Putaran kedua: simbol yang gagal (khususnya kripto -USD sering ditolak acak oleh Yahoo).
  // Tanpa ini kripto bisa hilang total dari laporan padahal halaman tetap diterbitkan.
  if (gagal.length) {
    const ulang = [...new Set(gagal)];
    console.log(`→ Ulangi ${ulang.length} simbol yang gagal…`);
    for (const sym of ulang) {
      const e = UNIVERSE.find(u => u.symbol === sym);
      if (!e) continue;
      let ok = false;
      for (let coba = 1; coba <= 2 && !ok; coba++) {
        if (coba > 1) await sleep(1200 * coba);
        ok = await proses(e);
      }
      if (!ok) console.log(`   ✗ ${sym} tetap gagal`);
    }
    const tetap = [...new Set(gagal)].filter(sym => !results.some(r => r.symbol === sym));
    if (tetap.length) console.log(`   tetap gagal: ${tetap.join(", ")}`);
  }

  // Regime pasar: IHSG vs MA200 (market_regime)
  console.log("→ Cek regime pasar (IHSG)…");
  let regime = null;
  {
    const rows = await chart("^JKSE", "5y");
    if (rows && rows.length > 60) {
      const closesRaw = rows.map(r => r.c);
      const rq = await batchQuote(["^JKSE"]);
      const live = rq[0] && rq[0].regularMarketPrice > 0 ? rq[0].regularMarketPrice : null;
      const px = live != null ? live : closesRaw[closesRaw.length - 1];
      // samakan dgn saham: harga live jadi bar "hari ini"
      const lastDay = new Date(rows[rows.length - 1].t * 1000).toISOString().slice(0, 10);
      const base = (lastDay === new Date().toISOString().slice(0, 10) && closesRaw.length > 1) ? closesRaw.slice(0, -1) : closesRaw;
      const closes = base.concat(px);
      const chg = rq[0] ? (rq[0].regularMarketChangePercent ?? null) : null;
      regime = {
        name: "IHSG", px, chg1d: chg, ma200: sma(closes, 200), ma50: sma(closes, 50), ma20: sma(closes, 20),
        bearish: sma(closes, 200) != null && px < sma(closes, 200),
        ret1m: closes.length > 22 ? (px / closes[closes.length - 22] - 1) * 100 : null,
        ret6m: closes.length > 127 ? (px / closes[closes.length - 127] - 1) * 100 : null,
      };
      console.log("  IHSG", px.toFixed(0), "| MA200", regime.ma200?.toFixed(0), "→", regime.bearish ? "BEARISH" : "netral/bullish");
    } else { console.log("  regime tidak tersedia"); }
  }

  // SANITY CHECK INDEKS (A4): lonjakan indeks wajib dibuktikan oleh breadth saham.
  // Bila IHSG bilang anjlok hebat tapi mayoritas saham di universe tidak turun → curiga glitch Yahoo.
  {
    const idxChg = regime.chg1d;
    const idxStocks = results.filter(s => s.market === "IDX" && s.chg1d != null);
    if (idxChg != null && idxStocks.length >= 10) {
      const sorted = idxStocks.map(s => s.chg1d).sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)];
      const down3 = idxStocks.filter(s => s.chg1d < -3).length / idxStocks.length;
      const nearArb = idxStocks.filter(s => s.chg1d <= -9).length / idxStocks.length;
      regime.breadth = { medianChg: med, shareDown3: down3, shareNearArb: nearArb, n: idxStocks.length };
      const extreme = Math.abs(idxChg) >= 5;
      const corroborated = Math.abs(med - idxChg) < 8 && (idxChg < 0 ? down3 > 0.3 : down3 < 0.7);
      if (extreme && !corroborated) {
        regime.suspectIndex = true;
        console.log(`  ⚠️ SANITY: pergerakan IHSG ${idxChg.toFixed(1)}% TIDAK didukung breadth (median saham ${med.toFixed(1)}%, ${ (down3*100).toFixed(0)}% turun >3%) → kemungkinan glitch data. Jangan andalkan regime hari ini.`);
      } else if (extreme && corroborated) {
        regime.crashConfirmed = true;
        console.log(`  ✓ SANITY: IHSG ${idxChg.toFixed(1)}% terkonfirmasi breadth (median ${med.toFixed(1)}%, ${(nearArb*100).toFixed(0)}% mendekati ARB) → koreksi NYATA, bukan glitch.`);
      }
    }
  }

  // Regime AS: S&P 500 vs MA200 + VIX + yield 10 thn + DXY (risk-on/off global)
  console.log("→ Cek regime AS…");
  {
    try {
      const rq = await batchQuote(["^GSPC", "^VIX", "^TNX", "DX-Y.NYB"]);
      const qm = Object.fromEntries(rq.map(q => [q.symbol, q]));
      const gf = await chartFull("^GSPC", "1y");
      const grows = gf ? gf.rows : null;
      if (grows && grows.length > 200 && qm["^GSPC"]) {
        const gc = grows.map(r => r.c);
        const spx = (qm["^GSPC"].regularMarketPrice > 0) ? qm["^GSPC"].regularMarketPrice : gc[gc.length - 1];
        const closes = gc.concat(spx);
        const ma200 = sma(closes, 200);
        const vix = qm["^VIX"] ? qm["^VIX"].regularMarketPrice : null;
        regime.us = {
          spx, ma200, vix,
          chg1d: qm["^GSPC"].regularMarketChangePercent != null ? qm["^GSPC"].regularMarketChangePercent : null,
          tnx: qm["^TNX"] ? qm["^TNX"].regularMarketPrice : null,
          dxy: qm["DX-Y.NYB"] ? qm["DX-Y.NYB"].regularMarketPrice : null,
          ret1m: closes.length > 22 ? (spx / closes[closes.length - 22] - 1) * 100 : null,
          ret6m: closes.length > 127 ? (spx / closes[closes.length - 127] - 1) * 100 : null,
          bearish: ma200 != null && spx < ma200,
          riskOff: (ma200 != null && spx < ma200) || (vix != null && vix > 30),
          riskOn: (ma200 != null && spx > ma200) && (vix != null && vix < 20),
        };
        console.log("  S&P", spx.toFixed(0), "| MA200", ma200?.toFixed(0), "| VIX", vix?.toFixed(1), "→", regime.us.riskOff ? "RISK-OFF" : regime.us.riskOn ? "RISK-ON" : "netral");
      }
    } catch (e) { console.log("  regime AS gagal:", e.message); }
  }

  // SEC EDGAR: "KI" versi AS — filing 60 hari terakhir per emiten (JSON gratis)
  console.log("→ SEC EDGAR…");
  {
    const SEC_UA = "saham-screener/1.0 (contact: screener@example.com)";
    let cikMap = {};
    try {
      const tj = await (await fetch("https://www.sec.gov/files/company_tickers.json", { headers: { "User-Agent": SEC_UA } })).json();
      Object.values(tj).forEach(v => { cikMap[String(v.ticker).toUpperCase()] = String(v.cik_str).padStart(10, "0"); });
    } catch (e) { console.log("  peta CIK gagal"); }
    async function edgarFor(ticker) {
      const out = { score: 0, notes: [], flags: [], exclude: false };
      const cik = cikMap[ticker.toUpperCase()];
      if (!cik) return out;
      try {
        const r = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, { headers: { "User-Agent": SEC_UA, "Accept": "application/json" } });
        if (!r.ok) return out;
        const j = await r.json();
        const f = j.filings && j.filings.recent;
        if (!f) return out;
        const now = Date.now(), inDays = d => (now - new Date(d + "T00:00:00Z").getTime()) / 86400000;
        const docs60 = [], docs14 = [];
        for (let i = 0; i < f.form.length; i++) {
          const age = inDays(f.filingDate[i]);
          const e = { form: f.form[i], desc: f.primaryDocDescription[i] || "" };
          if (age <= 60) docs60.push(e);
          if (age <= 14) docs14.push(e);
        }
        const forms60 = docs60.map(d => d.form);
        const has = p => forms60.some(x => x.indexOf(p) === 0);
        const b424 = docs60.filter(d => /^424B/.test(d.form) && !/pricing supplement/i.test(d.desc));
        if (b424.length) { out.score -= 5; out.notes.push("EDGAR: ada filing " + b424[0].form + " ≤60 hari (−5) → cek prospektus: bisa ATM/follow-on (dilusi) atau surat utang."); out.flags.push("dilusi_potensial"); }
        else if (has("S-3")) { out.score -= 5; out.notes.push("EDGAR: shelf S-3 aktif (−5) → perusahaan siap menjual saham baru sewaktu-waktu."); out.flags.push("dilusi_potensial"); }
        if (has("S-1")) { out.notes.push("EDGAR: ada S-1 → emiten baru melantai / IPO susulan."); out.flags.push("ipo_baru"); }
        if (forms60.some(x => /^SC TO/.test(x))) { out.score += 10; out.notes.push("EDGAR: tender offer SC TO (+10)."); out.flags.push("tender"); }
        if (forms60.some(x => /13D/.test(x))) { out.score += 5; out.notes.push("EDGAR: Schedule 13D → investor aktivis masuk (+5, biasanya positif jangka pendek)."); }
        if (has("DEF 14A")) out.notes.push("EDGAR: proxy DEF 14A → ada agenda RUPS/pemungutan suara.");
        const k8 = docs14.filter(x => x.form === "8-K").length;
        if (k8) out.notes.push("EDGAR: " + k8 + "× Form 8-K dalam 14 hari → ada kejadian material, baca isinya (akuisisi/CEO/kontrak).");
        const f4 = forms60.filter(x => x === "4").length, f144 = forms60.filter(x => x === "144").length;
        if (f4 >= 3) out.notes.push("EDGAR: " + f4 + "× Form 4 ≤60 hari → insider aktif; arahnya (beli/jual) harus dicek per filing.");
        if (f144 >= 2) out.notes.push("EDGAR: " + f144 + "× Form 144 → rencana penjualan insider, potensi tekanan.");
      } catch (e) {}
      out.score = Math.max(-15, Math.min(15, out.score));
      return out;
    }
    const usList = results.filter(s => s.market === "US");
    const ei = { i: 0 };
    async function eworker() {
      while (ei.i < usList.length) {
        const s = usList[ei.i++];
        s.edgar = await edgarFor(s.ticker);
        await sleep(200);
      }
    }
    await Promise.all(Array.from({ length: 4 }, eworker));
    console.log("  EDGAR selesai:", usList.filter(s => s.edgar && (s.edgar.notes.length || s.edgar.score)).length, "emiten ada sinyal");
  }

  // Konteks crypto: Fear & Greed + dominasi BTC + fase siklus halving
  console.log("→ Konteks crypto…");
  {
    const HALVING = new Date("2024-04-19T00:00:00Z").getTime();
    const mHalv = (Date.now() - HALVING) / 2629800000;
    const phase = mHalv < 12 ? "markup awal pasca-halving" : mHalv <= 18 ? "zona puncak historis (waspada distribusi)" : mHalv <= 30 ? "markdown/bear pasca-puncak" : "akumulasi dasar siklus baru (pola historis, bukan hukum)";
    let fng = null, btcDom = null;
    try {
      const j = await (await fetch("https://api.alternative.me/fng/?limit=1", { headers: { "User-Agent": UA } })).json();
      if (j.data && j.data[0]) fng = { v: +j.data[0].value, label: j.data[0].value_classification };
    } catch (e) {}
    try {
      const j = await (await fetch("https://api.coingecko.com/api/v3/global", { headers: { "User-Agent": UA } })).json();
      if (j.data) btcDom = +j.data.market_cap_percentage.btc.toFixed(1);
    } catch (e) {}
    console.log("  F&G:", fng ? fng.v + " (" + fng.label + ")" : "-", "| dominasi BTC:", btcDom != null ? btcDom + "%" : "-", "| fase:", phase);
    // FDV / dilusi dari CoinGecko (gratis, 1 request untuk semua koin)
    let cg = null;
    try {
      const ids = { BTC:"bitcoin",ETH:"ethereum",SOL:"solana",BNB:"binancecoin",XRP:"ripple",ADA:"cardano",DOGE:"dogecoin",AVAX:"avalanche-2",DOT:"polkadot",LINK:"chainlink",LTC:"litecoin",TRX:"tron",BCH:"bitcoin-cash",XLM:"stellar",TON:"the-open-network",NEAR:"near",APT:"aptos",UNI:"uniswap",AAVE:"aave",HBAR:"hedera-hashgraph",SUI:"sui",ARB:"arbitrum",OP:"optimism",INJ:"injective-protocol" };
      const j2 = await jget("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=" + Object.values(ids).join(",") + "&per_page=250&page=1&sparkline=false");
      if (Array.isArray(j2)) { cg = {}; j2.forEach(c => { cg[String(c.symbol || "").toUpperCase()] = c; }); console.log("  CoinGecko: " + j2.length + " koin (FDV/dilusi)"); }
    } catch (e) { console.log("  CoinGecko gagal:", e.message); }
    results.forEach(s => {
      if (s.market !== "CRYPTO") return;
      s.fng = fng; s.btcDom = btcDom;
      s.cycle = { monthsHalving: Math.round(mHalv), phase };
      s.ddHigh = (s.high52 && s.px) ? (s.px / s.high52 - 1) * 100 : null;
      const c = cg && cg[s.ticker];
      if (c) {
        const mcapCG = c.market_cap != null ? c.market_cap : s.mcap;
        s.fdv = c.fully_diluted_valuation != null ? c.fully_diluted_valuation : null;
        s.maxSup = c.max_supply != null ? c.max_supply : null;
        s.circSup = c.circulating_supply != null ? c.circulating_supply : null;
        s.fdvMcap = (s.fdv != null && mcapCG) ? s.fdv / mcapCG : null;
        s.athChg = c.ath_change_percentage != null ? c.ath_change_percentage : null;
      }
    });
  }

  // FINALISASI SKOR (tahap 2): valuasi relatif sektor, kualitas, kekuatan relatif vs indeks, pengali rezim
  console.log("→ Finalisasi skor (valuasi relatif + kualitas + relatif vs indeks)…");
  {
    // benchmark 1 bulan per pasar: IHSG, S&P500, BTC
    const btc = results.find(s => s.ticker === "BTC");
    const benchRet1m = {
      IDX: regime && regime.ret1m != null ? regime.ret1m : null,
      US: regime && regime.us && regime.us.ret1m != null ? regime.us.ret1m : null,
      CRYPTO: btc && btc.ret1m != null ? btc.ret1m : null,
    };
    const ctx = {
      benchRet1m,
      bearish: !!(regime && regime.bearish && !regime.suspectIndex),
      usRiskOff: !!(regime && regime.us && regime.us.riskOff),
    };
    finalizeScores(results, ctx);
    // Pembanding per pasar untuk tampilan laporan — sebelumnya semua pasar dibandingkan IHSG.
    // IDX → IHSG, US → S&P 500, CRYPTO → BTC (proxy pasar kripto).
    const btcBaru = results.find(s => s.ticker === "BTC");
    regime.bench = {
      IDX: {
        label: "IHSG", px: regime.px != null ? regime.px : null, chg1d: regime.chg1d != null ? regime.chg1d : null,
        ma200: regime.ma200 != null ? regime.ma200 : null,
        bearish: !!(regime.bearish && !regime.suspectIndex),
      },
      US: {
        label: "S&P 500",
        px: regime.us && regime.us.spx != null ? regime.us.spx : null,
        chg1d: regime.us && regime.us.chg1d != null ? regime.us.chg1d : null,
        ma200: regime.us && regime.us.ma200 != null ? regime.us.ma200 : null,
        bearish: !!(regime.us && regime.us.bearish),
      },
      ...(SKIP_CRYPTO ? {} : {
        CRYPTO: {
          label: "BTC",
          px: btcBaru && btcBaru.px != null ? btcBaru.px : null,
          chg1d: btcBaru && btcBaru.chg1d != null ? btcBaru.chg1d : null,
          ma200: btcBaru && btcBaru.ma200 != null ? btcBaru.ma200 : null,
          bearish: !!(btcBaru && btcBaru.ma200 != null && btcBaru.px != null && btcBaru.px < btcBaru.ma200),
        },
      }),
    };
    console.log("  pembanding:", Object.entries(regime.bench)
      .map(([k, v]) => `${k}→${v.label}${v.chg1d != null ? " " + v.chg1d.toFixed(1) + "%" : ""}${v.bearish ? " (bearish)" : ""}`).join(" · "));
    console.log("  selesai. contoh:", ["PWON", "BBCA", "BSDE"].map(t => {
      const s = results.find(x => x.ticker === t);
      return s ? `${t}=${s.score.total}(v${s.score.val}+k${s.score.qual}+t${s.score.trend}+m${s.score.mom}+a${s.score.bandar}+r${s.score.rel})` : t + "=-";
    }).join(" · "));
  }

  // Berita
  console.log("→ Ambil berita (Google News)…");
  {
    const ni = { i: 0 };
    async function nworker() {
      while (ni.i < results.length) {
        const s = results[ni.i++];
        const q = s.market === "IDX" ? `${s.ticker} saham` : s.market === "US" ? `${s.ticker} ${s.name} stock` : s.name;
        s.news = await fetchNews(q);
        if (ni.i % 20 === 0) console.log(`   …berita ${ni.i}/${results.length}`);
        await sleep(220);
      }
    }
    await Promise.all(Array.from({ length: 6 }, nworker));
  }

  // Aksi korporasi (dari berita + data struktural) → skor & pengecualian
  console.log("→ Klasifikasi aksi korporasi…");
  results.forEach(s => {
    s.ca = classifyCA(s);
    if (s.caNotesExtra) s.ca.notes.push(s.caNotesExtra);
    if (s.score.flags.valueTrap) s.ca.notes.push("Value trap: PER murah tapi laba & pendapatan menurun → poin valuasi dipangkas separuh dalam skor.");
    const base = s.score.total;
    s.score.total = Math.max(0, base + s.ca.score);
    s.excluded = !!(s.ca.exclude || (s.ca.spekulatif && s.mcap && s.mcap < 1e12));
    if (s.market === "IDX" && s.arb && s.arb.excludeArb) { s.excluded = true; s.ca.notes.push("ARB 2 hari berturut-turut → dikecualikan selama 5 hari (pola lazim berlanjut)."); }
  });

  // Pasar yang BENAR-BENAR ada datanya. Dulu daftar ini ditentukan hanya dari SKIP_CRYPTO,
  // padahal Yahoo sering menolak simbol -USD secara acak → hasil: 0 instrumen CRYPTO tapi
  // bagian crypto tetap diterbitkan apa adanya (harga live tidak punya baris untuk di-update).
  const MKT = ["IDX", "US", "CRYPTO"].filter(m => results.some(r => r.market === m));
  if (!SKIP_CRYPTO) {
    const ada = new Set(results.filter(r => r.market === "CRYPTO").map(r => r.ticker));
    const hilang = [...new Set(CRYPTO)].map(t => cryptoTicker(t)).filter(t => !ada.has(t));
    console.log(`  crypto: ${ada.size}/${CRYPTO.length} koin berhasil` + (hilang.length ? ` — gagal: ${hilang.join(",")}` : ""));
  }
  MKT.forEach(m => {
    const arr = results.filter(r => r.market === m)
      .sort((a, b) => (a.excluded ? 1 : 0) - (b.excluded ? 1 : 0) || b.score.total - a.score.total);
    arr.forEach((r, i) => r.rank = i + 1);
  });
  results.sort((a, b) => MKT.indexOf(a.market) - MKT.indexOf(b.market) || a.rank - b.rank);
  const nExc = results.filter(r => r.excluded).length;
  console.log("   dikecualikan:", nExc, "instrumen");

  fs.writeFileSync(__dirname + "/saham-screener.json", JSON.stringify({ generatedAt: new Date().toISOString(), regime, stocks: results }, null, 2));

  const cols = ["market","rank","ticker","name","sector","industry","cur","finCur","fxConverted","px","chg1d","ret1d","ret5d","ret12m","mom121","pe","pb","divYield","earnInDays","shortPct","daysToCover","turnover","floatPct","divYears","roe","debtToEquity","rsi","mfi","obv","accum","volSpike","ret1m","ret3m","offHigh","arb.limitPct","arb.isArb","arb.streak","flags.crash","flags.exdiv","flags.suspect","flags.mislead","flags.illiquid","flags.commodity","flags.arb","flags.arbToday","flags.valueTrap","flags.bearishRegime","excluded","ca.score","score.total","score.val","score.qual","score.trend","score.mom","score.bandar","score.rel"];
  const get = (r, p) => p.split(".").reduce((o, k) => (o ? o[k] : undefined), r);
  const lines = results.map(r => cols.map(c => { const v = get(r, c); return v == null ? "" : (typeof v === "number" ? Math.round(v * 10000) / 10000 : `"${String(v).replace(/"/g, "'")}"`); }).join(","));
  fs.writeFileSync(__dirname + "/saham-screener.csv", [cols.join(","), ...lines].join("\n"));

  console.log("\n===== RINGKASAN =====");
  MKT.forEach(m => {
    const arr = results.filter(r => r.market === m).slice(0, 5);
    console.log(`\n--- ${m} (top ${arr.length}) ---`);
    arr.forEach(s => console.log(`  #${s.rank} ${s.ticker.padEnd(6)} ${String(s.name).slice(0,18).padEnd(19)} px=${s.px} RSI=${s.rsi?.toFixed(0)} acum=${(s.accum*100).toFixed(0)}% skor=${s.score.total}(v${s.score.val}+k${s.score.qual}+t${s.score.trend}+m${s.score.mom}+a${s.score.bandar}+r${s.score.rel})${s.ca.score?" ca"+(s.ca.score>0?"+":"")+s.ca.score:""}${s.arb&&s.arb.isArb?" ARB":""}${s.excluded?" ❌DIKECUALIKAN":""}${s.score.flags.crash?" ⚠CRASH":""} berita=${s.news.length}`));
  });
  console.log(`\nTotal: ${results.length} instrumen → saham-screener.json & .csv`);
})();
