/* Verify the private Vercel endpoint without a paid API key. */
const assert=require('node:assert/strict');
const handler=require('../../research-private-api/api/data.js');
const oldKey=process.env.RESEARCH_ACCESS_KEY,oldToken=process.env.EODHD_API_TOKEN;
const viewKey='unit-test-example-long-secret-7JNAfFbMX';
process.env.RESEARCH_ACCESS_KEY=viewKey;
process.env.EODHD_API_TOKEN='TEST_TOKEN_NEVER_SENT';
function request(query,auth=viewKey,origin='https://hibikiprime0098-dotcom.github.io'){
 return new Promise(resolve=>{
   const res={headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},end(body){resolve({status:this.statusCode,headers:this.headers,data:body?JSON.parse(body):{}})}};
   Promise.resolve(handler({method:'GET',headers:{authorization:auth===null?'':'Bearer '+auth,origin},query},res)).catch(err=>resolve({error:err.message}));
 });
}
(async()=>{
 const denied=await request({mode:'status'},null);assert.equal(denied.status,401);
 const badOrigin=await request({mode:'status'},viewKey,'https://example.com');assert.equal(badOrigin.status,403);
 const status=await request({mode:'status'});assert.equal(status.status,200);assert.equal(status.data.symbols,78);
 assert.equal((await request({mode:'history',code:'TOTALLYFAKE'})).status,400);
 const before=global.fetch;let calls=[];
 global.fetch=async url=>{
  calls.push(String(url));
  if(String(url).includes('/fundamentals/')){
   return {ok:true,json:async()=>({Highlights:{PERatio:21.5,ReturnOnEquityTTM:.23,RevenueTTM:1e9},Valuation:{PriceBookMRQ:3.2,PriceSalesTTM:2.1},General:{UpdatedAt:'2026-09-30'}})};
  }
  const d=new Date(Date.UTC(2025,10,1)),bars=[];
  for(let i=0;i<260;i++){let date=new Date(d.getTime()+i*86400000).toISOString().slice(0,10),p=100+Math.sin(i/11)*12+i*.3;bars.push({date,open:p,high:p+2,low:p-2,close:p,adjusted_close:p,volume:10_000});}
  return {ok:true,json:async()=>bars};
 };
 const jp=await request({mode:'history',code:'8035'});assert.equal(jp.status,200);assert.equal(jp.data.currency,'JPY');
 assert.equal(jp.data.ticker,'8035.TSE');assert.ok(jp.data.bars.length>=200);
 const us=await request({mode:'fundamentals',code:'MSFT'});assert.equal(us.status,200);
 assert.equal(us.data.valuation.per,21.5);assert.equal(us.data.valuation.pbr,3.2);
 assert.ok(calls.every(x=>x.includes('TEST_TOKEN_NEVER_SENT')));
 assert.ok(!JSON.stringify(jp.data).includes('TEST_TOKEN_NEVER_SENT'));
 assert.ok(!JSON.stringify(us.data).includes('TEST_TOKEN_NEVER_SENT'));
 global.fetch=before;
 process.env.RESEARCH_ACCESS_KEY=oldKey;process.env.EODHD_API_TOKEN=oldToken;
 console.log('PASS private backend',JSON.stringify({symbols:status.data.symbols,japan:jp.data.ticker,us:us.data.ticker,historyBars:jp.data.bars.length}));
})().catch(e=>{console.error(e);process.exit(1)});
