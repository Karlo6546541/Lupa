#!/usr/bin/env python3
"""Export the public content of the built site as one JSON feed for the Lupa mobile app (iOS + Android).

    python3 build.py --base-url https://lupa-lovat.vercel.app
    python3 scripts/export_app_feed.py          # → dist/app/v1/feed.json   (package_vercel.py runs this automatically)

What goes in: everything that is ALREADY public in dist/ — titles, deks, categories, the ticker tape, the full body
of FREE posts, and for subscriber-only posts only the same teaser the website shows (intro + preview sections) plus
the headings of the locked sections. Subscriber-only remainders stay in private/ and reach the app only through
/api/app-article after a store-purchase check. check_paywall.py scans dist/ (including this JSON) for leaks.

Rendered HTML is taken from dist/ (so price tokens, quote boxes and images look exactly like the site); relative
links are rewritten to root-relative ("/assets/…", "/hr/…") so the app can resolve them against SITE_URL."""
import datetime, html, json, pathlib, re, sys
from urllib.parse import urljoin, urlparse

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONTENT, DIST = ROOT / "content", ROOT / "dist"
OUT = DIST / "app" / "v1" / "feed.json"
LANGS = ("hr", "en")
PATHS = {"hr": dict(articles="clanci", about="o-nama", disclaimer="izjava-o-odgovornosti"),
         "en": dict(articles="articles", about="about", disclaimer="disclaimer")}
FEED_VERSION = 1

SITE = json.loads((CONTENT / "site.json").read_text())
IMAGES = json.loads((CONTENT / "images.json").read_text())
MON = json.loads((CONTENT / "monetization.json").read_text())

def fail(msg): sys.exit("export_app_feed: ERROR: " + msg)

def between(s, start, end, where):
    i = s.find(start)
    if i < 0: fail(f"{where}: marker {start!r} not found (did build.py change?)")
    i += len(start); j = s.find(end, i)
    if j < 0: fail(f"{where}: end marker {end!r} not found")
    return s[i:j]

def rootrel(fragment, page_path):
    """Rewrite href/src/srcset relative URLs to root-relative ones, resolved against the page's own path."""
    base = "https://lupa.invalid/" + page_path
    def one(u):
        u = u.strip()
        if not u or u.startswith(("#", "mailto:", "tel:", "data:")) or re.match(r"^[a-z]+://", u): return u
        p = urlparse(urljoin(base, u)); return p.path + (("?" + p.query) if p.query else "") + (("#" + p.fragment) if p.fragment else "")
    fragment = re.sub(r'\b(href|src)="([^"]*)"', lambda m: f'{m.group(1)}="{one(html.unescape(m.group(2))).replace(chr(34), "&quot;")}"', fragment)
    def srcset(m):
        parts = []
        for item in m.group(1).split(","):
            bits = item.strip().split()
            if bits: parts.append(" ".join([one(bits[0])] + bits[1:]))
        return f'srcset="{", ".join(parts)}"'
    return re.sub(r'\bsrcset="([^"]*)"', srcset, fragment)

def strip_web_only(fragment):
    # Ads (house ads link to the advertising page), newsletter forms and paywall/checkout markup are web-only.
    fragment = re.sub(r'<aside class="ad\b.*?</aside>', "", fragment, flags=re.S)
    fragment = re.sub(r'<form\b.*?</form>', "", fragment, flags=re.S)
    return fragment.strip()

def label2(v): return v if isinstance(v, dict) else {"hr": v, "en": v}

def load_posts():
    posts = []
    for d in sorted((CONTENT / "posts").iterdir()):
        if not d.is_dir() or d.name.startswith("_"): continue
        m = json.loads((d / "meta.json").read_text())
        if m.get("draft"): continue
        m["dir"] = d.name; posts.append(m)
    posts.sort(key=lambda p: (p["date"], p.get("order", 0)), reverse=True)
    return posts

def access(p):
    a = p.get("access")
    if a in ("free", "subscribers"): return a
    return "subscribers" if "research" in p["categories"] else "free"

def export_post(p):
    out = {"id": p["dir"], "date": p["date"], "order": p.get("order", 0), "access": access(p), "categories": p["categories"],
           "tickers": p.get("tickers", []), "hero": p.get("hero") or "home-hero", "title": p["title"], "dek": p["dek"],
           "url": {}, "body": {}, "locked": {}, "minutes": {}, "dateLabel": {}, "heroAlt": {}, "heroCaption": {},
           "sources": [{"label": label2(s["label"]), "url": s["url"]} for s in p.get("sources", [])]}
    if p.get("sponsored"): out["sponsored"] = p["sponsored"]
    img = IMAGES.get(out["hero"], {})
    for L in LANGS:
        path = f"{L}/{PATHS[L]['articles']}/{p['slug'][L]}/"
        f = DIST / path / "index.html"
        if not f.exists(): fail(f"{f} missing — run build.py first")
        s = f.read_text()
        prose = between(s, '<div class="prose">', '</div><aside class="rail"', str(f))
        locked = []
        if out["access"] == "subscribers":
            if '<section class="paywall"' not in prose: fail(f"{f}: paid post without paywall section")
            pw = prose[prose.find('<section class="paywall"'):]
            nxt = re.search(r'<div class="pw-next">.*?<ul>(.*?)</ul>', pw, flags=re.S)
            if nxt: locked = [html.unescape(re.sub(r"<[^>]+>", "", li)).strip() for li in re.findall(r"<li>(.*?)</li>", nxt.group(1), flags=re.S)]
            prose = prose[:prose.find('<section class="paywall"')]
        out["body"][L] = rootrel(strip_web_only(prose), path)
        out["locked"][L] = locked
        out["url"][L] = "/" + path
        mm = re.search(r'<div class="byline">.*?<time[^>]*>(.*?)</time>.*?<span>(\d+) ', s, flags=re.S)
        if not mm: fail(f"{f}: byline not found")
        out["dateLabel"][L] = html.unescape(mm.group(1)); out["minutes"][L] = int(mm.group(2))
        out["heroAlt"][L] = (img.get("alt") or {}).get(L, ""); out["heroCaption"][L] = (img.get("caption") or {}).get(L, "")
    return out

def export_page(key):
    page = {"title": {}, "dek": {}, "body": {}, "url": {}}
    for L in LANGS:
        path = f"{L}/{PATHS[L][key]}/"
        s = (DIST / path / "index.html").read_text()
        page["title"][L] = html.unescape(re.sub(r"<[^>]+>", "", between(s, "<h1>", "</h1>", path)))
        page["dek"][L] = html.unescape(re.sub(r"<[^>]+>", "", between(s, '<p class="dek">', "</p>", path)))
        page["body"][L] = rootrel(strip_web_only(between(s, '<div class="prose prose-page">', "</div></article>", path)), path)
        page["url"][L] = "/" + path
    return page

def export_tape():
    tape = {}
    for L in LANGS:
        s = (DIST / L / "index.html").read_text()
        row = re.search(r'<div class="tape-row">(.*?)</div>', s, flags=re.S)
        items = []
        if row:
            for m in re.finditer(r'<span class="ti"><b>(.*?)</b> <span class="num">(.*?)</span> <span class="num (up|down|flat)">(.*?)</span></span>', row.group(1)):
                items.append({"label": html.unescape(m.group(1)), "value": html.unescape(m.group(2)), "dir": m.group(3), "change": html.unescape(m.group(4))})
            asof = re.search(r'<span class="ti asof">(.*?)</span>', row.group(1))
        tape[L] = {"items": items, "asof": html.unescape(asof.group(1)) if row and asof else ""}
    return tape

def export_tracker(posts):
    """Company tracker for the app: per-ticker timeline (SEC filings, insider buys/sales), catalyst calendar and track
    record. Same functions as the website (tracker.py), so both always show the same thing. All of it is public data."""
    sys.path.insert(0, str(ROOT))
    import tracker
    from zoneinfo import ZoneInfo
    today = datetime.datetime.now(ZoneInfo("Europe/Zagreb")).date()
    db, manual = tracker.load()
    latest = json.loads((ROOT / "data" / "prices.json").read_text())
    snaps = {}
    def snapshot(session):
        if session not in snaps:
            f = ROOT / "data" / "snapshots" / f"{session}.json"
            snaps[session] = json.loads(f.read_text()) if f.exists() else {}
        return snaps[session]
    seg = {"hr": "tvrtke", "en": "companies"}
    companies = {}
    for t, co in db.get("companies", {}).items():
        v = tracker.company_view(t, co, posts, latest, snapshot, today)
        v["events"] = v["events"][:30]
        v["url"] = {L: f"/{L}/{seg[L]}/{t.lower()}/" for L in LANGS}
        card = DIST / "assets" / "cards" / f"{t.lower()}-hr.png"
        v["card"] = {L: f"/assets/cards/{t.lower()}-{L}.png" for L in LANGS} if card.exists() else None
        companies[t] = v
    used = {c["sector"] for c in companies.values()}
    return {"generated": db.get("generated"), "sectors": [{"id": i, **lab} for i, lab in tracker.SECTORS if i in used], "companies": companies, "calendar": tracker.calendar(db, manual, today),
            "scorecard": tracker.scorecard(posts, latest, snapshot),
            "urls": {"calendar": {"hr": "/hr/kalendar/", "en": "/en/calendar/"}, "track": {"hr": "/hr/rezultati/", "en": "/en/track-record/"}}}

def main():
    if not DIST.exists(): fail("dist/ missing — run build.py first")
    posts = load_posts()
    feed = {
        "version": FEED_VERSION,
        "generated": datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat(),
        "name": SITE["name"], "tagline": SITE["tagline"], "description": SITE["description"],
        "categories": [{"id": c["id"], "hr": c["hr"], "en": c["en"], "image": c.get("image")} for c in SITE["categories"]],
        "tape": export_tape(),
        "subscription": {"plan": MON["subscription"]["plan"], "price_eur": MON["subscription"]["price_eur"], "interval": MON["subscription"]["interval"]},
        "pages": {k: export_page(k) for k in ("about", "disclaimer")},
        "posts": [export_post(p) for p in posts],
        "tracker": export_tracker(posts),   # optional for the app: older app versions simply ignore it
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(feed, ensure_ascii=False, separators=(",", ":")))
    paid = sum(1 for p in feed["posts"] if p["access"] == "subscribers")
    print(f"app feed: {len(feed['posts'])} posts ({paid} subscriber-only as teasers) → {OUT.relative_to(ROOT)} ({OUT.stat().st_size/1024:.0f} KB)")

if __name__ == "__main__":
    main()
