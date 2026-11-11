#!/usr/bin/env python3
"""Fetch latest daily closes from Yahoo Finance public chart endpoint and write data/prices.json.
Usage: python3 scripts/update_prices.py [TICKER ...]   (no args = refresh all tickers already in prices.json)
Never edit numbers by hand: re-run this script and rebuild."""
import json, sys, urllib.request, urllib.parse, datetime, pathlib
from zoneinfo import ZoneInfo
ROOT = pathlib.Path(__file__).resolve().parent.parent
P = ROOT / "data" / "prices.json"
db = json.loads(P.read_text()) if P.exists() else {}
tickers = sys.argv[1:] or list(db.keys())
ny = ZoneInfo("America/New_York")
for t in tickers:
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(t)}?range=1mo&interval=1d"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        r = json.load(urllib.request.urlopen(req, timeout=20))["chart"]["result"][0]
    except Exception as e:
        print("FAIL", t, e); continue
    m = r["meta"]; ts = r["timestamp"]; cl = r["indicators"]["quote"][0]["close"]
    rows = [(datetime.datetime.fromtimestamp(a, ny).strftime("%Y-%m-%d"), round(b, 4)) for a, b in zip(ts, cl) if b is not None]
    last_d, last = rows[-1]; prev = rows[-2][1]
    ch = last - prev
    db[t] = {
        "symbol": t, "name": m.get("longName") or m.get("shortName"), "currency": m.get("currency"),
        "exchange": m.get("fullExchangeName"), "type": m.get("instrumentType"),
        "last": round(last, 4), "prev_close": round(prev, 4), "change": round(ch, 4),
        "change_pct": round(ch / prev * 100, 2), "session_date": last_d,
        "as_of": datetime.datetime.fromtimestamp(m["regularMarketTime"], ny).strftime("%Y-%m-%d %H:%M ET"),
        "high52": m.get("fiftyTwoWeekHigh"), "low52": m.get("fiftyTwoWeekLow"),
        "closes": rows, "source": "Yahoo Finance",
        "source_url": f"https://finance.yahoo.com/quote/{urllib.parse.quote(t)}",
        "fetched_at": datetime.datetime.now(ZoneInfo("Europe/Zagreb")).strftime("%Y-%m-%d %H:%M %Z"),
    }
    print(f"{t:6} {last:>10} {ch:+.4f} ({ch/prev*100:+.2f}%) {last_d}")
P.write_text(json.dumps(db, indent=1, ensure_ascii=False))
# Frozen snapshot per session date: articles reference these so published numbers never drift.
S = ROOT / "data" / "snapshots"; S.mkdir(exist_ok=True)
for sd in sorted({v["session_date"] for k, v in db.items() if k in tickers}):
    f = S / f"{sd}.json"
    snap = json.loads(f.read_text()) if f.exists() else {}
    for k in tickers:
        if k in db and db[k]["session_date"] == sd:
            snap[k] = db[k]
    f.write_text(json.dumps(snap, indent=1, ensure_ascii=False))
    print("snapshot", f.name, len(snap))
