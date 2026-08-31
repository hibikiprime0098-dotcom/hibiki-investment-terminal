let currentPlan=null;
const PLAN_PROFILES={
  defensive:{cash:20,core:60,growth:15,option:5,maxPos:7,maxSector:22,maxTheme:14,count:12},
  balanced:{cash:10,core:55,growth:25,option:10,maxPos:9,maxSector:26,maxTheme:18,count:10},
  growth:{cash:5,core:45,growth:35,option:15,maxPos:11,maxSector:30,maxTheme:22,count:9},
  aggressive:{cash:3,core:35,growth:40,option:22,maxPos:13,maxSector:35,maxTheme:27,count:8}
};
function switchPage(name){
  $('screenPage').classList.toggle('hide',name!=='screen');$('plannerPage').classList.toggle('hide',name!=='planner');$('modelPage').classList.toggle('hide',name!=='model');
  document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('on',b.dataset.page===name));
  window.scrollTo({top:0,behavior:'smooth'});
}
function planCandidates(scope){
  let a=scope==='filtered'?filtered():[...universe];
  return a.filter(x=>(x.investment??x.screening)!=null).map(x=>{
    const base=x.investment??x.screening??0,pot=x.potential??Math.max(40,(x.screening||0)-5);
    const quality=base, thematic=(x.autoThemes?.length||0)+(x.themes?.length||0);
    return {...x,_core:quality+(x.marketCap?Math.min(8,Math.log10(Math.max(1,x.marketCap))-8):0),_growth:quality*.55+pot*.45+Math.min(8,thematic*2),_option:pot*.72+quality*.28+Math.min(10,thematic*2.5)}
  });
}
function pickDiversified(cands,metric,count,regionPref,maxSector,maxTheme,used=new Set()){
  const out=[], sectorN={}, themeN={};
  const targetUS=regionPref==='us'?.72:regionPref==='jp'?.35:.58;
  const sorted=[...cands].sort((a,b)=>b[metric]-a[metric]);
  for(const x of sorted){
    if(out.length>=count)break;if(used.has(x.id))continue;
    const secShare=(sectorN[x.sector]||0)/Math.max(1,out.length);if(out.length>3&&secShare>maxSector/100)continue;
    const usShare=out.filter(z=>z.market==='US').length/Math.max(1,out.length);if(out.length>4&&((x.market==='US'&&usShare>targetUS+.18)||(x.market==='JP'&&usShare<targetUS-.18)))continue;
    const tags=[...x.themes,...(x.autoThemes||[])].slice(0,3);if(tags.some(t=>(themeN[t]||0)/Math.max(1,out.length)>maxTheme/100)&&out.length>4)continue;
    out.push(x);used.add(x.id);sectorN[x.sector]=(sectorN[x.sector]||0)+1;tags.forEach(t=>themeN[t]=(themeN[t]||0)+1);
  }
  return out;
}
function buildPortfolioPlan(){
  if(!universe.length){$('planOutput').innerHTML='<div class="box plan-summary"><h2>銘柄データを読み込み中です</h2></div>';return}
  const total=Math.max(50000,+$('planTotal').value||1000000),monthly=Math.max(0,+$('planMonthly').value||0),years=+$('planHorizon').value||5,risk=$('planRisk').value,reg=$('planRegion').value,scope=$('planUniverse').value,pr=PLAN_PROFILES[risk];
  const c=planCandidates(scope),used=new Set();
  const investable=total*(1-pr.cash/100),desired=Math.max(5,Math.min(pr.count,Math.floor(investable/70000)+3));
  const coreN=Math.max(2,Math.round(desired*pr.core/(pr.core+pr.growth+pr.option))),growthN=Math.max(1,Math.round(desired*pr.growth/(pr.core+pr.growth+pr.option))),optionN=Math.max(1,desired-coreN-growthN);
  const core=pickDiversified(c,'_core',coreN,reg,pr.maxSector,pr.maxTheme,used),growth=pickDiversified(c,'_growth',growthN,reg,pr.maxSector,pr.maxTheme,used),option=pickDiversified(c,'_option',optionN,reg,pr.maxSector,pr.maxTheme,used);
  const sleeves=[['core',core,pr.core],['growth',growth,pr.growth],['option',option,pr.option]],positions=[];
  for(const [sl,arr,pct] of sleeves){if(!arr.length)continue;const each=pct/arr.length;for(const x of arr)positions.push({x,sleeve:sl,weight:each,amount:Math.round(total*each/100/1000)*1000})}
  const actualInvest=positions.reduce((a,p)=>a+p.amount,0),cash=Math.max(0,total-actualInvest);
  const horizonContrib=total+monthly*12*years;
  const provisional=positions.some(p=>p.x.formalTotal==null);currentPlan={total,monthly,years,risk,reg,scope,profile:pr,positions,cash,horizonContrib,provisional};
  const sectorMap={};positions.forEach(p=>sectorMap[sectorName(p.x.sector)]=(sectorMap[sectorName(p.x.sector)]||0)+p.weight);
  const topSecs=Object.entries(sectorMap).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const riskLabel={defensive:'慎重',balanced:'バランス',growth:'成長重視',aggressive:'積極'}[risk];
  $('planOutput').innerHTML=`<div class="box plan-summary"><div class="kicker">PORTFOLIO COMMITTEE OUTPUT</div><h2>${total.toLocaleString()}円の${provisional?'調査用・暫定':'正式候補'}モデル配分</h2><p class="muted">${provisional?'正式5-Factor未完了銘柄を含むため、これは発注用ではなくResearch Portfolioです。 ':''}${riskLabel}・${years}年・毎月${monthly.toLocaleString()}円。${positions.length}銘柄＋待機資金で構成。${years}年間の入金総額は約${horizonContrib.toLocaleString()}円です。</p><div class="plan-actions"><button class="green" id="askPlanAI">このプランをAIに相談</button><button class="ghost" id="copyPlan">プラン要約をコピー</button></div></div>
  <div class="alloc-grid"><div class="card alloc"><small>コア</small><b>${pr.core}%</b><span class="muted">質・流動性・安定</span></div><div class="card alloc"><small>構造成長</small><b>${pr.growth}%</b><span class="muted">テーマ成長</span></div><div class="card alloc"><small>非対称</small><b class="gold">${pr.option}%</b><span class="muted">化ける可能性</span></div><div class="card alloc"><small>待機資金</small><b>${Math.round(cash/total*100)}%</b><span class="muted">暴落・追加投資余力</span></div></div>
  <div class="box plan-summary"><h3>セクター配分</h3><div class="mini-bars">${topSecs.map(([n,w])=>`<div class="barrow"><span>${n}</span><div class="bar"><i style="width:${Math.min(100,w*2.2)}%"></i></div><b>${w.toFixed(1)}%</b></div>`).join('')}</div></div>
  <div class="plan-table"><div class="pr h"><div>#</div><div>銘柄</div><div>役割</div><div>比率</div><div>金額</div><div>採用理由</div></div>${positions.map((p,i)=>`<div class="pr"><div>${i+1}</div><div><b>${p.x.name}</b><div class="muted">${p.x.ticker} · ${p.x.market==='JP'?'日本':'米国'} · ${sectorName(p.x.sector)}</div></div><div><span class="sleeve ${p.sleeve}">${p.sleeve==='core'?'コア':p.sleeve==='growth'?'成長':'非対称'}</span></div><div><b>${p.weight.toFixed(1)}%</b></div><div>¥${p.amount.toLocaleString()}</div><div class="reason">${p.x.analyzed?p.x.why:p.x.screeningWhy}</div></div>`).join('')}</div>
  <div class="riskbox"><b>リスク委員会コメント</b><p class="muted">1銘柄の目安上限 ${pr.maxPos}%、1セクター ${pr.maxSector}%、1テーマ ${pr.maxTheme}%を基本制約とします。実際の発注前には価格・単元・税制・手数料・最新決算を確認し、四半期または大きな乖離時にリバランスします。</p></div>`;
  setTimeout(()=>{$('askPlanAI').onclick=()=>{openAdvisor();advisorAsk('このポートフォリオプランの弱点、集中リスク、改善案をレビューして')};$('copyPlan').onclick=copyPlanSummary},0);
}
function planText(){if(!currentPlan)return 'まだポートフォリオプランは作成されていません。';const p=currentPlan;return `投資総額${p.total.toLocaleString()}円、${p.years}年、毎月${p.monthly.toLocaleString()}円。銘柄: `+p.positions.map(z=>`${z.x.name} ${z.weight.toFixed(1)}%`).join('、')+`。待機資金${p.cash.toLocaleString()}円。`}
async function copyPlanSummary(){try{await navigator.clipboard.writeText(planText());}catch(e){}}
function openAdvisor(){
  $('advisor').classList.remove('hide');setTimeout(()=>$('advisorInput').focus(),50);
}
function addMsg(text,who){const d=document.createElement('div');d.className='msg '+who;d.textContent=text;$('advisorLog').appendChild(d);$('advisorLog').scrollTop=$('advisorLog').scrollHeight}
function advisorAnswer(q){
  const t=q.toLowerCase(), top=filtered().slice(0,7);
  if(/プラン|分散|ポートフォリオ|総額|配分|何銘柄/.test(t)){
    if(!currentPlan)buildPortfolioPlan();
    if(currentPlan){const p=currentPlan, secs={};p.positions.forEach(z=>secs[sectorName(z.x.sector)]=(secs[sectorName(z.x.sector)]||0)+z.weight);const mx=Object.entries(secs).sort((a,b)=>b[1]-a[1])[0];return `現在のモデルは${p.positions.length}銘柄＋待機資金で、最大セクターは${mx?mx[0]+' 約'+mx[1].toFixed(0)+'%':'未算出'}です。私なら、コアで予測誤差に耐え、構造成長で超過収益を狙い、非対称枠は失敗しても全体を壊さない比率に抑えます。投資額が小さい場合は銘柄数を無理に増やさず、5〜8銘柄程度から始める方が実装効率は良いです。`}
  }
  if(/リスク|暴落|下落|損失|集中/.test(t))return '見るべきは「当たるか」より、外れた時に生き残れるかです。1銘柄・1セクター・1テーマの上限、現金余力、流動性、決算イベント集中を管理してください。高Potential銘柄は上昇余地が大きい一方、仮説崩壊時の下落も大きいため、コア銘柄より小さく持つのが合理的です。';
  const hit=universe.find(x=>(x.name+' '+x.ticker).toLowerCase().includes(t.trim())&&t.trim().length>1);
  if(hit)return `${hit.name}（${hit.ticker}）は、${hit.investment!=null?'Investment '+hit.investment:'一次Screening '+hit.screening}${hit.potential!=null?' / Potential '+hit.potential:''}。${hit.analyzed?hit.why:hit.screeningWhy} 現状は${hit.analyzed?'深掘り済み':'一次スクリーニング段階'}なので、購入前には最新決算・一次情報で仮説を再確認したいです。`;
  if(/テーマ|ai|冷却|量子|原子力|宇宙|防衛|電力|半導体/.test(t)){const names=top.map(x=>`${x.name}(${x.investment??x.screening})`).join('、');return `現在の条件で上位候補は ${names} です。テーマ投資では「市場が大きい」だけでなく、①ボトルネック、②売上への転換、③供給制約、④株価への未織り込みを確認します。テーマ内でも複数のバリューチェーン段階へ分散するのが良いです。`}
  if(/日本|米国/.test(t)){const jp=universe.filter(x=>x.market==='JP').length,us=universe.filter(x=>x.market==='US').length;return `母集団は日本${jp.toLocaleString()}銘柄、米国${us.toLocaleString()}銘柄です。地域配分は期待リターンだけでなく、円/ドル為替、業種構成、バリュエーション、税務・取引コストも含めて決めます。現在のプランナーでは日米バランス/米国重視/日本重視を切り替えられます。`}
  return `現在の絞り込み上位（正式TotalまたはResearch Priority）は ${top.slice(0,5).map(x=>`${x.name}(${x.formalTotal??x.investment??x.screening})`).join('、')} です。正式Investment Scoreは5-Factorデータが揃った銘柄だけに確定します。質問を「投資総額」「銘柄名」「テーマ」「暴落時の対応」「分散」のいずれかを含めて具体化すると、現在のデータを使ってより深く整理できます。`;
}
function advisorAsk(q){q=(q||'').trim();if(!q)return;openAdvisor();addMsg(q,'user');setTimeout(()=>addMsg(advisorAnswer(q),'ai'),120);$('advisorInput').value=''}

function initUI(){
  $('sector').innerHTML='<option value="ALL">全11セクター</option>'+SECTORS.map(s=>`<option value="${s[0]}">${s[1]}</option>`).join('');
  $('theme').innerHTML='<option value="ALL">代表テーマ</option>'+THEMES.map(t=>`<option value="${t[0]}">${t[1]}</option>`).join('');
  applyUrlState();
  document.querySelectorAll('[data-r]').forEach(e=>e.onclick=()=>{region=e.dataset.r;page=1;document.querySelectorAll('[data-r]').forEach(b=>b.classList.toggle('on',b===e));render()});
  $('search').oninput=()=>{page=1;render()}; $('themeSearch').oninput=()=>{page=1;render()}; $('budget').oninput=()=>{page=1;render()};
  $('sector').onchange=e=>{sector=e.target.value;page=1;render()}; $('theme').onchange=e=>{theme=e.target.value;page=1;render()};
  $('clearSector').onclick=()=>{sector='ALL';$('sector').value='ALL';page=1;render()};
  $('clearTheme').onclick=()=>{theme='ALL';$('theme').value='ALL';page=1;render()};
  $('prev').onclick=()=>{if(page>1){page--;render();window.scrollTo({top:$('table').offsetTop-80,behavior:'smooth'})}};
  $('next').onclick=()=>{page++;render();window.scrollTo({top:$('table').offsetTop-80,behavior:'smooth'})};
  $('x').onclick=()=>$('modal').classList.add('hide'); $('modal').onclick=e=>{if(e.target.id==='modal')$('modal').classList.add('hide')};
  $('nativeShare').onclick=nativeShare;$('shareTop').onclick=nativeShare;$('lineShare').onclick=lineShare;$('copyShare').onclick=copyShare;$('installTop').onclick=installApp;$('installApp').onclick=installApp;$('accountBtn').onclick=openAccount;
  document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>switchPage(b.dataset.page));
  $('buildPlan').onclick=buildPortfolioPlan;
  $('aiQuickSend').onclick=()=>advisorAsk($('aiQuick').value);$('aiQuick').addEventListener('keydown',e=>{if(e.key==='Enter')advisorAsk($('aiQuick').value)});
  $('advisorSend').onclick=()=>advisorAsk($('advisorInput').value);$('advisorInput').addEventListener('keydown',e=>{if(e.key==='Enter')advisorAsk($('advisorInput').value)});$('advisorClose').onclick=()=>$('advisor').classList.add('hide');
}
async function boot(){
  initUI();
  const results=await Promise.allSettled([loadJP(),loadUS()]);
  let jp=results[0].status==='fulfilled'?results[0].value:[], us=results[1].status==='fulfilled'?results[1].value:[];
  if(!jp.length)$('jpStatus').textContent='取得失敗'; if(!us.length)$('usStatus').textContent='取得失敗';
  universe=[...jp,...us].map(applyCurated);
  const seen=new Set(universe.map(x=>x.id));
  const fallback=[
    ['NVDA','NVIDIA','US','technology','Technology',null],['CRDO','Credo','US','technology','Technology',null],['MOD','Modine','US','industrials','Industrials',null],
    ['VRT','Vertiv','US','industrials','Industrials',null],['CEG','Constellation Energy','US','utilities','Utilities',null],['6857.T','アドバンテスト','JP','technology','電気機器',null],
    ['5803.T','フジクラ','JP','technology','非鉄金属',null],['6367.T','ダイキン工業','JP','industrials','機械',null],['6501.T','日立製作所','JP','industrials','電気機器',null]
  ];
  for(const f of fallback)if(!seen.has(f[0]))universe.push(applyCurated({id:f[0],ticker:f[0].replace('.T',''),name:f[1],market:f[2],sector:f[3],rawSector:f[4],price:f[5],marketCap:null,volume:null,source:'fallback'}));
  $('jpN').textContent=universe.filter(x=>x.market==='JP').length.toLocaleString();
  $('usN').textContent=universe.filter(x=>x.market==='US').length.toLocaleString();
  $('allN').textContent=universe.length.toLocaleString();
  $('analyzedN').textContent=universe.length.toLocaleString();
  render();
}
$('authLoginTab').onclick=()=>switchAuth('login');
$('authRegisterTab').onclick=()=>switchAuth('register');
$('login').onclick=loginLocal;
$('register').onclick=registerLocal;
$('loginPassword').addEventListener('keydown',e=>{if(e.key==='Enter')loginLocal()});
$('registerPassword2').addEventListener('keydown',e=>{if(e.key==='Enter')registerLocal()});
restoreLocalSession();
