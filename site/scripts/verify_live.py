#!/usr/bin/env python3
"""Anonymous live check: fetch every public URL (sitemap + feeds + assets) and make sure no subscriber-only sentence is served.
    python3 scripts/verify_live.py https://lupa-lovat.vercel.app"""
import re, sys, html, json, pathlib, urllib.request, urllib.error
ROOT = pathlib.Path(__file__).resolve().parent.parent
B = (sys.argv[1] if len(sys.argv) > 1 else "https://lupa-lovat.vercel.app").rstrip("/")
def get(u):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "lupa-verify"}), timeout=30) as r: return r.status, r.read().decode("utf-8", "ignore")
    except urllib.error.HTTPError as e: return e.code, e.read().decode("utf-8", "ignore")
def norm(s): return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()
sents = []
for f in (ROOT / "private" / "paid").glob("*.html"):
    for b in re.findall(r"<(?:p|li|td|blockquote)[^>]*>(.*?)</(?:p|li|td|blockquote)>", f.read_text(), flags=re.S):
        sents += [s for s in re.split(r"(?<=[.!?])\s+", norm(b)) if len(s.split()) >= 8]
st, sm = get(B + "/sitemap.xml"); urls = re.findall(r"<loc>([^<]+)</loc>", sm)
urls += [B + p for p in ["/", "/hr/feed.xml", "/en/feed.xml", "/robots.txt", "/assets/js/site.js", "/assets/css/style.css", "/404.html", "/api/session",
                         "/api/article?post=2026-11-11-ginkgo-bioworks&lang=hr", "/api/article?post=2026-11-11-infleqtion&lang=en"]]
leaks = bad = 0
for u in urls:
    st, body = get(u); t = norm(body)
    hit = [s for s in sents if s in t]
    exp_ok = st in (200,) or (u.startswith(B + "/api/article") and st in (401, 402, 503))
    if not exp_ok: bad += 1
    if hit: leaks += len(hit)
    print(f"{st} {'LEAK x%d ' % len(hit) if hit else ''}{u}")
print(f"{len(urls)} URLs, {len(sents)} private sentences, {leaks} leaks, {bad} unexpected statuses")
sys.exit(1 if leaks or bad else 0)
