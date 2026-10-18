// bt-stats.js — statistik per-trade config pemenang (rvol 1,5 · hold 4 mgg · trailing ATR 2,5x · stop -10% · N=10)
const fs = require("fs");
const src = fs.readFileSync(__dirname + "/run7.js", "utf8");
const cut = src.indexOf('console.log("\\n== 1) Jumlah slot');
if (cut < 0) throw new Error("penanda tidak ditemukan");
const head = src.slice(0, cut);

const tail = `
const CFG = { ...base, K: 10, exitMode: "atr", atrK: 2.5, maxHold: 20, hardStop: 0.10, gapMax: 0.04, regime: "both", rvol: 1.5, liqMin: 1e9 };
function stat(sp){
  const [a,b]=SPL[sp]; const o=simulate(A,CFG,a,b); const m=metrics(o.equity,A.dates,a);
  const t=o.trades; const n=t.length;
  const wins=t.filter(x=>x.ret>0), loss=t.filter(x=>x.ret<=0);
  const avg=x=>x.length? x.reduce((p,q)=>p+q.ret,0)/x.length : 0;
  const hold=t.map(x=>x.bars).sort((p,q)=>p-q);
  const med=hold.length? hold[Math.floor(hold.length/2)] : 0;
  const why={}; t.forEach(x=>why[x.why]=(why[x.why]||0)+1);
  const z=(x)=>x.toFixed(1).padStart(7);
  console.log("== "+sp+" ==");
  console.log("  CAGR "+z(m.cagr)+"% | DD "+z(m.mdd)+"% | Sharpe "+m.sharpe.toFixed(2)+" | trade "+n+" | win "+(n?(wins.length/n*100).toFixed(0):0)+"%");
  console.log("  rata2/trade "+z(avg(t))+"% | menang "+z(avg(wins))+"% ("+wins.length+") | kalah "+z(avg(loss))+"% ("+loss.length+")");
  console.log("  hold: median "+med+" hari bursa | min "+hold[0]+" | maks "+hold[hold.length-1]);
  console.log("  alasan keluar: "+Object.entries(why).map(([k,v])=>k+" "+v).join(" | "));
  const srt=[...t].map(x=>x.ret).sort((x,y)=>x-y); const q=(p)=>srt[Math.min(srt.length-1,Math.floor(srt.length*p))];
  console.log("  persentil ret: p10 "+q(.1).toFixed(1)+"% | p50 "+q(.5).toFixed(1)+"% | p90 "+q(.9).toFixed(1)+"% | terbaik "+Math.max(...t.map(x=>x.ret)).toFixed(1)+"% | terburuk "+Math.min(...t.map(x=>x.ret)).toFixed(1)+"%");
  const yrs={};
  for(let i=a+1;i<=Math.min(b,A.N-1);i++){ const y=new Date(A.dates[i]).getUTCFullYear(); const r=o.equity[i-a]/o.equity[i-1-a]-1; yrs[y]=((yrs[y]||0)+1)*(1+r)-1; }
  console.log("  per tahun: "+Object.entries(yrs).map(([y,v])=>y+" "+((v>=0?"+":"")+(v*100).toFixed(1)+"%")).join("  "));
  return {sp,cagr:m.cagr,mdd:m.mdd,n,win:n?wins.length/n*100:0,avgWin:avg(wins),avgLoss:avg(loss),medHold:med,why};
}
const OUT={config:CFG};
["FULL","DEV","VAL","OOS"].forEach(sp=>{ OUT[sp]=stat(sp); console.log(""); });
fs.writeFileSync(__dirname+"/bt-stats.json", JSON.stringify(OUT,null,1));
console.log("disimpan: bt-stats.json");
`;
fs.writeFileSync(__dirname + "/_bt-stats.run.js", head + tail);
console.log("_bt-stats.run.js dibuat");
