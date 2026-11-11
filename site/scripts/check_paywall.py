#!/usr/bin/env python3
"""Fail if any subscriber-only text leaks into the public build (dist/: HTML, RSS, sitemap, JS, CSS, JSON).

For every private/paid/<post>.<lang>.html it takes each paragraph / list item / table cell sentence with
>= 8 words and checks that it does not appear anywhere in dist/. Run after build.py; package_vercel.py runs it too."""
import re, html, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST, PRIV = ROOT / "dist", ROOT / "private" / "paid"
def norm(s): return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()
public = "\n".join(norm(f.read_text(errors="ignore")) for f in DIST.rglob("*") if f.is_file() and f.suffix in (".html", ".xml", ".js", ".css", ".json", ".txt"))
bad = checked = 0
files = sorted(PRIV.glob("*.html")) if PRIV.exists() else []
for f in files:
    for block in re.findall(r"<(?:p|li|td|blockquote)[^>]*>(.*?)</(?:p|li|td|blockquote)>", f.read_text(), flags=re.S):
        for sent in re.split(r"(?<=[.!?])\s+", norm(block)):
            if len(sent.split()) < 8: continue
            checked += 1
            if sent in public: bad += 1; print("LEAK", f.name, "→", sent[:100])
print(f"paywall: {len(files)} private bodies, {checked} sentences checked, {bad} leaks")
sys.exit(1 if bad or (files == [] and "--allow-empty" not in sys.argv) else 0)
