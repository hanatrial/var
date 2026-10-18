// test-bt2.js — uji rencana masuk/keluar IDX (angka + tanggal) hasil generate
const fs = require("fs");
const c = fs.readFileSync(process.argv[2] || "C:/Users/imadur.risalah/Downloads/screener-exp/auto/saham-laporan.html", "utf8");

const di = c.indexOf("const DATA = "); const dj = c.indexOf("[", di); const dk = c.indexOf("\nconst REGIME", dj);
const DATA = JSON.parse(c.slice(dj, dk).replace(/;\s*$/, ""));
const ri = c.indexOf("const REGIME = ", dk); const rj = c.indexOf("{", ri); const rk = c.indexOf("\n", rj);
const REGIME = JSON.parse(c.slice(rj, rk).replace(/;\s*$/, ""));

function blockFrom(marker) {
  const s = c.indexOf(marker);
  if (s < 0) throw new Error("tidak ada: " + marker);
  let i = c.indexOf("{", s), depth = 0;
  while (i < c.length) { if (c[i] === "{") depth++; else if (c[i] === "}") { depth--; if (!depth) return c.slice(s, i + 1); } i++; }
  throw new Error("kurang seimbang: " + marker);
}
function sliceBetween(a, b) { const s = c.indexOf(a); const e = c.indexOf(b, s); return c.slice(s, e); }

const btConst = sliceBetween("const BT={", ";\nfunction btIdx");
const kal = sliceBetween("const NMB=[", "function btEntryHTML");
const btIdxSrc = blockFrom("function btIdx(s){");
const btEntrySrc = blockFrom("function btEntryHTML(s,bt){");

const ID = x => x == null ? "—" : Math.round(x).toLocaleString("id-ID");
const CUR = (s, v) => v == null ? "—" : (s.cur === "IDR" ? "Rp " + Math.round(v).toLocaleString("id-ID") : "$" + (+v).toFixed(2));
const PCT = x => x == null ? "—" : ((x >= 0 ? "+" : "") + (+x).toFixed(2) + "%");

const build = new Function("REGIME", "ID", "CUR", "PCT",
  btConst + ";\n" + kal + "\n" + btIdxSrc + "\n" + btEntrySrc + "\nreturn {btIdx,btEntryHTML,fmtTgl,bursaKe,tglClose};");
const H = build(REGIME, ID, CUR, PCT);

console.log("IHSG " + ID(REGIME.px) + " · MA50 " + ID(REGIME.ma50) + " · MA200 " + ID(REGIME.ma200));

function plan(tk) {
  const s = DATA.find(x => x.ticker === tk && x.market === "IDX");
  if (!s) return console.log("tidak ada: " + tk);
  const bt = H.btIdx(s);
  console.log("\n=== " + tk + " · close " + CUR(s, s.px) + " · tgl close terakhir " + H.tglClose(s));
  console.log(bt.checks.map(x => "  " + (x.ok ? "[x]" : "[ ]") + " " + x.k.replace(/&amp;/g, "&") + " — " + x.v).join("\n"));
  const html = H.btEntryHTML(s, bt);
  const txt = html.replace(/<[^>]+>/g, "|").replace(/\|+/g, " | ").replace(/\s+/g, " ").trim();
  console.log("  verdict: " + (txt.split("|")[2] || "").trim());
  console.log("  tabel: " + txt.slice(txt.indexOf("AKSI"), txt.indexOf("AKSI") + 700));
  return { s, bt };
}
["PTSP", "AUTO", "ACES"].forEach(plan);

const cal = { "Jum 16 Okt 2026 -> +1": H.bursaKe("2026-10-16", 1), "+6": H.bursaKe("2026-10-16", 6), "+17": H.bursaKe("2026-10-16", 17), "+21": H.bursaKe("2026-10-16", 21) };
console.log("\nkalender: " + Object.entries(cal).map(([k, v]) => k + " = " + H.fmtTgl(v) + " (" + v + ")").join(" · "));
