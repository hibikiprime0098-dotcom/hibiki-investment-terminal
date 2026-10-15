#!/usr/bin/env node
/* Automated smoke tests for the published research UI, not securities forecasts. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const BASE=path.join(__dirname,'..');
const context=vm.createContext({
 console,localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},
 setTimeout,clearTimeout
});
const technical=fs.readFileSync(path.join(BASE,'technical-levels.js'),'utf8');
vm.runInContext(technical,context,{filename:'technical-levels.js'});
assert.ok(context.IRTechnical,'technical analysis module must load');
const src=fs.readFileSync(path.join(BASE,'app-v2.js'),'utf8').replace(/\binit\(\);\s*$/,'');
new vm.Script(src,{filename:'app-v2.js'});
vm.runInContext(src,context,{filename:'app-v2.js'});
const take=key=>vm.runInContext(key,context);
const parseCSV=take('parseCSV');
const rows=parseCSV(fs.readFileSync(path.join(BASE,'data','companies.csv'),'utf8'));
assert.ok(rows.length>=80,'company master must contain enough candidates');
const state=take('state');state.companies=rows;state.loaded=true;
const stockSet=take('stockSet'),plan=take('entryPlan'),quote=take('price'),rowHtml=take('rowHtml');
const fx=take('priceDisplay'),score=take('scoreCompany');
let checked=0;
for(const [market,count] of [['JP',47],['FOREIGN',31]]){
 state.market=market;
 const set=stockSet();
 assert.equal(set.length,count,market+' candidates changed unexpectedly');
 for(const c of set){
  assert.ok(!fx(c).includes('円換算待ち'));
  const p=plan(c);
  if(p){
   assert.ok(p.second<=p.first,'buy target should not exceed buy-watch');
   assert.ok(p.first<p.ref,'buy-watch should be below quoted price');
   assert.ok(p.sellFirst>p.ref,'sell-watch should exceed reference');
   assert.ok(p.sellTarget>p.sellFirst,'sell target should exceed sell-watch');
   checked++;
  }
  assert.equal((rowHtml(c,1).match(/<td/g)||[]).length,15,'15-column price matrix');
  assert.ok(score(c).coverage<=100);
 }
}
const a=rows.find(r=>r['証券コード']==='8035');
assert.ok(a&&quote(a).currency==='JPY','Tokyo Electron must be JPY');
const bars=[];
const last=new Date();last.setUTCHours(0,0,0,0);last.setUTCDate(last.getUTCDate()-1);
for(let i=200;i>=0;i--){
 const d=new Date(last);d.setUTCDate(last.getUTCDate()-i);
 const close=9800+(200-i)*8+220*Math.sin((200-i)/12);
 bars.push({date:d.toISOString().slice(0,10),close,high:close+130,low:close-140});
}
const t=context.IRTechnical.levels(bars);
assert.ok(t.ok,'chart analytics should succeed with 200+ daily bars');
state.histories['8035']=bars;
state.localQuotes['8035']={price:bars.at(-1).close,currency:'JPY',as_of:bars.at(-1).date};
assert.ok(plan(a).method.startsWith('日足チャート'),'technical prices should be used on recent chart history');
const html=fs.readFileSync(path.join(BASE,'index.html'),'utf8');
const headings=html.match(/<thead>([\s\S]*?)<\/thead>/)[1];
assert.equal((headings.match(/<th/g)||[]).length,15,'expected 15 table headings');
assert.match(html,/technical-levels\.js/,'technical module is missing from page');
const ids=new Set([...html.matchAll(/id="([^"]+)"/g)].map(x=>x[1]));
const accesses=[...src.matchAll(/\$\('([^']+)'\)/g)].map(x=>x[1]);
for(const id of accesses)assert.ok(ids.has(id)||id==='manualQuote','missing DOM id '+id);
console.log('PASS',JSON.stringify({stockUniverse:rows.length,checkedPriceLevels:checked,japanStocks:47,foreignStocks:31,technicalBars:bars.length,tableColumns:15}));
