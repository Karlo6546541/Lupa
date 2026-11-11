#!/usr/bin/env python3
"""Build optimised image derivatives: content/images/<name>.jpg -> src/assets/img/<name>-{480,800,full}.{webp,jpg} + <name>-og.jpg (1200x630).
Requires Pillow (pip install pillow). Re-run only when you add or change an image; outputs are committed."""
import pathlib, json
from PIL import Image
ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "content" / "images"; OUT = ROOT / "src" / "assets" / "img"; OUT.mkdir(parents=True, exist_ok=True)
manifest = {}
for f in sorted(SRC.glob("*.jpg")):
    im = Image.open(f).convert("RGB"); W, H = im.size; name = f.stem; widths = []
    for w in (480, 800, W):
        if w > W or w in widths: continue
        r = im if w == W else im.resize((w, round(H * w / W)), Image.LANCZOS)
        r.save(OUT / f"{name}-{w}.webp", "WEBP", quality=78, method=6)
        r.save(OUT / f"{name}-{w}.jpg", "JPEG", quality=80, optimize=True, progressive=True)
        widths.append(w)
    # Open Graph 1200x630 centre crop
    s = max(1200 / W, 630 / H); r = im.resize((round(W * s), round(H * s)), Image.LANCZOS)
    l = (r.width - 1200) // 2; t = (r.height - 630) // 2
    r.crop((l, t, l + 1200, t + 630)).save(OUT / f"{name}-og.jpg", "JPEG", quality=82, optimize=True, progressive=True)
    manifest[name] = {"w": W, "h": H, "widths": widths}
    print(name, W, H, widths)
(OUT / "manifest.json").write_text(json.dumps(manifest, indent=1))
