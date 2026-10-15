'use strict';
/* Private EODHD API for one authenticated user, NOT a public redistribution feed.
   GitHub Pages is public; the licensed rows never get committed to it.
   Set EODHD_API_TOKEN and RESEARCH_ACCESS_KEY as private Vercel environment variables. */
const crypto=require('node:crypto');
const SYMBOLS=new Map([["4704",["4704.TSE","JPY"]],["4493",["4493.TSE","JPY"]],["6702",["6702.TSE","JPY"]],["6501",["6501.TSE","JPY"]],["6965",["6965.TSE","JPY"]],["8035",["8035.TSE","JPY"]],["6302",["6302.TSE","JPY"]],["6857",["6857.TSE","JPY"]],["3040",["3040.TSE","JPY"]],["6701",["6701.TSE","JPY"]],["4498",["4498.TSE","JPY"]],["3788",["3788.TSE","JPY"]],["5803",["5803.TSE","JPY"]],["6503",["6503.TSE","JPY"]],["9432",["9432.TSE","JPY"]],["3687",["3687.TSE","JPY"]],["6864",["6864.TSE","JPY"]],["3915",["3915.TSE","JPY"]],["6728",["6728.TSE","JPY"]],["2326",["2326.TSE","JPY"]],["3692",["3692.TSE","JPY"]],["3774",["3774.TSE","JPY"]],["4398",["4398.TSE","JPY"]],["4417",["4417.TSE","JPY"]],["3626",["3626.TSE","JPY"]],["8056",["8056.TSE","JPY"]],["4307",["4307.TSE","JPY"]],["9449",["9449.TSE","JPY"]],["6146",["6146.TSE","JPY"]],["6920",["6920.TSE","JPY"]],["7735",["7735.TSE","JPY"]],["7729",["7729.TSE","JPY"]],["6723",["6723.TSE","JPY"]],["4063",["4063.TSE","JPY"]],["4004",["4004.TSE","JPY"]],["5801",["5801.TSE","JPY"]],["5802",["5802.TSE","JPY"]],["5805",["5805.TSE","JPY"]],["5574",["5574.TSE","JPY"]],["5591",["5591.TSE","JPY"]],["5132",["5132.TSE","JPY"]],["3984",["3984.TSE","JPY"]],["6504",["6504.TSE","JPY"]],["6367",["6367.TSE","JPY"]],["9433",["9433.TSE","JPY"]],["1944",["1944.TSE","JPY"]],["1969",["1969.TSE","JPY"]],["FTNT",["FTNT.US","USD"]],["ZS",["ZS.US","USD"]],["PANW",["PANW.US","USD"]],["CRWD",["CRWD.US","USD"]],["NET",["NET.US","USD"]],["MSFT",["MSFT.US","USD"]],["IBM",["IBM.US","USD"]],["QNT",["QNT.US","USD"]],["IONQ",["IONQ.US","USD"]],["RGTI",["RGTI.US","USD"]],["QBTS",["QBTS.US","USD"]],["IQMX",["IQMX.US","USD"]],["XNDU",["XNDU.US","USD"]],["FORM",["FORM.US","USD"]],["KEYS",["KEYS.US","USD"]],["VRT",["VRT.US","USD"]],["HO",["HO.PA","EUR"]],["COHR",["COHR.US","USD"]],["OXIG",["OXIG.LSE","GBP"]],["NVDA",["NVDA.US","USD"]],["ANET",["ANET.US","USD"]],["ETN",["ETN.US","USD"]],["SU",["SU.PA","EUR"]],["RBRK",["RBRK.US","USD"]],["CVLT",["CVLT.US","USD"]],["OKTA",["OKTA.US","USD"]],["GLW",["GLW.US","USD"]],["AVGO",["AVGO.US","USD"]],["LITE",["LITE.US","USD"]],["GOOGL",["GOOGL.US","USD"]],["AMZN",["AMZN.US","USD"]]]);
const ORIGIN='https://hibikiprime0098-dotcom.github.io';
function send(res,status,data){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  res.end(JSON.stringify(data));
}
function num(x){if(x===null||x===undefined||x==='')return null;const n=Number(x);return Number.isFinite(n)?n:null;}
function positive(x){const n=num(x);return n!==null&&n>0?n:null;}
function safeAuth(req){
  const expected=process.env.RESEARCH_ACCESS_KEY;
  if(!expected||expected.length<20)return false;
  const v=String(req.headers.authorization||'');
  const token=v.startsWith('Bearer ')?v.slice(7):'';
  const left=Buffer.from(token),right=Buffer.from(expected);
  return left.length===right.length && crypto.timingSafeEqual(left,right);
}
function latestBalances(f){
 const m=f?.Financials?.Balance_Sheet?.quarterly||f?.Financials?.Balance_Sheet?.yearly;
 if(!m||typeof m!=='object')return null;
 const key=Object.keys(m).sort().reverse()[0];return m[key]||null;
}
function latestAnnual(financials,section){
 const block=financials?.[section]?.yearly;
 if(!block||typeof block!=='object')return null;
 const entries=Object.entries(block).filter(([k,v])=>/^\d{4}-\d{2}-\d{2}$/.test(k)&&v);
 entries.sort(([a],[b])=>b.localeCompare(a));
 return entries.length?{date:entries[0][0],row:entries[0][1],currency:String(financials[section].currency_symbol||'')}:null;
}
function annualCashFacts(doc,currency,highlights){
 const cf=latestAnnual(doc.Financials,'Cash_Flow'),income=latestAnnual(doc.Financials,'Income_Statement');
 if(!cf||!income||cf.date!==income.date||cf.currency!==income.currency)return {};
 const o=positive(cf.row.totalCashFromOperatingActivities??cf.row.operatingCashFlow);
 const expenditure=num(cf.row.capitalExpenditures);
 const direct=num(cf.row.freeCashFlow),revenue=positive(income.row.totalRevenue);
 const fcf=direct!==null?direct:(o!==null&&expenditure!==null?o-Math.abs(expenditure):null);
 const out={cashPeriod:cf.date,financialCurrency:cf.currency};
 if(fcf!==null){out.fcf=fcf;if(revenue)out.fcfMargin=fcf/revenue;}
 if(fcf>0&&cf.currency===currency&&positive(highlights.MarketCapitalization)>0)
   out.pfcf=positive(highlights.MarketCapitalization)/fcf;
 return out;
}
function fundamentals(doc,ticker,currency){
 const h=doc.Highlights||{},v=doc.Valuation||{},b=latestBalances(doc);
 const equity=positive(b?.totalStockholderEquity??b?.totalStockholdersEquity);
 const totalAssets=positive(b?.totalAssets);
 const cash=positive(b?.cashAndShortTermInvestments);
 const debt=num(b?.shortLongTermDebtTotal??b?.longTermDebtTotal);
 const cashData=annualCashFacts(doc,currency,h);
 const fields={
  per:positive(v.TrailingPE??h.PERatio),
  pbr:positive(v.PriceBookMRQ),
  psr:positive(v.PriceSalesTTM),
  roe:num(h.ReturnOnEquityTTM),
  revenueGrowthYoY:num(h.QuarterlyRevenueGrowthYOY),
  earningsGrowthYoY:num(h.QuarterlyEarningsGrowthYOY),
  dividendYield:num(h.DividendYield),
  fcfMargin:cashData.fcfMargin??null,
  pfcf:cashData.pfcf??null,
  fcfFiscalYearEnd:cashData.cashPeriod||null,
  financialCurrency:cashData.financialCurrency||null,
  equityRatio:equity&&totalAssets?equity/totalAssets:null,
  netCash:cash!==null&&debt!==null?cash-debt:null,
  revenueTTM:positive(h.RevenueTTM),
  sharesOutstanding:positive(doc.SharesStats?.SharesOutstanding),
  eps:positive(h.DilutedEpsTTM??h.EarningsShare),
  nextYearEpsEstimate:positive(h.EPSEstimateNextYear)
 };
 return {ticker,currency,provider:'EODHD / company financial disclosures',
   updated_at:new Date().toISOString(),as_of:h.MostRecentQuarter||doc.General?.UpdatedAt||null,
   valuation:fields,source:'https://eodhd.com/financial-apis/stock-etfs-fundamental-data-feeds'};
}
function normalizeBars(data){
 if(!Array.isArray(data))throw Error('Data subscription or symbol has no daily bars');
 let bars=data.map(r=>({date:String(r.date||''),open:positive(r.open),high:positive(r.high),low:positive(r.low),close:positive(r.close),adjusted:positive(r.adjusted_close),volume:num(r.volume)}))
   .filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&r.close!==null&&r.low!==null&&r.high!==null&&r.open!==null&&r.high>=r.low&&r.low<=r.close&&r.high>=r.close)
   .sort((a,b)=>a.date.localeCompare(b.date)).slice(-320);
 const last=bars.at(-1);
 if(!last)throw Error('Price series returned no valid OHLC records');
 const latestFactor=last.adjusted&&last.close?last.adjusted/last.close:1;
 // Historical high/low/close are normalised to the latest raw price.
 // This compensates for splits AND dividends (total-return-style adjustment).
 bars=bars.map(b=>{
   let adj=(b.adjusted&&b.close?b.adjusted/b.close/latestFactor:1);
   if(!(adj>0&&adj<100))adj=1;
   return {date:b.date,open:Math.round(b.open*adj*10000)/10000,
     high:Math.round(b.high*adj*10000)/10000,
     low:Math.round(b.low*adj*10000)/10000,
     close:Math.round(b.close*adj*10000)/10000,volume:b.volume};
 });
 return {last,bars};
}
const handler=async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin',ORIGIN);
 res.setHeader('Vary','Origin');
 res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
 res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
 if(req.method==='OPTIONS'){res.statusCode=204;return res.end();}
 if(req.method!=='GET')return send(res,405,{error:'method_not_allowed'});
 if(req.headers.origin&&req.headers.origin!==ORIGIN)return send(res,403,{error:'origin_restricted'});
 if(!safeAuth(req))return send(res,401,{error:'access_denied'});
 const status={enabled:Boolean(process.env.EODHD_API_TOKEN),provider:'EODHD (personal licence)',entitlement:'private, authenticated access',symbols:SYMBOLS.size};
 if(req.query?.mode==='status')return send(res,200,status);
 if(!status.enabled)return send(res,503,{error:'provider_not_configured',message:'Set EODHD_API_TOKEN on Vercel project, then redeploy.'});
 const code=String(req.query?.code||'').trim().toUpperCase();
 const listing=SYMBOLS.get(code);
 if(!listing)return send(res,400,{error:'unknown_symbol'});
 const [ticker,currency]=listing;
 const mode=String(req.query?.mode||'history');
 if(mode!=='history'&&mode!=='fundamentals')return send(res,400,{error:'unknown_mode'});
 const since=new Date();since.setUTCDate(since.getUTCDate()-520);
 const start=since.toISOString().slice(0,10);
 const path=mode==='history'?'/eod/'+encodeURIComponent(ticker):'/fundamentals/'+encodeURIComponent(ticker);
 const url=new URL('https://eodhd.com/api'+path);
 url.searchParams.set('api_token',process.env.EODHD_API_TOKEN);
 if(mode==='history'){url.searchParams.set('fmt','json');url.searchParams.set('period','d');url.searchParams.set('from',start);}
 try{
   const r=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15500)});
   if(!r.ok)return send(res,r.status===429?429:r.status===403?403:502,{error:'provider_rejected',code,status:r.status});
   const body=await r.json();
   if(!body||Array.isArray(body)===false&&body.status&&body.status!=='ok')
      return send(res,502,{error:'invalid_provider_payload',code});
   if(mode==='fundamentals')return send(res,200,fundamentals(body,ticker,currency));
   const {last,bars}=normalizeBars(body);
   return send(res,200,{code,ticker,currency,provider:'EODHD EOD',as_of:last.date,
      price:last.close,adjustment:'dividend and split adjusted to latest raw close',bars,
      notes:'Daily closes; not live or executable exchange quotes. Personal use only.'});
 }catch(e){
   return send(res,502,{error:'provider_unavailable',code,message:e instanceof Error?e.message.slice(0,100):'unknown'});
 }
};
handler._testing={normalizeBars,fundamentals,symbols:SYMBOLS.size};
module.exports=handler;
