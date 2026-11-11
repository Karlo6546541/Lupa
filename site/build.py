#!/usr/bin/env python3
"""Lupa static site generator. Zero dependencies (Python 3.9+).

    python3 build.py                      # relative links, works on any host / sub-path
    python3 build.py --base-url https://user.github.io/lupa   # adds absolute canonical/hreflang, sitemap.xml, RSS

Output: ./dist
"""
import json, re, shutil, sys, html, datetime, pathlib, argparse
from zoneinfo import ZoneInfo

ROOT = pathlib.Path(__file__).resolve().parent
CONTENT = ROOT / "content"; DATA = ROOT / "data"; SRC = ROOT / "src"; OUT = ROOT / "dist"
LANGS = ("hr", "en")
NY = ZoneInfo("America/New_York"); ZG = ZoneInfo("Europe/Zagreb")

PRIVATE = ROOT / "private"   # subscriber-only article bodies; NEVER published as static files (bundled into the API function only)
ap = argparse.ArgumentParser(); ap.add_argument("--base-url", default=""); ap.add_argument("--out", default=str(OUT))
ap.add_argument("--private-out", default=str(PRIVATE))
ARGS = ap.parse_args(); BASE = ARGS.base_url.rstrip("/"); OUT = pathlib.Path(ARGS.out); PRIVATE = pathlib.Path(ARGS.private_out)

SITE = json.loads((CONTENT / "site.json").read_text())
CATS = {c["id"]: c for c in SITE["categories"]}
FUND = json.loads((DATA / "fundamentals.json").read_text()) if (DATA / "fundamentals.json").exists() else {}
LATEST = json.loads((DATA / "prices.json").read_text())

T = {  # UI strings
 "hr": dict(home="Naslovnica", archive="Arhiva", about="O nama", disclaimer="Izjava o odgovornosti", latest="Najnovije",
            all_articles="Svi članci", read="min čitanja", sources="Izvori", byline="Uredništvo Lupe", published="Objavljeno",
            source_px="Izvor cijene", close="Zatvaranje", chg="promjena", m1="1 mj.", lang_name="Hrvatski", other="English",
            not_advice="Lupa objavljuje nezavisna istraživanja i komentare. Ništa ovdje nije investicijski savjet ni preporuka za kupnju ili prodaju vrijednosnih papira.",
            more="Opširnije", beat="Što pratimo", in_cat="U rubrici", related="Još iz Lupe", tape_note="Zatvaranje", empty="Ovdje još nema članaka.",
            skip="Preskoči na sadržaj", sections="Rubrike", price_note="Cijene su zaključne cijene navedene sesije (podaci s odgodom) i ne ažuriraju se nakon objave.",
            notfound="Stranica nije pronađena", notfound_p="Ova adresa ne postoji ili je premještena.", rights="Sva prava pridržana.", footer_lang="Jezik", mcap="Tržišna kapitalizacija", markets_now="Tržište u brojkama", data_time="podatak od"),
 "en": dict(home="Home", archive="Archive", about="About", disclaimer="Disclaimer", latest="Latest",
            all_articles="All articles", read="min read", sources="Sources", byline="Lupa research desk", published="Published",
            source_px="Price source", close="Close", chg="change", m1="1 mo", lang_name="English", other="Hrvatski",
            not_advice="Lupa publishes independent research and commentary. Nothing here is investment advice or a recommendation to buy or sell any security.",
            more="Read more", beat="Our beat", in_cat="Filed under", related="More from Lupa", tape_note="Close", empty="No articles here yet.",
            skip="Skip to content", sections="Sections", price_note="Prices are closing prices for the stated session (delayed data) and are not updated after publication.",
            notfound="Page not found", notfound_p="This address does not exist or has moved.", rights="All rights reserved.", footer_lang="Language", mcap="Market cap", markets_now="Markets in numbers", data_time="data as of"),
}
PATHS = {"hr": dict(articles="clanci", cat="rubrika", archive="arhiva", about="o-nama", disclaimer="izjava-o-odgovornosti",
                    newsletter="newsletter", advertise="oglasavanje", subscribe="pretplata", account="racun",
                    privacy="privatnost", terms="uvjeti", companies="tvrtke", calendar="kalendar", track="rezultati"),
         "en": dict(articles="articles", cat="category", archive="archive", about="about", disclaimer="disclaimer",
                    newsletter="newsletter", advertise="advertise", subscribe="subscribe", account="account",
                    privacy="privacy", terms="terms", companies="companies", calendar="calendar", track="track-record")}
OLD_PATHS = {"hr": "podrzi-lupu", "en": "support"}  # retired donation page → 308 to the subscribe page (see scripts/package_vercel.py)
MON = json.loads((CONTENT / "monetization.json").read_text())
IMAGES = json.loads((CONTENT / "images.json").read_text())
IMG_MANIFEST = json.loads((SRC / "assets" / "img" / "manifest.json").read_text())
MONTHS_HR = ["siječnja","veljače","ožujka","travnja","svibnja","lipnja","srpnja","kolovoza","rujna","listopada","studenoga","prosinca"]
MONTHS_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"]

def esc(s): return html.escape(str(s), quote=True)

def fmt_date(d, lang):
    d = datetime.date.fromisoformat(d[:10])
    return f"{d.day}. {MONTHS_HR[d.month-1]} {d.year}." if lang == "hr" else f"{d.day} {MONTHS_EN[d.month-1]} {d.year}"

def fmt_num(x, lang, dec=2, sign=False):
    s = f"{abs(x):,.{dec}f}"
    if lang == "hr": s = s.replace(",", "§").replace(".", ",").replace("§", ".")
    if sign: s = ("+" if x > 0 else "−" if x < 0 else "±") + s
    elif x < 0: s = "−" + s
    return s

def fmt_pct(x, lang, sign=True):
    n = fmt_num(x, lang, 2, sign)
    return f"{n} %" if lang == "hr" else f"{n}%"

def decimals(v): return 4 if v["last"] < 1 else 2

def cls(x): return "up" if x > 0 else "down" if x < 0 else "flat"

def as_of_text(v, lang):
    # v["as_of"] like "2026-11-10 16:00 ET"
    dt = datetime.datetime.strptime(v["as_of"].replace(" ET", ""), "%Y-%m-%d %H:%M").replace(tzinfo=NY)
    z = dt.astimezone(ZG); zn = z.tzname()
    if lang == "hr":
        return f"{dt:%H:%M} ET ({z:%H:%M} {zn}, zagrebačko vrijeme)"
    return f"{dt:%H:%M} ET ({z:%H:%M} {zn} Zagreb)"

SNAP_CACHE = {}
def snapshot(session):
    if not session: return LATEST
    if session not in SNAP_CACHE:
        f = DATA / "snapshots" / f"{session}.json"
        SNAP_CACHE[session] = json.loads(f.read_text()) if f.exists() else {}
    return SNAP_CACHE[session]

def get_px(sym, session):
    snap = snapshot(session)
    if sym not in snap: raise SystemExit(f"ERROR: no price for {sym} in snapshot {session}. Run scripts/update_prices.py {sym}")
    return snap[sym]

INDEX_NAMES = {"^GSPC": "S&P 500", "^IXIC": "Nasdaq Composite", "^RUT": "Russell 2000", "^DJI": "Dow Jones", "^VIX": "VIX"}
def label(sym, v=None): return INDEX_NAMES.get(sym, sym.lstrip("^"))

def sparkline(v):
    pts = [c for _, c in v["closes"]]
    if len(pts) < 2: return ""
    lo, hi = min(pts), max(pts); rng = (hi - lo) or 1
    W, H = 300, 56; step = W / (len(pts) - 1)
    xy = [(i * step, H - 4 - (p - lo) / rng * (H - 8)) for i, p in enumerate(pts)]
    poly = " ".join(f"{x:.1f},{y:.1f}" for x, y in xy)
    col = "var(--up)" if pts[-1] >= pts[0] else "var(--down)"
    area = f"0,{H} " + poly + f" {W},{H}"
    return (f'<svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" role="img" aria-label="{esc(v["closes"][0][0])} – {esc(v["closes"][-1][0])}">'
            f'<polygon points="{area}" fill="{col}" opacity=".08"/><polyline points="{poly}" fill="none" stroke="{col}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>')

def quote_box(sym, session, lang):
    v = get_px(sym, session); t = T[lang]; d = decimals(v)
    first, last = v["closes"][0], v["closes"][-1]
    m1 = (last[1] / first[1] - 1) * 100
    cur = "" if v.get("type") == "INDEX" else f'<small>{esc(v["currency"])}</small>'
    name = v.get("name") or sym
    mc = FUND.get(sym, {}).get("market_cap_usd")
    mc_html = f' · {t["mcap"]} ≈ {esc(fmt_cap(mc, lang))} USD' if mc else ""
    return (f'<figure class="quote"><div class="quote-top"><div><div class="sym">{esc(label(sym))}</div>'
            f'<div class="nm">{esc(sym if v.get("type")=="INDEX" else name)} · {esc(v.get("exchange",""))}{mc_html}</div></div>'
            f'<div><div class="px">{fmt_num(v["last"], lang, d)}{cur}</div>'
            f'<div class="chg {cls(v["change"])}">{fmt_num(v["change"], lang, d, True)} ({fmt_pct(v["change_pct"], lang)})</div></div></div>'
            f'{sparkline(v)}'
            f'<figcaption class="quote-foot"><span>{t["close"]} {fmt_date(v["session_date"], lang)} · {t["data_time"]} {as_of_text(v, lang)}</span>'
            f'<span>{t["m1"]}: <span class="{cls(m1)}">{fmt_pct(m1, lang)}</span> · {t["source_px"]}: <a href="{esc(v["source_url"])}" rel="noopener">{esc(v["source"])}</a></span></figcaption></figure>')

def fmt_cap(mc, lang):
    num, unit = float(mc[:-1]), mc[-1]
    if lang == "hr": return fmt_num(num, "hr", 2) + (" mlrd." if unit == "B" else " mil.")
    return f"{num:,.2f}" + ("bn" if unit == "B" else "m")

def chip(sym, session, lang):
    v = get_px(sym, session); d = decimals(v)
    cur = "" if v.get("type") == "INDEX" else " " + v["currency"]
    return (f'<span class="chip"><b>{esc(label(sym))}</b> {fmt_num(v["last"], lang, d)}{esc(cur)} '
            f'<span class="{cls(v["change"])}">{fmt_pct(v["change_pct"], lang)}</span></span>')

def expand_tokens(body, session, lang):
    def rep(m):
        kind, arg = m.group(1), m.group(2).strip()
        if kind == "quote": return quote_box(arg, session, lang)
        if kind == "quotes":
            syms = [s.strip() for s in arg.split(",") if s.strip()]
            return '<div class="quote-grid">' + "".join(quote_box(s, session, lang) for s in syms) + "</div>"
        v = get_px(arg, session); d = decimals(v)
        if kind == "q": return chip(arg, session, lang)
        if kind == "px": return f'<span class="num">{fmt_num(v["last"], lang, d)}</span>'
        if kind == "chg": return f'<span class="num {cls(v["change"])}">{fmt_pct(v["change_pct"], lang)}</span>'
        if kind == "chgabs": return f'<span class="num {cls(v["change"])}">{fmt_num(v["change"], lang, d, True)}</span>'
        if kind == "prev": return f'<span class="num">{fmt_num(v["prev_close"], lang, d)}</span>'
        if kind == "m1":
            m1 = (v["closes"][-1][1] / v["closes"][0][1] - 1) * 100
            return f'<span class="num {cls(m1)}">{fmt_pct(m1, lang)}</span>'
        if kind == "hi52": return f'<span class="num">{fmt_num(v["high52"], lang, d)}</span>'
        if kind == "lo52": return f'<span class="num">{fmt_num(v["low52"], lang, d)}</span>'
        if kind == "off52":
            o = (v["last"] / v["high52"] - 1) * 100
            return f'<span class="num {cls(o)}">{fmt_pct(o, lang)}</span>'
        raise SystemExit(f"Unknown token {kind}")
    return re.sub(r"\{\{(quotes|quote|q|px|chgabs|chg|prev|m1|hi52|lo52|off52):([^}]+)\}\}", rep, body)

# ---------- load content ----------
def load_posts():
    posts = []
    for d in sorted((CONTENT / "posts").iterdir()):
        if not d.is_dir() or d.name.startswith("_"): continue
        m = json.loads((d / "meta.json").read_text())
        if m.get("draft"): continue
        for L in LANGS:
            if not (d / f"{L}.html").exists(): raise SystemExit(f"ERROR: {d.name} missing {L}.html (every post must exist in both languages)")
            m.setdefault("body", {})[L] = (d / f"{L}.html").read_text()
        m["dir"] = d.name
        for c in m["categories"]:
            if c not in CATS: raise SystemExit(f"ERROR: {d.name}: unknown category {c}")
        posts.append(m)
    posts.sort(key=lambda p: (p["date"], p.get("order", 0)), reverse=True)
    return posts

def load_pages():
    pages = {}
    for d in sorted((CONTENT / "pages").iterdir()):
        m = json.loads((d / "meta.json").read_text())
        for L in LANGS: m.setdefault("body", {})[L] = (d / f"{L}.html").read_text()
        pages[d.name] = m
    return pages

# ---------- URL helpers (all output paths are directories with index.html) ----------
def p_home(L): return f"{L}/"
def p_post(p, L): return f"{L}/{PATHS[L]['articles']}/{p['slug'][L]}/"
def p_cat(cid, L): return f"{L}/{PATHS[L]['cat']}/{CATS[cid][L]['slug']}/"
def p_archive(L): return f"{L}/{PATHS[L]['archive']}/"
def p_page(key, L): return f"{L}/{PATHS[L][key]}/"

def rel(frm, to):
    """relative href from page dir `frm` (e.g. 'hr/clanci/x/') to target path `to`"""
    depth = frm.count("/") if frm else 0
    return ("../" * depth) + to if (("../" * depth) + to) else "./"

def absu(path): return f"{BASE}/{path}" if BASE else None

# ---------- extra UI strings (design + monetization) ----------
T2 = {
 "hr": dict(newsletter="Newsletter", support="Pretplata", advertise="Oglašavanje", menu="Izbornik", close_menu="Zatvori izbornik",
            read_story="Pročitaj analizu", ill="Ilustracija: Lupa", on_page="U ovom tekstu", sponsored="Sponzorirano", partner="Partner",
            sponsored_note="Ovaj sadržaj plaćen je od strane navedenog partnera. Uredništvo Lupe zadržalo je potpunu uredničku kontrolu, a tekst nije preporuka za ulaganje.",
            ad="Oglas", ad_house="Oglasni prostor", ad_house_t="Dođite do čitatelja koji istražuju male tvrtke.", ad_house_cta="Oglašavanje na Lupi",
            nl_kicker="Besplatni newsletter", nl_title="Lupa u sandučiću, radnim danima ujutro",
            nl_text="Pregled američke sesije, popis „Danas na radaru” i nove analize. Kratko, s izvorima, bez preporuka za kupnju.",
            nl_email="Vaša e-adresa", nl_lang="Jezik newslettera", nl_submit="Prijavi me", nl_hr="Hrvatski", nl_en="English",
            nl_privacy="Koristimo samo vašu e-adresu, samo za newsletter. Ne prodajemo je i ne dijelimo. Odjava je moguća u svakom trenutku.",
            nl_demo="Automatska prijava još nije uključena: klikom se otvara e-poruka uredništvu s vašom prijavom.",
            nl_ok="Hvala! Otvorili smo vašu aplikaciju za e-poštu s pripremljenom prijavom. Pošaljite poruku i dodat ćemo vas na popis.",
            nl_ok_live="Hvala! Provjerite sandučić i potvrdite prijavu.", nl_bad="Upišite ispravnu e-adresu.",
            more_from="Još iz Lupe", explore="Istražite rubrike", support_strip="Pregledi tržišta i radar besplatni su za sve. Dubinske analize tvrtki u cijelosti čitaju pretplatnici — 7 € mjesečno, otkazivanje u bilo kojem trenutku.",
            support_cta="Pretplata na Lupu", story_count="članaka", privacy="Pravila privatnosti", terms="Uvjeti korištenja"),
 "en": dict(newsletter="Newsletter", support="Subscribe", advertise="Advertise", menu="Menu", close_menu="Close menu",
            read_story="Read the analysis", ill="Illustration: Lupa", on_page="In this piece", sponsored="Sponsored", partner="Partner",
            sponsored_note="This content was paid for by the partner named above. Lupa's editors kept full editorial control, and it is not an investment recommendation.",
            ad="Advertisement", ad_house="Ad space", ad_house_t="Reach readers who research small companies.", ad_house_cta="Advertise on Lupa",
            nl_kicker="Free newsletter", nl_title="Lupa in your inbox, weekday mornings",
            nl_text="The US session in brief, the “On the radar” watchlist and new deep dives. Short, sourced, no buy recommendations.",
            nl_email="Your email address", nl_lang="Newsletter language", nl_submit="Sign me up", nl_hr="Hrvatski", nl_en="English",
            nl_privacy="We use your email address only for the newsletter. We never sell or share it, and you can unsubscribe at any time.",
            nl_demo="Automatic sign-up is not switched on yet: submitting opens an email to the editors with your request.",
            nl_ok="Thank you! We opened your email app with a prepared sign-up message. Send it and we will add you to the list.",
            nl_ok_live="Thank you! Check your inbox to confirm your subscription.", nl_bad="Please enter a valid email address.",
            more_from="More from Lupa", explore="Explore the sections", support_strip="Market wraps and the radar are free for everyone. Subscribers read the company deep dives in full — €7 a month, cancel anytime.",
            support_cta="Lupa subscription", story_count="articles", privacy="Privacy policy", terms="Terms of use"),
}
T3 = {  # paywall / subscription strings
 "hr": dict(paid_badge="Za pretplatnike", account="Moj račun", plan_name="Pretplata na Lupu", price_line="7 € mjesečno",
            price_big='7 €<span> / mjesečno</span>', cancel_any="Otkazivanje u bilo kojem trenutku.",
            gate_kicker="Za pretplatnike", gate_title="Ostatak ove analize čitaju pretplatnici",
            gate_text="Pročitali ste uvodni dio. Cijela dubinska analiza — brojke, novac, rizici i zaključak Lupe — dostupna je uz pretplatu na Lupu. Pregledi tržišta i radar ostaju besplatni za sve.",
            gate_next="U nastavku", gate_btn="Pretplati se — 7 € mjesečno", gate_more="Što dobivam pretplatom", gate_have="Već ste pretplatnik?", gate_manage="Moj račun",
            gate_checking="Provjeravamo pretplatu…", gate_err="Sadržaj trenutačno nije moguće učitati. Osvježite stranicu ili pokušajte malo kasnije.",
            gate_nojs="Za čitanje cijele analize u pregledniku treba biti uključen JavaScript."),
 "en": dict(paid_badge="For subscribers", account="My account", plan_name="Lupa subscription", price_line="€7 a month",
            price_big='€7<span> / month</span>', cancel_any="Cancel anytime.",
            gate_kicker="For subscribers", gate_title="The rest of this analysis is for subscribers",
            gate_text="You have read the opening. The full deep dive — the numbers, the cash, the risks and Lupa's take — is available with a Lupa subscription. Market wraps and the radar stay free for everyone.",
            gate_next="Still to come", gate_btn="Subscribe — €7 a month", gate_more="What a subscription includes", gate_have="Already a subscriber?", gate_manage="My account",
            gate_checking="Checking your subscription…", gate_err="The article could not be loaded right now. Refresh the page or try again shortly.",
            gate_nojs="JavaScript needs to be enabled in your browser to read the full analysis."),
}
for _L in LANGS: T[_L].update(T2[_L]); T[_L].update(T3[_L])
CONTACT = MON.get("contact_email", "urednistvo@lupa.example")

# ---------- images ----------
def img_paths(name):
    if name not in IMG_MANIFEST: raise SystemExit(f"ERROR: image '{name}' not processed. Add content/images/{name}.jpg + entry in content/images.json, run scripts/process_images.py")
    return IMG_MANIFEST[name]

def picture(name, here, L, sizes="100vw", cls="", eager=False):
    m = img_paths(name); a = IMAGES.get(name, {}).get("alt", {}).get(L, "")
    base = rel(here, f"assets/img/{name}")
    webp = ", ".join(f"{base}-{w}.webp {w}w" for w in m["widths"]); jpg = ", ".join(f"{base}-{w}.jpg {w}w" for w in m["widths"])
    load = ('fetchpriority="high"' if eager is True else "") if eager else 'loading="lazy"'
    return (f'<picture class="{cls}"><source type="image/webp" srcset="{webp}" sizes="{sizes}">'
            f'<img src="{base}-{m["widths"][-1]}.jpg" srcset="{jpg}" sizes="{sizes}" width="{m["w"]}" height="{m["h"]}" alt="{esc(a)}" {load} decoding="async"></picture>')

def figure(name, here, L, cls="figure", eager=False, sizes="(min-width: 1100px) 46rem, 100vw"):
    cap = IMAGES.get(name, {}).get("caption", {}).get(L, "")
    return f'<figure class="{cls}">{picture(name, here, L, sizes, eager=eager)}<figcaption>{esc(cap)} <span class="credit">{T[L]["ill"]}</span></figcaption></figure>'

def post_hero(p): return p.get("hero") or "home-hero"

# ---------- access (free vs subscribers) ----------
# meta.json "access": "free" | "subscribers". Missing → posts in the `research` category are subscriber-only, everything else free.
def access(p):
    a = p.get("access")
    if a is None: return "subscribers" if "research" in p["categories"] else "free"
    if a not in ("free", "subscribers"): raise SystemExit(f"ERROR: {p['dir']}: access must be 'free' or 'subscribers', got {a!r}")
    return a
def is_paid(p): return access(p) == "subscribers"
def paid_badge(L): return f'<span class="badge-paid"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/></svg>{T[L]["paid_badge"]}</span>'
def split_preview(raw, n_sections):
    """Preview = intro + first n <h2> sections. Returns (preview_raw, rest_raw)."""
    parts = raw.split("<h2")
    k = 1 + n_sections
    if len(parts) <= k: raise SystemExit("ERROR: subscriber-only post needs more <h2> sections than preview_sections")
    return "<h2".join(parts[:k]), "<h2" + "<h2".join(parts[k:])

# ---------- monetization components ----------
def ad_slot(kind, here, L):
    snippet = (MON.get("ads", {}).get("slots", {}) or {}).get(kind, "")
    t = T[L]
    if snippet:
        return f'<aside class="ad ad-{kind}" aria-label="{t["ad"]}"><span class="ad-label">{t["ad"]}</span>{snippet}</aside>'
    return (f'<aside class="ad ad-{kind} ad-house" aria-label="{t["ad_house"]}"><span class="ad-label">{t["ad_house"]}</span>'
            f'<p>{t["ad_house_t"]}</p><a class="ad-cta" href="{rel(here, p_page("advertise", L))}">{t["ad_house_cta"]} →</a></aside>')

def newsletter_form(L, compact=False):
    t = T[L]; nl = MON.get("newsletter", {}); live = bool(nl.get("action_url"))
    action = nl["action_url"] if live else f"mailto:{CONTACT}"
    field = nl.get("email_field", "email") if live else "email"
    hidden = "".join(f'<input type="hidden" name="{esc(k)}" value="{esc(v)}">' for k, v in (nl.get("hidden_fields") or {}).items()) if live else ""
    lang_field = nl.get("language_field", "tag") if live else "lang"
    uid = "nl-" + ("c" if compact else "f") + "-" + L
    return f"""<form class="nl-form{' nl-compact' if compact else ''}" action="{esc(action)}" method="post" data-live="{'1' if live else '0'}" data-mailto="{esc(CONTACT)}" data-ok="{esc(t['nl_ok_live'] if live else t['nl_ok'])}" data-bad="{esc(t['nl_bad'])}" data-subject="{esc('Prijava na newsletter Lupa' if L=='hr' else 'Lupa newsletter sign-up')}" novalidate{' target="_blank"' if live else ' enctype="text/plain"'}>
<div class="nl-row"><label class="sr" for="{uid}-email">{t['nl_email']}</label><input id="{uid}-email" type="email" name="{esc(field)}" autocomplete="email" required placeholder="{t['nl_email']}" inputmode="email">
<button type="submit">{t['nl_submit']}</button></div>
<fieldset class="nl-lang"><legend>{t['nl_lang']}</legend><label><input type="radio" name="{esc(lang_field)}" value="hr"{' checked' if L=='hr' else ''}> {t['nl_hr']}</label><label><input type="radio" name="{esc(lang_field)}" value="en"{' checked' if L=='en' else ''}> {t['nl_en']}</label></fieldset>
{hidden}<p class="nl-privacy">{t['nl_privacy']}{'' if live else ' ' + t['nl_demo']}</p><p class="nl-status" role="status" aria-live="polite"></p></form>"""

def newsletter_band(here, L, image=True):
    t = T[L]
    img = f'<div class="nl-media">{picture("newsletter", here, L, "(min-width: 900px) 40vw, 100vw", eager="auto")}</div>' if image else ""
    return (f'<section class="nl-band reveal{"" if image else " no-media"}" aria-labelledby="nlh-{L}">{img}<div class="nl-body"><p class="kicker">{t["nl_kicker"]}</p>'
            f'<h2 id="nlh-{L}">{t["nl_title"]}</h2><p class="nl-lead">{t["nl_text"]}</p>{newsletter_form(L)}</div></section>')

def support_strip(here, L):
    t = T[L]
    return f'<section class="support-strip reveal"><p>{t["support_strip"]}</p><a class="btn btn-ghost" href="{rel(here, p_page("subscribe", L))}">{t["support_cta"]} →</a></section>'

# ---------- layout ----------
def tape(here, L):
    syms = ["^GSPC", "^IXIC", "^DJI", "^RUT", "IWM", "XBI", "IBB", "^VIX"]
    items = []
    for s_ in syms:
        if s_ not in LATEST: continue
        v = LATEST[s_]
        items.append(f'<span class="ti"><b>{esc(label(s_))}</b> <span class="num">{fmt_num(v["last"], L)}</span> <span class="num {cls(v["change"])}">{"▲" if v["change"]>0 else "▼" if v["change"]<0 else "•"} {fmt_pct(v["change_pct"], L)}</span></span>')
    v0 = LATEST.get("^GSPC")
    note = f'<span class="ti asof">{T[L]["tape_note"]} {fmt_date(v0["session_date"], L)} · Yahoo Finance</span>' if v0 else ""
    row = "".join(items) + note
    return (f'<div class="tape" role="region" aria-label="{"Tržišni pregled" if L=="hr" else "Market tape"}"><div class="tape-track"><div class="tape-row">{row}</div>'
            f'<div class="tape-row" aria-hidden="true">{row}</div></div></div>')

LOGO_SVG = '<svg class="mark" viewBox="0 0 40 40" aria-hidden="true"><circle cx="16" cy="16" r="10.5" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 24l11 11" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg>'

def layout(L, here, alt_path, title, desc, body, active=None, extra_head="", og_type="website", og_image=None, og_path=None):
    t = T[L]; other = "en" if L == "hr" else "hr"
    css = rel(here, "assets/css/style.css"); fonts = rel(here, "assets/css/fonts.css"); js = rel(here, "assets/js/site.js")
    canon = absu(here); alt_abs = absu(alt_path)
    hreflang = (f'<link rel="alternate" hreflang="{L}" href="{esc(canon or rel(here, here))}">'
                f'<link rel="alternate" hreflang="{other}" href="{esc(alt_abs or rel(here, alt_path))}">'
                f'<link rel="alternate" hreflang="x-default" href="{esc(absu(p_home("hr")) or rel(here, p_home("hr")))}">')
    canon_tag = f'<link rel="canonical" href="{esc(canon)}">' if canon else ""
    feed = f'<link rel="alternate" type="application/rss+xml" title="Lupa ({L.upper()})" href="{esc(rel(here, L + "/feed.xml"))}">' if BASE else ""
    nav = []
    for cid in CATS:
        cur = ' aria-current="page"' if active == cid else ""
        nav.append(f'<li><a href="{rel(here, p_cat(cid, L))}"{cur}>{esc(CATS[cid][L]["name"])}</a></li>')
    if COMPANIES: nav.append(f'<li><a href="{rel(here, p_page("companies", L))}"{" aria-current=\"page\"" if active == "tracker" else ""}>{TT[L]["nav"]}</a></li>')
    cur = ' aria-current="page"' if active == "about" else ""
    nav.append(f'<li><a href="{rel(here, p_page("about", L))}"{cur}>{t["about"]}</a></li>')
    nav.append(f'<li class="nav-extra"><a href="{rel(here, p_page("subscribe", L))}"{" aria-current=\"page\"" if active in ("subscribe", "account") else ""}>{t["support"]}</a></li>')
    nav.append(f'<li class="nav-extra"><a href="{rel(here, p_page("newsletter", L))}"{" aria-current=\"page\"" if active=="newsletter" else ""}>{t["newsletter"]}</a></li>')
    langsw = (f'<div class="lang" role="group" aria-label="{t["footer_lang"]}">'
              + (f'<span aria-current="true" lang="hr">HR</span><a href="{rel(here, alt_path)}" hreflang="en" lang="en" data-setlang="en" aria-label="English">EN</a>' if L == "hr"
                 else f'<a href="{rel(here, alt_path)}" hreflang="hr" lang="hr" data-setlang="hr" aria-label="Hrvatski">HR</a><span aria-current="true" lang="en">EN</span>')
              + '</div>')
    ogimg = og_image or "home-hero"
    og = (f'<meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(desc)}">'
          f'<meta property="og:type" content="{og_type}"><meta property="og:site_name" content="Lupa"><meta property="og:locale" content="{"hr_HR" if L=="hr" else "en_US"}">'
          f'<meta name="twitter:card" content="summary_large_image">'
          + (f'<meta property="og:url" content="{esc(canon)}"><meta property="og:image" content="{esc(absu(og_path or "assets/img/" + ogimg + "-og.jpg"))}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">'
             f'<meta property="og:image:alt" content="{esc(IMAGES.get(ogimg, {}).get("alt", {}).get(L, ""))}">' if canon else ""))
    full_title = title if title.startswith("Lupa") else f"{title} — Lupa"
    foot_sections = "".join(f'<li><a href="{rel(here, p_cat(c, L))}">{esc(CATS[c][L]["name"])}</a></li>' for c in CATS)
    return f"""<!doctype html>
<html lang="{L}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(full_title)}</title>
<meta name="description" content="{esc(desc)}">
{canon_tag}{hreflang}{feed}
{og}
<meta name="theme-color" content="#0b1f1d">
<link rel="icon" href="{rel(here, 'assets/favicon.svg')}" type="image/svg+xml">
<link rel="preload" href="{rel(here, 'assets/fonts/Newsreader-normal-300_800-latin.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="{fonts}">
<link rel="stylesheet" href="{css}">
<script>document.documentElement.classList.add('js')</script>
{extra_head}
</head>
<body data-lang="{L}">
<a class="skip" href="#main">{t['skip']}</a>
{tape(here, L)}
<header class="site-header">
<div class="hdr">
<a class="logo" href="{rel(here, p_home(L))}" aria-label="Lupa — {t['home']}"><span>Lupa</span>{LOGO_SVG}</a>
<span class="hdr-tag">{esc(SITE['tagline'][L])}</span>
<div class="hdr-tools">{langsw}<a class="btn btn-ghost btn-sm hdr-sub" href="{rel(here, p_page('subscribe', L))}">{t['support']}</a><a class="btn btn-accent btn-sm hdr-nl" href="{rel(here, p_page('newsletter', L))}">{t['newsletter']}</a>
<button class="menu-btn" type="button" aria-expanded="false" aria-controls="sitenav" data-open="{t['menu']}" data-close="{t['close_menu']}"><span class="menu-icon" aria-hidden="true"></span><span class="sr">{t['menu']}</span></button></div>
</div>
<nav class="sections" id="sitenav" aria-label="{t['sections']}"><ul>{''.join(nav)}</ul></nav>
</header>
<main id="main">
{body}
</main>
<footer class="site">
<div class="wrap foot-grid">
<div class="foot-brand"><a class="logo logo-foot" href="{rel(here, p_home(L))}"><span>Lupa</span>{LOGO_SVG}</a><p class="foot-tag">{esc(SITE['tagline'][L])}</p>
<p class="foot-small">{t['not_advice']} <a href="{rel(here, p_page('disclaimer', L))}">{t['disclaimer']}</a>.</p></div>
<div><h2>{t['sections']}</h2><ul>{foot_sections}</ul></div>
<div><h2>Lupa</h2><ul><li><a href="{rel(here, p_page('about', L))}">{t['about']}</a></li><li><a href="{rel(here, p_archive(L))}">{t['archive']}</a></li>
<li><a href="{rel(here, p_page('companies', L))}">{TT[L]['companies']}</a></li><li><a href="{rel(here, p_page('calendar', L))}">{TT[L]['calendar']}</a></li><li><a href="{rel(here, p_page('track', L))}">{TT[L]['track']}</a></li>
<li><a href="{rel(here, p_page('newsletter', L))}">{t['newsletter']}</a></li><li><a href="{rel(here, p_page('subscribe', L))}">{t['support_cta']}</a></li><li><a href="{rel(here, p_page('account', L))}">{t['account']}</a></li>
<li><a href="{rel(here, p_page('advertise', L))}">{t['advertise']}</a></li><li><a href="{rel(here, p_page('disclaimer', L))}">{t['disclaimer']}</a></li>
<li><a href="{rel(here, p_page('privacy', L))}">{t['privacy']}</a></li><li><a href="{rel(here, p_page('terms', L))}">{t['terms']}</a></li></ul></div>
<div><h2>{t['footer_lang']}</h2><ul><li><a href="{rel(here, alt_path)}" data-setlang="{other}" hreflang="{other}" lang="{other}">{T[other]['lang_name']}</a></li><li><a href="mailto:{esc(CONTACT)}">{esc(CONTACT)}</a></li></ul></div>
</div>
<div class="wrap foot-base"><span>© 2026 Lupa. {t['rights']}</span><span>{'Ilustracije: Lupa (generirane, ne prikazuju stvarne tvrtke ni osobe)' if L=='hr' else 'Illustrations: Lupa (generated; they do not depict real companies or people)'}</span></div>
</footer>
<script src="{js}" defer></script>
</body>
</html>"""

def words(htmltext): return len(re.sub(r"<[^>]+>|\{\{[^}]+\}\}", " ", htmltext).split())
def minutes(p, L): return max(1, round(words(p["body"][L]) / 220))

def kicker(p, L, here):
    if p.get("sponsored"): return f'<span class="kicker kicker-sponsored">{T[L]["sponsored"]}</span>'
    cid = p["categories"][0]
    return f'<a class="kicker" href="{rel(here, p_cat(cid, L))}">{esc(CATS[cid][L]["name"])}</a>'

def card(p, L, here, size="md"):
    chips = "".join(chip(s_, p.get("prices_session"), L) for s_ in p.get("tickers", [])[:3])
    chips_html = f'<div class="chips">{chips}</div>' if chips else ""
    sizes = "(min-width: 1100px) 24rem, (min-width: 700px) 45vw, 100vw"
    return (f'<article class="card card-{size} reveal"><a class="card-media" href="{rel(here, p_post(p, L))}" tabindex="-1" aria-hidden="true">{picture(post_hero(p), here, L, sizes)}</a>'
            f'<div class="card-body">{kicker(p, L, here)}'
            f'<h3><a href="{rel(here, p_post(p, L))}">{esc(p["title"][L])}</a></h3><p>{esc(p["dek"][L])}</p>'
            f'<div class="meta">{paid_badge(L) + " " if is_paid(p) else ""}{fmt_date(p["date"], L)} · {minutes(p, L)} {T[L]["read"]}</div>{chips_html}</div></article>')

def write(path, s):
    f = OUT / path / "index.html" if path.endswith("/") or path == "" else OUT / path
    f.parent.mkdir(parents=True, exist_ok=True); f.write_text(s)

def insert_in_article_ad(body, here, L, at=3):
    parts = body.split("<h2")
    if len(parts) >= at + 1:  # before the `at`-th section heading (3rd by default)
        return "<h2".join(parts[:at]) + ad_slot("in_article", here, L) + "<h2" + "<h2".join(parts[at:])
    return body + ad_slot("in_article", here, L)

def expand_images(body, here, L):
    return re.sub(r"\{\{img:([\w-]+)\}\}", lambda m: figure(m.group(1), here, L, "figure figure-inline reveal"), body)

# ---------- pages ----------
def build_post(p, L):
    here = p_post(p, L); other = "en" if L == "hr" else "hr"; t = T[L]
    def render(raw): return expand_tokens(expand_images(raw, here, L), p.get("prices_session"), L)
    paid = is_paid(p)
    if not paid:
        body = insert_in_article_ad(render(p["body"][L]), here, L)
    else:
        n = int(p.get("preview_sections", 1))
        pre_raw, rest_raw = split_preview(p["body"][L], n)
        rest = render(rest_raw)
        rest = insert_in_article_ad(rest, here, L, at=max(1, 3 - n))  # same spot as free posts: before the 3rd <h2> overall
        # Full remainder goes ONLY to the private bundle served by /api/article after an entitlement check.
        (PRIVATE / "paid").mkdir(parents=True, exist_ok=True)
        (PRIVATE / "paid" / f"{p['dir']}.{L}.html").write_text(rest)
        PAID_INDEX[p["dir"]] = {"slug": p["slug"], "title": p["title"]}
        heads = [re.sub(r"<[^>]+>", "", h) for h in re.findall(r"<h2[^>]*>(.*?)</h2>", rest_raw, flags=re.S)]
        nexts = "".join(f"<li>{esc(html.unescape(h))}</li>" for h in heads)
        nxt = rel(here, here)
        body = (render(pre_raw) +
                f'<section class="paywall" id="paywall" data-post="{esc(p["dir"])}" data-lang="{L}" aria-labelledby="pw-{L}">'
                f'<div class="pw-fade" aria-hidden="true"></div><div class="pw-card"><p class="kicker">{paid_badge(L)}</p>'
                f'<h2 id="pw-{L}">{t["gate_title"]}</h2><p>{t["gate_text"]}</p>'
                + (f'<div class="pw-next"><p class="pw-next-h">{t["gate_next"]}</p><ul>{nexts}</ul></div>' if nexts else "") +
                f'<p class="pw-price"><strong>{t["plan_name"]}</strong> · {t["price_line"]} · {t["cancel_any"]}</p>'
                f'<form class="pw-form" method="post" action="/api/checkout"><input type="hidden" name="lang" value="{L}"><input type="hidden" name="next" value="/{esc(here)}">'
                f'<button class="btn btn-accent" type="submit">{t["gate_btn"]}</button></form>'
                f'<p class="pw-links"><a href="{rel(here, p_page("subscribe", L))}">{t["gate_more"]}</a> · {t["gate_have"]} <a href="{rel(here, p_page("account", L))}">{t["gate_manage"]}</a></p>'
                f'<p class="pw-status" role="status" aria-live="polite" data-checking="{esc(t["gate_checking"])}" data-err="{esc(t["gate_err"])}"></p>'
                f'<noscript><p class="pw-status">{t["gate_nojs"]}</p></noscript></div></section>'
                f'<div class="paid-body" id="paid-body" hidden></div>')
    cats = " · ".join(f'<a href="{rel(here, p_cat(c, L))}">{esc(CATS[c][L]["name"])}</a>' for c in p["categories"])
    srcs = "".join(f'<li><a href="{esc(s_["url"])}" rel="noopener">{esc(s_["label"][L] if isinstance(s_["label"], dict) else s_["label"])}</a></li>' for s_ in p.get("sources", []))
    related = [q for q in POSTS if q is not p][:3]
    rel_html = f'<section class="wrap related"><div class="section-head"><h2>{t["more_from"]}</h2><a class="meta" href="{rel(here, p_archive(L))}">{t["all_articles"]} →</a></div><div class="cards">{"".join(card(q, L, here) for q in related)}</div></section>' if related else ""
    ld = {"@context": "https://schema.org", "@type": "Article", "headline": p["title"][L], "description": p["dek"][L],
          "datePublished": p["date"], "inLanguage": L, "author": {"@type": "Organization", "name": "Lupa"}, "publisher": {"@type": "Organization", "name": "Lupa"}}
    if BASE: ld["mainEntityOfPage"] = absu(here); ld["image"] = absu(f"assets/img/{post_hero(p)}-og.jpg")
    if paid:  # Google's paywalled-content markup
        ld["isAccessibleForFree"] = False
        ld["hasPart"] = {"@type": "WebPageElement", "isAccessibleForFree": False, "cssSelector": ".paid-body"}
    extra = f'<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>'
    sp = p.get("sponsored")
    sp_html = (f'<div class="sponsor-banner" role="note"><strong>{t["sponsored"]}</strong> · {t["partner"]}: '
               f'{("<a href=\"" + esc(sp["url"]) + "\" rel=\"sponsored noopener\">" + esc(sp["name"]) + "</a>") if sp.get("url") else esc(sp["name"])}<p>{t["sponsored_note"]}</p></div>') if sp else ""
    chips = "".join(company_link(s_, here, L, chip(s_, p.get("prices_session"), L)) for s_ in p.get("tickers", []))
    rail = (f'<aside class="rail" aria-label="{t["on_page"]}">'
            + (f'<div class="rail-box"><h2>{t["on_page"]}</h2><div class="chips chips-col">{chips}</div><p class="meta">{t["price_note"]}</p></div>' if chips else "")
            + ad_slot("sidebar", here, L)
            + f'<div class="rail-box rail-nl"><h2>{t["nl_kicker"]}</h2><p>{t["nl_text"]}</p>{newsletter_form(L, compact=True)}</div></aside>')
    html_body = f"""<article class="post">
<header class="article-head">{sp_html}<div class="meta cats">{cats}{" · " + paid_badge(L) if paid else ""}</div><h1>{esc(p['title'][L])}</h1><p class="dek">{esc(p['dek'][L])}</p>
<div class="byline"><span class="by">{t['byline']}</span><span>{t['published']} <time datetime="{esc(p['date'])}">{fmt_date(p['date'], L)}</time></span><span>{minutes(p, L)} {t['read']}</span></div></header>
{figure(post_hero(p), here, L, "figure figure-hero", eager=True, sizes="(min-width: 1280px) 76rem, 100vw")}
<div class="post-grid"><div class="prose">{body}</div>{rail}</div>
<div class="post-end">
<section class="sources"><h2>{t['sources']}</h2><ol>{srcs}</ol></section>
<aside class="disclaimer-box">{t['not_advice']} <a href="{rel(here, p_page('disclaimer', L))}">{t['disclaimer']}</a>.</aside>
</div>
<div class="wrap">{newsletter_band(here, L)}</div>
</article>{rel_html}"""
    write(here, layout(L, here, p_post(p, other), p["title"][L], p["dek"][L], html_body, active=p["categories"][0], extra_head=extra, og_type="article", og_image=post_hero(p)))

def build_home(L):
    here = p_home(L); t = T[L]; other = "en" if L == "hr" else "hr"
    if not POSTS:
        body = f'<div class="wrap"><p class="empty">{t["empty"]}</p></div>'
    else:
        lead, side, rest = POSTS[0], POSTS[1:4], POSTS[4:]
        lead_chips = "".join(chip(s_, lead.get("prices_session"), L) for s_ in lead.get("tickers", [])[:4])
        hero = f"""<section class="hero">
{picture(post_hero(lead), here, L, "100vw", "hero-media", eager=True)}
<div class="hero-shade" aria-hidden="true"></div>
<div class="hero-body wrap"><div class="hero-text">{kicker(lead, L, here)}
<h1 class="hero-title"><a href="{rel(here, p_post(lead, L))}">{esc(lead['title'][L])}</a></h1>
<p class="hero-dek">{esc(lead['dek'][L])}</p>
<div class="hero-meta">{paid_badge(L) if is_paid(lead) else ""}<span>{fmt_date(lead['date'], L)} · {minutes(lead, L)} {t['read']}</span><div class="chips">{lead_chips}</div></div>
<a class="btn btn-accent" href="{rel(here, p_post(lead, L))}">{t['read_story']} →</a></div></div></section>"""
        side_html = f'<section class="wrap"><div class="section-head"><h2>{t["latest"]}</h2><a class="meta" href="{rel(here, p_archive(L))}">{t["all_articles"]} →</a></div><div class="cards cards-3">{"".join(card(q, L, here) for q in side + rest)}</div></section>'
        mk = [x for x in ["^GSPC", "^IXIC", "^RUT", "XBI"] if x in LATEST]
        sess = LATEST[mk[0]]["session_date"] if mk else None
        market_html = (f'<section class="wrap markets"><div class="section-head"><h2>{t["markets_now"]}</h2><span class="meta">{t["close"]} {fmt_date(sess, L)} · Yahoo Finance</span></div>'
                       f'<div class="quote-grid">{"".join(quote_box(x, None, L) for x in mk)}</div></section>') if mk else ""
        tiles = "".join(f'<a class="tile reveal" href="{rel(here, p_cat(c, L))}">{picture(CATS[c].get("image", "home-hero"), here, L, "(min-width: 900px) 20vw, 50vw")}'
                        f'<span class="tile-shade" aria-hidden="true"></span><span class="tile-body"><span class="tile-name">{esc(CATS[c][L]["name"])}</span><span class="tile-desc">{esc(CATS[c][L]["desc"])}</span>'
                        f'<span class="tile-count">{sum(1 for q in POSTS if c in q["categories"])} {t["story_count"]}</span></span></a>' for c in CATS)
        body = f"""{hero}
{side_html}
<div class="wrap">{newsletter_band(here, L)}</div>
{market_html}
<div class="wrap">{ad_slot("home_band", here, L)}</div>
<section class="wrap"><div class="section-head"><h2>{t['explore']}</h2></div><div class="tiles">{tiles}</div></section>
<div class="wrap">{support_strip(here, L)}</div>"""
    write(here, layout(L, here, p_home(other), f"Lupa — {SITE['tagline'][L]}", SITE["description"][L], body, og_image=post_hero(POSTS[0]) if POSTS else None))

def list_rows(items, L, here):
    t = T[L]
    return "".join(f'<article class="list-item reveal"><a class="list-media" href="{rel(here, p_post(p, L))}" tabindex="-1" aria-hidden="true">{picture(post_hero(p), here, L, "(min-width: 700px) 16rem, 100vw")}</a>'
                   f'<div><div class="meta">{kicker(p, L, here)}{" " + paid_badge(L) if is_paid(p) else ""} · {fmt_date(p["date"], L)} · {minutes(p, L)} {t["read"]}</div>'
                   f'<h2><a href="{rel(here, p_post(p, L))}">{esc(p["title"][L])}</a></h2><p>{esc(p["dek"][L])}</p>'
                   f'<div class="chips">{"".join(chip(s_, p.get("prices_session"), L) for s_ in p.get("tickers", [])[:5])}</div></div></article>' for p in items) \
           or f'<p class="empty">{t["empty"]}</p>'

def list_page(L, here, alt, title, intro, items, active, image):
    t = T[L]
    body = (f'<header class="page-banner">{picture(image, here, L, "100vw", "banner-media", eager=True)}<div class="banner-shade" aria-hidden="true"></div>'
            f'<div class="wrap banner-body"><p class="kicker kicker-light">{t["in_cat"] if active in CATS else "Lupa"}</p><h1>{esc(title)}</h1><p>{esc(intro)}</p></div></header>'
            f'<div class="wrap list-wrap"><div class="list">{list_rows(items, L, here)}</div>{ad_slot("sidebar", here, L)}</div>'
            f'<div class="wrap">{newsletter_band(here, L)}</div>')
    write(here, layout(L, here, alt, title, intro, body, active=active, og_image=image))

def expand_page_tokens(body, here, L):
    body = body.replace("{{newsletter_form}}", newsletter_form(L)).replace("{{contact_email}}", esc(CONTACT))
    body = re.sub(r"\{\{mailto:([^}]+)\}\}", lambda m: "mailto:" + CONTACT + "?subject=" + urllib.parse.quote(m.group(1)), body)
    body = re.sub(r"\{\{link:(\w+)\}\}", lambda m: rel(here, p_page(m.group(1), L)), body)
    body = re.sub(r"\{\{ad_example:(\w+)\}\}", lambda m: ad_slot(m.group(1), here, L), body)
    body = body.replace("{{subscribe_box}}", subscribe_box(here, L)).replace("{{account_box}}", account_box(here, L))
    body = body.replace("{{price_line}}", T[L]["price_line"])
    return expand_images(body, here, L)

def subscribe_box(here, L):
    t = T[L]; hr = L == "hr"
    items = (["Sve dubinske analize tvrtki u cijelosti — Ginkgo Bioworks, Infleqtion i svaka nova", "Na hrvatskom i engleskom, s izvorima i cijenama iz zaključne sesije",
              "Pregledi tržišta, „Danas na radaru” i newsletter ostaju besplatni za sve", "Bez obveze: otkazujete sami, jednim klikom, u Stripeovu portalu"] if hr else
             ["Every company deep dive in full — Ginkgo Bioworks, Infleqtion and each new one", "In Croatian and English, with sources and closing-session prices",
              "Market wraps, “On the radar” and the newsletter stay free for everyone", "No lock-in: cancel yourself, in one click, in Stripe's customer portal"])
    lis = "".join(f"<li>{esc(i)}</li>" for i in items)
    fine = ("Plaćanje obrađuje Stripe: kartica, a na podržanim uređajima i Google Pay ili Apple Pay. Lupa ne vidi i ne sprema podatke vaše kartice. "
            "Pristup se otključava u pregledniku u kojem platite, a na drugim uređajima prijavom e-poštom. Pretplata se obnavlja svaki mjesec dok je ne otkažete; nakon otkazivanja pristup traje do kraja plaćenog razdoblja. Za pristup koristimo samo nužne, sigurne kolačiće (bez praćenja i oglasnih kolačića)."
            if hr else
            "Payments are processed by Stripe: card, plus Google Pay or Apple Pay on supported devices. Lupa never sees or stores your card details. "
            "Access unlocks in the browser you pay in, and on other devices by email sign-in. The subscription renews every month until you cancel; after cancelling, access lasts until the end of the paid period. Access uses only strictly necessary, secure cookies (no tracking or advertising cookies).")
    inactive = ("<strong>Plaćanja još nisu aktivna.</strong> Online pretplatu uključujemo uskoro. Ništa vam se ne naplaćuje — gumb za pretplatu proradit će čim naplata bude spremna."
                if hr else "<strong>Payments are not active yet.</strong> Online subscriptions are coming soon. You will not be charged — the subscribe button will start working as soon as billing is ready.")
    legal = ("Uvjeti pretplate, otkazivanje i pravo na odustanak:" if hr else "Subscription terms, cancellation and right of withdrawal:")
    canceled = "Plaćanje je prekinuto i ništa nije naplaćeno. Možete pokušati ponovno kad želite." if hr else "Checkout was cancelled and nothing was charged. You can try again whenever you like."
    return (f'<div class="plan" id="plan"><div class="plan-head"><p class="kicker">{t["plan_name"]}</p><p class="plan-price">{t["price_big"]}</p>'
            f'<p class="plan-sub">{t["cancel_any"]}</p></div><ul class="plan-list">{lis}</ul>'
            f'<form class="sub-form" method="post" action="/api/checkout"><input type="hidden" name="lang" value="{L}"><input type="hidden" name="next" value="">'
            f'<button class="btn btn-accent btn-lg" type="submit">{t["gate_btn"]}</button></form>'
            f'<div class="note pay-inactive" hidden>{inactive}</div><div class="note pay-canceled" hidden>{canceled}</div>'
            f'<p class="plan-fine">{fine}</p>'
            f'<p class="plan-fine">{legal} <a href="{rel(here, p_page("terms", L))}">{t["terms"]}</a> · <a href="{rel(here, p_page("privacy", L))}">{t["privacy"]}</a></p>'
            f'<p class="plan-fine">{t["gate_have"]} <a href="{rel(here, p_page("account", L))}">{t["account"]}</a></p></div>')

def account_box(here, L):
    t = T[L]; hr = L == "hr"; sub = rel(here, p_page("subscribe", L))
    S = (dict(loading="Provjeravamo pretplatu na ovom uređaju…",
              welcome="<strong>Dobro došli u Lupu!</strong> Pretplata je aktivna i sve analize otključane su u ovom pregledniku.",
              active_h="Pretplata je aktivna", active_p="U ovom pregledniku imate pristup svim dubinskim analizama.",
              manage="Upravljaj pretplatom ili je otkaži", manage_p="Otvara Stripeov portal: promjena kartice, računi i otkazivanje.",
              logout="Odjava s ovog uređaja",
              none_h="U ovom pregledniku nema aktivne pretplate", none_p="Pretplatom na Lupu čitate sve dubinske analize tvrtki u cijelosti.",
              none_cta="Pretplati se — 7 € mjesečno",
              lapsed="Pretplata povezana s ovim preglednikom više nije aktivna. Možete je obnoviti u bilo kojem trenutku.",
              inactive="<strong>Plaćanja još nisu aktivna.</strong> Pretplatu uključujemo uskoro; do tada se ništa ne naplaćuje.",
              err="Provjera trenutačno nije uspjela. Osvježite stranicu za koji trenutak.",
              device_h="Novi uređaj ili preglednik?",
              device_p="Upišite e-adresu s kojom ste se pretplatili i poslat ćemo vam poveznicu za prijavu (vrijedi 15 minuta). Za pomoć pišite na ",
              email_label="E-adresa", email_btn="Pošalji poveznicu za prijavu",
              email_off="Prijava e-poštom trenutačno nije uključena. Čitajte u pregledniku u kojem ste se pretplatili; za pomoć pišite na ",
              l_sent="Ako za tu e-adresu postoji pretplata, poslali smo poveznicu za prijavu. Provjerite pristiglu poštu (i neželjenu poštu).",
              l_bad="Upišite ispravnu e-adresu.", l_wait="Previše pokušaja. Pričekajte nekoliko minuta pa pokušajte ponovno.",
              l_error="Slanje poveznice trenutačno nije uspjelo. Pokušajte ponovno za koji trenutak.",
              l_expired="Poveznica za prijavu je istekla ili nije ispravna. Zatražite novu niže.",
              l_ok="Prijavljeni ste. Ako je pretplata aktivna, sve analize sada su otključane i u ovom pregledniku.",
              l_paid="Plaćanje je uspjelo! Budući da je dovršeno u drugom pregledniku, otključajte pristup ovdje: upišite e-adresu s kojom ste platili i kliknite poveznicu iz e-pošte.",
              l_off="Prijava e-poštom trenutačno nije uključena.",
              portal_login="Pretplatom (kartica, računi, otkazivanje) možete upravljati s bilo kojeg uređaja preko Stripeove prijave e-poštom:",
              portal_login_btn="Prijava u Stripeov portal", nojs="Za provjeru pretplate treba biti uključen JavaScript.") if hr else
         dict(loading="Checking for a subscription in this browser…",
              welcome="<strong>Welcome to Lupa!</strong> Your subscription is active and every analysis is unlocked in this browser.",
              active_h="Your subscription is active", active_p="This browser has access to every company deep dive.",
              manage="Manage or cancel subscription", manage_p="Opens Stripe's customer portal: update your card, see invoices, cancel.",
              logout="Sign out of this device",
              none_h="No active subscription in this browser", none_p="A Lupa subscription unlocks every company deep dive in full.",
              none_cta="Subscribe — €7 a month",
              lapsed="The subscription linked to this browser is no longer active. You can renew it at any time.",
              inactive="<strong>Payments are not active yet.</strong> Subscriptions are coming soon; nothing is charged until then.",
              err="We could not check right now. Please refresh the page in a moment.",
              device_h="New device or browser?",
              device_p="Enter the email you subscribed with and we will send you a sign-in link (valid for 15 minutes). For help write to ",
              email_label="Email address", email_btn="Email me a sign-in link",
              email_off="Email sign-in is not switched on right now. Read in the browser you subscribed in; for help write to ",
              l_sent="If there is a subscription for that address, we have sent a sign-in link. Check your inbox (and spam folder).",
              l_bad="Please enter a valid email address.", l_wait="Too many attempts. Please wait a few minutes and try again.",
              l_error="We could not send the link right now. Please try again in a moment.",
              l_expired="The sign-in link has expired or is not valid. Request a new one below.",
              l_ok="You are signed in. If your subscription is active, every analysis is now unlocked in this browser too.",
              l_paid="Payment succeeded! Because it finished in a different browser, unlock access here: enter the email you paid with and click the link we send you.",
              l_off="Email sign-in is not switched on right now.",
              portal_login="You can manage the subscription (card, invoices, cancellation) from any device through Stripe's email sign-in:",
              portal_login_btn="Sign in to Stripe's portal", nojs="JavaScript needs to be enabled to check your subscription."))
    return (f'<div class="account" id="account" data-state="loading" data-lang="{L}">'
            + "".join(f'<div class="note acct-login" data-login="{k}" role="status" hidden>{S["l_" + k]}</div>' for k in ("sent", "bad", "wait", "error", "expired", "ok", "paid", "off"))
            + f'<p class="acct-panel" data-show="loading" role="status">{S["loading"]}</p>'
            f'<div class="note acct-welcome" hidden>{S["welcome"]}</div>'
            f'<div class="acct-panel acct-card" data-show="active" hidden><p class="kicker">{t["plan_name"]}</p><h2>{S["active_h"]}</h2><p>{S["active_p"]}</p>'
            f'<form method="post" action="/api/portal"><input type="hidden" name="lang" value="{L}"><button class="btn btn-accent" type="submit">{S["manage"]}</button></form>'
            f'<p class="plan-fine">{S["manage_p"]}</p>'
            f'<form method="post" action="/api/logout"><input type="hidden" name="lang" value="{L}"><button class="btn btn-ghost btn-sm" type="submit">{S["logout"]}</button></form></div>'
            f'<div class="acct-panel acct-card" data-show="none" hidden><p class="kicker">{t["plan_name"]}</p><h2>{S["none_h"]}</h2>'
            f'<p class="acct-lapsed" hidden>{S["lapsed"]}</p><p>{S["none_p"]}</p><p><a class="btn btn-accent" href="{sub}">{S["none_cta"]}</a></p></div>'
            f'<div class="note acct-panel" data-show="inactive" hidden>{S["inactive"]}</div>'
            f'<div class="note acct-panel" data-show="error" hidden>{S["err"]}</div>'
            f'<noscript><p class="note">{S["nojs"]}</p></noscript>'
            + f'<section class="acct-device" id="acct-device"><h2>{S["device_h"]}</h2>'
            f'<div class="acct-email-on"><p>{S["device_p"]}<a href="mailto:{esc(CONTACT)}">{esc(CONTACT)}</a>.</p>'
            f'<form class="login-form" method="post" action="/api/login"><input type="hidden" name="lang" value="{L}">'
            f'<label for="login-email-{L}">{S["email_label"]}</label> <input id="login-email-{L}" type="email" name="email" required autocomplete="email" inputmode="email" maxlength="254"> '
            f'<button class="btn btn-accent btn-sm" type="submit">{S["email_btn"]}</button></form></div>'
            f'<p class="acct-email-off" hidden>{S["email_off"]}<a href="mailto:{esc(CONTACT)}">{esc(CONTACT)}</a>.</p>'
            f'<p class="acct-portal-login" hidden>{S["portal_login"]} <a class="btn btn-ghost btn-sm" href="#" rel="noopener">{S["portal_login_btn"]}</a></p></section></div>')

def build_static_page(key, pg, L):
    here = p_page(key, L); other = "en" if L == "hr" else "hr"
    img = pg.get("hero")
    hero = figure(img, here, L, "figure figure-hero", eager=True, sizes="(min-width: 1280px) 76rem, 100vw") if img else ""
    body = (f'<article class="page page-{key}"><header class="article-head"><h1>{esc(pg["title"][L])}</h1><p class="dek">{esc(pg["dek"][L])}</p></header>{hero}'
            f'<div class="prose prose-page">{expand_page_tokens(pg["body"][L], here, L)}</div></article>')
    if key not in ("newsletter",): body += f'<div class="wrap">{newsletter_band(here, L)}</div>' if key in ("about",) else ""
    write(here, layout(L, here, p_page(key, other), pg["title"][L], pg["dek"][L], body, active=key, og_image=img))

def build_root():
    s = f"""<!doctype html><html lang="hr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lupa — Istraživanje malih dionica / Small-cap research</title>
<meta name="description" content="{esc(SITE['description']['hr'])}">
<link rel="alternate" hreflang="hr" href="{esc(absu('hr/') or 'hr/')}"><link rel="alternate" hreflang="en" href="{esc(absu('en/') or 'en/')}"><link rel="alternate" hreflang="x-default" href="{esc(absu('hr/') or 'hr/')}">
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="assets/css/fonts.css"><link rel="stylesheet" href="assets/css/style.css">
<script>(function(){{try{{var l=localStorage.getItem('lupa-lang');if(!l){{var n=(navigator.languages&&navigator.languages[0]||navigator.language||'').toLowerCase();l=/^(hr|bs|sr|sh|sl)/.test(n)?'hr':'en';}}location.replace((l==='en'?'en':'hr')+'/');}}catch(e){{location.replace('hr/');}}}})();</script>
<noscript><meta http-equiv="refresh" content="0; url=hr/"></noscript></head>
<body class="root-page"><main class="root-choose"><a class="logo" href="hr/"><span>Lupa</span>{LOGO_SVG}</a><p class="tagline">Istraživanje malih dionica · Small-cap research</p>
<p><a class="btn btn-accent" href="hr/" data-setlang="hr">Hrvatski</a> <a class="btn btn-ghost" href="en/" data-setlang="en">English</a></p></main><script src="assets/js/site.js" defer></script></body></html>"""
    (OUT / "index.html").write_text(s)
    root = BASE + "/" if BASE else "/"
    nf = f"""<!doctype html><html lang="hr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>404 — Lupa</title>
<link rel="stylesheet" href="{root}assets/css/fonts.css"><link rel="stylesheet" href="{root}assets/css/style.css"></head>
<body class="root-page"><main class="root-choose"><a class="logo" href="{root}"><span>Lupa</span>{LOGO_SVG}</a><h1>{T['hr']['notfound']} · {T['en']['notfound']}</h1><p>{T['hr']['notfound_p']}<br>{T['en']['notfound_p']}</p>
<p><a class="btn btn-accent" href="{root}hr/">Naslovnica</a> <a class="btn btn-ghost" href="{root}en/">Home</a></p></main></body></html>"""
    (OUT / "404.html").write_text(nf)

def build_feeds_and_sitemap(all_paths):
    if not BASE: return
    urls = "".join(f"<url><loc>{esc(absu(p))}</loc></url>" for p in all_paths)
    (OUT / "sitemap.xml").write_text(f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>')
    (OUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {BASE}/sitemap.xml\n")
    for L in LANGS:
        items = ""
        for p in POSTS[:30]:
            d = datetime.datetime.fromisoformat(p["date"][:10]).replace(hour=7, tzinfo=ZG)
            items += (f"<item><title>{esc(p['title'][L])}</title><link>{esc(absu(p_post(p, L)))}</link><guid>{esc(absu(p_post(p, L)))}</guid>"
                      f"<pubDate>{d.strftime('%a, %d %b %Y %H:%M:%S %z')}</pubDate><description>{esc(p['dek'][L])}</description></item>")
        (OUT / L / "feed.xml").write_text(f'<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Lupa ({L.upper()})</title>'
                                         f'<link>{esc(absu(p_home(L)))}</link><description>{esc(SITE["tagline"][L])}</description><language>{L}</language>{items}</channel></rss>')

# ---------- company tracker: profiles, catalyst calendar, track record (data: tracker.py) ----------
import tracker
TODAY = datetime.datetime.now(ZG).date()
TRK_DB, TRK_MANUAL = tracker.load()
COMPANIES = TRK_DB.get("companies", {})
TT = {
 "hr": dict(companies="Tvrtke", companies_dek="Tvrtke koje Lupa prati: dubinske analize i imena s radara, sa zadnjim zatvaranjem, dnevnom promjenom i tržišnom kapitalizacijom. Ispod su i službene objave. Ovo nije preporuka za kupnju.",
            calendar="Kalendar katalizatora", calendar_dek="Datumi koji mogu pomaknuti cijenu: financijski rezultati i završeci kliničkih ispitivanja tvrtki koje pratimo.",
            track="Rezultati analiza", track_dek="Što se s cijenom dogodilo nakon svake naše dubinske analize — sve analize, i one koje su prošle loše.",
            nav="Tvrtke", company="Tvrtka", price="Cijena", day="Dan", insider12="Uprava (12 mj.)", last_event="Zadnja objava", buys="kupnji", sells="prodaja",
            group_dive="Dubinske analize", group_dive_lead="Tvrtke s vlastitom analizom. Cijeli tekst čitaju pretplatnici.",
            group_radar="Na radaru", group_radar_lead="Imena iz besplatnog radara. Još nemaju vlastitu analizu.",
            piece_radar="Na radaru", profile="Profil i objave",
            timeline="Objave i transakcije uprave", none="Još nema podataka.", insider_h="Uprava: kupnje i prodaje u zadnjih 12 mjeseci",
            insider_p="Otvorene tržišne kupnje (šifra P) i prodaje (šifra S) iz obrazaca Form 4. Dodjele dionica, porezna zadržavanja i izvršenja opcija ne računaju se jer nisu odluka o ulaganju.",
            buy_v="Kupnje", sell_v="Prodaje", routine="rutinskih transakcija izostavljeno", trials="Klinička ispitivanja", trial="Ispitivanje", phase="Faza", status="Stanje", done="Planirani završetak",
            analyses="Naše analize", since_h="Od naše analize", since_p="Cijena na dan analize ({d}): {a}. Zadnje zatvaranje ({d2}): {b}.", since_ev="novih objava od analize",
            vs="Russell 2000 (IWM) u istom razdoblju", date="Datum", event="Događaj", est="procjena", est_note="Procjena = datum izveden iz prošlih objava ili naveden samo mjesecom; tvrtka ga nije potvrdila.",
            analysis="Analiza", then="Cijena tada", now="Zadnja cijena", chg="Promjena", bench="IWM", source="Izvor",
            track_note="Promjena cijene od sesije na kojoj se analiza temelji do zadnjeg zatvaranja. Analize nisu preporuke za kupnju ili prodaju; prošlo kretanje cijene ne jamči buduće.",
            data_note="Podaci: SEC EDGAR i ClinicalTrials.gov, osvježeno {d} Sažeci događaja nastaju automatski iz službenih obrazaca; izvornik je uvijek na poveznici.",
            app_cta="U aplikaciji Lupa možete pratiti ovu tvrtku i dobiti obavijest o novoj objavi ili kupnji uprave.", all="Sve tvrtke", next_res="Sljedeći rezultati",
            ty=dict(earnings="Rezultati", trial="Ispitivanje", meeting="Skupština", fda="FDA", other="Događaj"), f_all="Sve", open="Otvori", edgar="Sve objave na SEC EDGAR-u"),
 "en": dict(companies="Companies", companies_dek="The companies Lupa covers: deep dives and radar names, with the last close, the day's change and market cap. Official filings are listed below. This is not a buy recommendation.",
            calendar="Catalyst calendar", calendar_dek="Dates that can move the price: financial results and clinical-trial completions for the companies we track.",
            track="Track record", track_dek="What the price did after each of our deep dives — every analysis, including the ones that went badly.",
            nav="Companies", company="Company", price="Price", day="Day", insider12="Insiders (12 mo)", last_event="Latest filing", buys="buys", sells="sales",
            group_dive="Deep dives", group_dive_lead="Companies with their own analysis. Subscribers read the full piece.",
            group_radar="On the radar", group_radar_lead="Names from the free radar. They do not have a deep dive of their own yet.",
            piece_radar="On the radar", profile="Profile and filings",
            timeline="Filings and insider transactions", none="No data yet.", insider_h="Insiders: buys and sales in the last 12 months",
            insider_p="Open-market purchases (code P) and sales (code S) from Form 4 filings. Share grants, tax withholding and option exercises are left out because they are not investment decisions.",
            buy_v="Buys", sell_v="Sales", routine="routine transactions left out", trials="Clinical trials", trial="Trial", phase="Phase", status="Status", done="Planned completion",
            analyses="Our research", since_h="Since our analysis", since_p="Price on the day of the analysis ({d}): {a}. Latest close ({d2}): {b}.", since_ev="new filings since the analysis",
            vs="Russell 2000 (IWM) over the same period", date="Date", event="Event", est="estimate", est_note="Estimate = a date derived from past filings or given only as a month; not confirmed by the company.",
            analysis="Analysis", then="Price then", now="Latest price", chg="Change", bench="IWM", source="Source",
            track_note="Price change from the session the analysis was based on to the latest close. Analyses are not recommendations to buy or sell; past price moves do not guarantee future ones.",
            data_note="Data: SEC EDGAR and ClinicalTrials.gov, refreshed {d}. Event summaries are generated automatically from the official forms; the original is always one click away.",
            app_cta="In the Lupa app you can follow this company and get a notification about a new filing or insider buy.", all="All companies", next_res="Next results",
            ty=dict(earnings="Results", trial="Trial", meeting="Meeting", fda="FDA", other="Event"), f_all="All", open="Open", edgar="All filings on SEC EDGAR"),
}
STATUS_HR = {"RECRUITING": "Uključuje ispitanike", "ACTIVE_NOT_RECRUITING": "U tijeku (bez novih ispitanika)", "COMPLETED": "Završeno",
             "NOT_YET_RECRUITING": "Još nije počelo", "ENROLLING_BY_INVITATION": "Uključivanje po pozivu", "SUSPENDED": "Obustavljeno"}
def trial_status(s, L): return STATUS_HR.get(s, s.replace("_", " ").capitalize()) if L == "hr" else s.replace("_", " ").capitalize()
def p_company(t, L): return f"{L}/{PATHS[L]['companies']}/{t.lower()}/"
def company_link(sym, here, L, inner):
    return f'<a class="chip-link" href="{rel(here, p_company(sym, L))}">{inner}</a>' if sym in COMPANIES else inner
def cview(t): return tracker.company_view(t, COMPANIES[t], POSTS, LATEST, snapshot, TODAY)
def trk_nav(here, L, active):
    tt = TT[L]
    return ('<nav class="trk-nav" aria-label="' + tt["nav"] + '">' + "".join(
        f'<a href="{rel(here, p_page(k, L))}"{" aria-current=\"page\"" if k == active else ""}>{tt[k]}</a>' for k in ("companies", "calendar", "track")) + '</nav>')
def trk_page(L, key, here, alt, title, dek, inner, og_path=None, wide=False):
    gen = TRK_DB.get("generated")
    note = f'<p class="trk-note">{TT[L]["data_note"].format(d=fmt_date(gen, L))}</p>' if gen else ""
    body = (f'<article class="page page-tracker"><header class="article-head"><h1>{esc(title)}</h1><p class="dek">{esc(dek)}</p>{trk_nav(here, L, key)}</header>'
            f'<div class="prose prose-page{" prose-wide" if wide else ""}">{inner}{note}'
            f'<aside class="disclaimer-box">{T[L]["not_advice"]} <a href="{rel(here, p_page("disclaimer", L))}">{T[L]["disclaimer"]}</a>.</aside></div></article>')
    write(here, layout(L, here, alt, title, dek, body, active="tracker", og_path=og_path))
def pct_span(x, L): return f'<span class="{cls(x)}">{fmt_pct(x, L)}</span>'
def event_rows(evs, L, here=None, with_ticker=False):
    rows = ""
    for e in evs:
        badge = {"buy": "ev-buy", "sell": "ev-sell", "filing": "ev-imp" if e["important"] else "ev-file"}[e["kind"]]
        tk = f'<a class="ev-tk" href="{rel(here, p_company(e["ticker"], L))}">{esc(e["ticker"])}</a> ' if with_ticker else ""
        rows += (f'<li class="ev {badge}"><time datetime="{esc(e["date"])}">{fmt_date(e["date"], L)}</time>'
                 f'<span class="ev-form">{esc(e["form"])}</span><span class="ev-text">{tk}<a href="{esc(e["url"])}" rel="noopener">{esc(e["text"][L])}</a></span></li>')
    return f'<ol class="ev-list">{rows}</ol>' if rows else f'<p class="empty">{TT[L]["none"]}</p>'

def build_company(t, L):
    v = cview(t); tt = TT[L]; here = p_company(t, L); other = "en" if L == "hr" else "hr"
    title = f'{v["name"]} ({t})'
    dek = (f'{v["name"]}: službene objave, transakcije uprave i analize Lupe.' if L == "hr" else f'{v["name"]}: official filings, insider transactions and Lupa research.')
    inner = quote_box(t, None, L) if t in LATEST else ""
    s = v["since"]
    if s:
        post = next(p for p in POSTS if p["dir"] == s["post"]); d = decimals(LATEST[t])
        bench = f' · {tt["vs"]}: {pct_span(s["bench_pct"], L)}' if s["bench_pct"] is not None else ""
        inner += (f'<section class="since"><h2>{tt["since_h"]}: {pct_span(s["pct"], L)}</h2>'
                  f'<p>{tt["since_p"].format(d=fmt_date(s["session"], L), a=fmt_num(s["then"], L, d) + " " + s["currency"], d2=fmt_date(s["now_session"], L), b=fmt_num(s["now"], L, d) + " " + s["currency"])}{bench}'
                  f' · <strong>{v["since_events"]}</strong> {tt["since_ev"]}.</p>'
                  f'<p><a href="{rel(here, p_post(post, L))}">{esc(post["title"][L])}</a> {paid_badge(L) if is_paid(post) else ""}</p></section>')
    ne = next((c for c in CALENDAR if c["ticker"] == t and c["type"] == "earnings"), None)
    if ne: inner += f'<p class="next-res"><strong>{tt["next_res"]}:</strong> {fmt_date(ne["date"], L)}{" (" + tt["est"] + ")" if ne["estimate"] else ""} · <a href="{rel(here, p_page("calendar", L))}">{tt["calendar"]}</a></p>'
    i = v["insider"]
    inner += (f'<h2>{tt["insider_h"]}</h2><div class="ins-grid"><div class="ins ins-buy"><span>{tt["buy_v"]}</span><b>{i["buys"]}</b><small>{tracker.usd_short(i["buy_value"], L)}</small></div>'
              f'<div class="ins ins-sell"><span>{tt["sell_v"]}</span><b>{i["sells"]}</b><small>{tracker.usd_short(i["sell_value"], L)}</small></div></div>'
              f'<p class="trk-fine">{tt["insider_p"]} ({i["other"]} {tt["routine"]}.)</p>')
    inner += f'<h2>{tt["timeline"]}</h2>{event_rows(v["events"], L)}<p class="trk-fine"><a href="{esc(v["edgar_url"])}" rel="noopener">{tt["edgar"]} →</a></p>'
    if v["trials"]:
        rows = "".join(f'<tr><td><a href="{esc(x["url"])}" rel="noopener">{esc(x["title"])}</a></td><td>{esc(x["phase"] or "—")}</td><td>{esc(trial_status(x["status"], L))}</td><td>{esc(x["primary_completion"] or "—")}</td></tr>' for x in v["trials"])
        inner += f'<h2>{tt["trials"]}</h2><div class="tablewrap"><table><thead><tr><th>{tt["trial"]}</th><th>{tt["phase"]}</th><th>{tt["status"]}</th><th>{tt["done"]}</th></tr></thead><tbody>{rows}</tbody></table></div>'
    mine = [p for p in POSTS if p["dir"] in v["posts"]]
    if mine: inner += f'<h2>{tt["analyses"]}</h2><ul class="trk-posts">' + "".join(f'<li><a href="{rel(here, p_post(p, L))}">{esc(p["title"][L])}</a> <span class="meta">{fmt_date(p["date"], L)}</span> {paid_badge(L) if is_paid(p) else ""}</li>' for p in mine) + "</ul>"
    inner += f'<p class="note">{tt["app_cta"]}</p>'
    trk_page(L, "companies", here, p_company(t, other), title, dek, inner, og_path=CARDS.get((t, L)))

SECTOR_LABEL = {"hr": {"bio": "Bioinženjering", "quantum": "Kvantno računalstvo"},
                "en": {"bio": "Bioengineering", "quantum": "Quantum computing"}}
def directory_list():
    """Editorial coverage list (content/companies.json `_directory`), not every ticker that appears in an article."""
    raw = json.loads((CONTENT / "companies.json").read_text())
    listed = raw.get("_directory")
    if not isinstance(listed, list) or not listed:
        raise SystemExit("ERROR: content/companies.json is missing a non-empty _directory list")
    out = []
    for t in listed:
        if not isinstance(t, str) or t in out:
            raise SystemExit(f"ERROR: bad _directory entry {t!r}")
        px = LATEST.get(t)
        if not px:
            raise SystemExit(f"ERROR: directory company {t} has no quote in data/prices.json")
        if px.get("type") in ("ETF", "INDEX") or t.startswith("^"):
            raise SystemExit(f"ERROR: {t} is an index or fund and cannot be listed as a company")
        out.append(t)
    return out
def directory_post(ticker):
    """Deep dive when this ticker is the subject; otherwise the latest other piece (the radar)."""
    hits = [p for p in POSTS if ticker in p.get("tickers", [])]
    dives = [p for p in hits if "research" in p.get("categories", []) and tracker.primary_ticker(p, LATEST) == ticker]
    if dives: return dives[0]
    rest = [p for p in hits if tracker.primary_ticker(p, LATEST) == ticker or "research" not in p.get("categories", [])]
    if not rest:
        raise SystemExit(f"ERROR: {ticker} is on the companies directory but has no Lupa article of its own")
    return rest[0]
def is_dive(ticker):
    post = directory_post(ticker)
    return "research" in post.get("categories", []) and tracker.primary_ticker(post, LATEST) == ticker
def directory_row(t, L, here):
    tt = TT[L]; px = LATEST[t]; post = directory_post(t); dive = is_dive(t)
    name = px.get("name") or (COMPANIES.get(t) or {}).get("name") or t
    d = decimals(px)
    sector = SECTOR_LABEL[L].get((COMPANIES.get(t) or {}).get("sector") or "", "")
    kicker = f'<p class="kicker">{esc(sector)}</p>' if sector else ""
    article = rel(here, p_post(post, L))
    piece = T[L]["read_story"] if dive else tt["piece_radar"]
    badge = (paid_badge(L) + " ") if is_paid(post) else ""
    profile = f' · <a href="{rel(here, p_company(t, L))}">{tt["profile"]}</a>' if t in COMPANIES else ""
    mc = FUND.get(t) if isinstance(FUND.get(t), dict) else {}
    mcap = mc.get("market_cap_usd") or ""
    mcap_html = ""
    if mcap:
        src = mc.get("source")
        link = f' · <a href="{esc(src)}" rel="noopener">stockanalysis.com</a>' if src else ""
        mcap_html = f'<p class="meta">{T[L]["mcap"]} ≈ {esc(fmt_cap(mcap, L))} USD{link}</p>'
    meta = " · ".join(x for x in (t, px.get("exchange") or "") if x)
    return (f'<article class="co" data-ticker="{esc(t)}" data-mcap="{esc(mcap)}" data-dive="{"1" if dive else "0"}">'
            f'<div class="co-main">{kicker}<h3><a href="{article}">{esc(name)}</a></h3>'
            f'<p class="meta">{esc(meta)}</p>'
            f'<p class="co-links">{badge}<a href="{article}">{esc(piece)}</a>{profile}</p></div>'
            f'<div class="co-px"><div class="px">{fmt_num(px["last"], L, d)}<small>{esc(px.get("currency") or "")}</small></div>'
            f'<div class="chg {cls(px["change"])}">{fmt_num(px["change"], L, d, True)} ({fmt_pct(px["change_pct"], L)})</div>'
            f'{mcap_html}<p class="meta">{T[L]["close"]} {fmt_date(px["session_date"], L)} · '
            f'<a href="{esc(px["source_url"])}" rel="noopener">{esc(px["source"])}</a></p></div></article>')
def directory_block(L, here):
    tt = TT[L]; listed = directory_list()
    groups = (("dive", tt["group_dive"], tt["group_dive_lead"], [t for t in listed if is_dive(t)]),
              ("radar", tt["group_radar"], tt["group_radar_lead"], [t for t in listed if not is_dive(t)]))
    body = ""
    for _gid, title, lead, tickers in groups:
        if not tickers: continue
        rows = "".join(directory_row(t, L, here) for t in tickers)
        body += (f'<section class="co-group"><h2>{esc(title)}</h2><p class="co-lead">{esc(lead)}</p>'
                 f'<div class="co-dir">{rows}</div></section>')
    return (f'<div class="co-coverage" data-directory="coverage">{body}'
            f'<p class="trk-fine">{T[L]["price_note"]}</p></div><!--coverage-end-->')
def build_tracker_pages(L):
    tt = TT[L]; other = "en" if L == "hr" else "hr"; out = []
    # companies index — coverage directory, then filings for those names only
    here = p_page("companies", L); listed = directory_list(); latest_events = []
    for t in listed:
        if t not in COMPANIES: continue
        latest_events += cview(t)["events"][:6]
    latest_events.sort(key=lambda e: e["date"], reverse=True)
    inner = (directory_block(L, here) + f'<h2>{tt["timeline"]}</h2>'
             + event_rows([e for e in latest_events if e["important"]][:20], L, here, with_ticker=True))
    trk_page(L, "companies", here, p_page("companies", other), tt["companies"], tt["companies_dek"], inner, wide=True); out.append(here)
    for t in COMPANIES: build_company(t, L); out.append(p_company(t, L))
    # calendar
    here = p_page("calendar", L); inner = ""; month = None
    for c in CALENDAR:
        m = c["date"][:7]
        if m != month:
            inner += ("</ol>" if month else "") + f'<h2>{(MONTHS_HR_NOM if L == "hr" else MONTHS_EN)[int(m[5:]) - 1].capitalize()} {m[:4]}{"." if L == "hr" else ""}</h2><ol class="cal-list">'; month = m
        tk = f'<a class="ev-tk" href="{rel(here, p_company(c["ticker"], L))}">{esc(c["ticker"])}</a>' if c.get("ticker") in COMPANIES else esc(c.get("ticker") or "")
        ttl = f'<a href="{esc(c["url"])}" rel="noopener">{esc(c["title"][L])}</a>' if c.get("url") else esc(c["title"][L])
        inner += (f'<li class="cal cal-{esc(c["type"])}"><time datetime="{esc(c["date"])}">{fmt_date(c["date"], L)}</time><span class="cal-type">{tt["ty"].get(c["type"], tt["ty"]["other"])}</span>'
                  f'<span class="ev-text">{tk} {ttl}{" <em class=\"est\">" + tt["est"] + "</em>" if c["estimate"] else ""}</span></li>')
    inner = (inner + "</ol>" + f'<p class="trk-fine">{tt["est_note"]}</p>') if CALENDAR else f'<p class="empty">{tt["none"]}</p>'
    trk_page(L, "calendar", here, p_page("calendar", other), tt["calendar"], tt["calendar_dek"], inner); out.append(here)
    # track record
    here = p_page("track", L); rows = ""
    for r in SCORE:
        post = next(p for p in POSTS if p["dir"] == r["post"]); d = 4 if r["then"] < 1 else 2
        rows += (f'<tr><td><a href="{rel(here, p_post(post, L))}">{esc(post["title"][L])}</a><br><span class="meta">{company_link(r["ticker"], here, L, esc(r["ticker"]))} · {fmt_date(r["date"], L)}</span></td>'
                 f'<td class="r">{fmt_num(r["then"], L, d)}</td><td class="r">{fmt_num(r["now"], L, d)}</td><td class="r">{pct_span(r["pct"], L)}</td>'
                 f'<td class="r">{pct_span(r["bench_pct"], L) if r["bench_pct"] is not None else "—"}</td></tr>')
    inner = (f'<div class="tablewrap"><table class="trk-table"><thead><tr><th>{tt["analysis"]}</th><th class="r">{tt["then"]}</th><th class="r">{tt["now"]}</th><th class="r">{tt["chg"]}</th><th class="r">{tt["bench"]}</th></tr></thead><tbody>{rows}</tbody></table></div>'
             if SCORE else f'<p class="empty">{tt["none"]}</p>') + f'<p class="trk-fine">{tt["track_note"]}</p>'
    trk_page(L, "track", here, p_page("track", other), tt["track"], tt["track_dek"], inner, og_path=CARDS.get(("track", L)), wide=True); out.append(here)
    return out
MONTHS_HR_NOM = ["siječanj","veljača","ožujak","travanj","svibanj","lipanj","srpanj","kolovoz","rujan","listopad","studeni","prosinac"]

# ---------- main ----------
import urllib.parse
POSTS = load_posts(); PAGES = load_pages(); PAID_INDEX = {}
CALENDAR = tracker.calendar(TRK_DB, TRK_MANUAL, TODAY)
SCORE = tracker.scorecard(POSTS, LATEST, snapshot)
CARDS = {}   # (ticker | "track", lang) → path of the share-card PNG inside dist/ (only when Pillow is installed)
if OUT.exists(): shutil.rmtree(OUT)
if PRIVATE.exists(): shutil.rmtree(PRIVATE)
PRIVATE.mkdir(parents=True)
shutil.copytree(SRC / "assets", OUT / "assets", ignore=shutil.ignore_patterns("manifest.json"))
(OUT / ".nojekyll").write_text("")
try:
    import cards
    CARDS = cards.make_all(OUT, {t: cview(t) for t in COMPANIES}, SCORE, POSTS)
except ImportError as e:
    print(f"share cards skipped ({e}); pip install pillow to enable")
paths = []
for L in LANGS:
    other = "en" if L == "hr" else "hr"
    build_home(L); paths.append(p_home(L))
    for p in POSTS: build_post(p, L); paths.append(p_post(p, L))
    for cid in CATS:
        items = [p for p in POSTS if cid in p["categories"]]
        list_page(L, p_cat(cid, L), p_cat(cid, other), CATS[cid][L]["name"], CATS[cid][L]["desc"], items, cid, CATS[cid].get("image", "home-hero")); paths.append(p_cat(cid, L))
    list_page(L, p_archive(L), p_archive(other), T[L]["archive"], SITE["description"][L], POSTS, "archive", "research-desk"); paths.append(p_archive(L))
    for key, pg in PAGES.items(): build_static_page(key, pg, L); paths.append(p_page(key, L))
    paths += build_tracker_pages(L)
build_root(); build_feeds_and_sitemap(paths)
(PRIVATE / "paid-index.json").write_text(json.dumps(PAID_INDEX, ensure_ascii=False, indent=1))
print(f"Built {len(POSTS)} posts × {len(LANGS)} languages, {len(paths)} pages → {OUT}")
print(f"Subscriber-only: {', '.join(PAID_INDEX) or 'none'} (private bodies → {PRIVATE}, not in {OUT.name}/)")
