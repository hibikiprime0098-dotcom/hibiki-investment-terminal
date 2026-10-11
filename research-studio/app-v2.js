'use strict';
/* Investment Research Studio — two-market dashboard. Research data is public CSV; preferences are local. */
const $=id=>document.getElementById(id);
const state={
 market:localStorage.getItem('irs2_market')==='FOREIGN'?'FOREIGN':'JP',
 capital:Math.max(0,Number(localStorage.getItem('irs_budget'))||1000000),
 lot:['1','100','200'].includes(localStorage.getItem('irs_lot_mode'))?Number(localStorage.getItem('irs_lot_mode')):1,
 fx:{JPY:1,USD:Number(localStorage.getItem('irs_usdjpy'))||150,EUR:0,GBP:0},
 fxNote:'保存されたレート／仮設定。最新値ではありません。',
 companies:[],models:[],chains:[],actions:{},quotes:{},
 watched:new Set(),chartReady:false,loaded:false
};
try{const raw=JSON.parse(localStorage.getItem('irs2_watch')||'[]');state.watched=new Set(Array.isArray(raw)?raw:[]);}catch(_){}
const yenfmt=new Intl.NumberFormat('ja-JP',{maximumFractionDigits:0});
const nfmt=new Intl.NumberFormat('ja-JP',{maximumFractionDigits:2});
function yen(n){return '¥'+yenfmt.format(Math.round(Number(n)||0));}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function plain(v){return (v===null||v===undefined||String(v).trim()==='')?null:String(v).trim();}
function nval(v){if(!plain(v))return null;let x=Number(v);return Number.isFinite(x)?x:null;}
function ratio(v){const n=nval(v);return n===null?'—':nfmt.format(n)+'倍';}
function pct(v){const n=nval(v);return n===null?'—':nfmt.format(n*100)+'%';}
function field(v){return esc(plain(v)||'未確認');}
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),2800);}
function parseCSV(source){
 const result=[];let row=[],col='',quoted=false;
 source=String(source||'').replace(/^\uFEFF/,'');
 for(let i=0;i<source.length;i++){
  const ch=source[i];
  if(quoted){if(ch==='"'&&source[i+1]==='"'){col+='"';i++;}else if(ch==='"')quoted=false;else col+=ch;}
  else if(ch==='"')quoted=true;else if(ch===','){row.push(col);col='';}
  else if(ch==='\r'||ch==='\n'){if(ch==='\r'&&source[i+1]==='\n')i++;row.push(col);if(row.some(x=>x!==''))result.push(row);row=[];col='';}
  else col+=ch;
 }
 if(col||row.length){row.push(col);result.push(row);}
 const headers=result.shift()||[];return result.map(r=>Object.fromEntries(headers.map((k,i)=>[k,r[i]??''])));
}
async function fetchText(path){const r=await fetch(path+'?v='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error(path+' HTTP '+r.status);return r.text();}
async function loadData(){
 try{
  const [a,b,c,d,e]=await Promise.all([
   fetchText('data/companies.csv'),
   fetchText('data/allocation_models.csv'),
   fetchText('data/value_chains.csv'),
   fetchText('data/corporate_actions.csv'),
   fetchText('data/quotes.json').catch(()=>'{"quotes":{}}')
  ]);
  state.companies=parseCSV(a);state.models=parseCSV(b);state.chains=parseCSV(c);state.actions=Object.fromEntries(parseCSV(d).map(x=>[x['コード'],x]));
  try{const q=JSON.parse(e);state.quotes=q.quotes&&typeof q.quotes==='object'?q.quotes:{};}catch(_){}
  if(state.companies.length<30)throw Error('企業データが不足');
  state.loaded=true;
  $('dataStatus').textContent=state.companies.length+'商品を登録 / 指標は時点値';
  render();
 }catch(err){$('dataStatus').textContent='データ読込エラー';$('rows').innerHTML='<tr><td colspan="10">企業データを読み込めませんでした。ページを再読み込みしてください。<br>'+esc(err.message)+'</td></tr>';}
}
function symbolCode(c){return String(c['証券コード']||'').trim();}
function isCore(c){return symbolCode(c)==='全世界株式'||String(c['取引所']).includes('投資信託')||String(c['投資テーマ']).includes('テーマETF');}
function isStock(c){return !isCore(c) && !String(c['取引所']).includes('ETF') && !['QTUM','CIBR'].includes(symbolCode(c));}
function country(c){return c['所在国']==='日本'?'JP':'FOREIGN';}
function stockSet(){return state.companies.filter(c=>isStock(c)&&country(c)===state.market);}
function relation(c){const v=String(c['需要区分']||'');const theme=String(c['投資テーマ']||'');return v==='直接'||theme.includes('直接')?'直接':v==='二次'||theme.includes('二次')?'二次':v==='間接'?'間接':'間接';}
function relationName(c){const m=relation(c);return m==='直接'?'直接関連':m==='二次'?'二次波及':'間接関連';}
function price(c){
 const code=symbolCode(c);const q=state.quotes[code];const local=nval(c['直近株価（現地通貨）']);
 let curr=c['所在国']==='日本'?'JPY':c['所在国']==='英国'?'GBP':c['所在国']==='フランス'?'EUR':'USD';
 let number=local,date=c['株価基準日']||'未確認',origin='調査時の参考価格';
 if(q&&Number(q.price)>0&&/^\d{4}-\d{2}-\d{2}$/.test(String(q.as_of||''))){number=Number(q.price);date=q.as_of;curr=q.currency||curr;origin='配信終値';}
 const fx=state.fx[curr];return {value:number,currency:curr,fx,JPY:number!==null&&fx>0?number*fx:null,date,origin};
}
function priceDisplay(c){const p=price(c);return p.JPY===null?'円換算待ち':yen(p.JPY);}
function marketValue(c){const p=price(c);return p.value===null?'株価未確認':p.currency+' '+nfmt.format(p.value);}
function numberMetric(c,name){const v=nval(c[name]);return v!==null&&v>0?v:null;}
function valuation(c){
 const pf=numberMetric(c,'P/FCF（倍）');const pe=numberMetric(c,'PER（倍）');const ps=numberMetric(c,'P/S（倍）');
 let x,label,cutoffs;
 if(pf!==null){x=pf;label='P/FCF';cutoffs=[12,22,40,65,110];}
 else if(pe!==null){x=pe;label='PER';cutoffs=[12,21,33,55,90];}
 else if(ps!==null){x=ps;label='PSR';cutoffs=[2,5,11,22,40];}
 else return {score:null,label:'未確認'};
 const scores=[96,83,65,40,18,6];let score=scores.at(-1);
 for(let i=0;i<cutoffs.length;i++){if(x<=cutoffs[i]){score=scores[i];break;}}
 return {score,label:label+' '+nfmt.format(x)+'倍'};
}
function rating(c){
 const raw=String(c['財務安全性（定性）']||'');const letter=(raw.match(/^([ABCD])/i)||[])[1];
 return letter?{A:91,B:74,C:43,D:19}[letter.toUpperCase()]:null;
}
function durability(c){
 const t=String(c['投資テーマ']||'');
 if(t.includes('量子専業'))return 20;
 if(['MSFT','IBM','GOOGL','AMZN','AVGO','6501','6702','6503'].includes(symbolCode(c)))return 85;
 if(['FTNT','ZS','PANW','CRWD','4704','6965','5803','GLW','FORM','KEYS'].includes(symbolCode(c)))return 70;
 return 59;
}
function scoreCompany(c){
 const safety=rating(c),v=valuation(c),pf=numberMetric(c,'P/FCF（倍）');
 const hasFcf=String(c['財務安全性（定性）']||'').includes('FCF');
 const cash=pf!==null?Math.max(22,Math.min(90,95-0.6*pf)):(hasFcf?64:null);
 const raw=plain(c['売上成長率予想'])||plain(c['売上成長率実績']);
 const gr=raw!==null&&Math.abs(Number(raw))<=2?Number(raw):null;
 const growth=gr===null?null:Math.max(8,Math.min(95,50+gr*145));
 const parts={safety,v: v.score,cash,growth,durability:durability(c)};
 const weights={safety:30,v:25,cash:20,growth:15,durability:10};
 let covered=0,total=0;for(const k of Object.keys(weights)){if(parts[k]!==null){covered+=weights[k];total+=parts[k]*weights[k];}}
 const qualified=safety!==null&&v.score!==null&&covered>=70;
 return {score:qualified?Math.round(total/covered):null,qualified,coverage:covered,safety,valuation:v,cash,growth,durability:parts.durability,parts,growthRaw:gr};
}
function dividend(c){return state.actions[symbolCode(c)]||null;}
function hasVerifiedDividend(c){return dividend(c)?.['配当確認']==='公式IR確認済';}
function infoUrl(url){try{const u=new URL(url);return ['http:','https:'].includes(u.protocol)?u.href:null;}catch(_){return null;}}
function modelTargets(amount){
 const axes=[10,30,100,300,500,1000];const man=amount/10000;const out=[];
 for(const r of state.models){
  const code=r['コード'];if(!code||String(code).includes('合計'))continue;
  const values=axes.map(x=>Number(r[String(x)])||0);let target;
  if(man<=10)target=values[0]*(man/10);
  else if(man>=1000)target=values.at(-1)*(man/1000);
  else{let k=0;while(k<axes.length-2&&man>axes[k+1])k++;target=values[k]+(values[k+1]-values[k])*(man-axes[k])/(axes[k+1]-axes[k]);}
  const y=target*10000;out.push({code,name:r['投資先'],theme:r['区分'],amount:y});
 }
 let sum=0;for(const m of out){if(m.code==='全世界株式')continue;m.amount=m.amount<10000?0:Math.floor(m.amount/10000)*10000;sum+=m.amount;}
 const core=out.find(x=>x.code==='全世界株式');if(core)core.amount=Math.max(0,amount-sum);return out;
}
function shareEstimate(c,amount){const p=price(c);if(p.JPY===null)return '株価未確認';const unit=c['所在国']==='日本'?state.lot:1;
 const lots=Math.floor(amount/(p.JPY*unit))*unit;
 return lots?yenfmt.format(lots)+'株（概算）':unit+'株に届かない';}
function renderModel(){
 const targets=modelTargets(state.capital);
 const core=targets.find(r=>r.code==='全世界株式');
 $('kCore').textContent=core?yen(core.amount):'—';
 const group=targets.filter(r=>r.amount>0 && r.code!=='全世界株式' && state.companies.some(c=>symbolCode(c)===r.code&&country(c)===state.market));
 $('kMarket').textContent=yen(group.reduce((n,r)=>n+r.amount,0));
 $('modelRows').innerHTML=group.length?group.map(r=>{
  const c=state.companies.find(c=>symbolCode(c)===r.code);
  return '<div class="modelitem"><div><b>'+esc(r.name)+'</b><small>'+esc(r.code)+' / '+esc(c?relationName(c):r.theme)+'</small></div><strong>'+yen(r.amount)+'</strong><em>'+esc(c?shareEstimate(c,r.amount):'購入条件確認')+'</em></div>';
 }).join(''):'<p class="hint">現在の投資可能額では、この市場の個別株はモデル上まだ購入対象に入っていません。</p>';
}
function rowHtml(c,index){
 const s=scoreCompany(c),d=dividend(c),code=symbolCode(c),p=price(c);
 const cls=relation(c)==='直接'?'green':relation(c)==='二次'?'purple':'';
 const rank=s.qualified?String(index)+'位':'保留';
 const star=c['共通度']==='★★★'?'<span class="stars"> ★★★</span>':'';
 const sign=s.qualified?'<b class="score">'+s.score+'点</b><br><small class="muted">根拠 '+s.coverage+'%</small>':'<span class="muted">指標不足</span>';
 const divLabel=d?'<span class="badge gold">配当IR確認</span>':'<span class="muted">未確認</span>';
 return '<tr><td><span class="badge">'+rank+'</span></td><td><button class="companybtn" data-detail="'+esc(code)+'">'+esc(c['企業名／商品名'])+'</button>'+star+'<div class="code">'+esc(code)+' / '+esc(c['投資テーマ'])+'</div></td><td><span class="badge '+cls+'">'+esc(relationName(c))+'</span></td><td>'+sign+'</td><td>'+ratio(c['PER（倍）'])+'</td><td>'+ratio(c['P/S（倍）'])+'</td><td>'+ratio(c['P/FCF（倍）'])+'</td><td class="price"><strong>'+esc(priceDisplay(c))+'</strong><small>'+esc(p.date)+' / '+esc(p.origin)+'</small></td><td>'+divLabel+'</td><td><button class="watchbtn '+(state.watched.has(code)?'on':'')+'" data-watch="'+esc(code)+'" aria-label="ウォッチを切り替え">'+(state.watched.has(code)?'★':'☆')+'</button></td></tr>';
}
function renderNotice(rows){
 const verified=rows.filter(c=>hasVerifiedDividend(c)),watched=verified.filter(c=>state.watched.has(symbolCode(c)));
 const target=$('marketNotice');
 if(watched.length){target.className='notice visible';target.textContent='配当メモ：ウォッチ中の '+watched.map(c=>c['企業名／商品名']).join('・')+' に、公式IRで確認できた配当情報があります。詳細から資料を確認できます（新規発表通知ではありません）。';}
 else if(verified.length){target.className='notice visible';target.textContent='配当情報：'+verified.length+'銘柄に公式IRで確認できた配当資料があります。★を付けるとウォッチ銘柄として上部に表示します。';}
 else{target.className='notice';target.textContent='';}
}
function render(){
 if(!state.loaded)return;
 const jp=state.market==='JP';const label=jp?'国内株':'海外株';
 document.title=label+'ランキング｜Investment Research Studio';
 $('marketTitle').textContent=label+'ランキング';
 $('rankHeading').textContent=label+'｜投資優先順位';
 $('marketDescription').textContent=jp?'日本の量子・セキュリティ・AI周辺企業を財務重視で比較。企業を開くとチャートと根拠を確認できます。':'米国・欧州の量子・セキュリティ・AI周辺企業を比較。ドル建て株価は参考為替レートで円換算します。';
 document.querySelectorAll('[data-market]').forEach(b=>{const active=b.dataset.market===state.market;b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false');});
 $('capital').value=state.capital/10000;$('usdjpy').value=state.fx.USD;$('jpLots').value=state.lot;
 $('kTotal').textContent=yen(state.capital);
 renderModel();
 const all=stockSet().map(c=>({c,s:scoreCompany(c)}));const count=all.filter(x=>x.s.qualified).length;
 $('kRated').textContent=count+' / '+all.length+'社';
 const q=$('search').value.trim().toLowerCase(),rel=$('relation').value,div=$('divFilter').value,sort=$('sort').value;
 let list=all.filter(({c})=>(!q||(String(c['企業名／商品名'])+' '+symbolCode(c)+' '+String(c['投資テーマ'])).toLowerCase().includes(q))&&(rel==='all'||relation(c)===rel)&&(div==='all'||(div==='verified'&&hasVerifiedDividend(c))||(div==='watch'&&state.watched.has(symbolCode(c)))));
 if(sort==='score')list.sort((a,b)=>(Number(b.s.qualified)-Number(a.s.qualified))||(b.s.score||0)-(a.s.score||0)||(b.s.coverage-a.s.coverage)||symbolCode(a.c).localeCompare(symbolCode(b.c)));
 if(sort==='name')list.sort((a,b)=>String(a.c['企業名／商品名']).localeCompare(String(b.c['企業名／商品名']),'ja'));
 if(sort==='per')list.sort((a,b)=>(numberMetric(a.c,'PER（倍）')??Infinity)-(numberMetric(b.c,'PER（倍）')??Infinity));
 let rank=0;
 $('rows').innerHTML=list.map(({c,s})=>rowHtml(c,s.qualified?++rank:0)).join('')||'<tr><td colspan="10">条件に合う銘柄がありません。</td></tr>';
 $('resultCount').textContent=list.length+'社を表示 / '+all.length+'社';
 renderNotice(stockSet());
}
function tradingSymbol(c){
 const code=symbolCode(c).replace(/[^A-Za-z0-9.]/g,'');const ex=String(c['取引所']||'').toUpperCase();
 if(c['所在国']==='日本')return 'TSE:'+code;
 if(ex.includes('NASDAQ'))return 'NASDAQ:'+code;
 if(ex.includes('NYSE'))return 'NYSE:'+code;
 if(c['所在国']==='英国')return 'LSE:'+code;
 if(c['所在国']==='フランス')return 'EURONEXT:'+code;
 return code;
}
function showDetail(code){
 const c=state.companies.find(x=>symbolCode(x)===code);if(!c)return;
 const s=scoreCompany(c),d=dividend(c),p=price(c),risk=c['主要リスク'];
 $('detailSymbol').textContent=esc(code)+' / '+esc(c['所在国'])+' / '+esc(relationName(c));
 $('detailTitle').textContent=c['企業名／商品名'];
 const fields=[
 ['暫定優先順位',s.qualified?s.score+'点 /100（指標充足 '+s.coverage+'%）':'判定保留（指標充足 '+s.coverage+'%）'],
 ['関係の種類',relationName(c)+' / '+c['投資テーマ']],
 ['株価参考値',priceDisplay(c)+'　（'+marketValue(c)+' / '+p.date+' / '+p.origin+'）'],
 ['国内株の購入額目安',c['所在国']==='日本'?shareEstimate(c,Math.round(state.capital*.05))+'：仮に資金の5%を割当てた場合':'海外株：1株単位で円換算試算'],
 ['PER',ratio(c['PER（倍）'])],['PBR','データ未収録'],['PSR',ratio(c['P/S（倍）'])],['P/FCF',ratio(c['P/FCF（倍）'])],
 ['自己資本比率','データ未収録'],['ROE','データ未収録'],
 ['売上成長率・実績',pct(c['売上成長率実績'])+' / '+(c['実績対象期間']||'')],
 ['売上成長率・予想',pct(c['売上成長率予想'])+' / '+(c['予想対象期間']||'')],
 ['財務安全性（既存評価）',plain(c['財務安全性（定性）'])||'未確認'],
 ['事業の持続性','暫定定性評価（保守的な業種・分散性ルール）'],
 ['投資理由',c['投資理由']],['競争優位性',c['競争優位性']],['主なリスク',risk],['買う前に確認する論点',c['購入判断の論点']],
 ['株主優待','公式確認未済（制度の有無を確定していません）'],
 ['配当金',d?'公式IRで配当公表を確認。'+(d['内容']||''):'公式IRの個別確認未済。無配と断定していません。'],
 ['配当資料の対象期間',d?.['対象期']||'—']
 ];
 let html=fields.map(x=>'<div class="fact"><b>'+esc(x[0])+'</b><div>'+esc(x[1]??'未確認')+'</div></div>').join('');
 const chain=state.chains.filter(x=>x['コード']===code);
 if(chain.length){html+='<h3 style="margin:24px 0 5px">二次波及・需要の根拠</h3>'+chain.map(x=>'<div class="fact"><b>'+esc(x['バリューチェーン'])+'</b><div>'+esc(x['増える需要の起点'])+' → '+esc(x['買われる製品・役務'])+'<br><small class="muted">'+esc(x['利益化の限界']||'')+'</small></div></div>').join('');}
 const links=[['企業一次資料',c['業績・技術一次資料URL']],['株価・評価資料',c['株価・評価資料URL']],['配当の公式IR',d?.['IR出典']]];
 html+='<div class="linkrow">'+links.filter(x=>infoUrl(x[1])).map(x=>'<a href="'+esc(infoUrl(x[1]))+'" target="_blank" rel="noopener noreferrer">'+esc(x[0])+' ↗</a>').join('')+'</div>';
 $('detailBody').innerHTML=html;
 $('detailBackdrop').hidden=false;
 document.body.style.overflow='hidden';
 const sym=tradingSymbol(c),tv='https://www.tradingview.com/symbols/'+encodeURIComponent(sym.replace(':','-'))+'/';
 $('chartContainer').innerHTML='<div class="tvbox"><div class="tradingview-widget-container__widget"></div></div>';
 $('chartFallback').innerHTML='チャートが表示されない場合は <a target="_blank" rel="noopener noreferrer" href="'+esc(tv)+'">TradingViewでこの銘柄を開く ↗</a>';
 if(!/^[A-Za-z0-9.:]+$/.test(sym))return;
 const cfg={symbols:[[c['企業名／商品名'],sym+'|1D']],colorTheme:'light',locale:'ja',autosize:true,chartOnly:false,changeMode:'price-and-percent',dateRanges:['1m|30','3m|60','12m|1D','60m|1W','all|1M'],hideDateRanges:false,isTransparent:false,showVolume:true};
 const script=document.createElement('script');
 script.type='text/javascript';script.src='https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js';
 script.async=true;script.textContent=JSON.stringify(cfg);
 $('chartContainer').querySelector('.tvbox').appendChild(script);
}
function closeDetail(){$('detailBackdrop').hidden=true;$('chartContainer').innerHTML='';document.body.style.overflow='';}
async function loadFx(){
 const rates=['USD','EUR','GBP'];const found=await Promise.all(rates.map(async code=>{
 try{
  const r=await fetch('https://api.frankfurter.dev/v2/rate/'+code+'/JPY',{cache:'no-store',signal:AbortSignal.timeout(7000)});
  if(!r.ok)throw Error(String(r.status));const body=await r.json();
  return Number(body.rate)>0?{code,rate:Number(body.rate),date:body.date}:null;
 }catch(_){return null;}
 }));
 const ok=found.filter(Boolean);for(const v of ok){state.fx[v.code]=v.rate;if(v.code==='USD')localStorage.setItem('irs_usdjpy',String(v.rate));}
 if(ok.length){state.fxNote='参考為替：'+ok.map(v=>v.code+' '+v.date).join(' / ');}
 else state.fxNote='レートの取得に失敗。保存値を使用（最新ではありません）';
 $('fxStatus').textContent=state.fxNote;
 if(state.loaded)render();
}
function init(){
 document.querySelectorAll('[data-market]').forEach(b=>b.addEventListener('click',()=>{state.market=b.dataset.market;localStorage.setItem('irs2_market',state.market);$('search').value='';$('relation').value='all';$('divFilter').value='all';$('sort').value='score';render();window.scrollTo({top:0,behavior:'smooth'});}));
 $('capital').addEventListener('input',e=>{if(e.target.value==='')return;let v=Math.max(0,Math.min(50000,Math.floor(Number(e.target.value))));if(!Number.isFinite(v))return;state.capital=v*10000;localStorage.setItem('irs_budget',String(state.capital));if(state.loaded)render();});
 $('usdjpy').addEventListener('change',e=>{const v=Number(e.target.value);if(!(v>0))return;state.fx.USD=v;state.fxNote='USD/JPY手入力（最新値ではありません）';$('fxStatus').textContent=state.fxNote;localStorage.setItem('irs_usdjpy',String(v));if(state.loaded)render();});
 $('jpLots').addEventListener('change',e=>{state.lot=Number(e.target.value);localStorage.setItem('irs_lot_mode',String(state.lot));if(state.loaded)render();});
 ['search','relation','divFilter','sort'].forEach(k=>$(k).addEventListener(k==='search'?'input':'change',()=>{if(state.loaded)render();}));
 $('weightsToggle').onclick=()=>{const pane=$('weightsPanel');pane.hidden=!pane.hidden;$('weightsToggle').setAttribute('aria-expanded',pane.hidden?'false':'true');};
 $('rows').onclick=e=>{const target=e.target.closest('[data-detail]');if(target){showDetail(target.dataset.detail);return;}const watch=e.target.closest('[data-watch]');if(watch){const code=watch.dataset.watch;if(state.watched.has(code))state.watched.delete(code);else state.watched.add(code);localStorage.setItem('irs2_watch',JSON.stringify([...state.watched]));render();toast('ウォッチ銘柄を更新しました');}};
 $('closeDetail').onclick=closeDetail;
 $('detailBackdrop').onclick=e=>{if(e.target===$('detailBackdrop'))closeDetail();};
 window.addEventListener('keydown',e=>{if(e.key==='Escape')closeDetail();});
 $('fxStatus').textContent=state.fxNote;
 $('capital').value=state.capital/10000;$('usdjpy').value=state.fx.USD;$('jpLots').value=state.lot;
 loadData();loadFx();
}
init();
