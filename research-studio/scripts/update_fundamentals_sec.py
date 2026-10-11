#!/usr/bin/env python3
"""Fetch SEC companyfacts for U.S. issuer financial metrics.
Respect SEC EDGAR fair access; never infer missing financial items.
These are reported fundamentals, not real-time prices or analyst forecasts.
"""
import csv
import datetime as dt
import json
import os
import pathlib
import re
import time
import urllib.error
import urllib.request

BASE = pathlib.Path(__file__).resolve().parents[1]
COMPANIES = BASE / "data" / "companies.csv"
OUT = BASE / "data" / "fundamentals.json"
CONTACT = os.environ.get("SEC_USER_AGENT", "InvestmentResearchStudio/1.0 (github-actions[bot]@users.noreply.github.com)")
HEADERS = {"User-Agent": CONTACT, "Accept": "application/json", "Accept-Encoding": "gzip"}
REQUEST_GAP = 0.30


def get_json(url, retry=2):
    for n in range(retry + 1):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": HEADERS["User-Agent"], "Accept": "application/json"})
            with urllib.request.urlopen(request, timeout=25) as reply:
                return json.loads(reply.read().decode("utf-8"))
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            if n == retry:
                raise
            time.sleep(2 + 2*n)
    return {}


def fact_items(facts, keys, unit, annual=False):
    gaap = facts.get("facts", {}).get("us-gaap", {})
    items = []
    for tag in keys:
        group = gaap.get(tag, {}).get("units", {}).get(unit, [])
        for x in group:
            if x.get("form") not in ("10-K", "10-Q", "10-K/A", "10-Q/A"):
                continue
            if "val" not in x or not x.get("end") or not x.get("filed"):
                continue
            try:
                duration = (dt.date.fromisoformat(x["end"]) - dt.date.fromisoformat(x["start"])).days if x.get("start") else None
            except ValueError:
                continue
            if annual and (duration is None or not 320 <= duration <= 385):
                continue
            if not annual and duration is not None:
                continue
            # Never consider future filings, or amended values for radically old periods.
            if x["filed"] > dt.date.today().isoformat():
                continue
            items.append((x["end"], x["filed"], tag, float(x["val"])))
    # Most recently ended period; then latest-filed disclosure.
    items.sort(key=lambda t: (t[0], t[1], t[2]), reverse=True)
    return items


def fetch_metric(facts, keys, unit="USD", annual=False):
    values = fact_items(facts, keys, unit, annual)
    return values[0] if values else None


def company_fundamentals(facts, cik):
    metrics = {
        "assets": (["Assets"], False, "USD"),
        "equity": (["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"], False, "USD"),
        "shares": (["CommonStockSharesOutstanding"], False, "shares"),
        "revenue": (["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax"], True, "USD"),
        "netIncome": (["NetIncomeLoss"], True, "USD"),
        "operatingCF": (["NetCashProvidedByUsedInOperatingActivities"], True, "USD"),
        "capex": (["PaymentsToAcquirePropertyPlantAndEquipment"], True, "USD"),
        "eps": (["EarningsPerShareDiluted", "EarningsPerShareBasic"], True, "USD/shares")
    }
    r = {"source": f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json",
         "method": "US GAAP: latest SEC XBRL companyfacts, financial year values, latest instant balance sheet",
         "fetched_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")}
    raw={}
    for name, (tags, annual, unit) in metrics.items():
        found = fetch_metric(facts, tags, unit, annual)
        if found is not None:
            r[name] = round(found[3], 6) if name == "eps" else found[3]
            r[name+"Period"] = found[0]
            raw[name] = found
    if raw.get("revenue"):
        r["period_end"]=raw["revenue"][0]
    elif raw.get("assets"):
        r["period_end"]=raw["assets"][0]
    if r.get("assets",0)>0 and r.get("equity") is not None:
        r["equityRatio"] = round(r["equity"] / r["assets"], 6)
    if r.get("equity",0)>0 and r.get("netIncome") is not None:
        r["roe"] = round(r["netIncome"] / r["equity"], 6)
        r["roeMethod"] = "Annual net income / last balance sheet shareholders equity (not average equity)"
    if r.get("operatingCF") is not None and r.get("capex") is not None:
        r["fcf"] = r["operatingCF"] - r["capex"]
        if r.get("revenue",0)>0:
            r["fcfMargin"] = round(r["fcf"] / r["revenue"], 6)
    # Revenue growth only with same tag and ~one-year-apart annual facts.
    if raw.get("revenue"):
        end, _, tag, latest = raw["revenue"]
        current_end=dt.date.fromisoformat(end)
        old=[it for it in fact_items(facts,[tag],"USD",True)
             if 340 <= (current_end-dt.date.fromisoformat(it[0])).days <= 390]
        if old and old[0][3]>0:
            r["revenueGrowthYoY"]=round(latest/old[0][3]-1,6)
            r["revenueGrowthPeriod"]=end
    return r


def main():
    with COMPANIES.open(encoding="utf-8-sig", newline="") as fp:
        universe=list(csv.DictReader(fp))
    tickers=sorted({row["証券コード"].strip().upper() for row in universe if row["所在国"]=="米国"
                 and re.fullmatch(r"[A-Z]{1,5}(\.[A-Z])?",row["証券コード"].strip().upper())})
    try:
        existing=json.loads(OUT.read_text(encoding="utf-8"))
    except (FileNotFoundError,json.JSONDecodeError):
        existing={}
    companies=existing.get("companies",{}) if isinstance(existing.get("companies"),dict) else {}
    errors=[];done=0
    try:
        mapping=get_json("https://www.sec.gov/files/company_tickers.json")
        lookup={x["ticker"].upper():int(x["cik_str"]) for x in mapping.values()}
    except Exception as exc:
        print("SEC CIK list unavailable:",type(exc).__name__)
        lookup={}
        # Validated examples from the SEC public ticker list; do not guess other CIKs.
        lookup.update({"MSFT":789019, "IBM":51143, "NVDA":1045810})
    for symbol in tickers:
        cik=lookup.get(symbol)
        if not cik:
            errors.append(symbol+": SEC CIK not found");continue
        try:
            payload=get_json(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json")
            result=company_fundamentals(payload,cik)
            if not any(k in result for k in ("equityRatio","fcf","eps","revenue")):
                raise ValueError("No usable US-GAAP metrics")
            companies[symbol]=result
            done+=1
        except Exception as exc:
            errors.append(symbol+": "+type(exc).__name__)
        time.sleep(REQUEST_GAP)
    document={"updated_at":dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
              "provider":"U.S. SEC EDGAR companyfacts, issuer filings",
              "attempted":len(tickers),"updated":done,"companies":companies,"errors":errors[:60]}
    # Preserve verified historical disclosures if upstream is blocked.
    if done > 0:
        OUT.write_text(json.dumps(document,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    else:
        print("SEC fetch yielded 0 usable issuer records; existing snapshot unchanged")
    print("SEC fundamentals refreshed:",done,"/",len(tickers),"stored:",len(companies))
    if errors:
        print("Examples of unavailable facts:",errors[:8])


if __name__=="__main__":
    main()
