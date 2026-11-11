#!/usr/bin/env python3
"""Generate Lupa app icon, Android adaptive icon layers and splash image from the site's brand mark
(magnifier from /assets/favicon.svg + header logo; colours from style.css). Needs Pillow."""
from PIL import Image, ImageDraw, ImageFont
import pathlib
A = pathlib.Path(__file__).resolve().parent.parent / "assets"
DEEP, PAPER, AMBER, TEAL, INK = "#0b1f1d", "#f6f3ec", "#c9852a", "#0e5a50", "#14201e"
SS = 4  # supersampling

def mark(draw, cx, cy, size, ring, handle):
    """Magnifier in a size×size box centred at (cx, cy) — same geometry as the site's 40×40 logo mark."""
    u = size / 40.0; x0, y0 = cx - size / 2, cy - size / 2
    r, w = 10.5 * u, 4 * u
    c = (x0 + 16 * u, y0 + 16 * u)
    draw.ellipse([c[0] - r - w / 2, c[1] - r - w / 2, c[0] + r + w / 2, c[1] + r + w / 2], outline=ring, width=round(w))
    hw = 5 * u; p1, p2 = (x0 + 24 * u, y0 + 24 * u), (x0 + 35 * u, y0 + 35 * u)
    import math
    dx, dy = p2[0] - p1[0], p2[1] - p1[1]; L = math.hypot(dx, dy); nx, ny = -dy / L * hw / 2, dx / L * hw / 2
    draw.polygon([(p1[0] + nx, p1[1] + ny), (p2[0] + nx, p2[1] + ny), (p2[0] - nx, p2[1] - ny), (p1[0] - nx, p1[1] - ny)], fill=handle)
    for p in (p1, p2): draw.ellipse([p[0] - hw / 2, p[1] - hw / 2, p[0] + hw / 2, p[1] + hw / 2], fill=handle)

def canvas(size, bg):
    im = Image.new("RGBA", (size * SS, size * SS), bg); return im, ImageDraw.Draw(im)
def save(im, name, size): im.resize((size, size), Image.LANCZOS).save(A / name); print("wrote", name)

# iOS / generic icon: deep green, paper ring, amber handle (no transparency — App Store requirement)
im, d = canvas(1024, DEEP); mark(d, 512 * SS, 512 * SS, 700 * SS, PAPER, AMBER); save(im.convert("RGB"), "icon.png", 1024)
# Android adaptive: foreground inside the 66% safe zone, solid background, monochrome (themed icons)
im, d = canvas(1024, (0, 0, 0, 0)); mark(d, 512 * SS, 512 * SS, 440 * SS, PAPER, AMBER); save(im, "android-icon-foreground.png", 1024)
im, d = canvas(1024, DEEP); save(im, "android-icon-background.png", 1024)
im, d = canvas(1024, (0, 0, 0, 0)); mark(d, 512 * SS, 512 * SS, 440 * SS, "white", "white"); save(im, "android-icon-monochrome.png", 1024)
# Splash: wordmark "Lupa" + amber mark on paper (shown centred on a paper background by expo-splash-screen)
W, H = 1200, 480
im = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
f = ImageFont.truetype(str(A / "fonts" / "Newsreader_600SemiBold.ttf"), 300 * SS)
t = ImageFont.truetype(str(A / "fonts" / "Newsreader_400Regular_Italic.ttf"), 64 * SS)
bw = d.textbbox((0, 0), "Lupa", font=f); tw = bw[2] - bw[0]; ms = 170 * SS
x = (W * SS - (tw + 30 * SS + ms)) / 2
d.text((x - bw[0], 40 * SS - bw[1] + 10 * SS), "Lupa", font=f, fill=INK)
mark(d, x + tw + 30 * SS + ms / 2, 40 * SS + (bw[3] - bw[1]) / 2 + 30 * SS, ms, AMBER, AMBER)
sub = "Istraživanje malih dionica · Small-cap research"; sb = d.textbbox((0, 0), sub, font=t)
d.text(((W * SS - (sb[2] - sb[0])) / 2, 370 * SS), sub, font=t, fill="#5f6b67")
im.resize((W, H), Image.LANCZOS).save(A / "splash-icon.png"); print("wrote splash-icon.png")
im, d = canvas(48, (0, 0, 0, 0)); mark(d, 24 * SS, 24 * SS, 44 * SS, INK, TEAL); save(im, "favicon.png", 48)
# In-app logo mark (amber magnifier, transparent) used next to the "Lupa" wordmark in the header
im, d = canvas(128, (0, 0, 0, 0)); mark(d, 64 * SS, 64 * SS, 124 * SS, AMBER, AMBER); save(im, "mark.png", 128)
im, d = canvas(64, (0, 0, 0, 0)); mark(d, 32 * SS, 32 * SS, 60 * SS, "#8a5410", "#8a5410"); save(im, "lock-mark.png", 64)
