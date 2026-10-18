// test-bt.js — uji sinyal BEST BUY/SIAP versi backtest (IDX) dari halaman hasil generate
const fs = require("fs");
const c = fs.readFileSync(process.argv[2] || "C:/Users/imadur.risalah/Downloads/var/saham-laporan.html", "utf8");

const di = c.indexOf("const DATA = ");
const dj = c.indexOf("[", di);
const dk = c.indexOf("\nconst REGIME", dj);
const DATA = JSON.parse(c.slice(dj, dk).replace(/;\s*$/, ""));

const ri = c.indexOf("const REGIME = ", dk);
const rj = c.indexOf("{", ri);
const rk = c.indexOf("\n", rj);
const REGIME = JSON.parse(c.slice(rj, rk).replace(/;\s*$/, ""));

function block(marker, open, close) {
  const s = c.indexOf(marker);
  if (s < 0) throw new Error("tidak ditemukan: " + marker);
  const o = c.indexOf(open, s);
  let i = o, depth = 0;
  while (i < c.length) { if (c[i] === open) depth++; else if (c[i] === close) { depth--; if (!depth) return c.slice(s, i + 1); } i++; }
  throw new Error("tak seimbang: " + marker);
}
const btSrc = block("function btIdx(s){", "{", "}");
const bts = c.indexOf("const BT={"); const bte = c.indexOf(";", bts);
const btConst = c.slice(bts, bte + 1);

const ID = x => x == null ? "—" : Math.round(x).toLocaleString("id-ID");
const CUR = (s, v) => v == null ? "—" : (s.cur === "IDR" ? "Rp " + Math.round(v).toLocaleString("id-ID") : "$" + (+v).toFixed(2));
const PCT = x => x == null ? "—" : ((x >= 0 ? "+" : "") + (+x).toFixed(2) + "%");
const f = new Function("REGIME", "ID", "CUR", "PCT", btConst + "\nreturn " + btSrc + ";");
const fn = f(REGIME, ID, CUR, PCT);

const idx = DATA.filter(x => x.market === "IDX");
console.log("Data IDX: " + idx.length + " saham · hi252 ada: " + idx.filter(s => s.hi252 != null).length + " · atr14 ada: " + idx.filter(s => s.atr14 != null).length);
console.log("IHSG " + ID(REGIME.px) + " | MA50 " + ID(REGIME.ma50) + " | MA200 " + ID(REGIME.ma200) + " | 6 bln " + PCT(REGIME.ret6m));

const n = k => idx.filter(s => { const b = fn(s); const m = { regim: 0, breakout: 1, volume: 2, relatif: 3, likuid: 4 }; return b.checks[m[k]].ok; }).length;
console.log("\nLolos per syarat: rejim " + n("regim") + " · breakout " + n("breakout") + " · volume " + n("volume") + " · relatif " + n("relatif") + " · likuid " + n("likuid"));

const ok = idx.filter(s => fn(s).ok);
const ready = idx.filter(s => { const b = fn(s); return b.ready && !b.ok; });
console.log("\nIDX: BEST BUY(uji) " + ok.length + " · SIAP " + ready.length);
ok.forEach(s => console.log("  ⭐ " + s.ticker.padEnd(6) + " skor " + s.score.total + " | entry " + CUR(s, s.px) + " | SL " + CUR(s, fn(s).slPx) + " | trail " + CUR(s, fn(s).trailPx)));
ready.forEach(s => { const b = fn(s); console.log("  ★ " + s.ticker.padEnd(6) + " skor " + s.score.total + " | vol " + (s.volSpike != null ? s.volSpike.toFixed(2) + "×" : "—") + " | belum: " + b.checks.filter(x => !x.ok).map(x => x.k.split("(")[0]).join(", ")); });

const near = idx.filter(s => s.hi252 != null && s.px / s.hi252 >= 0.97).sort((a, b) => b.px / b.hi252 - a.px / a.hi252).slice(0, 6);
console.log("\nPaling dekat breakout (>=97% dari puncak 252 bar):");
near.forEach(s => { const b = fn(s); console.log("  " + s.ticker.padEnd(6) + " " + ((s.px / s.hi252 - 1) * 100).toFixed(1) + "% dari puncak | vol " + (s.volSpike != null ? s.volSpike.toFixed(2) + "×" : "—") + " | gagal: " + b.checks.filter(x => !x.ok).map(x => x.k.split(":")[0].split("(")[0]).join(", ")); });
