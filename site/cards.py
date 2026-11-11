"""Share cards (1200×630 PNG) for company profiles and the track record: the image social networks show when a Lupa
link is posted, and what the app's Share button points to. Needs Pillow (`pip install pillow`); build.py skips the
cards silently when it is missing. Fonts: the same OFL families as the site, from ../app/assets/fonts."""
import pathlib
from PIL import Image, ImageDraw, ImageFont   # ImportError here → build.py prints "share cards skipped"
import tracker

FONTS = pathlib.Path(__file__).resolve().parent.parent / "app" / "assets" / "fonts"
W, H = 1200, 630
DEEP, PAPER, TEAL, AMBER, UP, DOWN, MUTED = "#0b1f1d", "#f6f3ec", "#5fd39a", "#c9852a", "#5fd39a", "#ff8a80", "#9fb3ae"

def font(name, size): return ImageFont.truetype(str(FONTS / name), size)

def fit(draw, text, name, size, max_w, min_size=28):
    while size > min_size and draw.textlength(text, font=font(name, size)) > max_w: size -= 2
    return font(name, size)

def pct(x, L):
    s = f"{abs(x):.1f}".replace(".", "," if L == "hr" else ".")
    return ("+" if x > 0 else "−" if x < 0 else "±") + s + (" %" if L == "hr" else "%")

def base(kicker):
    im = Image.new("RGB", (W, H), DEEP); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 10], fill=AMBER)
    d.text((64, 54), "Lupa", font=font("Newsreader_600SemiBold.ttf", 54), fill=PAPER)
    d.text((W - 64, 78), kicker.upper(), font=font("IBMPlexSans_600SemiBold.ttf", 22), fill=MUTED, anchor="rs")
    d.text((64, H - 52), "lupa · small-cap research", font=font("IBMPlexMono_400Regular.ttf", 22), fill=MUTED)
    return im, d

def company_card(v, L, path):
    hr = L == "hr"
    im, d = base("Tvrtka" if hr else "Company")
    d.text((64, 170), v["ticker"], font=font("IBMPlexMono_500Medium.ttf", 96), fill=PAPER)
    d.text((64, 290), v["name"], font=fit(d, v["name"], "Newsreader_500Medium.ttf", 50, W - 128), fill=PAPER)
    y = 400
    if v["since"]:
        s = v["since"]
        d.text((64, y), "Od naše analize" if hr else "Since our analysis", font=font("IBMPlexSans_400Regular.ttf", 28), fill=MUTED)
        d.text((64, y + 40), pct(s["pct"], L), font=font("IBMPlexMono_500Medium.ttf", 64), fill=UP if s["pct"] >= 0 else DOWN)
    elif v["price"]:
        d.text((64, y), "Zadnje zatvaranje" if hr else "Latest close", font=font("IBMPlexSans_400Regular.ttf", 28), fill=MUTED)
        d.text((64, y + 40), f"{v['price']['last']:.2f} {v['price']['currency']}".replace(".", "," if hr else "."), font=font("IBMPlexMono_500Medium.ttf", 64), fill=PAPER)
    i = v["insider"]
    d.text((640, y), "Uprava, 12 mj." if hr else "Insiders, 12 mo", font=font("IBMPlexSans_400Regular.ttf", 28), fill=MUTED)
    d.text((640, y + 46), f"{i['buys']} " + ("kupnji" if hr else "buys"), font=font("IBMPlexMono_500Medium.ttf", 44), fill=UP)
    d.text((900, y + 46), f"{i['sells']} " + ("prodaja" if hr else "sales"), font=font("IBMPlexMono_500Medium.ttf", 44), fill=DOWN)
    im.save(path, optimize=True)

def track_card(score, posts, L, path):
    hr = L == "hr"
    im, d = base("Rezultati analiza" if hr else "Track record")
    d.text((64, 150), "Što se dogodilo nakon naših analiza" if hr else "What happened after our analyses", font=font("Newsreader_500Medium.ttf", 46), fill=PAPER)
    y = 250
    for r in score[:5]:
        d.text((64, y), r["ticker"], font=font("IBMPlexMono_500Medium.ttf", 40), fill=PAPER)
        d.text((260, y + 6), r["name"], font=fit(d, r["name"], "IBMPlexSans_400Regular.ttf", 30, 560, 20), fill=MUTED)
        d.text((W - 64, y), pct(r["pct"], L), font=font("IBMPlexMono_500Medium.ttf", 40), fill=UP if r["pct"] >= 0 else DOWN, anchor="ra")
        y += 62
    im.save(path, optimize=True)

def make_all(out, views, score, posts):
    """Writes dist/assets/cards/*.png and returns {(ticker | 'track', lang): 'assets/cards/…png'} for og:image."""
    if not (FONTS / "Newsreader_600SemiBold.ttf").exists(): raise ImportError(f"fonts not found in {FONTS}")
    folder = out / "assets" / "cards"; folder.mkdir(parents=True, exist_ok=True); done = {}
    for L in tracker.LANGS:
        for t, v in views.items():
            name = f"{t.lower()}-{L}.png"; company_card(v, L, folder / name); done[(t, L)] = f"assets/cards/{name}"
        name = f"track-{L}.png"; track_card(score, posts, L, folder / name); done[("track", L)] = f"assets/cards/{name}"
    return done
