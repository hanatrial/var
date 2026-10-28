// generate-backtest.js — laporan HTML mandiri dari backtest-semua.json
const fs = require("fs");
const D = JSON.parse(fs.readFileSync("/workspace/backtest-semua.json", "utf8"));
const TPL = fs.readFileSync("/workspace/.opencode/backtest-template.html", "utf8");

const f1 = x => (x == null || !isFinite(x) ? "—" : (x >= 0 ? "+" : "") + x.toFixed(1) + "%");
const f2 = x => (x == null || !isFinite(x) ? "—" : (x >= 0 ? "+" : "") + x.toFixed(2));

// grafik SVG equity curve (log-ish linear skala relatif ke 1.0)
function svg(curves, w = 640, h = 190, pad = 26) {
  const series = Object.entries(curves).filter(([k, v]) => Array.isArray(v) && v.length);
  if (!series.length) return "";
  let min = Infinity, max = -Infinity;
  series.forEach(([, v]) => v.forEach(x => { if (isFinite(x)) { min = Math.min(min, x); max = Math.max(max, x); } }));
  if (!isFinite(min) || min === max) { min = 0; max = 1; }
  min = Math.max(min, 0);
  const n = series[0][1].length;
  const X = i => pad + (i / (n - 1)) * (w - pad * 2);
  const Y = v => h - pad - ((v - min) / (max - min)) * (h - pad * 2);
  const colors = { main: "#cdea3f", bench: "#7d8cff", regime: "#ff9b6b" };
  const names = { main: "Strategi Top-5 · 4 mgg", bench: "Buy&hold indeks", regime: "Top-5 + filter regime" };
  let g = "";
  // garis horizontal
  for (let k = 0; k <= 4; k++) {
    const v = min + (max - min) * k / 4, y = Y(v);
    g += `<line x1="${pad}" y1="${y.toFixed(1)}" x2="${w - pad}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,.08)"/>
          <text x="4" y="${(y + 3).toFixed(1)}" fill="#8b96a8" font-size="9">${v.toFixed(1)}</text>`;
  }
  series.forEach(([k, v]) => {
    const d = v.map((x, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(x).toFixed(1)}`).join("");
    g += `<path d="${d}" fill="none" stroke="${colors[k] || "#aaa"}" stroke-width="1.6" stroke-linejoin="round"/>`;
  });
  const leg = series.map(([k], i) => `<span style="display:inline-flex;align-items:center;gap:5px;margin-right:14px;font-size:11px;color:#aab4c4"><i style="width:14px;height:3px;background:${colors[k] || "#aaa"};display:inline-block;border-radius:2px"></i>${names[k] || k}</span>`).join("");
  return `<div class="chartbox"><div class="legenda">${leg}</div><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:${h}px">${g}</svg></div>`;
}

const MK = [
  { k: "IDX", b: "IDX", flag: "🇮🇩", title: "Saham Indonesia", note: "Universe 80 emiten likuid (perluasan dari 83 → termasuk nama lapis-2; 13 simbol tak valid dibuang)." },
  { k: "CRYPTO", b: "CRYPTO", flag: "₿", title: "Crypto", note: "Universe 12 koin besar." },
];

let sections = "";
MK.forEach(m => {
  const x = D[m.k];
  if (!x) return;
  const rows = x.rows.map(r => {
    const best = r.cagr === Math.max(...x.rows.map(z => z.cagr));
    return `<tr${best ? ' class="best"' : ""}><td>${r.label}</td><td class="num">${f1(r.cagr)}</td><td class="num">${f1(r.mdd)}</td><td class="num">${f2(r.sharpe)}</td><td class="num">${f1(r.vol)}</td><td class="num">${r.win.toFixed(0)}%</td><td class="num">${f1(r.avgTrade)}</td><td class="num">${r.trades}</td></tr>`;
  }).join("");
  const ewWin = x.ew.cagr > Math.max(...x.rows.map(r => r.cagr));
  sections += `
  <section class="mk">
    <h2>${m.flag} ${m.title} — vs ${x.benchName}</h2>
    <p class="meta">Periode <b>${x.start} → ${x.end}</b> · ${x.bars} hari bursa · universe ${x.universe} · biaya 0,4% round-trip · eksekusi harga tutup · tanpa look-ahead</p>
    <p class="note">${m.note}</p>
    ${svg({ main: x.curves.main, bench: x.curves.bench, regime: x.curves.regime })}
    <table>
      <thead><tr><th>Strategi</th><th class="num">CAGR</th><th class="num">Max DD</th><th class="num">Sharpe</th><th class="num">Vol</th><th class="num">Win rate</th><th class="num">Avg trade</th><th class="num"># trade</th></tr></thead>
      <tbody>
        <tr class="base"><td>Buy&amp;hold ${x.benchName}</td><td class="num">${f1(x.bench.cagr)}</td><td class="num">${f1(x.bench.mdd)}</td><td class="num">${f2(x.bench.sharpe)}</td><td class="num">${f1(x.bench.vol)}</td><td class="num">—</td><td class="num">—</td><td class="num">—</td></tr>
        <tr class="base${ewWin ? " best" : ""}"><td>Equal-weight seluruh universe</td><td class="num">${f1(x.ew.cagr)}</td><td class="num">${f1(x.ew.mdd)}</td><td class="num">${f2(x.ew.sharpe)}</td><td class="num">${f1(x.ew.vol)}</td><td class="num">—</td><td class="num">—</td><td class="num">—</td></tr>
        <tr class="base"><td>Pilihan <b>acak</b> Top-5 (rata² 30 percobaan)</td><td class="num">${f1(x.randAvg.cagr)}</td><td class="num">${f1(x.randAvg.mdd)}</td><td class="num">${f2(x.randAvg.sharpe)}</td><td class="num">${f1(x.randAvg.vol)}</td><td class="num">—</td><td class="num">—</td><td class="num">—</td></tr>
        ${rows}
      </tbody>
    </table>
    <p class="freq">Paling sering masuk Top-5: ${x.topFreq.slice(0, 5).map(t => `<b>${t.sym.replace(".JK", "").replace("-USD", "")}</b> (${t.n}×)`).join(" · ")}</p>
  </section>`;
});

const out = TPL.replace("/*__SECTIONS__*/", sections).replace("/*__GENAT__*/", new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) + " WIB");
fs.writeFileSync("/workspace/backtest-laporan.html", out);
console.log("backtest-laporan.html dibuat —", (out.length / 1024).toFixed(0), "KB");
