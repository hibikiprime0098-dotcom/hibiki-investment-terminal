#!/usr/bin/env python3
"""Fetch only authorized daily US closes. No broker authentication or orders."""
import csv,datetime as dt,json,os,pathlib,time,urllib.parse,urllib.request
root=pathlib.Path(__file__).resolve().parents[1]
source=root/'data'/'price_symbols.csv'
target=root/'data'/'quotes.json'
key=os.environ.get('ALPHA_VANTAGE_API_KEY','').strip()
if not key:
    print('ALPHA_VANTAGE_API_KEY is absent: research prices remain dated reference values')
    raise SystemExit(0)
with source.open(encoding='utf-8-sig',newline='') as fh:
    rows=[r for r in csv.DictReader(fh) if r.get('enabled')=='1']
if len(rows)>25:
    raise SystemExit('Free-plan limit: at most 25 symbols')
try:
    old=json.loads(target.read_text(encoding='utf-8'))
except (ValueError,FileNotFoundError):
    old={}
quotes=old.get('quotes',{}) if isinstance(old.get('quotes'),dict) else {}
valid_codes={r['code'] for r in rows}
quotes={k:v for k,v in quotes.items() if k in valid_codes}
errors=[];updated=0
for i,r in enumerate(rows):
    sym=r['api_symbol'].upper()
    params=urllib.parse.urlencode({'function':'GLOBAL_QUOTE','symbol':sym,'apikey':key})
    try:
        req=urllib.request.Request('https://www.alphavantage.co/query?'+params,
               headers={'User-Agent':'investment-research-studio/1.0'})
        with urllib.request.urlopen(req,timeout=25) as response:
            content=json.load(response)
        quote=content.get('Global Quote',{})
        if quote.get('01. symbol','').upper()!=sym: raise ValueError('Symbol mismatch or rate limit')
        price=float(quote['05. price']);date=quote['07. latest trading day']
        if not 0<price<1e9: raise ValueError('Invalid price')
        dt.date.fromisoformat(date)
        quotes[r['code']]={'price':round(price,5),'currency':'USD','as_of':date,
                         'kind':'end_of_day','source':'Alpha Vantage GLOBAL_QUOTE'}
        updated+=1
    except Exception as err:
        errors.append(r['code']+': '+type(err).__name__)
    if i+1<len(rows):time.sleep(1)
result={'status':'ok' if updated else 'no_new_prices',
        'updated_at':dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
        'provider':'Alpha Vantage GLOBAL_QUOTE (EOD)',
        'request_count':len(rows),'updated_count':updated,'quotes':quotes,'errors':errors}
target.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Daily closes refreshed:',updated,'/',len(rows),'errors:',len(errors))
