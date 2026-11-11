#!/usr/bin/env python3
"""Scaffold a new bilingual post (created as draft — set "draft": false or delete the key to publish).
Usage:
  python3 scripts/new_post.py 2026-11-12 "hr-slug" "en-slug" markets,small-caps [TICKER ...]
Then: python3 scripts/update_prices.py TICKER ...  (writes data/snapshots/<session>.json)
      set "prices_session" in meta.json to that session date, write hr.html + en.html, python3 build.py"""
import sys, json, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
date, shr, sen, cats, *tickers = sys.argv[1:]
d = ROOT / "content" / "posts" / f"{date}-{sen[:40]}"
d.mkdir(parents=True, exist_ok=False)
access = "subscribers" if "research" in cats.split(",") else "free"   # research = paid by default; change to "free" to unlock
meta = {"date": date, "order": 0, "access": access, "draft": True, "slug": {"hr": shr, "en": sen}, "categories": cats.split(","),
        "prices_session": "YYYY-MM-DD", "tickers": tickers, "hero": "home-hero",
        "title": {"hr": "", "en": ""}, "dek": {"hr": "", "en": ""},
        "sources": [{"label": "Source title", "url": "https://"}]}
(d / "meta.json").write_text(json.dumps(meta, indent=1, ensure_ascii=False))
(d / "hr.html").write_text("<p>Tekst na hrvatskom. Primjer cijene: {{q:%s}}</p>\n" % (tickers[0] if tickers else "^RUT"))
(d / "en.html").write_text("<p>English text. Price example: {{q:%s}}</p>\n" % (tickers[0] if tickers else "^RUT"))
print("created", d, "| access:", access)
