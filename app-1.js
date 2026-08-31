const USDJPY=150, PAGE=40;
const JP_MASTER='https://raw.githubusercontent.com/skr-works/ticker-master-japan/refs/heads/main/data/master.csv';
const JP_LATEST='https://te-chan.github.io/JP-CompanyCode/company_list.csv';
const US_ALL='https://raw.githubusercontent.com/Ate329/top-us-stock-tickers/main/tickers/all.csv';
const SEC_EX='https://www.sec.gov/files/company_tickers_exchange.json';

const SECTORS=[
 ['technology','情報技術'],['industrials','資本財・産業'],['financials','金融'],['health','ヘルスケア'],
 ['discretionary','一般消費財'],['staples','生活必需品'],['communication','コミュニケーション・サービス'],
 ['energy','エネルギー'],['materials','素材'],['utilities','公益事業'],['realestate','不動産'],['other','未分類']
];
const THEMES=[
 ['ai','AI計算・半導体'],['cool','AIデータセンター冷却'],['link','高速接続・光通信'],['power','電力・送配電'],
 ['nuke','原子力・安定電源'],['robot','ロボティクス'],['glp','肥満・代謝疾患'],['cyber','サイバーセキュリティ'],
 ['space','宇宙・衛星'],['defense','防衛・ドローン']
 ];
const THEME_RULES=[
 ['生成AI・GPU',/gpu|accelerator|artificial intelligence|生成ai|aiサーバ|nvidia/i],
 ['半導体製造装置',/semiconductor equipment|wafer|lithograph|tester|半導体製造|テスタ|露光/i],
 ['HBM・メモリ',/memory|dram|nand|hbm|メモリ/i],
 ['液冷・熱管理',/liquid cool|thermal|cooling|hvac|chiller|液冷|冷却|空調|熱管理/i],
 ['データセンター',/data center|datacenter|データセンター/i],
 ['高速接続・光通信',/optical|fiber|photon|transceiver|interconnect|光通信|光ファイバ|コネクタ/i],
 ['電力網・変圧器',/grid|transformer|switchgear|power equipment|送配電|変圧器|電力機器/i],
 ['原子力・SMR',/nuclear|uranium|smr|原子力|ウラン/i],
 ['再生可能エネルギー',/solar|wind|renewable|太陽光|風力|再生可能/i],
 ['蓄電池・ESS',/battery|energy storage|ess|蓄電池|電池/i],
 ['EV・電動化',/electric vehicle|ev|電気自動車|電動化/i],
 ['ロボティクス',/robot|automation|motion control|ロボット|自動化|fa機器/i],
 ['フィジカルAI',/robot|machine vision|sensor|servo|ロボット|画像認識|センサ/i],
 ['量子コンピューティング',/quantum|量子/i],
 ['サイバーセキュリティ',/cyber|security software|endpoint|firewall|サイバー|セキュリティ/i],
 ['クラウド・SaaS',/cloud|saas|software|クラウド|ソフトウェア/i],
 ['AI創薬',/ai drug|computational drug|bioinformatics|創薬|バイオインフォ/i],
 ['GLP-1・肥満症',/glp|obesity|diabetes|肥満|糖尿病/i],
 ['ADC・がん治療',/oncology|antibody drug conjugate|adc|がん|抗体/i],
 ['遺伝子治療',/gene therap|crispr|genomic|遺伝子|ゲノム/i],
 ['医療機器',/medical device|diagnostic|医療機器|診断/i],
 ['宇宙・衛星',/space|satellite|rocket|宇宙|衛星|ロケット/i],
 ['防衛・ドローン',/defense|aerospace|drone|missile|防衛|ドローン|航空宇宙/i],
 ['造船',/shipbuilding|shipyard|造船/i],
 ['銅・電線',/copper|wire|cable|銅|電線|ケーブル/i],
 ['レアアース・重要鉱物',/rare earth|lithium|nickel|critical mineral|レアアース|リチウム|ニッケル/i],
 ['金・貴金属',/gold|precious metal|金鉱|貴金属/i],
 ['水・インフラ',/water|wastewater|水処理|上下水/i],
 ['建設・インフラ更新',/construction|engineering|infrastructure|建設|土木|インフラ/i],
 ['物流自動化',/logistics|warehouse|material handling|物流|倉庫|搬送/i],
 ['半導体材料',/photoresist|silicon wafer|electronic material|フォトレジスト|シリコンウエハ|電子材料/i],
 ['先端パッケージ',/packaging|chiplet|substrate|advanced package|パッケージ|チップレット|基板/i],
 ['センサー・画像認識',/sensor|lidar|camera|machine vision|センサ|画像認識|ライダー/i],
 ['自動運転',/autonomous|adas|self-driving|自動運転/i],
 ['決済・Fintech',/payment|fintech|digital bank|決済|フィンテック/i],
 ['暗号資産インフラ',/crypto|blockchain|bitcoin|暗号資産|ブロックチェーン/i],
 ['保険テック',/insurtech|insurance software|保険/i],
 ['旅行・インバウンド',/travel|hotel|airline|tourism|旅行|ホテル|航空|インバウンド/i],
 ['コンテンツ・ゲーム',/game|gaming|anime|content|ゲーム|アニメ|コンテンツ/i],
 ['広告・デジタルメディア',/advertising|media|adtech|広告|メディア/i],
 ['食品・農業テック',/agri|agriculture|food tech|農業|食品/i],
 ['REIT・データセンター不動産',/reit|real estate|data center property|不動産|投資法人/i]
];

const MODEL_SPEC={version:'0.9',weights:{quality:.25,growth:.25,valuation:.20,momentum:.20,durability:.10},minCoverage:.80};
function clipZ(z){return Math.max(-3,Math.min(3,z))}
function zScoreTo100(z,invert=false){if(z==null||!Number.isFinite(z))return null;const v=50+(50/3)*clipZ(invert?-z:z);return Math.max(0,Math.min(100,Math.round(v*10)/10))}
function weightedTotal(f){const keys=['quality','growth','valuation','momentum','durability'];if(keys.some(k=>f?.[k]==null))return null;return Math.round(10*keys.reduce((a,k)=>a+f[k]*MODEL_SPEC.weights[k],0))/10}
function scoreBand(v){if(v==null)return 'データ不足';if(v>=85)return '最優先調査';if(v>=80)return '強い候補';if(v>=75)return '詳細調査候補';if(v>=65)return 'Watchlist';return '優先度低'}
function hardFilterStatus(x){
  const checks=[];
  if(x.marketCap!=null){const capMin=x.market==='JP'?3e10:3e8;checks.push({n:'時価総額',s:x.marketCap>=capMin?'pass':'fail',v:fmtCap(x.marketCap)});}else checks.push({n:'時価総額',s:'unknown',v:'不足'});
  if(x.price&&x.volume){const dv=x.price*x.volume;if(x.market==='US')checks.push({n:'売買代金 proxy',s:dv>=7e5?'pass':'warn',v:'$'+(dv/1e6).toFixed(1)+'M'});else checks.push({n:'売買代金 proxy',s:dv>=1e8?'pass':'warn',v:'¥'+Math.round(dv/1e6)+'M'});}else checks.push({n:'平均売買代金',s:'unknown',v:'不足'});
  checks.push({n:'債務超過',s:'unknown',v:x.sector==='financials'?'金融テンプレートで別評価':'財務取得待ち'});checks.push({n:'Going Concern',s:'unknown',v:'開示確認待ち'});checks.push({n:'重大会計問題',s:'unknown',v:'開示確認待ち'});
  const fail=checks.some(c=>c.s==='fail');return {status:fail?'fail':checks.some(c=>c.s==='unknown')?'incomplete':'pass',checks};
}
function formalScore(x){return weightedTotal(x.factors||null)}
function dataCoverage(x){const f=x.factors||{};const have=['quality','growth','valuation','momentum','durability'].filter(k=>f[k]!=null).length;return Math.round(have/5*100)}
function researchLabel(x){const t=formalScore(x);if(t!=null)return scoreBand(t);if(x.analyzed)return '旧暫定スコア・再計算待ち';return 'Research Priority'}

const CURATED={
 'NVDA':{i:93,p:88,themes:['ai'],why:'AI計算基盤の標準プラットフォーム。GPUだけでなくCUDA・ネットワークを含むエコシステムが競争優位。'},
 '6857.T':{i:89,p:86,themes:['ai'],why:'AI GPU/HBMの高性能化でテスト複雑性が上昇し、半導体テスタの付加価値が高まりやすい。'},
 'CRDO':{i:79,p:95,themes:['link'],why:'AIクラスタ大型化でGPU間接続の帯域と消費電力がボトルネック化。高速・省電力接続の伸びが企業規模に対して大きい。',f:[98,97,96,90,92]},
 '5803.T':{i:80,p:92,themes:['link'],why:'生成AIデータセンターの高密度化で光配線・融着接続の重要性が上昇。AI物理インフラ側で利益レバレッジが効く可能性。',f:[95,94,91,93,87]},
 'MOD':{i:84,p:96,themes:['cool'],why:'AIデータセンターの発熱密度上昇で冷却が制約化。データセンター冷却売上の高成長が全社利益構造を変える可能性。',f:[97,99,98,88,95]},
 'VRT':{i:87,p:89,themes:['cool','power'],why:'AIデータセンターの電源・熱管理を一体提供。ラック高密度化ほど設備価値が上がりやすい。'},
 '6367.T':{i:81,p:84,themes:['cool'],why:'世界的な空調基盤を持ち、データセンター向けチラー・液冷・制御へ事業領域を拡張できる。'},
 'GEV':{i:82,p:82,themes:['power'],why:'AI・電化で電力需要が増える局面で、発電設備と送配電設備の供給制約を取り込める。'},
 '6501.T':{i:84,p:77,themes:['power','robot'],why:'送配電・デジタル・産業自動化の複数テーマにまたがり、社会インフラ投資を取り込む。'},
 'CEG':{i:84,p:87,themes:['power','nuke'],why:'AIデータセンターの24時間電力需要に対し、既存原子力の安定供給価値が再評価されやすい。',f:[92,96,88,92,74]},
 'LLY':{i:85,p:83,themes:['glp'],why:'肥満・糖尿病治療市場の巨大化に対する直接エクスポージャー。'},
 'PANW':{i:86,p:79,themes:['cyber'],why:'クラウド・AI普及で攻撃面が拡大し、セキュリティ統合プラットフォーム需要が増える。'}
};

let universe=[], region='ALL', sector='ALL', theme='ALL', page=1;
const $=id=>document.getElementById(id);

function parseCSV(text){
  text=text.replace(/^\uFEFF/,'');
  const rows=[]; let row=[], cell='', q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i], n=text[i+1];
    if(q){
      if(c=='"' && n=='"'){cell+='"';i++}
      else if(c=='"'){q=false}
      else cell+=c;
    }else{
      if(c=='"')q=true;
      else if(c==','){row.push(cell);cell=''}
      else if(c=='\n'){row.push(cell);rows.push(row);row=[];cell=''}
      else if(c!='\r')cell+=c;
    }
  }
  if(cell.length||row.length){row.push(cell);rows.push(row)}
  const h=rows.shift()||[];
  return rows.filter(r=>r.some(x=>x!=='')).map(r=>Object.fromEntries(h.map((k,i)=>[k.trim(),(r[i]||'').trim()])));
}

function jpSector(s){
  const m={
    '電気機器':'technology','精密機器':'technology','情報・通信業':'communication',
    '機械':'industrials','建設業':'industrials','陸運業':'industrials','海運業':'industrials','空運業':'industrials','倉庫・運輸関連業':'industrials','卸売業':'industrials','サービス業':'industrials',
    '銀行業':'financials','証券、商品先物取引業':'financials','保険業':'financials','その他金融業':'financials',
    '医薬品':'health',
    '輸送用機器':'discretionary','小売業':'discretionary','その他製品':'discretionary','繊維製品':'discretionary','ゴム製品':'discretionary',
    '食料品':'staples','水産・農林業':'staples',
    '鉱業':'energy','石油・石炭製品':'energy',
    '化学':'materials','パルプ・紙':'materials','ガラス・土石製品':'materials','鉄鋼':'materials','非鉄金属':'materials','金属製品':'materials',
    '電気・ガス業':'utilities','不動産業':'realestate'
  }; return m[s]||'other';
}
function usSector(s){
  const m={'Technology':'technology','Industrials':'industrials','Finance':'financials','Health Care':'health','Consumer Discretionary':'discretionary','Consumer Staples':'staples','Telecommunications':'communication','Energy':'energy','Basic Materials':'materials','Utilities':'utilities','Real Estate':'realestate'};
  return m[s]||'other';
}
function eligibleJP(name){
  return !/(ETF|ＥＴＦ|上場投信|ＮＥＸＴ.?ＦＵＮＤＳ|NEXT.?FUNDS|ｉＦｒｅｅＥＴＦ|iFreeETF|ＭＡＸＩＳ|MAXIS|グローバルＸ|上場インデックス|ETN|ＥＴＮ|投資法人|ＲＥＩＴ|REIT|リート|インフラファンド|優先株)/i.test(name||'');
}
function eligibleUS(name,symbol){
  const n=name||'';
  if(/Warrant|Warrants| Unit$| Units$| Rights?$|Notes? due|Senior Notes|Subordinated Notes|Debentures?|Preferred Stock|Preferred Shares|Depositary Shares representing.*Preferred|Exchange Traded| ETF| ETN/i.test(n))return false;
  if(/W$/.test(symbol||'') && /Warrant/i.test(n))return false;
  return true;
}
function inferThemes(x){
  const a=new Set(CURATED[x.id]?.themes||[]);
  const txt=(x.name+' '+x.rawSector).toLowerCase();
  if(/semiconductor|半導体/.test(txt))a.add('ai');
  if(/cool|thermal|hvac|air conditioning|空調|冷却/.test(txt))a.add('cool');
  if(/fiber|optical|photon|通信|telecom/.test(txt))a.add('link');
  if(/electric|power|utility|電力|電気・ガス|grid/.test(txt))a.add('power');
  if(/nuclear|原子力/.test(txt))a.add('nuke');
  if(/robot|automation|ロボ|自動化/.test(txt))a.add('robot');
  if(/cyber|security/.test(txt))a.add('cyber');
  if(/space|satellite|aerospace|宇宙|衛星/.test(txt))a.add('space');
  if(/defense|aerospace|防衛/.test(txt))a.add('defense');
  return [...a];
}
