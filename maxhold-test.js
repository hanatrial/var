// maxhold-test.js — pengaruh maxHold (5/10/20/40/60 hari bursa) pada config pemenang
// config tetap: K=10 eq-weight · exit trailing ATR 2,5x · stop -10% · minHold 5 · rvol>=1,5 · regime both · liq>=Rp1M
const fs = require("fs");
const src = fs.readFileSync(__dirname + "/run7.js", "utf8");
const cut = src.indexOf('console.log("\\n== 1) Jumlah slot');
if (cut < 0) throw new Error("penanda tidak ditemukan");
const head = src.slice(0, cut);

const tail = `
const CFG = { ...base, K: 10, exitMode: "atr", atrK: 2.5, hardStop: 0.10, gapMax: 0.04, regime: "both", rvol: 1.5, liqMin: 1e9 };
const HOLDS = [5, 10, 20, 40, 60];
function row(mh, sp){
  const [a, b] = SPL[sp];
  const o = simulate(A, { ...CFG, maxHold: mh }, a, b);
  const m = metrics(o.equity, A.dates, a);
  const t = o.trades, n = t.length;
  const win = n ? t.filter(x => x.ret > 0).length / n * 100 : 0;
  const h = t.map(x => x.bars).sort((p, q) => p - q);
  const med = n ? h[Math.floor(n / 2)] : 0;
  const why = { waktu: 0, atr: 0, stop: 0, ma20: 0 };
  t.forEach(x => { why[x.why] = (why[x.why] || 0) + 1; });
  const yrs = {};
  for (let i = a + 1; i <= Math.min(b, A.N - 1); i++) {
    const y = new Date(A.dates[i]).getUTCFullYear();
    yrs[y] = ((yrs[y] || 0) + 1) * (1 + o.equity[i - a] / o.equity[i - 1 - a] - 1) - 1;
  }
  return { cagr: m.cagr, mdd: m.mdd, sharpe: m.sharpe, n, win, med,
           avg: n ? t.reduce((p, q) => p + q.ret, 0) / n : 0, why, yrs };
}
const res = {};
for (const mh of HOLDS) {
  res[mh] = {};
  for (const sp of ["FULL", "DEV", "VAL", "OOS"]) res[mh][sp] = row(mh, sp);
  const F = res[mh].FULL;
  console.log(
    ("maxHold " + String(mh).padStart(2) + " hrb").padEnd(15) + "| " +
    "FULL " + F.cagr.toFixed(1).padStart(6) + "%  DD " + F.mdd.toFixed(1).padStart(6) + "%  Sha " + F.sharpe.toFixed(2).padStart(5) +
    " | DEV " + res[mh].DEV.cagr.toFixed(1).padStart(5) + "%  VAL " + res[mh].VAL.cagr.toFixed(1).padStart(5) + "%  OOS " + res[mh].OOS.cagr.toFixed(1).padStart(5) + "% " +
    "| trade " + String(F.n).padStart(3) + "  win " + F.win.toFixed(0) + "%  holdMed " + String(F.med).padStart(2) + "  avg " + F.avg.toFixed(1).padStart(5) + "%" +
    " | keluar: waktu " + F.why.waktu + " · atr " + F.why.atr + " · stop " + F.why.stop
  );
}
console.log("\\nreturn FULL per tahun:");
for (const mh of HOLDS) {
  console.log(("  maxHold " + mh).padEnd(15) + Object.entries(res[mh].FULL.yrs)
    .map(([y, v]) => y + " " + (v >= 0 ? "+" : "") + (v * 100).toFixed(0) + "%").join("  "));
}
fs.writeFileSync(__dirname + "/maxhold-test.json", JSON.stringify(res, null, 1));
console.log("\\ndisimpan: maxhold-test.json");
`;
fs.writeFileSync(__dirname + "/_maxhold.run.js", head + tail);
console.log("_maxhold.run.js dibuat");
