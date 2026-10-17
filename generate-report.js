// generate-report.js — sisipkan data screener ke template laporan interaktif
const fs = require("fs");
const raw = JSON.parse(fs.readFileSync(__dirname + "/saham-screener.json", "utf8"));
const stocks = Array.isArray(raw) ? raw : raw.stocks;
const regime = Array.isArray(raw) ? null : raw.regime;
const tpl = fs.readFileSync(__dirname + "/report-template.html", "utf8");

// hanya sertakan field yang dibutuhkan browser (hemat ukuran)
const keep = ["ticker","symbol","market","cur","rank","name","sector","px","chg1d","ret1d","ret5d",
  "pe","fwdPe","pb","mcap","divYield","high52","low52","avgVol","turnover","floatPct","exDiv",
  "divYears","exDivDays","lastDiv","ipoBaru","reverseSplit","stockSplit","arb","ca","excluded",
  "ma20","ma50","ma200","rsi","mfi","obv","accum","volSpike","ret1m","ret3m","ret6m","ret12m","mom121","hi20","lo20","offHigh",
  "earnDate","earnInDays","shortPct","daysToCover","edgar","fng","btcDom","cycle","ddHigh",
  "industry","finCur","fxConverted",
  "roe","margin","revGrowth","earnGrowth","debtToEquity","currentRatio","eps","bvps","score","series","news"];
const slim = stocks.map(r => Object.fromEntries(keep.filter(k => k in r).map(k => [k, r[k]])));

const json = JSON.stringify(slim);
const reg = JSON.stringify(regime || null);
let html = tpl.replace("/*__DATA__*/", json);
html = html.replace("/*__REGIME__*/", reg);
html = html.replace("/*__GENERATED__*/", JSON.stringify(raw.generatedAt || null));
fs.writeFileSync(__dirname + "/saham-laporan.html", html);
console.log("Laporan interaktif dibuat: saham-laporan.html —", slim.length, "instrumen,", Math.round(html.length/1024), "KB");
