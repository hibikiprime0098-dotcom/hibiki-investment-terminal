'use strict';
/* Investment Research Studio — two-market dashboard. Research data is public CSV; preferences are local. */
const $=id=>document.getElementById(id);
const state={
 market:localStorage.getItem('irs2_market')==='FOREIGN'?'FOREIGN':'JP',
 capital:Math.max(0,Number(localStorage.getItem('irs_budget'))||1000000),
 lot:['1','100','200'].includes(localStorage.getItem('irs_lot_mode'))?Number(localStorage.getItem('irs_lot_mode')):1,
 fx:{JPY:1,USD:Number(localStorage.getItem('irs_usdjpy'))||150,EUR:0,GBP:0},
 fxNote:'保存されたレート／仮設定。最新値ではありません。',
 companies:[],models:[],chains:[],actions:{},quotes:{},fundamentals:{},localQuotes:{},
 watched:new Set(),chartReady:false,loaded:false
};
try{const raw=JSON.parse(localStorage.getItem('irs2_watch')||'[]');state.watched=new Set(Array.isArray(raw)?raw:[]);}catch(_){}
try{state.localQuotes=JSON.parse(localStorage.getItem('irs2_reference_quotes')||'{}')}catch(_){}
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
  const [a,b,c,d,e,g]=await Promise.all([
   fetchText('data/companies.csv'),
   fetchText('data/allocation_models.csv'),
   fetchText('data/value_chains.csv'),
   fetchText('data/corporate_actions.csv'),
   fetchText('data/quotes.json').catch(()=>'{"quotes":{}}'),
   fetchText('data/fundamentals.json').catch(()=>'{"companies":{}}')
  ]);
  state.companies=parseCSV(a);state.models=parseCSV(b);state.chains=parseCSV(c);state.actions=Object.fromEntries(parseCSV(d).map(x=>[x['コード'],x]));
  try{const q=JSON.parse(e);state.quotes=q.quotes&&typeof q.quotes==='object'?q.quotes:{};}catch(_){}
  try{const z=JSON.parse(g);state.fundamentals=z.companies&&typeof z.companies==='object'?z.companies:{};}catch(_){}
  if(state.companies.length<30)throw Error('企業データが不足');
  state.loaded=true;
  $('dataStatus').textContent=state.companies.length+'商品を登録 / 指標は時点値';
  render();
  loadJapanFundamentals();
 }catch(err){$('dataStatus').textContent='データ読込エラー';$('rows').innerHTML='<tr><td colspan="15">企業データを読み込めませんでした。ページを再読み込みしてください。<br>'+esc(err.message)+'</td></tr>';}
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
 const user=state.localQuotes[code];if(user&&Number(user.price)>0){number=Number(user.price);date=String(user.as_of||'入力日未確認');curr=user.currency||curr;origin='ユーザー入力の参考値';}
 const fx=state.fx[curr];return {value:number,currency:curr,fx,JPY:number!==null&&fx>0?number*fx:null,date,origin,verified:origin==='配信終値'};
}
function priceDisplay(c){const p=price(c);return p.JPY===null?(c['所在国']==='日本'?'円建て株価未取得':'株価・円換算未取得'):yen(p.JPY);}
function marketValue(c){const p=price(c);return p.value===null?'株価未確認':p.currency+' '+nfmt.format(p.value);}
function numberMetric(c,name){
 const direct=nval(c[name]);if(direct!==null&&direct>0)return direct;
 const f=state.fundamentals[symbolCode(c)];if(f&&c['所在国']==='日本'&&f.provider==='the-shashi.com'){
  const tag={'PER（倍）':'historicPer','PBR（倍）':'historicPbr','P/S（倍）':'historicPsr'}[name];
  return tag&&Number(f[tag])>0?Number(f[tag]):null;
 }
 if(!f||c['所在国']!=='米国')return null;
 const p=price(c);
 // Ratios from SEC disclosures plus quoted market price. Never use a stale reference to claim a current ratio.
 if(!(p.value>0)||p.currency!=='USD')return null;
 const age=(Date.now()-Date.parse(String(p.date).slice(0,10)+'T00:00:00Z'))/86400000;
 if(!Number.isFinite(age)||age<0||age>7)return null;
 const eps=Number(f.eps),shares=Number(f.shares),equity=Number(f.equity),
   revenue=Number(f.revenue),fcf=Number(f.fcf);
 if(name==='PER（倍）'&&eps>0)return p.value/eps;
 if(!(shares>0))return null;
 if(name==='PBR（倍）'&&equity>0)return p.value*shares/equity;
 if(name==='P/FCF（倍）'&&fcf>0)return p.value*shares/fcf;
 if(name==='P/S（倍）'&&revenue>0)return p.value*shares/revenue;
 return null;
}
function metricOrigin(c,key){
 const direct=nval(c[key]);if(direct!==null&&direct>0)return 'existing';
 const f=state.fundamentals[symbolCode(c)];
 if(f?.provider==='the-shashi.com'&&({
  'PER（倍）':'historicPer','PBR（倍）':'historicPbr','P/S（倍）':'historicPsr'
 }[key])&&Number(f[{'PER（倍）':'historicPer','PBR（倍）':'historicPbr','P/S（倍）':'historicPsr'}[key]])>0)return 'annual';
 return null;
}
function metricText(c,key){
 const val=numberMetric(c,key);if(!(val>0))return '公表資料で確認（対象指標の算出値なし）';
 const past=metricOrigin(c,key)==='annual';
 const f=state.fundamentals[symbolCode(c)]||{};
 return nfmt.format(val)+'倍'+(past?'（決算期末 '+(f.period_end||'期不明')+'、現在倍率ではない）':'');
}
function metricCell(c,key){
 const val=numberMetric(c,key);if(!(val>0))return '<span class="muted">—<small style="display:block">算定元不足</small></span>';
 return nfmt.format(val)+'倍'+(metricOrigin(c,key)==='annual'?'<small class="muted" style="display:block">決算期末</small>':'');
}
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
 const sec=state.fundamentals[symbolCode(c)],eq=Number(sec?.equityRatio);
 const raw=String(c['財務安全性（定性）']||'');
 if(sec&&Number.isFinite(eq)&&eq>=0&&eq<=1){
  const measured=eq>=0.5?94:eq>=0.35?82:eq>=0.25?70:eq>=0.15?55:eq>=0.08?38:20;
  const letter=(raw.match(/^([ABCD])/i)||[])[1];
  const prev=letter?{A:91,B:74,C:43,D:19}[letter.toUpperCase()]:null;
  return prev===null?measured:Math.round(measured*.6+prev*.4);
 }
const letter=(raw.match(/^([ABCD])/i)||[])[1];
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
 const sec=state.fundamentals[symbolCode(c)],margin=Number(sec?.fcfMargin);
 const opMargin=Number(sec?.operatingCashMargin);
 const cash=sec&&Number.isFinite(margin)?Math.max(5,Math.min(98,50+margin*190)):(sec&&Number.isFinite(opMargin)?Math.max(5,Math.min(92,45+opMargin*155)):(pf!==null?Math.max(22,Math.min(90,95-.6*pf)):(hasFcf?64:null)));
 const raw=plain(c['売上成長率予想'])||plain(c['売上成長率実績'])||(state.fundamentals[symbolCode(c)]?.revenueGrowthYoY!=null?String(state.fundamentals[symbolCode(c)].revenueGrowthYoY):null);
 const gr=raw!==null&&Math.abs(Number(raw))<=2?Number(raw):null;
 const growth=gr===null?null:Math.max(8,Math.min(95,50+gr*145));
 const parts={safety,v: v.score,cash,growth,durability:durability(c)};
 const weights={safety:30,v:25,cash:20,growth:15,durability:10};
 let covered=0,total=0;for(const k of Object.keys(weights)){if(parts[k]!==null){covered+=weights[k];total+=parts[k]*weights[k];}}
 const qualified=safety!==null&&v.score!==null&&covered>=60;
 return {score:qualified?Math.round(total/covered):null,qualified,coverage:covered,safety,valuation:v,cash,growth,durability:parts.durability,parts,growthRaw:gr};
}

function theme(c){
 if(plain(c['主テーマ']))return c['主テーマ'];
 const t=String(c['投資テーマ']||'');
 return /サイバー|セキュリティ|PQC/.test(t)?'サイバー':/量子/.test(t)?'量子':'AI';
}
function roundingTarget(num){return num>=1000?Math.floor(num/10)*10:num>=100?Math.floor(num):Math.floor(num*10)/10;}
function entryPlan(c){
 const p=price(c),sc=scoreCompany(c);if(!(p.JPY>0))return null;
 const per=numberMetric(c,'PER（倍）'),t=theme(c),pbr=numberMetric(c,'PBR（倍）');
 let buyWatch=10,buyTarget=20,sellWatch=20,sellTarget=40,why='標準的な長期投資の価格変動シナリオ';
 if((t==='量子'&&c['需要区分']==='直接')||(['3692','5574','5591','5132','4417','4398'].includes(symbolCode(c))&&!sc.qualified)){
  buyWatch=20;buyTarget=35;sellWatch=30;sellTarget=60;why='利益の予測困難さ・小型株の値動きの大きさ';
 }else if(per!==null&&per>=35){buyWatch=20;buyTarget=30;sellWatch=15;sellTarget=30;why='高PERを踏まえた利益確定目安と買い急がない価格帯';}
 else if((per!==null&&per>=28)||(t==='AI'&&c['需要区分']==='二次')){
  buyWatch=15;buyTarget=25;sellWatch=20;sellTarget=40;why='比較的高いPERまたはAI設備サイクルへの依存';
 }else if(per!==null&&per<20){buyWatch=8;buyTarget=15;sellWatch=25;sellTarget=45;why='PERが比較的低いが利益変動には注意';}
 if(pbr!==null&&pbr>=8){buyTarget=Math.max(buyTarget,30);why+='。PBR8倍以上の高い純資産倍率';}
 const age=Math.floor((Date.now()-new Date(String(p.date).slice(0,10)+'T00:00:00Z').getTime())/86400000);
 const stale=!(age>=0&&age<=7);
 return {ref:p.JPY,date:p.date,first:roundingTarget(p.JPY*(1-buyWatch/100)),second:roundingTarget(p.JPY*(1-buyTarget/100)),
  sellFirst:roundingTarget(p.JPY*(1+sellWatch/100)),sellTarget:roundingTarget(p.JPY*(1+sellTarget/100)),
  shallow:buyWatch,deep:buyTarget,sellWatch,sellTargetPct:sellTarget,why,qualified:sc.qualified,stale,
  info:'参考株価を基点にした上下動シナリオ。予想EPS/DCFで導いた適正価格や確定売却推奨ではありません。'};
}

function scoreBreakdown(c,sc){
 const config=[['safety','財務安全性',30],['v','割安度',25],['cash','キャッシュ創出力',20],['growth','成長性',15],['durability','事業持続性',10]];
 return config.map(([k,name,weight])=>{
  const value=sc.parts[k];let reason='';
  if(k==='safety')reason='既存財務評価：'+(plain(c['財務安全性（定性）'])||'未確認')+'。A/B/C/D→91/74/43/19点に暫定換算。定量的な自己資本比率・負債の直接計算ではありません。';
  if(k==='v')reason=sc.valuation.label+'。P/FCF→PER→PSRの順に利用できる倍率を参照。低倍率だけでは適正価格を保証しません。';
  if(k==='cash'){
  const f=state.fundamentals[symbolCode(c)];
  reason=f?.fcfMargin!=null?'SEC報告のFCFマージン '+pct(f.fcfMargin):
  f?.operatingCashMargin!=null?'決算期末の営業CFマージン '+pct(f.operatingCashMargin)+'。FCFではなく、キャッシュ創出の代理指標':
  'P/FCFまたは既存FCFコメントの代理指標。実際のFCF額・マージンは未収録の場合あり。';
 }
  if(k==='growth')reason=(plain(c['売上成長率予想'])?'予想 '+pct(c['売上成長率予想'])+' / '+(c['予想対象期間']||'期間未記載'):'実績 '+pct(c['売上成長率実績'])+' / '+(c['実績対象期間']||'期間未記載'))+'。数字は財務資料の元データであり将来リターン確率ではありません。';
  if(k==='durability')reason='事業分散・専業度と主力事業の有無に基づく暫定定性換算。競合シェア・チャーンの検証は必要。';
  return {name,weight,value,earned:value===null?null:(value*weight/100),reason};
 });
}
function dividend(c){return state.actions[symbolCode(c)]||null;}
function hasVerifiedDividend(c){return dividend(c)?.['配当確認']==='公式IR確認済';}
function hasVerifiedBenefit(c){return dividend(c)?.['優待確認']==='公式IR確認済';}
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
 const sc=scoreCompany(c),code=symbolCode(c),p=price(c),e=entryPlan(c);
 const relationClass=relation(c)==='直接'?'green':relation(c)==='二次'?'purple':'';
 const rank=sc.qualified?index+'位':index+'位・調査';
 const scoreLabel=sc.qualified?'<strong class="score">暫定 '+sc.score+'点</strong><small class="muted"> / 充足 '+sc.coverage+'%</small>':'<span class="muted">評価保留 / 充足 '+sc.coverage+'%</span>';
 const dividendLabel=hasVerifiedDividend(c)?'<span class="badge gold">配当IR確認</span>':hasVerifiedBenefit(c)?'<span class="badge green">優待IR確認</span>':'<span class="muted">未確認</span>';
 const cell=n=>e?'<strong>'+yen(n)+'</strong>'+(e.stale?'<small>基準日古い</small>':''):'<span class="muted">基準値確認後に計算</span>'; 
 const reference=p.JPY>0?'<strong>'+yen(p.JPY)+'</strong><small>'+esc(p.date)+' / '+esc(p.origin)+(e?.stale?' / 古い':'')+'</small>':'<a href="'+esc(infoUrl(c['株価・評価資料URL'])||'https://www.tradingview.com/')+'" target="_blank" rel="noopener noreferrer">提供元で確認 ↗</a><small>基準株価未取得（'+(c['所在国']==='日本'?'JPY':'現地通貨')+'）</small>';
 return '<tr><td><span class="badge">'+esc(rank)+'</span></td>'+
 '<td><button class="companybtn" data-detail="'+esc(code)+'">'+esc(c['企業名／商品名'])+'</button>'+(c['共通度']==='★★★'?'<span class="stars"> ★★★</span>':'')+'<div class="code">'+esc(code)+' / '+esc(theme(c))+'</div></td>'+
 '<td><span class="badge '+relationClass+'">'+esc(relationName(c))+'</span></td><td>'+scoreLabel+'</td>'+
 '<td>'+metricCell(c,'PER（倍）')+'</td><td>'+metricCell(c,'PBR（倍）')+'</td><td>'+metricCell(c,'P/S（倍）')+'</td><td>'+metricCell(c,'P/FCF（倍）')+'</td>'+
 '<td class="price">'+reference+'</td><td class="price">'+cell(e?.first)+'</td><td class="price">'+cell(e?.second)+'</td>'+
 '<td class="price">'+cell(e?.sellFirst)+'</td><td class="price">'+cell(e?.sellTarget)+'</td><td>'+dividendLabel+'</td>'+
 '<td><button class="watchbtn '+(state.watched.has(code)?'on':'')+'" data-watch="'+esc(code)+'" aria-label="ウォッチを切り替え">'+(state.watched.has(code)?'★':'☆')+'</button></td></tr>';
}
function renderNotice(rows){
 const verified=rows.filter(c=>hasVerifiedDividend(c)||hasVerifiedBenefit(c)),watched=verified.filter(c=>state.watched.has(symbolCode(c)));
 const target=$('marketNotice');
 if(watched.length){target.className='notice visible';target.textContent='株主還元メモ：ウォッチ中の '+watched.map(c=>c['企業名／商品名']).join('・')+' に、公式IRで確認できた配当・優待の情報があります。詳細から資料を確認できます（新規発表通知ではありません）。';}
 else if(verified.length){target.className='notice visible';target.textContent='株主還元情報：'+verified.length+'銘柄に公式IRで確認できた配当・優待資料があります。★を付けるとウォッチ銘柄として上部に表示します。';}
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
 const q=$('search').value.trim().toLowerCase(),rel=$('relation').value,div=$('divFilter').value,sort=$('sort').value,themeFilter=$('theme').value;
 let list=all.filter(({c})=>(!q||(String(c['企業名／商品名'])+' '+symbolCode(c)+' '+String(c['投資テーマ'])).toLowerCase().includes(q))&&(rel==='all'||relation(c)===rel)&&(themeFilter==='all'||theme(c)===themeFilter)&&(div==='all'||(div==='verified'&&(hasVerifiedDividend(c)||hasVerifiedBenefit(c)))||(div==='watch'&&state.watched.has(symbolCode(c)))));
 if(sort==='score')list.sort((a,b)=>(Number(b.s.qualified)-Number(a.s.qualified))||(b.s.score||0)-(a.s.score||0)||(b.s.safety??-1)-(a.s.safety??-1)||(b.s.coverage-a.s.coverage)||(parseInt(String(a.c['優先順位']).slice(1))||9)-(parseInt(String(b.c['優先順位']).slice(1))||9)||symbolCode(a.c).localeCompare(symbolCode(b.c)));
 if(sort==='name')list.sort((a,b)=>String(a.c['企業名／商品名']).localeCompare(String(b.c['企業名／商品名']),'ja'));
 if(sort==='per')list.sort((a,b)=>(numberMetric(a.c,'PER（倍）')??Infinity)-(numberMetric(b.c,'PER（倍）')??Infinity));
 let rank=0;
 $('rows').innerHTML=list.map(({c,s})=>rowHtml(c,++rank)).join('')||'<tr><td colspan="15">条件に合う銘柄がありません。</td></tr>';
 $('resultCount').textContent=list.length+'社を表示 / '+all.length+'社';
 renderNotice(stockSet());
 if($('quotesOpen').parentElement.open&&state.widgetMarket!==state.market){state.widgetMarket=state.market;reloadMarketWidget();}
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

function secMetric(c,key,kind){
 const row=state.fundamentals[symbolCode(c)];const val=Number(row?.[key]);
 if(!row||!Number.isFinite(val))return '未取得（SEC財務補完対象外／次回更新待ち）';
 return kind==='%'?(val*100).toFixed(1)+'%':nfmt.format(val);
}
function reloadMarketWidget(){
 const holder=$('marketWidget');holder.innerHTML='';
 const all=stockSet().map(c=>({name:tradingSymbol(c),displayName:String(c['企業名／商品名']||c['証券コード'])}));
 const group={name:state.market==='JP'?'日本株':'海外株',symbols:all};
 const parent=document.createElement('div');parent.className='tradingview-widget-container';parent.style.cssText='width:100%;height:470px;overflow:hidden';
 parent.innerHTML='<div class="tradingview-widget-container__widget"></div>';
 const script=document.createElement('script');script.async=true;script.src='https://s3.tradingview.com/external-embedding/embed-widget-market-quotes.js';
 script.textContent=JSON.stringify({title:'市場データ（配信遅延・取引所ごとの制約あり）',width:'100%',height:'100%',locale:'ja',showSymbolLogo:false,symbolsGroups:[group],colorTheme:'light'});
 parent.appendChild(script);holder.appendChild(parent);
}
function showDetail(code){
 const c=state.companies.find(x=>symbolCode(x)===code);if(!c)return;
 const s=scoreCompany(c),d=dividend(c),p=price(c),risk=c['主要リスク'],entry=entryPlan(c),parts=scoreBreakdown(c,s);
 $('detailSymbol').textContent=esc(code)+' / '+esc(c['所在国'])+' / '+esc(relationName(c));
 $('detailTitle').textContent=c['企業名／商品名'];
 const levels=[['直近の取得株価',p.JPY>0?yen(p.JPY):'提供元で確認'],['買い検討開始',entry?yen(entry.first):'算定待ち'],['購入目標',entry?yen(entry.second):'算定待ち'],['売却検討開始',entry?yen(entry.sellFirst):'算定待ち'],['目標売却',entry?yen(entry.sellTarget):'算定待ち']];
 $('priceSummary').innerHTML=levels.map(([label,value],i)=>'<div class="pricepill"><span>'+esc(label)+'</span><b>'+esc(value)+'</b></div>').join('')+
 '<p class="hint" style="grid-column:1/-1;margin:3px 0">価格の基準：'+esc(p.date)+' / '+esc(p.origin)+(entry?.stale?'（参考価格は7日超前のため再確認が必要）':'')+'。売買の4段階は参考価格からの条件付きシナリオであり、適正株価を保証しません。</p>';
 const fields=[
 ['暫定優先順位',s.qualified?s.score+'点 /100（指標充足 '+s.coverage+'%）':'判定保留（指標充足 '+s.coverage+'%）'],
 ['指標充足率の意味','データが利用できた評価項目の配点合計'+s.coverage+'点/100点。65%や80%は将来の成功確率でも株価上昇確率でもありません。'],
 ['主テーマと関連分類',theme(c)+' / '+relationName(c)],
 ['テーマとの関係を示す根拠',c['テーマの根拠']||c['投資理由']],
 ['テーマ売上が利益につながる裏付け',c['収益化の根拠']||'売上・利益寄与の定量的検証待ち'],
 ['買付検討価格①',entry?yen(entry.first)+'（参考株価'+yen(entry.ref)+'から'+entry.shallow+'%調整）':'参考株価を確認するまで提示保留'],
 ['買付検討価格②',entry?yen(entry.second)+'（参考株価から'+entry.deep+'%調整）':'参考株価を確認するまで提示保留'],
 ['売却検討開始価格③',entry?yen(entry.sellFirst)+'（参考株価から+'+entry.sellWatch+'%、投資仮説と期待収益を再評価）':'参考株価を確認するまで提示保留'],
 ['目標売却価格④',entry?yen(entry.sellTarget)+'（参考株価から+'+entry.sellTargetPct+'%、利益確定を検討する参考値）':'参考株価を確認するまで提示保留'],
 ['基準株価のデータ品質',entry?(entry.stale?'7日超の過去価格に基づく試算。今の株価ではないため最新値の照合が必要':'原則7日以内の基準株価。終値/遅延値とリアルタイム値は異なる'): '参考株価未取得。TradingViewの銘柄画面から確認'],

 ['価格提案の考え方',entry?entry.why+'。'+(entry.qualified?'財務スコアは暫定計算済':'財務評価は未完了・価格だけのシナリオ')+'。'+entry.date+'の参考株価を基準にしたシナリオで、適正価値の断定や売却推奨ではありません。':'価格・業績を確認後に提案'],

 ['関係の種類',relationName(c)+' / '+c['投資テーマ']],
 ['株価参考値',priceDisplay(c)+'　（'+marketValue(c)+' / '+p.date+' / '+p.origin+'）'],
 ['参考購入株数（仮に予算の5%）',shareEstimate(c,Math.round(state.capital*.05))+'：特定銘柄へ予算の5%を割り当てた場合'],
 ['PER',metricText(c,'PER（倍）')],['PBR',metricText(c,'PBR（倍）')],['PSR',metricText(c,'P/S（倍）')],['P/FCF',metricText(c,'P/FCF（倍）')],
 ['自己資本比率',secMetric(c,'equityRatio','%')],['FCFマージン',secMetric(c,'fcfMargin','%')],['SECの年次売上成長率',secMetric(c,'revenueGrowthYoY','%')],
 ['ROE',secMetric(c,'roe','%')],
 ['利用できる最新の財務表示','下部のTradingView財務ウィジェットに、売上高・利益・財務比率の提供元データを表示します。埋め込みの数値は当サイトのランキング点数に自動転記されません。'],
 ['日本の有価証券報告書由来データ',state.fundamentals[code]?.provider==='the-shashi.com'?'The社史 / EDINET XBRL / 決算期 '+(state.fundamentals[code].period_end||'不明')+' / '+(state.fundamentals[code].accounting_standard||'')+'。機械抽出のため原典照合が必要':'未取得・日本以外または対象企業データなし'],
 ['SECの直近財務報告',state.fundamentals[code]?('米国SEC開示 '+(state.fundamentals[code].period_end||'期間未確認')+' / '+(state.fundamentals[code].source||'')):'未連携・国内は企業IRから照合'],
 ['売上成長率・実績',pct(c['売上成長率実績'])+' / '+(c['実績対象期間']||'')],
 ['売上成長率・予想',pct(c['売上成長率予想'])+' / '+(c['予想対象期間']||'')+'。会社予想か市場予想かは一次資料で要確認'],['予想値の調査根拠',c['業績・技術一次資料URL']||'資料未登録'],['評価指標の参照日',c['指標評価日']||'資料ごとの照合が必要'],
 ['財務安全性（既存評価）',plain(c['財務安全性（定性）'])||'未確認'],
 ['事業の持続性','暫定定性評価（保守的な業種・分散性ルール）'],
 ['投資理由',c['投資理由']],['競争優位性',c['競争優位性']],['主なリスク',risk],['買う前に確認する論点',c['購入判断の論点']],
 ['株主優待',hasVerifiedBenefit(c)?(d['優待内容']||'公式IRで優待制度を確認'):'公式確認未済（制度の有無を確定していません）'],
 ['配当金',d?'公式IRで配当公表を確認。'+(d['内容']||''):'公式IRの個別確認未済。無配と断定していません。'],
 ['配当資料の対象期間',d?.['対象期']||'—']
 ];
 let html='<div class="notice visible" style="display:block;margin:0 0 15px">このランキングの点数・買い／売りの4目安は株価の将来予測ではありません。財務指標、参考株価の基準日、条件付きシナリオを必ず確認してください。</div>';
 html+='<div class="detailpriceinput"><label for="manualQuote"><b>確認した株価をこの画面の計算基準にする</b></label><div style="display:flex;gap:8px;margin-top:6px"><input id="manualQuote" type="number" min="0" step="0.01" placeholder="現地通貨で入力（例：123.45）" style="flex:1;padding:11px;border:1px solid #dbe6ef;border-radius:9px"><button class="watchbtn" id="saveQuote" data-quote-code="'+esc(code)+'">反映</button></div><p class="hint">TradingViewで確認した価格を入力すると、5つの価格の計算基準を更新します。入力値・通貨・日付はこのブラウザ内にのみ保存し、全訪問者の共通価格としては扱いません。</p></div>';
 html+=fields.map(x=>'<div class="fact"><b>'+esc(x[0])+'</b><div>'+esc(x[1]??'未確認')+'</div></div>').join('');
 html+='<h3 style="margin:25px 0 12px">各指標のスコア算定根拠</h3>'+parts.map(p=>'<div class="fact"><b>'+esc(p.name)+' '+p.weight+'点枠</b><div>'+esc(p.value===null?'未収録':p.value.toFixed(1)+'/100')+' → '+esc(p.earned===null?'判定除外':p.earned.toFixed(1)+'点')+'<br><span class="muted">'+esc(p.reason)+'</span></div></div>').join('');
 const chain=state.chains.filter(x=>x['コード']===code);
 if(chain.length){html+='<h3 style="margin:24px 0 5px">二次波及・需要の根拠</h3>'+chain.map(x=>'<div class="fact"><b>'+esc(x['バリューチェーン'])+'</b><div>'+esc(x['増える需要の起点'])+' → '+esc(x['買われる製品・役務'])+'<br><small class="muted">'+esc(x['利益化の限界']||'')+'</small></div></div>').join('');}
 const links=[['日本の財務資料（The社史）',state.fundamentals[code]?.provider==='the-shashi.com'?state.fundamentals[code].source:null],['SEC XBRL元データ',state.fundamentals[code]?.provider!=='the-shashi.com'?state.fundamentals[code]?.source:null],['企業一次資料',c['業績・技術一次資料URL']],['株価・評価資料',c['指標出典URL']||c['株価・評価資料URL']],['テーマの調査資料',c['業績・技術一次資料URL']],['配当の公式IR',d?.['IR出典']],['株主優待の公式IR',d?.['優待IR']]];
 html+='<div class="linkrow">'+links.filter(x=>infoUrl(x[1])).map(x=>'<a href="'+esc(infoUrl(x[1]))+'" target="_blank" rel="noopener noreferrer">'+esc(x[0])+' ↗</a>').join('')+'</div>';
 $('detailBody').innerHTML=html;
 $('detailBackdrop').hidden=false;
 document.body.style.overflow='hidden';
 const sym=tradingSymbol(c),tv='https://www.tradingview.com/symbols/'+encodeURIComponent(sym.replace(':','-'))+'/';
 const symbox=$('symbolQuote');symbox.innerHTML='<div class="tradingview-widget-container" style="width:100%;min-height:140px"><div class="tradingview-widget-container__widget"></div></div>';
 const w=document.createElement('script');w.async=true;w.src='https://s3.tradingview.com/external-embedding/embed-widget-symbol-info.js';
 w.textContent=JSON.stringify({symbol:sym,colorTheme:'light',isTransparent:false,locale:'ja',width:'100%'});
 symbox.querySelector('.tradingview-widget-container').appendChild(w);
 const fin=$('symbolFinancials');fin.innerHTML='<div class="tradingview-widget-container" style="width:100%;min-height:570px"><div class="tradingview-widget-container__widget"></div></div>';
 const fscript=document.createElement('script');fscript.async=true;fscript.src='https://s3.tradingview.com/external-embedding/embed-widget-financials.js';
 fscript.textContent=JSON.stringify({symbol:sym,colorTheme:'light',displayMode:'regular',isTransparent:false,locale:'ja',width:'100%',height:570});
 fin.querySelector('.tradingview-widget-container').appendChild(fscript);
 $('chartContainer').innerHTML='<div class="tvbox"><div class="tradingview-widget-container__widget"></div></div>';
 $('chartFallback').innerHTML='チャートが表示されない場合は <a target="_blank" rel="noopener noreferrer" href="'+esc(tv)+'">TradingViewでこの銘柄を開く ↗</a>';
 if(!/^[A-Za-z0-9.:]+$/.test(sym))return;
 const cfg={symbols:[[c['企業名／商品名'],sym+'|1D']],colorTheme:'light',locale:'ja',autosize:true,chartOnly:false,changeMode:'price-and-percent',dateRanges:['1m|30','3m|60','12m|1D','60m|1W','all|1M'],hideDateRanges:false,isTransparent:false,showVolume:true};
 const script=document.createElement('script');
 script.type='text/javascript';script.src='https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js';
 script.async=true;script.textContent=JSON.stringify(cfg);
 $('chartContainer').querySelector('.tvbox').appendChild(script);
}
function closeDetail(){$('detailBackdrop').hidden=true;$('chartContainer').innerHTML='';$('symbolQuote').innerHTML='';$('symbolFinancials').innerHTML='';$('priceSummary').innerHTML='';document.body.style.overflow='';}
// Japanese issuer annual filings via public EDINET/XBRL-derived API.
// All fetched data stays in this visitor's browser; provider attribution and fiscal dates are shown.
async function loadJapanFundamentals(){
 const japan=state.companies.filter(c=>c['所在国']==='日本'&&/^\d{4}$/.test(symbolCode(c))&&isStock(c));
 let completed=0,success=0;
 for(let n=0;n<japan.length;n+=6){
  const batch=japan.slice(n,n+6);
  await Promise.all(batch.map(async c=>{
   const code=symbolCode(c);
   try{
    const fetchJson=async suffix=>{
      const response=await fetch('https://the-shashi.com/api/'+code+'/'+suffix,{cache:'no-store',signal:AbortSignal.timeout(7500)});
      if(!response.ok)throw Error('HTTP '+response.status);return response.json();
    };
    const [d,stock]=await Promise.all([fetchJson('financials.json'),fetchJson('financials/stock.json')]);
    if(d.stock_code!==code||stock.stock_code!==code)throw Error('Code mismatch');
    const last=(rows)=>Array.isArray(rows)?rows.filter(x=>x&&x.period).sort((a,b)=>String(b.period).localeCompare(String(a.period)))[0]:null;
    const pl=last(d.financials),bs=last(d.bs),cf=last(d.cf),sh=last(stock.stock);
    const eligible=pl&&bs&&pl.period===bs.period&&pl.consolidation===bs.consolidation;
    const f={provider:'the-shashi.com',source:d.canonical_url,period_end:pl?.period||bs?.period||'',
     updated:d.updated,accounting_standard:pl?.accounting_standard,consolidation:pl?.consolidation,
     data_attribution:d.attribution};
    if(eligible){
     if(Number(bs.total_assets)>0&&Number(bs.equity)>0)f.equityRatio=bs.equity/bs.total_assets;
     if(Number(bs.equity)>0&&Number.isFinite(Number(pl.net_profit)))f.roe=pl.net_profit/bs.equity;
     if(Number(pl.sales)>0&&cf?.period===pl.period&&Number.isFinite(Number(cf.operating_cf)))
       f.operatingCashMargin=cf.operating_cf/pl.sales;
     const historic=Array.isArray(d.financials)?d.financials.filter(x=>x?.period&&x.period!==pl.period&&x.consolidation===pl.consolidation).sort((a,b)=>String(b.period).localeCompare(String(a.period)))[0]:null;
     if(historic&&Number(historic.sales)>0&&Number(pl.sales)>0)f.revenueGrowthYoY=pl.sales/historic.sales-1;
    }
    if(sh&&sh.period===pl?.period){
     if(Number(sh.per)>0)f.historicPer=Number(sh.per);
     if(Number(sh.pbr)>0)f.historicPbr=Number(sh.pbr);
     if(Number(sh.market_cap_yen)>0&&Number(pl.sales)>0&&pl.unit==='百万円')
       f.historicPsr=sh.market_cap_yen/(pl.sales*1000000);
    }
    if(Object.keys(f).some(k=>['equityRatio','roe','operatingCashMargin','revenueGrowthYoY','historicPer','historicPbr','historicPsr'].includes(k))){
      state.fundamentals[code]=f;success++;
    }
   }catch(e){/* No assumptions if not found, blocked by CORS, or schema changed. */}
   finally{completed++;}
  }));
  if(state.loaded){$('dataStatus').textContent='調査企業 '+state.companies.length+'件 / 国内決算補完 '+success+'/'+completed+'社';render();}
 }
 if(!success&&japan.length)$('dataStatus').textContent='企業情報登録済 / 外部の国内財務APIに接続できませんでした';
}

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
 document.querySelectorAll('[data-market]').forEach(b=>b.addEventListener('click',()=>{state.market=b.dataset.market;localStorage.setItem('irs2_market',state.market);$('search').value='';$('theme').value='all';$('relation').value='all';$('divFilter').value='all';$('sort').value='score';render();window.scrollTo({top:0,behavior:'smooth'});}));
 $('capital').addEventListener('input',e=>{if(e.target.value==='')return;let v=Math.max(0,Math.min(50000,Math.floor(Number(e.target.value))));if(!Number.isFinite(v))return;state.capital=v*10000;localStorage.setItem('irs_budget',String(state.capital));if(state.loaded)render();});
 $('usdjpy').addEventListener('change',e=>{const v=Number(e.target.value);if(!(v>0))return;state.fx.USD=v;state.fxNote='USD/JPY手入力（最新値ではありません）';$('fxStatus').textContent=state.fxNote;localStorage.setItem('irs_usdjpy',String(v));if(state.loaded)render();});
 $('jpLots').addEventListener('change',e=>{state.lot=Number(e.target.value);localStorage.setItem('irs_lot_mode',String(state.lot));if(state.loaded)render();});
 ['search','theme','relation','divFilter','sort'].forEach(k=>$(k).addEventListener(k==='search'?'input':'change',()=>{if(state.loaded)render();}));
 $('quotesOpen').parentElement.addEventListener('toggle',e=>{if(e.target.open){state.widgetMarket=state.market;reloadMarketWidget();}});
 $('weightsToggle').onclick=()=>{const pane=$('weightsPanel');pane.hidden=!pane.hidden;$('weightsToggle').setAttribute('aria-expanded',pane.hidden?'false':'true');};
 $('rows').onclick=e=>{const target=e.target.closest('[data-detail]');if(target){showDetail(target.dataset.detail);return;}const watch=e.target.closest('[data-watch]');if(watch){const code=watch.dataset.watch;if(state.watched.has(code))state.watched.delete(code);else state.watched.add(code);localStorage.setItem('irs2_watch',JSON.stringify([...state.watched]));render();toast('ウォッチ銘柄を更新しました');}};
 $('detailBody').addEventListener('click',e=>{if(e.target.id!=='saveQuote')return;
  const code=e.target.dataset.quoteCode,c=state.companies.find(x=>symbolCode(x)===code),val=Number($('manualQuote')?.value);
  if(!c||!(val>0))return toast('正しい現地通貨の株価を入力してください');
  const curr=c['所在国']==='日本'?'JPY':c['所在国']==='英国'?'GBP':c['所在国']==='フランス'?'EUR':'USD';
  state.localQuotes[code]={price:val,currency:curr,as_of:new Date().toISOString().slice(0,10)};
  localStorage.setItem('irs2_reference_quotes',JSON.stringify(state.localQuotes));showDetail(code);render();toast('確認した参考株価を5価格の基準に反映しました');
 });
 $('closeDetail').onclick=closeDetail;
 $('detailBackdrop').onclick=e=>{if(e.target===$('detailBackdrop'))closeDetail();};
 window.addEventListener('keydown',e=>{if(e.key==='Escape')closeDetail();});
 $('fxStatus').textContent=state.fxNote;
 $('capital').value=state.capital/10000;$('usdjpy').value=state.fx.USD;$('jpLots').value=state.lot;
 loadData();loadFx();
}
init();
