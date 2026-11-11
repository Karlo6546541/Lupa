"""Company tracker: turns data/companies.json (SEC + ClinicalTrials.gov, see scripts/update_companies.py) into the
things readers see — a per-ticker timeline, the catalyst calendar and the track record. Pure functions, no I/O besides
load(); used by BOTH build.py (website) and scripts/export_app_feed.py (mobile app), so the two can never disagree."""
import datetime, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent
LANGS = ("hr", "en")
# Sectors of tracked companies (content/companies.json → "sector"). Not the same as the article categories in site.json:
# a sector needs no articles, it only groups companies in the tracker.
SECTORS = [
    ("bio", {"hr": "Bioinženjering", "en": "Bioengineering"}),
    ("quantum", {"hr": "Kvantno računalstvo", "en": "Quantum computing"}),
    ("space", {"hr": "Svemir", "en": "Space"}),
    ("nuclear", {"hr": "Nuklearna energija", "en": "Nuclear energy"}),
    ("robotics", {"hr": "Roboti i dronovi", "en": "Robots and drones"}),
]
def sector_label(sid, L): return dict(SECTORS).get(sid, {}).get(L)
BENCH = "IWM"   # Russell 2000 ETF: the fair yardstick for small caps

def load():
    f = ROOT / "data" / "companies.json"
    db = json.loads(f.read_text()) if f.exists() else {"companies": {}, "generated": None}
    c = ROOT / "content" / "catalysts.json"
    manual = [x for x in json.loads(c.read_text())] if c.exists() else []
    return db, [m for m in manual if isinstance(m, dict) and m.get("date")]

# ---------- formatting ----------
def n(x, L, dec=0):
    s = f"{x:,.{dec}f}"
    return s.replace(",", "§").replace(".", ",").replace("§", ".") if L == "hr" else s

def usd(x, L, dec=0):
    return f"{n(x, L, dec)} $" if L == "hr" else f"${n(x, L, dec)}"

def usd_short(x, L):
    for lim, hr, en in ((1e9, " mlrd.", "bn"), (1e6, " mil.", "m"), (1e3, " tis.", "k")):
        if abs(x) >= lim:
            v = x / lim; d = 1 if abs(v) < 100 else 0
            return f"{n(v, L, d)}{hr} $" if L == "hr" else f"${n(v, L, d)}{en}"
    return usd(x, L)

ROLE_HR = {"Director": "član odbora", "10% owner": "vlasnik više od 10 %"}
def role(r, L): return ROLE_HR.get(r, r) if L == "hr" else r

# 8-K items, most newsworthy first. (hr, en, important?)
ITEMS = [
 ("4.02", "Raniji financijski izvještaji više nisu pouzdani", "Earlier financial statements can no longer be relied on", True),
 ("3.01", "Obavijest burze o mogućem isključenju iz kotacije", "Exchange notice about possible delisting", True),
 ("1.03", "Stečaj ili prisilna uprava", "Bankruptcy or receivership", True),
 ("2.02", "Objava financijskih rezultata", "Financial results released", True),
 ("1.01", "Sklopljen važan ugovor", "Material agreement signed", True),
 ("2.01", "Dovršena kupnja ili prodaja imovine", "Acquisition or disposal completed", True),
 ("1.02", "Raskinut važan ugovor", "Material agreement terminated", True),
 ("3.02", "Prodaja novih dionica izvan burze (moguće razvodnjavanje)", "Unregistered sale of new shares (possible dilution)", True),
 ("2.03", "Novo zaduženje", "New debt obligation", True),
 ("5.02", "Promjena u upravi ili odboru", "Change of executives or directors", True),
 ("2.05", "Restrukturiranje ili otpuštanja", "Restructuring or layoffs", True),
 ("2.06", "Otpis vrijednosti imovine", "Material impairment", True),
 ("5.07", "Rezultati glasanja dioničara", "Shareholder vote results", False),
 ("5.03", "Izmjena statuta", "Charter or bylaws amended", False),
 ("7.01", "Objava za ulagače (prezentacija, priopćenje)", "Investor disclosure (presentation, press release)", False),
 ("8.01", "Ostali važni događaji", "Other events", False),
]
FORM_LABEL = {
 "10-Q": ("Kvartalni izvještaj (10-Q)", "Quarterly report (10-Q)", True),
 "10-K": ("Godišnji izvještaj (10-K)", "Annual report (10-K)", True),
 "20-F": ("Godišnji izvještaj (20-F)", "Annual report (20-F)", True),
 "S-1": ("Prijava izdanja novih dionica (S-1)", "Registration of new shares (S-1)", True),
 "S-3": ("Okvirna prijava za izdavanje dionica (S-3)", "Shelf registration for new shares (S-3)", True),
 "424B5": ("Prospekt: prodaja novih dionica (moguće razvodnjavanje)", "Prospectus: sale of new shares (possible dilution)", True),
 "DEF 14A": ("Poziv na skupštinu dioničara (proxy)", "Proxy statement for the shareholder meeting", False),
 "NT 10-Q": ("Kašnjenje kvartalnog izvještaja", "Late quarterly report notice", True),
 "NT 10-K": ("Kašnjenje godišnjeg izvještaja", "Late annual report notice", True),
 "6-K": ("Tekuće izvješće (6-K)", "Current report (6-K)", False),
}

def filing_text(f):
    form = f["form"]; base = form.replace("/A", "")
    amend = {"hr": " (ispravak)", "en": " (amended)"} if form.endswith("/A") else {"hr": "", "en": ""}
    if base == "8-K":
        for code, hr, en, imp in ITEMS:
            if code in f.get("items", []): return {"hr": hr + amend["hr"], "en": en + amend["en"]}, imp
        return {"hr": "Tekuće izvješće (8-K)" + amend["hr"], "en": "Current report (8-K)" + amend["en"]}, False
    hr, en, imp = FORM_LABEL.get(base, (form, form, False))
    return {"hr": hr + amend["hr"], "en": en + amend["en"]}, imp

def insider_text(r):
    out = {}
    for L in LANGS:
        who = r["owner"] + (f", {role(r['role'], L)}" if r.get("role") else "")
        head = {"buy": ("Kupnja uprave", "Insider buy"), "sell": ("Prodaja uprave", "Insider sale")}[r["kind"]][L == "en"]
        amt = (f"{n(r['shares'], L)} dionica" if L == "hr" else f"{n(r['shares'], L)} shares")
        if r.get("price"): amt += (f" po {usd(r['price'], L, 2)} (ukupno {usd_short(r['value'], L)})" if L == "hr" else f" at {usd(r['price'], L, 2)} ({usd_short(r['value'], L)} in total)")
        plan = (" · unaprijed zadan plan (10b5-1)" if L == "hr" else " · pre-arranged plan (10b5-1)") if r.get("planned") and r["kind"] == "sell" else ""
        out[L] = f"{head}: {who} — {amt}{plan}"
    return out

# ---------- per-company timeline ----------
def events(co, limit=40):
    """Newest first. kinds: buy | sell | filing. Routine insider rows (grants, tax withholding, option exercises) are
    left out of the timeline; they only count in insider_summary()['other']."""
    ev = []
    for f in co.get("filings", []):
        text, imp = filing_text(f)
        ev.append({"id": f"{co['ticker']}:{f['id']}", "ticker": co["ticker"], "date": f["date"], "kind": "filing", "form": f["form"],
                   "text": text, "important": imp, "url": f["url"]})
    for r in co.get("insider", []):
        if r["kind"] == "other": continue
        ev.append({"id": f"{co['ticker']}:{r['id']}", "ticker": co["ticker"], "date": r["filed"], "kind": r["kind"], "form": "4",
                   "text": insider_text(r), "important": r["kind"] == "buy" or (r.get("value") or 0) >= 250000, "value": r.get("value"), "url": r["url"]})
    ev.sort(key=lambda e: (e["date"], e["kind"] != "filing", e["id"]), reverse=True)
    return ev[:limit]

def insider_summary(co, today, days=365):
    cut = (today - datetime.timedelta(days=days)).isoformat()
    s = {"days": days, "buys": 0, "buy_value": 0, "sells": 0, "sell_value": 0, "other": 0}
    for r in co.get("insider", []):
        if r["date"] < cut: continue
        if r["kind"] == "buy": s["buys"] += 1; s["buy_value"] += r.get("value") or 0
        elif r["kind"] == "sell": s["sells"] += 1; s["sell_value"] += r.get("value") or 0
        else: s["other"] += 1
    return s

# ---------- catalyst calendar ----------
def calendar(db, manual, today, horizon_days=200):
    """Upcoming dated events, soonest first. `estimate` = derived from past behaviour, not announced by the company.
    A manual entry (content/catalysts.json) of type 'earnings' replaces the estimate for that ticker."""
    end = (today + datetime.timedelta(days=horizon_days)).isoformat(); start = today.isoformat()
    out = []
    confirmed = {m["ticker"] for m in manual if m.get("type") == "earnings" and m["date"] >= start}
    for m in manual:
        if not (start <= m["date"] <= end): continue
        out.append({"date": m["date"], "ticker": m.get("ticker"), "type": m.get("type", "other"), "estimate": False,
                    "title": m["title"], "url": m.get("url")})
    for t, co in db.get("companies", {}).items():
        e = co.get("next_earnings_estimate")
        if e and t not in confirmed and start <= e <= end:
            out.append({"date": e, "ticker": t, "type": "earnings", "estimate": True, "url": co.get("edgar_url"),
                        "title": {"hr": f"{co['name']}: kvartalni rezultati", "en": f"{co['name']}: quarterly results"}})
        for tr in co.get("trials", []):
            d = tr.get("primary_completion") or ""
            if len(d) == 7: d += "-28"            # month precision: place at month end
            if not (start <= d <= end): continue
            ph = f" ({tr['phase']})" if tr.get("phase") else ""
            out.append({"date": d, "ticker": t, "type": "trial", "estimate": len(tr["primary_completion"]) == 7, "url": tr["url"],
                        "title": {"hr": f"{co['name']}: planirani završetak ispitivanja{ph} — {tr['title']}",
                                  "en": f"{co['name']}: planned primary completion{ph} — {tr['title']}"}})
    out.sort(key=lambda x: (x["date"], x.get("ticker") or ""))
    return out

# ---------- track record ----------
def primary_ticker(post, prices):
    for t in post.get("tickers", []):
        if prices.get(t, {}).get("type") == "EQUITY": return t
    return None

def scorecard(posts, latest, snapshot_fn):
    """One row per company deep dive ('research' category): price at the session the analysis used vs. the latest close,
    next to the Russell 2000 ETF over the same days. Every analysis is listed, winners and losers alike."""
    rows = []
    for p in posts:
        if "research" not in p.get("categories", []) or not p.get("prices_session"): continue
        t = primary_ticker(p, latest)
        snap = snapshot_fn(p["prices_session"])
        if not t or t not in snap or t not in latest: continue
        then, now = snap[t]["last"], latest[t]["last"]
        row = {"post": p["dir"], "ticker": t, "name": latest[t].get("name") or t, "date": p["date"], "session": p["prices_session"],
               "then": then, "now": now, "now_session": latest[t]["session_date"], "currency": latest[t].get("currency", "USD"),
               "pct": round((now / then - 1) * 100, 2), "bench": BENCH, "bench_pct": None}
        if BENCH in snap and BENCH in latest:
            row["bench_pct"] = round((latest[BENCH]["last"] / snap[BENCH]["last"] - 1) * 100, 2)
        rows.append(row)
    rows.sort(key=lambda r: r["date"], reverse=True)
    return rows

def company_view(t, co, posts, latest, snapshot_fn, today):
    """Everything the profile page / app screen shows for one ticker."""
    px = latest.get(t)
    mine = [p for p in posts if t in p.get("tickers", [])]
    first = next((r for r in reversed(scorecard(posts, latest, snapshot_fn)) if r["ticker"] == t), None)
    since_date = first["session"] if first else None
    evs = events(co)
    return {"ticker": t, "name": co.get("name") or t, "sector": co.get("sector"), "edgar_url": co.get("edgar_url"),
            "price": ({"last": px["last"], "change_pct": px["change_pct"], "session": px["session_date"], "currency": px.get("currency", "USD"),
                       "high52": px.get("high52"), "low52": px.get("low52")} if px else None),
            "posts": [p["dir"] for p in mine], "since": first,
            "since_events": sum(1 for e in evs if since_date and e["date"] > since_date),
            "events": evs, "insider": insider_summary(co, today), "trials": co.get("trials", []),
            "next_earnings_estimate": co.get("next_earnings_estimate")}
