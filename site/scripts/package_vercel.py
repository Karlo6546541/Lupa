#!/usr/bin/env python3
"""Package dist/ + api/ + private/ into a Vercel Build Output API v3 tree and a single deployable archive.

    python3 build.py --base-url https://lupa-lovat.vercel.app
    python3 scripts/check_links.py && python3 scripts/check_paywall.py
    python3 scripts/package_vercel.py            # → .vercel/output/ and site.tgz

site.tgz contains ONLY `.vercel/output/` (static files + Node functions + routing config). The Vercel project's
build command is `tar -xzf site.tgz`, which recreates `.vercel/output/` on Vercel; Vercel then serves it as-is
(static site + /api/* functions). Subscriber-only bodies are copied ONLY into the article function bundle,
never into static/. The script refuses to package if check_paywall.py finds a leak."""
import json, pathlib, shutil, subprocess, sys, tarfile
ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST, API, PRIV = ROOT / "dist", ROOT / "api", ROOT / "private"
OUT = ROOT / ".vercel" / "output"
FUNCS = ["checkout", "session", "article", "portal", "logout", "stripe-webhook", "login",
         "app-entitlement", "app-article"]          # app-* = Lupa mobile app (store subscriptions), see api/store-verify.js
# Vercel Hobby plan: max 12 functions per deployment. We ship 9; keep it <= 12 (login also handles the emailed link,
# checkout also handles the Stripe success redirect).
assert len(FUNCS) <= 12, "too many functions for the Vercel Hobby plan"
STORE_FUNCS = {"app-entitlement", "app-article"}   # these also need api/store-verify.js
PAID_FUNCS = {"article", "app-article"}            # the only bundles that receive private/paid
RUNTIME = "nodejs22.x"

# Mobile-app feed (public content only) → dist/app/v1/feed.json; written BEFORE the leak check so it is scanned too.
r = subprocess.run([sys.executable, str(ROOT / "scripts" / "export_app_feed.py")])
if r.returncode: sys.exit("ABORT: app feed export failed — nothing packaged")
r = subprocess.run([sys.executable, str(ROOT / "scripts" / "check_paywall.py")])
if r.returncode: sys.exit("ABORT: paywall leak check failed — nothing packaged")

if OUT.exists(): shutil.rmtree(OUT)
shutil.copytree(DIST, OUT / "static", ignore=shutil.ignore_patterns(".nojekyll"))
for name in FUNCS:
    fd = OUT / "functions" / "api" / f"{name}.func"; fd.mkdir(parents=True)
    shutil.copy(API / f"{name}.js", fd / "index.js")
    shutil.copy(API / "lib.js", fd / "lib.js")
    (fd / ".vc-config.json").write_text(json.dumps({"runtime": RUNTIME, "handler": "index.js", "launcherType": "Nodejs",
                                                    "shouldAddHelpers": False, "maxDuration": 10}))
    if name in STORE_FUNCS:
        shutil.copy(API / "store-verify.js", fd / "store-verify.js")
    if name in PAID_FUNCS:
        shutil.copytree(PRIV / "paid", fd / "paid")
        shutil.copy(PRIV / "paid-index.json", fd / "paid-index.json")

SEC = {"X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "SAMEORIGIN",
       "Strict-Transport-Security": "max-age=31536000"}
config = {"version": 3, "routes": [
    {"src": "^/hr/podrzi-lupu/?$", "status": 308, "headers": {"Location": "/hr/pretplata/"}},
    {"src": "^/en/support/?$", "status": 308, "headers": {"Location": "/en/subscribe/"}},
    {"src": "^/(.*)$", "headers": SEC, "continue": True},
    {"src": "^/assets/(.*)$", "headers": {"Cache-Control": "public, max-age=3600"}, "continue": True},
    {"src": "^/app/v1/(.*)$", "headers": {"Cache-Control": "public, max-age=300"}, "continue": True},
    {"handle": "filesystem"},
    {"handle": "error"},
    {"status": 404, "src": "^(?!/api/).*$", "dest": "/404.html"},
]}
(OUT / "config.json").write_text(json.dumps(config, indent=1))

tgz = ROOT / "site.tgz"
with tarfile.open(tgz, "w:gz") as t:
    t.add(OUT, arcname=".vercel/output")
static_n = sum(1 for _ in (OUT / "static").rglob("*") if _.is_file())
print(f"packaged {static_n} static files + {len(FUNCS)} functions → {tgz.name} ({tgz.stat().st_size/1e6:.1f} MB)")
