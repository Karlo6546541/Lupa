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
print(f"checked {n} links, {bad} problems"); sys.exit(1 if bad else 0)
