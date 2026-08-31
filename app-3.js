function detail(id){
  const x=universe.find(z=>z.id===id); if(!x)return;
  const c=CURATED[id],hf=x.hardFilter||hardFilterStatus(x),ft=x.formalTotal;
  const statusClass=hf.status==='pass'?'hf-pass':hf.status==='fail'?'hf-fail':'hf-warn';
  const factors=x.factors||{};
  $('detail').innerHTML=`<h2>${x.name}</h2><p class="muted">${x.ticker} · ${x.market==='JP'?'日本':'米国'} · ${sectorName(x.sector)} / ${x.rawSector}</p>
    <div class="scores"><b>${ft!=null?'Total '+ft:x.investment!=null?'旧暫定 '+x.investment:'Research Priority '+x.screening}</b><b class="p">Potential ${x.potential??'未分析'}</b><b>${fmtY(minCost(x))}</b><span class="coverage">Coverage ${x.coverage||0}%</span></div>
    <section><h4>STEP 1 · HARD FILTER</h4><p class="${statusClass}"><b>${hf.status==='pass'?'PASS':hf.status==='fail'?'FAIL / 例外審査':'DATA INCOMPLETE'}</b></p><div class="research-flow">${hf.checks.map(z=>`<div><b>${z.n}</b><span>${z.v} · ${z.s==='pass'?'OK':z.s==='fail'?'要除外/例外審査':z.s==='warn'?'注意':'データ不足'}</span></div>`).join('')}</div></section>
    <section><h4>STEP 2 · 5-FACTOR MODEL</h4><div class="factor-matrix">${[['Quality','quality'],['Growth','growth'],['Valuation','valuation'],['Momentum/Revision','momentum'],['Durability','durability']].map(([n,k])=>`<div class="factor-cell"><small>${n}</small><b>${factors[k]??'—'}</b></div>`).join('')}</div><p class="muted" style="margin-top:8px">正式Total = 25%Q + 25%G + 20%V + 20%M/Revision + 10%D。必要データが揃うまではTotalを確定しません。旧v0.8スコアがある場合も正式v0.9スコアとは区別します。</p></section>
    <section><h4>STEP 3 · FUNDAMENTAL / DURABILITY</h4><p>${x.analyzed?x.why:'最新の一次情報、3年CAGR、ROIC/CFQ、Forward Growth、競争優位、顧客集中、Capital Allocationを取得してから深掘りします。'}</p></section>
    <section><h4>STEP 4 · RED FLAGS</h4><p>一過性利益、営業利益と営業CFの乖離、M&A/Goodwill、希薄化、顧客・製品集中、景気循環ピーク、会計変更、減損、規制・地政学・為替、Valuation過熱を確認。未確認項目は「問題なし」とみなしません。</p></section>
    <section><h4>STEP 5 · INTRINSIC VALUE</h4><p>DCF / Forward PER / EV/EBIT / FCF Yield / Historical & Peer MultipleからBull・Base・Bearを作成し、Expected UpsideとBear Downsideを別表示します。現時点で必要データが無ければ推測値は出しません。</p></section>
    <section><h4>THEME / ASYMMETRIC POTENTIAL</h4><p>${[...x.themes.map(themeName),...(x.autoThemes||[])].filter(Boolean).join(' / ')||'テーマ未分類'}</p>${c?.f?`<div class="factors">${['市場拡大','ボトルネック','利益レバレッジ','競争優位','未織り込み'].map((n,i)=>`<i>${n} ${c.f[i]}</i>`).join('')}</div>`:''}</section>
    <section><h4>DATA PROVENANCE</h4><p>${x.market==='JP'?'EDINET / 企業IR / 決算短信・説明資料 / 必要に応じJ-Quants':'SEC EDGAR / 10-K / 10-Q / 8-K / Earnings Release'}。実績・会社予想・Consensus・AI推定を混同せず、取得不能値はデータ不足扱い。</p></section>`;
  $('modal').classList.remove('hide');
}
const PUBLIC_BASE='https://hibikiprime0098-dotcom.github.io/hibiki-investment-terminal/';
let deferredInstallPrompt=null;
function shareUrl(){
  const u=new URL(PUBLIC_BASE);
  if(region!=='ALL')u.searchParams.set('market',region);
  if(sector!=='ALL')u.searchParams.set('sector',sector);
  if(theme!=='ALL')u.searchParams.set('theme',theme);
  const q=$('search')?.value.trim();if(q)u.searchParams.set('q',q);
  const tq=$('themeSearch')?.value.trim();if(tq)u.searchParams.set('topic',tq);
  const b=$('budget')?.value;if(b)u.searchParams.set('budget',b);
  return u.toString();
}
function setShareMsg(msg,ok=true){const el=$('shareMsg');if(!el)return;el.textContent=msg;el.classList.toggle('share-ok',ok);el.classList.toggle('share-error',!ok)}
async function nativeShare(){
  const url=shareUrl();
  const data={title:'投資分析ターミナル',text:'投資分析ターミナルで銘柄分析を見る',url};
  try{
    if(navigator.share && (!navigator.canShare || navigator.canShare(data))){
      await navigator.share(data);setShareMsg('端末の共有画面を開きました。');return;
    }
    await copyShare();
    showShareFallback(url);
  }catch(e){
    if(e?.name==='AbortError')return;
    await copyShare();showShareFallback(url);
  }
}
function lineShare(){
  const url=shareUrl();
  const share='https://social-plugins.line.me/lineit/share?url='+encodeURIComponent(url)+'&text='+encodeURIComponent('投資分析ターミナル');
  const w=window.open(share,'_blank','noopener,noreferrer');
  if(!w) location.href='https://line.me/R/share?text='+encodeURIComponent('投資分析ターミナル\n'+url);
}
async function copyShare(){
  const url=shareUrl();
  try{
    await navigator.clipboard.writeText(url);setShareMsg('公開リンクをコピーしました。');
  }catch(e){
    const ta=document.createElement('textarea');ta.value=url;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();
    const ok=document.execCommand('copy');ta.remove();setShareMsg(ok?'公開リンクをコピーしました。':'コピーできませんでした。下のリンクを長押ししてください。',ok);
    if(!ok)showShareFallback(url);
  }
}
function showShareFallback(url){
  $('detail').innerHTML=`<h2>共有</h2><section><h4>公開リンク</h4><p>このリンクをタップまたは長押しして共有できます。</p><a class="share-link" href="${url}" target="_blank" rel="noopener">${url}</a></section>`;
  $('modal').classList.remove('hide');
}
function isStandalone(){return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone===true}
function isIOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent)}
async function installApp(){
  if(isStandalone()){setShareMsg('すでにホーム画面から起動できる状態です。');return}
  if(deferredInstallPrompt){
    deferredInstallPrompt.prompt();
    const choice=await deferredInstallPrompt.userChoice.catch(()=>null);
    if(choice?.outcome==='accepted')setShareMsg('ホーム画面への追加を開始しました。');
    deferredInstallPrompt=null;return;
  }
  const ios=isIOS();
  $('detail').innerHTML=`<h2>ホーム画面に追加</h2><div class="install-help">${ios?
    '<div class="step"><b>iPhone / iPad</b><p>Safariでこのサイトを開き、画面下の共有ボタン →「ホーム画面に追加」→「追加」を選択してください。</p></div>':
    '<div class="step"><b>Android</b><p>Chromeの右上メニュー（︙）→「ホーム画面に追加」または「アプリをインストール」を選択してください。インストール可能になると、このページのボタンから直接確認画面も開けます。</p></div>'}
    <div class="step"><b>重要</b><p>ChatGPT内のファイル表示やプレビューではなく、公開URLをChrome/Safariで開いてください。</p><a class="share-link" href="${PUBLIC_BASE}" target="_blank" rel="noopener">${PUBLIC_BASE}</a></div></div>`;
  $('modal').classList.remove('hide');
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;document.querySelectorAll('#installTop,#installApp').forEach(b=>b&&b.classList.add('on'))});
window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;setShareMsg('ホーム画面への追加が完了しました。')});
function openAccount(){
  const a=currentLocalAccount();
  $('detail').innerHTML=`<h2>ユーザーアカウント</h2>
  <section class="auth-user">
    <h4>ログイン中</h4>
    <strong>${escapeHtml(a?.name||'ユーザー')}</strong>
    <p>${escapeHtml(a?.email||'')}</p>
    <p class="muted">現在は端末アカウントです。パスワードそのものは保存せず、Web Cryptoで生成したハッシュだけを保存しています。Supabaseクラウド認証接続後は、同じ画面のまま複数端末同期へ移行します。</p>
    <button id="logoutBtn" class="ghost logout">ログアウト</button>
  </section>`;
  $('modal').classList.remove('hide');
  setTimeout(()=>{const b=$('logoutBtn');if(b)b.onclick=logoutLocal},0);
}
function applyUrlState(){
  const p=new URLSearchParams(location.search);
  region=p.get('market')||'ALL';sector=p.get('sector')||'ALL';theme=p.get('theme')||'ALL';
  if($('search'))$('search').value=p.get('q')||'';if($('themeSearch'))$('themeSearch').value=p.get('topic')||'';if($('budget'))$('budget').value=p.get('budget')||'';
  document.querySelectorAll('[data-r]').forEach(b=>b.classList.toggle('on',b.dataset.r===region));
  if($('sector'))$('sector').value=sector;if($('theme'))$('theme').value=theme;
}

const LOCAL_ACCOUNTS_KEY='it_accounts_v2', LOCAL_SESSION_KEY='it_session_v2';
let appBooted=false;

function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function bytesToB64(bytes){let s='';bytes.forEach(b=>s+=String.fromCharCode(b));return btoa(s)}
function b64ToBytes(s){const bin=atob(s),a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return a}
async function passwordHash(password,saltB64){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:b64ToBytes(saltB64),iterations:180000,hash:'SHA-256'},key,256);
  return bytesToB64(new Uint8Array(bits));
}
function localAccounts(){try{return JSON.parse(localStorage.getItem(LOCAL_ACCOUNTS_KEY)||'{}')}catch(e){return {}}}
function saveLocalAccounts(a){localStorage.setItem(LOCAL_ACCOUNTS_KEY,JSON.stringify(a))}
function currentLocalAccount(){
  const id=localStorage.getItem(LOCAL_SESSION_KEY);if(!id)return null;
  return localAccounts()[id]||null;
}
function findLocalAccount(identifier){
  const q=(identifier||'').trim().toLowerCase(), all=localAccounts();
  if(all[q])return [q,all[q]];
  const hit=Object.entries(all).find(([k,a])=>(a.name||'').trim().toLowerCase()===q);
  return hit||null;
}
function switchAuth(mode){
  const login=mode==='login';
  $('loginPanel').classList.toggle('hide',!login);$('registerPanel').classList.toggle('hide',login);
  $('authLoginTab').classList.toggle('on',login);$('authRegisterTab').classList.toggle('on',!login);$('err').textContent='';
}
async function registerLocal(){
  const name=$('registerName').value.trim(),email=$('registerEmail').value.trim().toLowerCase(),p=$('registerPassword').value,p2=$('registerPassword2').value;
  if(name.length<1)return $('err').textContent='名前を入力してください。';
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return $('err').textContent='メールアドレスを確認してください。';
  if(p.length<8)return $('err').textContent='パスワードは8文字以上にしてください。';
  if(p!==p2)return $('err').textContent='パスワードが一致しません。';
  const all=localAccounts();
  if(all[email])return $('err').textContent='このメールアドレスはこの端末ですでに登録されています。';
  if(Object.values(all).some(a=>(a.name||'').trim().toLowerCase()===name.toLowerCase()))return $('err').textContent='同じ名前がこの端末にあります。メールでログインするか、別の表示名にしてください。';
  const salt=new Uint8Array(16);crypto.getRandomValues(salt);const saltB64=bytesToB64(salt);
  const hash=await passwordHash(p,saltB64);
  all[email]={name,email,salt:saltB64,hash,createdAt:new Date().toISOString()};
  saveLocalAccounts(all);localStorage.setItem(LOCAL_SESSION_KEY,email);await enterAuthenticatedApp(all[email]);
}
async function loginLocal(){
  const id=$('loginId').value.trim(),p=$('loginPassword').value;
  const hit=findLocalAccount(id);if(!hit)return $('err').textContent='この端末にアカウントがありません。新規登録してください。';
  const [email,a]=hit, hash=await passwordHash(p,a.salt);
  if(hash!==a.hash)return $('err').textContent='パスワードが違います。';
  localStorage.setItem(LOCAL_SESSION_KEY,email);await enterAuthenticatedApp(a);
}
async function enterAuthenticatedApp(a){
  $('lock').classList.add('hide');$('app').classList.remove('hide');$('accountPill').textContent=a?.name||a?.email||'ユーザー';
  if(!appBooted){appBooted=true;await boot()}
}
function logoutLocal(){
  localStorage.removeItem(LOCAL_SESSION_KEY);location.reload();
}
async function restoreLocalSession(){
  const a=currentLocalAccount();if(a)await enterAuthenticatedApp(a);
}
