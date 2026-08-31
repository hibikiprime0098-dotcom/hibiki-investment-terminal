async function loadJP(){
  $('jpStatus').textContent='取得中…';
  const [masterRes,latestRes]=await Promise.allSettled([fetch(JP_MASTER),fetch(JP_LATEST)]);
  let base=[];
  if(masterRes.status==='fulfilled' && masterRes.value.ok){
    const rows=parseCSV(await masterRes.value.text());
    base=rows.map(r=>{
      const code=r['コード']||r.code, name=r['銘柄名']||r.name, raw=r['33業種区分']||r.sector||'未分類';
      return {id:code+'.T',ticker:code,name,market:'JP',sector:jpSector(raw),rawSector:raw,price:null,marketCap:null,volume:null,source:'JP master'};
    }).filter(x=>x.ticker&&eligibleJP(x.name));
  }
  const map=new Map(base.map(x=>[x.ticker,x]));
  if(latestRes.status==='fulfilled' && latestRes.value.ok){
    const rows=parseCSV(await latestRes.value.text());
    for(const r of rows){
      const code=r.code||r['コード'], name=r.name||r['銘柄名'];
      if(code && !map.has(code) && eligibleJP(name)){
        map.set(code,{id:code+'.T',ticker:code,name,market:'JP',sector:'other',rawSector:'新規/未分類',price:null,marketCap:null,volume:null,source:'JP daily supplement'});
      }
    }
  }
  const arr=[...map.values()];
  $('jpStatus').textContent=arr.length?'取得済み':'取得失敗';
  return arr;
}
async function loadUS(){
  $('usStatus').textContent='取得中…';
  const [priceRes,secRes]=await Promise.allSettled([fetch(US_ALL),fetch(SEC_EX)]);
  if(priceRes.status!=='fulfilled'||!priceRes.value.ok)throw new Error('US universe fetch failed');
  let allowed=null;
  if(secRes.status==='fulfilled'&&secRes.value.ok){
    try{const j=await secRes.value.json();allowed=new Set(j.data.filter(r=>['Nasdaq','NYSE','NYSE American'].includes(r[3])).map(r=>String(r[2]).replaceAll('/','-')))}catch(e){}
  }
  const rows=parseCSV(await priceRes.value.text());
  const arr=rows.map(r=>({id:r.symbol,ticker:r.symbol,name:r.name,market:'US',sector:usSector(r.industry),rawSector:r.industry||'Uncategorized',price:+r.price||null,marketCap:+r.marketCap||null,volume:+r.volume||null,source:'US daily'}))
    .filter(x=>x.ticker&&eligibleUS(x.name,x.ticker)&&(!allowed||allowed.has(String(x.ticker).replaceAll('/','-'))));
  $('usStatus').textContent=arr.length?(allowed?'SEC照合済み':'取得済み'):'取得失敗';
  return arr;
}
function autoThemes(x){
  const text=(x.name+' '+x.rawSector+' '+sectorName(x.sector)).toLowerCase();
  const tags=[];
  for(const [name,re] of THEME_RULES)if(re.test(text))tags.push(name);
  return [...new Set(tags)];
}
function preliminaryScore(x){
  let score=40;
  if(x.market==='US'){
    const cap=x.marketCap||0, dv=(x.price||0)*(x.volume||0);
    if(cap>=2e11)score+=18; else if(cap>=5e10)score+=15; else if(cap>=1e10)score+=12; else if(cap>=2e9)score+=9; else if(cap>=3e8)score+=5;
    if(dv>=5e8)score+=16; else if(dv>=1e8)score+=13; else if(dv>=2e7)score+=10; else if(dv>=3e6)score+=6;
    if(x.price&&x.price<300)score+=4;
  }else{
    score+=8;
  }
  const n=(x.autoThemes||[]).length;
  score+=Math.min(18,n*4);
  if(['technology','industrials','utilities','health'].includes(x.sector))score+=4;
  return Math.max(0,Math.min(100,Math.round(score)));
}
function screeningReason(x){
  const bits=[];
  if(x.marketCap)bits.push('時価総額 '+fmtCap(x.marketCap));
  if(x.volume)bits.push('出来高 '+Math.round(x.volume).toLocaleString());
  if(x.autoThemes?.length)bits.push('テーマ: '+x.autoThemes.slice(0,3).join(' / '));
  if(!bits.length)bits.push('業種・企業名から一次分類済み');
  return bits.join(' · ');
}
function applyCurated(x){
  const c=CURATED[x.id];
  if(c){x.investment=c.i;x.potential=c.p;x.why=c.why;x.analyzed=true;x.scoreProvenance='v0.8旧暫定・v0.9再計算待ち'}
  else{x.investment=null;x.potential=null;x.why='Hard Filter / 5-Factor正式分析のためのデータ取得待ち。根拠のないInvestment Scoreは付与しません。';x.analyzed=false;x.scoreProvenance='Research Priority'}
  x.themes=inferThemes(x); x.autoThemes=autoThemes(x); x.screening=preliminaryScore(x); x.screeningWhy=screeningReason(x);x.hardFilter=hardFilterStatus(x);x.coverage=dataCoverage(x);x.formalTotal=formalScore(x);
  return x;
}
function minCost(x){
  if(!x.price)return null;
  return x.market==='JP'?x.price*100:x.price*USDJPY;
}
function fmtY(n){return n==null?'価格未取得':'¥'+Math.round(n).toLocaleString()}
function fmtCap(n){if(!n)return '—';if(n>=1e12)return (n/1e12).toFixed(1)+'T';if(n>=1e9)return (n/1e9).toFixed(1)+'B';return (n/1e6).toFixed(0)+'M'}
function sectorName(k){return (SECTORS.find(x=>x[0]===k)||['','未分類'])[1]}
function themeName(k){return (THEMES.find(x=>x[0]===k)||['',''])[1]}

function filtered(){
  const q=$('search').value.trim().toLowerCase(), tq=($('themeSearch')?.value||'').trim().toLowerCase(), b=+$('budget').value||0;
  let a=universe.filter(x=>{
    if(region!=='ALL'&&x.market!==region)return false;
    if(sector!=='ALL'&&x.sector!==sector)return false;
    if(theme!=='ALL'&&!x.themes.includes(theme))return false;
    if(tq && !(x.autoThemes.join(' ')+' '+x.themes.map(themeName).join(' ')+' '+x.name+' '+x.rawSector).toLowerCase().includes(tq))return false;
    if(q && !(x.name+' '+x.ticker+' '+x.rawSector).toLowerCase().includes(q))return false;
    const c=minCost(x);
    if(b && c!=null && c>b)return false;
    return true;
  });
  a.sort((a,b)=>{
    const as=a.formalTotal??a.investment??a.screening??0, bs=b.formalTotal??b.investment??b.screening??0;
    if(bs!==as)return bs-as;
    const ap=a.potential||0,bp=b.potential||0;if(bp!==ap)return bp-ap;
    if(a.marketCap||b.marketCap)return (b.marketCap||0)-(a.marketCap||0);
    return String(a.ticker).localeCompare(String(b.ticker),'ja');
  });
  return a;
}
function renderChips(){
  const counts=Object.fromEntries(SECTORS.map(s=>[s[0],universe.filter(x=>x.sector===s[0]).length]));
  $('sectorChips').innerHTML=SECTORS.map(s=>`<button class="chip ${sector===s[0]?'on':''}" data-s="${s[0]}"><b>${s[1]}</b><small>${counts[s[0]]||0}</small></button>`).join('');
  document.querySelectorAll('[data-s]').forEach(e=>e.onclick=()=>{sector=e.dataset.s;page=1;$('sector').value=sector;render()});
  $('themeChips').innerHTML=THEMES.map(t=>`<button class="chip ${theme===t[0]?'on':''}" data-t="${t[0]}"><b>${t[1]}</b><small>${universe.filter(x=>x.themes.includes(t[0])).length}</small></button>`).join('');
  document.querySelectorAll('[data-t]').forEach(e=>e.onclick=()=>{theme=e.dataset.t;page=1;$('theme').value=theme;render()});
}
function render(){
  const a=filtered(); $('filteredN').textContent=a.length.toLocaleString();
  const pages=Math.max(1,Math.ceil(a.length/PAGE)); if(page>pages)page=pages;
  const start=(page-1)*PAGE, view=a.slice(start,start+PAGE);
  $('pageInfo').textContent=a.length?`${(start+1).toLocaleString()}–${Math.min(start+PAGE,a.length).toLocaleString()} / ${a.length.toLocaleString()}件 · ${page}/${pages}ページ`:'0件';
  $('prev').disabled=page<=1;$('next').disabled=page>=pages;
  $('table').innerHTML='<div class="r h"><div>#</div><div>企業</div><div>市場</div><div>セクター/業種</div><div>Total / Priority</div><div>Potential</div><div>最低投資額</div><div>分析状況</div></div>'+
    (view.length?view.map((x,i)=>`<div class="r" data-id="${x.id}">
      <div>${start+i+1}</div>
      <div class="nm"><b>${x.name}</b><small>${x.ticker}${x.marketCap?' · 時価総額 '+fmtCap(x.marketCap):''}</small></div>
      <div><span class="badge">${x.market==='JP'?'日本':'米国'}</span></div>
      <div><b>${sectorName(x.sector)}</b><small class="muted" style="display:block">${x.rawSector}</small></div>
      <div class="${x.formalTotal!=null?'sc':x.investment!=null?'sc legacy':'screen'}">${x.formalTotal!=null?x.formalTotal:x.investment!=null?x.investment+'<small>旧暫定</small>':x.screening+'<small>優先度</small>'}</div>
      <div class="sc p ${x.potential==null?'na':''}">${x.potential==null?'未分析':x.potential}</div>
      <div class="budget">${fmtY(minCost(x))}</div>
      <div class="reason"><span class="coverage">${researchLabel(x)}</span><br>${x.formalTotal!=null?'5-Factor正式算出':x.analyzed?'旧スコアをv0.9で再計算待ち':x.screeningWhy}</div>
    </div>`).join(''):'<div class="loading">条件に該当する銘柄がありません。</div>');
  document.querySelectorAll('[data-id]').forEach(e=>e.onclick=()=>detail(e.dataset.id));
  renderChips();
}
