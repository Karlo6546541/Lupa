#!/usr/bin/env python3
"""Refresh data/companies.json: SEC filings, insider transactions (Form 4), clinical trials and the catalyst calendar
for every company Lupa covers. Zero dependencies; only free, official sources:

  SEC EDGAR          https://data.sec.gov/submissions/CIK##########.json  (filings index)
                     https://www.sec.gov/Archives/edgar/data/<cik>/<accession>/<form4>.xml  (insider transactions)
  ClinicalTrials.gov https://clinicaltrials.gov/api/v2/studies  (only for tickers with "ct_sponsor" in content/companies.json)

Usage:  python3 scripts/update_companies.py            # all covered tickers
        python3 scripts/update_companies.py INFQ DNA   # just these (others keep their stored data)

Which tickers: every EQUITY ticker used in a post's meta.json, plus any ticker listed in content/companies.json.
Numbers are never typed by hand or written by AI: everything here comes from the filings themselves.
The SEC asks automated clients to identify themselves: set LUPA_USER_AGENT="Lupa data refresh (you@your-domain)"
(default uses contact_email from content/monetization.json). A failed source keeps the previously stored data."""
import datetime, json, os, pathlib, re, sys, time, urllib.error, urllib.parse, urllib.request
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONTENT, DATA = ROOT / "content", ROOT / "data"
OUT = DATA / "companies.json"
TODAY = datetime.date.today()
FILINGS_DAYS, INSIDER_DAYS, MAX_FILINGS, MAX_FORM4 = 400, 365, 25, 40

MON = json.loads((CONTENT / "monetization.json").read_text())
UA = os.environ.get("LUPA_USER_AGENT") or f"Lupa data refresh ({MON.get('contact_email', 'contact unknown')})"

_last = [0.0]
def get(url, as_json=True, tries=3):
    """Polite GET: max ~5 requests/second (SEC fair-access limit is 10/s), retries on 429/5xx."""
    for attempt in range(tries):
        wait = 0.2 - (time.time() - _last[0])
        if wait > 0: time.sleep(wait)
        _last[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"})
            raw = urllib.request.urlopen(req, timeout=30).read()
            return json.loads(raw) if as_json else raw
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and attempt < tries - 1: time.sleep(2 * (attempt + 1)); continue
            raise
    raise RuntimeError("unreachable")

# ---------- which companies ----------
def covered_tickers():
    prices = json.loads((DATA / "prices.json").read_text())
    cfg = json.loads((CONTENT / "companies.json").read_text()) if (CONTENT / "companies.json").exists() else {}
    cfg = {k: v for k, v in cfg.items() if not k.startswith("_")}
    seen = []
    for m in sorted(CONTENT.glob("posts/*/meta.json")):
        for t in json.loads(m.read_text()).get("tickers", []):
            if prices.get(t, {}).get("type") == "EQUITY" and t not in seen: seen.append(t)
    for t in cfg:
        if t not in seen: seen.append(t)
    return seen, cfg, prices

# ---------- SEC ----------
# Forms worth showing a reader. Everything else (424B3 prospectus supplements, 13G, UPLOAD, CORRESP …) is noise.
FORMS = {"10-K", "10-Q", "8-K", "S-1", "S-3", "424B5", "DEF 14A", "10-K/A", "10-Q/A", "8-K/A", "NT 10-K", "NT 10-Q", "20-F", "6-K"}

def sec_filings(cik, sub):
    r = sub["filings"]["recent"]; out = []; form4 = []
    cutoff = (TODAY - datetime.timedelta(days=FILINGS_DAYS)).isoformat()
    icut = (TODAY - datetime.timedelta(days=INSIDER_DAYS)).isoformat()
    for i, form in enumerate(r["form"]):
        acc = r["accessionNumber"][i]; date = r["filingDate"][i]; doc = r["primaryDocument"][i]
        folder = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc.replace('-', '')}"
        if form in ("4", "4/A") and date >= icut and len(form4) < MAX_FORM4:
            form4.append({"acc": acc, "filed": date, "xml": f"{folder}/{doc.split('/')[-1]}", "url": f"{folder}/{doc}"})
        elif form in FORMS and date >= cutoff and len(out) < MAX_FILINGS:
            out.append({"id": acc, "form": form, "date": date, "period": r["reportDate"][i] or None,
                        "items": [x for x in (r["items"][i] or "").split(",") if x], "url": f"{folder}/{doc}"})
    # Every 8-K with item 2.02 (results) in the whole recent index: used to estimate the next earnings date.
    results = sorted({r["filingDate"][i] for i, f in enumerate(r["form"]) if f == "8-K" and "2.02" in (r["items"][i] or "")})
    return out, form4, results

def txt(node, path):
    el = node.find(path)
    return (el.text or "").strip() if el is not None and el.text else ""

def num(node, path):
    try: return float(txt(node, path))
    except ValueError: return None

def parse_form4(raw, meta):
    """One row per (owner, transaction code) per filing. P = open-market buy, S = open-market sale; the rest
    (A grant, M option exercise, F shares withheld for tax, G gift …) are routine and stored as kind 'other'."""
    root = ET.fromstring(raw)
    owners = []
    for o in root.findall("reportingOwner"):
        rel = o.find("reportingOwnerRelationship")
        role = txt(rel, "officerTitle") if rel is not None else ""
        if not role and rel is not None:
            role = "Director" if txt(rel, "isDirector") in ("1", "true") else "10% owner" if txt(rel, "isTenPercentOwner") in ("1", "true") else ""
        owners.append((txt(o, "reportingOwnerId/rptOwnerName"), role))
    owner = " / ".join(n for n, _ in owners[:2]) + (" …" if len(owners) > 2 else "")
    role = next((r for _, r in owners if r), "")
    planned = txt(root, "aff10b5One") in ("1", "true")
    groups = {}
    for tr in root.findall("nonDerivativeTable/nonDerivativeTransaction"):
        code = txt(tr, "transactionCoding/transactionCode")
        shares = num(tr, "transactionAmounts/transactionShares/value") or 0
        price = num(tr, "transactionAmounts/transactionPricePerShare/value") or 0
        g = groups.setdefault(code, {"shares": 0.0, "value": 0.0, "date": txt(tr, "transactionDate/value"), "after": None})
        g["shares"] += shares; g["value"] += shares * price
        g["date"] = max(g["date"], txt(tr, "transactionDate/value"))
        after = num(tr, "postTransactionAmounts/sharesOwnedFollowingTransaction/value")
        if after is not None: g["after"] = after
    rows = []
    for code, g in groups.items():
        if not g["shares"]: continue
        kind = "buy" if code == "P" else "sell" if code == "S" else "other"
        rows.append({"id": f"{meta['acc']}:{code}", "date": g["date"] or meta["filed"], "filed": meta["filed"], "owner": owner.title() if owner.isupper() else owner,
                     "role": role, "code": code, "kind": kind, "shares": round(g["shares"]),
                     "price": round(g["value"] / g["shares"], 4) if g["value"] else None, "value": round(g["value"]) if g["value"] else None,
                     "after": round(g["after"]) if g["after"] is not None else None, "planned": planned, "url": meta["url"]})
    return rows

# ---------- ClinicalTrials.gov ----------
def trials(sponsor):
    q = urllib.parse.urlencode({"query.lead": sponsor, "pageSize": 50,
                                "fields": "NCTId,BriefTitle,OverallStatus,Phase,PrimaryCompletionDate,LeadSponsorName,LastUpdatePostDate"})
    out = []
    for s in get(f"https://clinicaltrials.gov/api/v2/studies?{q}").get("studies", []):
        p = s["protocolSection"]; st = p.get("statusModule", {})
        lead = p.get("sponsorCollaboratorsModule", {}).get("leadSponsor", {}).get("name", "")
        if sponsor.lower() not in lead.lower(): continue          # the search is fuzzy: keep exact sponsor matches only
        status = st.get("overallStatus", "")
        if status in ("WITHDRAWN", "TERMINATED", "UNKNOWN", "NO_LONGER_AVAILABLE"): continue
        nct = p["identificationModule"]["nctId"]
        out.append({"id": nct, "title": p["identificationModule"].get("briefTitle", ""), "status": status,
                    "phase": "/".join(x.replace("EARLY_PHASE1", "Early Phase 1").replace("PHASE", "Phase ").replace("NA", "N/A") for x in p.get("designModule", {}).get("phases", [])) or None,
                    "primary_completion": st.get("primaryCompletionDateStruct", {}).get("date"),
                    "updated": st.get("lastUpdatePostDateStruct", {}).get("date"), "url": f"https://clinicaltrials.gov/study/{nct}"})
    return sorted(out, key=lambda x: x["primary_completion"] or "9999")

# ---------- next earnings estimate ----------
def estimate_earnings(result_dates):
    """Next results ≈ one quarter (13 weeks) after the last results 8-K; if the company reported within ±25 days of that
    day a year earlier, use that date + 52 weeks instead (companies keep nearly the same calendar). Clearly labelled as
    an estimate everywhere it is shown; a confirmed date in content/catalysts.json replaces it."""
    if not result_dates: return None
    dates = [datetime.date.fromisoformat(d) for d in result_dates]
    target = dates[-1] + datetime.timedelta(weeks=13)
    near = [d + datetime.timedelta(weeks=52) for d in dates if abs((d + datetime.timedelta(weeks=52) - target).days) <= 25]
    est = near[0] if near else target
    return est.isoformat() if est >= TODAY else None

# ---------- main ----------
def main():
    tickers, cfg, prices = covered_tickers()
    only = [t.upper() for t in sys.argv[1:]]
    db = json.loads(OUT.read_text()) if OUT.exists() else {"companies": {}}
    old = db.get("companies", {})
    ciks = {v["ticker"]: v["cik_str"] for v in get("https://www.sec.gov/files/company_tickers.json").values()}
    companies = {}
    for t in tickers:
        c = cfg.get(t, {}); prev = old.get(t, {})
        if only and t not in only:
            if prev: companies[t] = prev
            continue
        cik = c.get("cik") or ciks.get(t)
        if not cik: print("SKIP", t, "(no CIK: not an SEC registrant?)"); continue
        co = {"ticker": t, "name": prices.get(t, {}).get("name") or t, "cik": int(cik), "sector": c.get("sector"),
              "edgar_url": f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={int(cik):010d}&type=&dateb=&owner=include&count=40",
              "filings": prev.get("filings", []), "insider": prev.get("insider", []), "trials": prev.get("trials", []), "next_earnings_estimate": prev.get("next_earnings_estimate")}
        try:
            sub = get(f"https://data.sec.gov/submissions/CIK{int(cik):010d}.json")
            co["name"] = c.get("name") or sub.get("name") or co["name"]
            filings, form4, results = sec_filings(cik, sub)
            known = {}
            for row in prev.get("insider", []): known.setdefault(row["id"].split(":")[0], []).append(row)
            insider = []
            for f4 in form4:
                if f4["acc"] in known: insider += known[f4["acc"]]; continue      # already parsed on an earlier run
                try: insider += parse_form4(get(f4["xml"], as_json=False), f4)
                except Exception as e: print("  form4 FAIL", t, f4["acc"], e)
            co["filings"] = filings
            co["insider"] = sorted(insider, key=lambda x: (x["date"], x["id"]), reverse=True)
            co["next_earnings_estimate"] = estimate_earnings(results)
        except Exception as e:
            print("SEC FAIL", t, e, "(keeping stored data)")
        if c.get("ct_sponsor"):
            try: co["trials"] = trials(c["ct_sponsor"])
            except Exception as e: print("CT FAIL", t, e, "(keeping stored data)")
        companies[t] = co
        buys = sum(1 for x in co["insider"] if x["kind"] == "buy"); sells = sum(1 for x in co["insider"] if x["kind"] == "sell")
        print(f"{t:6} {len(co['filings']):3} filings · {len(co['insider']):3} insider rows ({buys} buys, {sells} sells) · {len(co['trials']):2} trials · next results ≈ {co['next_earnings_estimate']}")
    db = {"_note": "Written by scripts/update_companies.py from SEC EDGAR and ClinicalTrials.gov. Do not edit by hand.",
          "generated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "companies": companies}
    OUT.write_text(json.dumps(db, indent=1, ensure_ascii=False) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size/1024:.0f} KB, {len(companies)} companies)")

if __name__ == "__main__":
    main()
