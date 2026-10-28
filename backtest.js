// backtest.js — backtest walk-forward skor teknikal screener (IDX / Crypto)
// Desain (tanpa look-ahead):
//  * Indikator dihitung sekali per bar dari data historis (adj close → dividen & split sudah masuk).
//  * Rebalance tiap 5 hari bursa, sinyal dari data s/d hari itu; hold 20 hari bursa (4 minggu).
//  * Top-N equal weight; biaya 0,4% round-trip (0,2% beli + 0,2% jual).
//  * Skor = TREN(28) + MOMENTUM(20) + ALIRAN VOLUME(26) = maks 74.
//    VALUASI (46) tidak bisa direkonstruksi historis dari Yahoo → dikecualikan (disebut jujur di laporan).
//  * Baseline: buy&hold indeks, equal-weight universe, dan pilihan acak (30 seed).
const fs = require("fs");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";
const sleep = ms => new Promise(r => setTimeout(r, ms));

const IDX = ["BBCA","BBRI","BMRI","BBNI","BRIS","BBTN","ARTO","BJTM","BJBR","BNGA","BDMN","NISP","MEGA","PNBN","TLKM","ISAT","EXCL","TOWR","TBIG","MTEL","ASII","UNTR","HRUM","PTBA","ADRO","ITMG","BUMI","BYAN","MEDC","PGAS","AKRA","ADMR","ANTM","INCO","TINS","MDKA","PSAB","NCKL","MBMA","BRMS","ICBP","INDF","MYOR","UNVR","KLBF","SIDO","TSPC","HMSP","GGRM","INTP","SMGR","ARNA","SMRA","BSDE","CTRA","PWON","LPKR","DILD","GOTO","BUKA","EMTK","TPIA","BRPT","DSNG","CPIN","JPFA","MAIN","AALI","LSIP","SSMS","ACES","MAPI","MAPA","ERAA","SCMA","MNCN","MIKA","HEAL","SILO","PRDA","PGEO","JSMR","POWR"];
const CRYPTO = ["BTC-USD","ETH-USD","SOL-USD","BNB-USD","XRP-USD","ADA-USD","DOGE-USD","AVAX-USD","DOT-USD","LINK-USD","LTC-USD","TRX-USD"];
const MARKETS = [
  { name: "IDX", syms: IDX.map(t => t + ".JK"), bench: "^JKSE", benchName: "IHSG" },
  { name: "CRYPTO", syms: CRYPTO, bench: "BTC-USD", benchName: "Bitcoin" },
];

// ---------- data ----------
async function chart(sym) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5y&interval=1d`, { headers: { "User-Agent": UA } });
      if (r.status === 429) { await sleep(1200 * (a + 1)); continue; }
      if (!r.ok) return null;
      const j = await r.json();
      const res = j.chart && j.chart.result && j.chart.result[0];
      if (!res) return null;
      const ts = res.timestamp || [], q = res.indicators.quote[0];
      const adj = res.indicators.adjclose && res.indicators.adjclose[0] ? res.indicators.adjclose[0].adjclose : null;
      const rows = [];
      for (let i = 0; i < ts.length; i++) {
        const c = q.close[i], ac = adj ? adj[i] : c;
        if (c == null || ac == null || !(c > 0)) continue;
        rows.push({ t: ts[i] * 1000, h: q.high[i] || c, l: q.low[i] || c, c, ac, v: q.volume[i] || 0 });
      }
      return rows;
    } catch (e) { await sleep(500); }
  }
  return null;
}

// ---------- pra-hitung indikator (identik dgn stock-scraper.js) ----------
const smaRoll = (arr, n) => {                       // rata² n bar terakhir, NaN bila kurang
  const out = new Array(arr.length).fill(null);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
    if (i >= n) sum -= arr[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
};
function rsiSeries(c, n = 14) {
  const out = new Array(c.length).fill(null);
  if (c.length < n + 1) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; d >= 0 ? g += d : l -= d; }
  g /= n; l /= n;
  out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    g = (g * (n - 1) + (d > 0 ? d : 0)) / n;
    l = (l * (n - 1) + (d < 0 ? -d : 0)) / n;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}
function accumSeries(c, v, n = 20) {
  const out = new Array(c.length).fill(null);
  let up = 0, down = 0;
  for (let i = 1; i < c.length; i++) {
    if (c[i] > c[i - 1]) up += v[i]; else if (c[i] < c[i - 1]) down += v[i];
    if (i >= n) { const k = i - n; if (c[k] > c[k - 1]) up -= v[k]; else if (c[k] < c[k - 1]) down -= v[k]; }
    if (i >= n) out[i] = (up + down) ? up / (up + down) : 0.5;
  }
  return out;
}
function obvSlopeSeries(c, v) {
  const obv = new Array(c.length).fill(0);
  for (let i = 1; i < c.length; i++) obv[i] = obv[i - 1] + (c[i] > c[i - 1] ? v[i] : c[i] < c[i - 1] ? -v[i] : 0);
  const out = new Array(c.length).fill(null);
  const n = 20, mx = (n - 1) / 2;
  let den = 0; for (let i = 0; i < n; i++) den += (i - mx) ** 2;
  for (let i = n - 1; i < c.length; i++) {
    let my = 0, num = 0;
    for (let j = 0; j < n; j++) my += obv[i - n + 1 + j];
    my /= n;
    for (let j = 0; j < n; j++) num += (j - mx) * (obv[i - n + 1 + j] - my);
    out[i] = (num / den) / (Math.abs(my) || 1) * 100;
  }
  return out;
}
function mfiSeries(h, l, c, v, n = 14) {
  const out = new Array(c.length).fill(null);
  const tp = c.map((x, i) => (h[i] + l[i] + x) / 3);
  let pos = 0, neg = 0;
  for (let i = 1; i < c.length; i++) {
    const m = tp[i] * v[i];
    if (tp[i] > tp[i - 1]) pos += m; else neg += m;
    if (i > n) { const k = i - n; const mm = tp[k] * v[k]; if (tp[k] > tp[k - 1]) pos -= mm; else neg -= mm; }
    if (i >= n) out[i] = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
  }
  return out;
}
const pct = (a, b) => (a != null && b) ? (a / b - 1) * 100 : null;

// indikator lengkap per simbol (satu pass, lalu skor O(1) per bar)
function prep(rows) {
  const ac = rows.map(r => r.ac), v = rows.map(r => r.v);
  const h = rows.map(r => r.h), l = rows.map(r => r.l);
  const ma20 = smaRoll(ac, 20), ma50 = smaRoll(ac, 50), ma200 = smaRoll(ac, 200);
  const R = rsiSeries(ac), A = accumSeries(ac, v), O = obvSlopeSeries(ac, v), M = mfiSeries(h, l, ac, v);
  const volSpike = new Array(ac.length).fill(null);
  let vs = 0;
  for (let i = 0; i < ac.length; i++) {
    vs += v[i]; if (i >= 20) vs -= v[i - 20];
    if (i >= 20 && vs > 0) volSpike[i] = v[i] / (vs / 20);
  }
  const chg1d = new Array(ac.length).fill(null), ret5d = new Array(ac.length).fill(null),
        ret1m = new Array(ac.length).fill(null), ret3m = new Array(ac.length).fill(null);
  for (let i = 1; i < ac.length; i++) chg1d[i] = pct(ac[i], ac[i - 1]);
  for (let i = 5; i < ac.length; i++) ret5d[i] = pct(ac[i], ac[i - 5]);
  for (let i = 21; i < ac.length; i++) ret1m[i] = pct(ac[i], ac[i - 21]);
  for (let i = 63; i < ac.length; i++) ret3m[i] = pct(ac[i], ac[i - 63]);
  return { ac, v, ma20, ma50, ma200, R, A, O, M, volSpike, chg1d, ret5d, ret1m, ret3m };
}
const add = (cond, p) => cond ? p : 0;
function scoreAt(I, i, benchRet1m) {
  const px = I.ac[i];
  const ma20 = I.ma20[i], ma50 = I.ma50[i], ma200 = I.ma200[i];
  const R = I.R[i], A = I.A[i], O = I.O[i], M = I.M[i];
  const chg = I.chg1d[i];
  let trend = add(px && ma20 && px > ma20, 8) + add(ma20 && ma50 && ma20 > ma50, 8) + add(ma50 && ma200 && ma50 > ma200, 6) + add(ma200 && px > ma200, 6);
  trend = Math.min(trend, 28);
  let mom = add(R != null && R >= 45 && R <= 68, 10) + add(R != null && R > 68, -6) + add(I.ret1m[i] != null && I.ret1m[i] > 0, 5) + add(I.ret3m[i] != null && I.ret3m[i] > 5, 5);
  mom = Math.max(0, Math.min(mom, 20));
  // aliran volume: volume besar HANYA positif bila harga naik; volume besar saat harga turun = distribusi
  let flow = add(A != null && A > 0.55, 8) + add(A != null && A > 0.60, 4) + add(O > 0, 5) + add(M != null && M > 50 && M < 85, 5);
  const spike = I.volSpike[i] != null && I.volSpike[i] > 1.4;
  if (spike) flow += (chg == null || chg > -1) ? 4 : -4;
  flow = Math.max(0, Math.min(flow, 26));
  // kekuatan relatif vs benchmark 1 bulan (tetap hidup saat mode crash)
  let rs = 0;
  if (I.ret1m[i] != null && benchRet1m != null) {
    const d = I.ret1m[i] - benchRet1m;
    rs = d >= 10 ? 10 : d >= 3 ? 7 : d >= 0 ? 4 : d >= -5 ? 1 : 0;
  }
  const crash = (chg != null && chg <= -7) || (I.ret5d[i] != null && I.ret5d[i] <= -15);
  if (crash) { trend = 0; mom = 0; }
  return trend + mom + flow + rs;   // maks 84
}

// ---------- metrik ----------
function metrics(equity, dates) {
  const rets = [];
  for (let i = 1; i < equity.length; i++) if (equity[i - 1] > 0) rets.push(equity[i] / equity[i - 1] - 1);
  const yrs = (dates[dates.length - 1] - dates[0]) / (365.25 * 86400000);
  const tot = equity[equity.length - 1] / equity[0] - 1;
  const cagr = Math.pow(1 + tot, 1 / yrs) - 1;
  let peak = equity[0], mdd = 0;
  equity.forEach(x => { peak = Math.max(peak, x); mdd = Math.min(mdd, x / peak - 1); });
  const mu = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mu) ** 2, 0) / (rets.length || 1));
  return { tot: tot * 100, cagr: cagr * 100, mdd: mdd * 100, sharpe: sd ? (mu / sd) * Math.sqrt(252) : 0, vol: sd * Math.sqrt(252) * 100, yrs };
}

// ---------- simulasi ----------
// U: {sym: {px: harga di kalender benchmark (fwd-fill), bar: indeks bar asli, I: indikator}}
function simulate(U, dates, N, p) {
  const HOLD = p.holdW * 5, FREQ = 5, COST = 0.002;
  const syms = Object.keys(U);
  const equity = new Array(N).fill(1);
  const trades = [];
  let cash = 1;
  const sleeves = [];
  const priceAt = (s, i) => { const b = U[s].bar[i]; return b == null ? null : U[s].I.ac[b]; };
  // ret1m benchmark (untuk komponen kekuatan relatif)
  const bRet1m = p.benchAc ? p.benchAc.map((x, i) => i >= 21 ? (x / p.benchAc[i - 21] - 1) * 100 : null) : null;

  for (let i = 0; i < N; i++) {
    // likuidasi sleeve yang hold-nya habis
    for (let k = sleeves.length - 1; k >= 0; k--) {
      const sl = sleeves[k];
      if (i - sl.born >= HOLD) {
        let val = 0;
        sl.entries.forEach(e => {
          let px = priceAt(e.sym, i);
          if (px == null) { for (let j = i; j >= 0 && px == null; j--) px = priceAt(e.sym, j); }
          trades.push({ ret: (px / e.px - 1) * 100 - 0.4, sym: e.sym, born: sl.born, sold: i });
          val += sl.bud * e.w * (px / e.px) * (1 - COST);
        });
        cash += val;
        sleeves.splice(k, 1);
      }
    }
    // buka sleeve baru
    if (i >= 205 && (i - 205) % FREQ === 0 && i < N - HOLD) {
      const slot = HOLD / FREQ - sleeves.length;
      const budget = slot > 0 ? cash / slot : 0;
      if (budget > 1e-9) {
        let picks = [];
        const risky = p.useRegime && p.riskOff && p.riskOff[i];
        if (!risky) {
          if (p.randomSeed != null) {
            let seed = p.randomSeed >>> 0;
            const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
            const pool = syms.filter(s => U[s].bar[i] != null && U[s].bar[i] >= 205);
            while (picks.length < Math.min(p.top, pool.length)) picks.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
          } else {
            picks = syms
              .filter(s => { const b = U[s].bar[i]; return b != null && b >= 205; })
              .map(s => ({ s, sc: scoreAt(U[s].I, U[s].bar[i], bRet1m ? bRet1m[i] : null) }))
              .sort((a, b) => b.sc - a.sc || (a.s < b.s ? -1 : 1))
              .slice(0, p.top)
              .map(x => x.s);
          }
        }
        if (picks.length) {
          sleeves.push({ bud: budget * (1 - COST), entries: picks.map(s => ({ sym: s, px: priceAt(s, i), w: 1 / picks.length })), born: i });
          cash -= budget;
        }
      }
    }
    let mv = 0;
    sleeves.forEach(sl => sl.entries.forEach(e => {
      let px = priceAt(e.sym, i);
      if (px == null) px = e.px;
      mv += sl.bud * e.w * (px / e.px);
    }));
    equity[i] = cash + mv;
  }
  // likuidasi paksa akhir
  sleeves.forEach(sl => sl.entries.forEach(e => {
    let px = priceAt(e.sym, N - 1); if (px == null) px = e.px;
    trades.push({ ret: (px / e.px - 1) * 100 - 0.4, sym: e.sym, born: sl.born, sold: N - 1 });
    equity[N - 1] += sl.bud * e.w * (px / e.px) * (1 - COST);
  }));
  return { equity, trades };
}

// ---------- main ----------
(async () => {
  const OUT = {};
  for (const MK of MARKETS) {
    console.log(`\n===== ${MK.name} (benchmark ${MK.benchName}) =====`);
    const syms = MK.syms.slice();
    const raw = {};
    let ci = 0;
    async function worker() {
      while (ci < syms.length) {
        const s = syms[ci++];
        const rows = await chart(s);
        if (rows && rows.length > 260) raw[s] = rows;
        await sleep(100);
      }
    }
    await Promise.all(Array.from({ length: 6 }, worker));
    const bench = await chart(MK.bench);
    if (!bench || bench.length < 300) { console.log("  benchmark gagal"); continue; }

    const dates = bench.map(r => r.t), N = dates.length;
    const bAc = bench.map(r => r.ac);
    console.log(`  kalender ${N} bar (${new Date(dates[0]).toISOString().slice(0, 10)} → ${new Date(dates[N - 1]).toISOString().slice(0, 10)}) · data ${Object.keys(raw).length}/${syms.length} simbol`);

    // aligned ke kalender benchmark
    const U = {};
    for (const s of Object.keys(raw)) {
      const rows = raw[s], I = prep(rows);
      const map = new Map(); rows.forEach((r, k) => map.set(r.t, k));
      const bar = new Array(N).fill(null);
      let last = null;
      for (let i = 0; i < N; i++) { const k = map.get(dates[i]); if (k != null) { bar[i] = k; last = k; } else bar[i] = last; }  // fwd-fill indeks
      const own = bar.filter(x => x != null).length;
      if (own / N < 0.85) continue;                                  // IPO terlalu baru / data tipis
      U[s] = { bar, I };
    }
    const uni = Object.keys(U).length;
    console.log("  simbol layak:", uni);

    // risk-off benchmark (IHSG/BTC < MA200) utk variant filter regime
    const bMA = new Array(N).fill(null);
    let sum = 0;
    for (let i = 0; i < N; i++) { sum += bAc[i]; if (i >= 200) sum -= bAc[i - 200]; if (i >= 199) bMA[i] = sum / 200; }
    const riskOff = bAc.map((x, i) => bMA[i] != null && x < bMA[i]);

    const rowsOut = [];
    const curves = {};
    const freq = {};                                             // seberapa sering tiap simbol masuk Top-5
    for (const top of [3, 5, 10]) for (const holdW of [2, 4, 8]) {
      const { equity, trades } = simulate(U, dates, N, { top, holdW, benchAc: bAc });
      const m = metrics(equity, dates);
      const win = trades.length ? trades.filter(t => t.ret > 0).length / trades.length * 100 : 0;
      rowsOut.push({ label: `Top-${top} · hold ${holdW} mgg`, cagr: m.cagr, mdd: m.mdd, sharpe: m.sharpe, vol: m.vol, win, trades: trades.length, avgTrade: trades.reduce((a, b) => a + b.ret, 0) / trades.length });
      console.log(`  ${rowsOut[rowsOut.length - 1].label.padEnd(21)} CAGR ${m.cagr.toFixed(1)}% · maxDD ${m.mdd.toFixed(1)}% · Sharpe ${m.sharpe.toFixed(2)} · win ${win.toFixed(0)}% (${trades.length} trade)`);
      if (top === 5 && holdW === 4) {
        curves.main = equity;
        trades.forEach(t => { freq[t.sym] = (freq[t.sym] || 0) + 1; });
      }
    }
    { // variant: filter regime (berhenti buka sleeve saat benchmark < MA200)
      const { equity, trades } = simulate(U, dates, N, { top: 5, holdW: 4, useRegime: true, riskOff, benchAc: bAc });
      const m = metrics(equity, dates);
      const win = trades.length ? trades.filter(t => t.ret > 0).length / trades.length * 100 : 0;
      const row = { label: "Top-5 · hold 4 mgg · filter regime", cagr: m.cagr, mdd: m.mdd, sharpe: m.sharpe, vol: m.vol, win, trades: trades.length, avgTrade: trades.reduce((a, b) => a + b.ret, 0) / trades.length };
      rowsOut.push(row);
      console.log(`  ${row.label.padEnd(21)} CAGR ${m.cagr.toFixed(1)}% · maxDD ${m.mdd.toFixed(1)}% · Sharpe ${m.sharpe.toFixed(2)}`);
      curves.regime = equity;
    }
    // baseline acak 30 seed
    const rands = [];
    for (let sd = 1; sd <= 30; sd++) {
      const { equity } = simulate(U, dates, N, { top: 5, holdW: 4, randomSeed: sd * 7919, benchAc: bAc });
      rands.push(metrics(equity, dates));
    }
    const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
    const randAvg = { cagr: avg(rands.map(r => r.cagr)), mdd: avg(rands.map(r => r.mdd)), sharpe: avg(rands.map(r => r.sharpe)), vol: avg(rands.map(r => r.vol)) };

    // equal-weight universe (rebalance tiap 5 hari, biaya 0,2% per sisi pada nilai yang ditukar)
    const ew = (() => {
      const list = Object.keys(U).filter(s => U[s].I.ac.length > 205);
      const units = {}; let cashE = 1;
      const pAt = (s, i) => { const b = U[s].bar[i]; return b == null ? null : U[s].I.ac[b]; };
      const eq = [];
      for (let i = 0; i < N; i++) {
        // nilai portofolio (harga hari ini, unit tetap)
        const mvNow = s => (units[s] && pAt(s, i) != null) ? units[s] * pAt(s, i) : 0;
        if (i >= 205 && (i - 205) % 5 === 0 && i < N - 20) {
          const avail = list.filter(s => pAt(s, i) != null);
          let total = cashE;
          Object.keys(units).forEach(s => {
            const p = pAt(s, i) ?? pAt(s, i - 1);
            if (units[s] && p != null) { total += units[s] * p; delete units[s]; }
          });
          const each = total * (1 - 0.002) / avail.length;
          avail.forEach(s => units[s] = each / pAt(s, i));
          cashE = total - each * avail.length;      // sisa kas (biaya)
        } else {
          // mtm: harga baru → nilai unit berubah otomatis lewat pAt
        }
        let v = cashE;
        Object.keys(units).forEach(s => { const p = pAt(s, i) ?? pAt(s, i - 1); if (p != null) v += units[s] * p; });
        eq.push(v);
      }
      return metrics(eq, dates);
    })();

    const bhM = metrics(bAc, dates);
    console.log(`  ${("Buy&hold " + MK.benchName).padEnd(25)} CAGR ${bhM.cagr.toFixed(1)}% · maxDD ${bhM.mdd.toFixed(1)}% · Sharpe ${bhM.sharpe.toFixed(2)}`);
    console.log(`  ${"Equal-weight universe".padEnd(25)} CAGR ${ew.cagr.toFixed(1)}% · maxDD ${ew.mdd.toFixed(1)}% · Sharpe ${ew.sharpe.toFixed(2)}`);
    console.log(`  ${"Acak Top-5 (rata² 30)".padEnd(25)} CAGR ${randAvg.cagr.toFixed(1)}% · maxDD ${randAvg.mdd.toFixed(1)}% · Sharpe ${randAvg.sharpe.toFixed(2)}`);

    const topFreq = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([sym, n]) => ({ sym, n }));
    OUT[MK.name] = {
      benchName: MK.benchName, universe: uni, bars: N,
      start: new Date(dates[0]).toISOString().slice(0, 10), end: new Date(dates[N - 1]).toISOString().slice(0, 10),
      bench: bhM, ew, randAvg, rows: rowsOut, topFreq,
      dates: dates.map(d => new Date(d).toISOString().slice(0, 10)),
      curves: {
        bench: bAc.map(x => Math.round(x / bAc[0] * 1e4) / 1e4),
        main: curves.main.map(x => Math.round(x * 1e4) / 1e4),
        regime: curves.regime.map(x => Math.round(x * 1e4) / 1e4),
      },
    };
    fs.writeFileSync(`/workspace/backtest-${MK.name.toLowerCase()}.json`, JSON.stringify(OUT[MK.name]));
  }
  fs.writeFileSync("/workspace/backtest-semua.json", JSON.stringify(OUT));
  console.log("\nSelesai → backtest-semua.json");
})();
