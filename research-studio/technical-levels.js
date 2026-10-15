/* Investment Research Studio: daily-OHLC technical levels (not a price-data service).
 * A source must provide chronological data; never infer candles from a price.
 * These are mechanical support/resistance scenarios, not fair-value or guaranteed exits.
 */
(function(root){
'use strict';
function ok(n){return Number.isFinite(Number(n))?Number(n):null;}
function average(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:null;}
function meanLast(a,n){return a.length>=n?average(a.slice(-n)):null;}
function percentile(a,p){const s=a.filter(Number.isFinite).slice().sort((x,y)=>x-y);if(!s.length)return null;const v=(s.length-1)*p,lo=Math.floor(v),hi=Math.ceil(v);return s[lo]+(s[hi]-s[lo])*(v-lo);}
function extrema(a){return {min:Math.min(...a),max:Math.max(...a)};}
function parseBars(rows){
 if(!Array.isArray(rows))return [];
 const result=new Map();
 for(const r of rows){
   if(!r||typeof r!=='object')continue;
   const raw=r.date??r.Date??r['日付']??r.time??r.Time??r['日時']??r['年月日'];
   const date=typeof raw==='number'?new Date(raw>1e11?raw:raw*1000).toISOString().slice(0,10):String(raw||'').slice(0,10).replace(/\//g,'-');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
   const close=ok(r.close??r.Close??r['終値']??r.C);
   const high=ok(r.high??r.High??r['高値']??r.H);
   const low=ok(r.low??r.Low??r['安値']??r.L);
   if(!(close>0&&high>0&&low>0&&low<=close&&close<=high))continue;
   result.set(date,{date,close,high,low});
 }
 return [...result.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-400);
}
function levels(bars){
 const items=parseBars(bars);
 if(items.length<60)return {ok:false,why:'日足60本以上のOHLC履歴が必要',count:items.length};
 const n=items.length,last=items[n-1],close=last.close;
 const closes=items.map(x=>x.close);
 const recent60=items.slice(-60),recent120=items.slice(-Math.min(120,n));
 const supports=[percentile(recent60.map(x=>x.low),.22),percentile(recent120.map(x=>x.low),.08)];
 const resistances=[percentile(recent60.map(x=>x.high),.72),percentile(recent120.map(x=>x.high),.90)];
 const ma20=meanLast(closes,20),ma60=meanLast(closes,60),ma200=meanLast(closes,200);
 const ranges=items.slice(-15).map((r,i)=>{const prior=items[n-16+i]||r;return Math.max(r.high-r.low,Math.abs(r.high-prior.close),Math.abs(r.low-prior.close));});
 const atr=average(ranges);
 const step=Math.max(close*.012,(atr||0)*.32);
 // A limit only starts below the reference, deeper buy below start, sell thresholds above it.
 const lowerCandidates=[supports[0],ma20&&ma20*.992].filter(x=>x>0&&x<close);
 const watch=lowerCandidates.length?Math.max(close*.70,Math.max(...lowerCandidates)):close-step;
 const deepCandidates=[supports[1],ma60&&ma60*.965,watch-1.5*step].filter(x=>x>0&&x<watch);
 const buy=Math.max(close*.35,Math.min(...deepCandidates));
 const firstCandidate=resistances[0]>close?resistances[0]:close+Math.max(atr||0,close*.04);
 const sellStart=Math.max(close+step,Math.min(close*1.40,firstCandidate));
 const resistance=resistances[1]>sellStart?resistances[1]:sellStart+Math.max(atr*2,close*.06);
 const sellTarget=Math.max(sellStart+step,Math.min(close*1.85,resistance));
 const round=x=>x>1000?Math.round(x/5)*5:x>100?Math.round(x):Math.round(x*100)/100;
 const out={ok:true,as_of:last.date,history_first:items[0].date,count:n,current:close,
  buyWatch:round(Math.min(close-step,watch)),buyTarget:round(buy),sellWatch:round(sellStart),sellTarget:round(sellTarget),
  ma20,ma60,ma200,atr14:atr,
  support60:round(supports[0]),support120:round(supports[1]),
  resistance60:round(resistances[0]),resistance120:round(resistances[1]),
  why:'直近60/120営業日の安値分位点（支持帯）、高値分位点（抵抗帯）、20/60/200日移動平均、平均値幅ATRを使用。5価格は将来株価の予言ではありません。',
  method:'日足OHLC・サポート/レジスタンス'};
 if(!(out.buyTarget<out.buyWatch&&out.buyWatch<close&&close<out.sellWatch&&out.sellWatch<out.sellTarget))
   return {ok:false,why:'値幅不足またはチャートの計算条件不適合',count:n};
 return out;
}
root.IRTechnical={levels,parseBars,percentile,meanLast};
})(typeof window!=='undefined'?window:globalThis);