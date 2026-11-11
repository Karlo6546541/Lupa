#!/usr/bin/env python3
"""Verify every internal href/src/srcset/action in dist resolves to a file, and every page has a working HR/EN alternate."""
import re, pathlib, sys, urllib.parse
D = pathlib.Path(__file__).resolve().parent.parent / "dist"
bad = 0; n = 0
for f in D.rglob("*.html"):
    s = f.read_text()
    if f.name == "404.html": continue
    urls = [m.group(1) for m in re.finditer(r'(?:href|src|action)="([^"]+)"', s)]
    for m in re.finditer(r'srcset="([^"]+)"', s):
        urls += [c.strip().split(" ")[0] for c in m.group(1).split(",") if c.strip()]
    for u in urls:
        if u.startswith(("http://", "https://", "mailto:", "#", "data:", "/api/")): continue  # /api/* = Vercel Functions
        n += 1
        p = (f.parent / urllib.parse.unquote(u.split("#")[0])).resolve()
        if p.is_dir(): p = p / "index.html"
        if not p.exists(): bad += 1; print("BROKEN", f.relative_to(D), "->", u)
    for t in re.findall(r"\{\{[^}]+\}\}", s): bad += 1; print("UNEXPANDED TOKEN", f.relative_to(D), t)
    if f.parent != D and 'hreflang="hr"' not in s: bad += 1; print("NO HREFLANG", f.relative_to(D))
for css in D.rglob("*.css"):
    for u in re.findall(r"url\(([^)]+)\)", css.read_text()):
        n += 1
        if not (css.parent / u).resolve().exists(): bad += 1; print("BROKEN CSS", css, u)

# Companies directory is a first-class route (not only whatever the nav happens to link).
COVERAGE = ("DNA", "INFQ", "ABSI", "SANA", "CDXS", "QUBT", "RGTI", "QBTS")
NOT_LISTED = ("IONQ", "NVDA", "XBI", "IWM", "IBB")
ROUTES = {"hr/tvrtke/": ("en/companies/", "Tvrtke", "analize-firmi"),
          "en/companies/": ("hr/tvrtke/", "Companies", "company-research")}
def href_ends(html, lang, path):
    m = re.search(rf'hreflang="{lang}" href="([^"]+)"', html)
    return bool(m and m.group(1).split("?")[0].rstrip("/").endswith(path.rstrip("/")))
for route, (other, label, category) in ROUTES.items():
    f = D / route / "index.html"
    if not f.exists():
        bad += 1; print("MISSING ROUTE", route); continue
    s = f.read_text(); n += 1
    title = re.search(r"<title>(.*?)</title>", s)
    if not title or title.group(1).startswith("404"):
        bad += 1; print("ROUTE IS 404", route)
    own = "hr" if route.startswith("hr/") else "en"
    if not href_ends(s, own, route) or not href_ends(s, "en" if own == "hr" else "hr", other):
        bad += 1; print("ROUTE HREFLANG", route)
    canon = re.search(r'rel="canonical" href="([^"]+)"', s)
    if canon and not canon.group(1).split("?")[0].rstrip("/").endswith(route.rstrip("/")):
        bad += 1; print("ROUTE CANONICAL", route, canon.group(1))
    block = re.search(r'data-directory="coverage">(.*)<!--coverage-end-->', s, re.S)
    if not block:
        bad += 1; print("NO COVERAGE LIST", route); continue
    body = block.group(1)
    ticks = re.findall(r'data-ticker="([^"]+)"', body)
    if tuple(ticks) != COVERAGE:
        bad += 1; print("COVERAGE LIST", route, ticks)
    for sym in NOT_LISTED:
        if f'data-ticker="{sym}"' in body or f">{sym}<" in body:
            bad += 1; print("NOT A COVERAGE COMPANY", route, sym)
    if not re.search(r'href="[^"]*(?:/clanci/|/articles/)', body):
        bad += 1; print("COVERAGE HAS NO ARTICLE LINK", route)
    caps = re.findall(r'data-mcap="([^"]*)"', body)
    if len(caps) != len(COVERAGE) or any(not c for c in caps):
        bad += 1; print("COVERAGE MISSING MARKET CAP", route, caps)
    if f">{label}</a>" not in s:
        bad += 1; print("NAV LABEL", route, label)
    if category not in s:
        bad += 1; print("CATEGORY NAV MISSING", route, category)
for home, needle, label in (("hr/index.html", "hr/tvrtke/", "Tvrtke"), ("en/index.html", "en/companies/", "Companies")):
    s = (D / home).read_text() if (D / home).exists() else ""
    if needle not in s or f">{label}</a>" not in s:
        bad += 1; print("HOME NAV/FOOTER", home, needle, label)
sm = D / "sitemap.xml"
if sm.exists():
    text = sm.read_text()
    for route in ROUTES:
        if route not in text:
            bad += 1; print("SITEMAP MISSING", route)
print(f"checked {n} links, {bad} problems"); sys.exit(1 if bad else 0)
