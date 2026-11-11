# Lupa — Istraživanje malih dionica / Small-cap research

Bilingual (HR + EN) static research blog on small-cap stocks, bioengineering and quantum computing.
Zero-dependency Python generator (Python 3.9+, standard library only) + a small zero-dependency Node backend
(Vercel Functions in `api/`) for the freemium paywall and the Stripe subscription. No secrets in the repo.

## Folder map

```
lupa/
├── build.py                  # generator → dist/
├── content/
│   ├── site.json             # name, taglines, descriptions, categories (HR/EN names + slugs)
│   ├── posts/<YYYY-MM-DD-slug>/
│   │   ├── meta.json         # date, slugs {hr,en}, categories, tickers, prices_session, title/dek {hr,en}, sources
│   │   ├── hr.html           # Croatian body (HTML fragment + price tokens)
│   │   └── en.html           # English body
│   ├── pages/{about,disclaimer,newsletter,advertise,subscribe,account,privacy,terms}/  meta.json (+ optional "hero") + hr.html + en.html
│   ├── images/<name>.jpg     # ORIGINAL source illustrations (generated for Lupa)
│   ├── images.json           # per image: alt {hr,en} + caption {hr,en}
│   └── monetization.json     # contact email, newsletter provider, ad slots, subscription display text
├── data/
│   ├── prices.json           # latest fetched quotes (used by the home-page tape and "Markets in numbers")
│   ├── snapshots/<session>.json   # frozen quotes per session; articles read ONLY from their snapshot
│   └── fundamentals.json     # market cap / shares out (stockanalysis.com) shown in quote boxes
├── scripts/
│   ├── update_prices.py      # fetch Yahoo Finance daily closes → prices.json + snapshots/
│   ├── new_post.py           # scaffold a bilingual post (as draft)
│   ├── process_images.py     # content/images → src/assets/img (480/800/full webp+jpg, 1200×630 OG) — needs Pillow
│   ├── check_links.py        # verify all internal links/assets, tokens and hreflang in dist/
│   ├── check_paywall.py      # FAIL if any subscriber-only sentence appears anywhere in dist/ (HTML, RSS, sitemap, JS…)
│   ├── export_app_feed.py    # dist/ → dist/app/v1/feed.json (public content for the mobile app; run by package_vercel.py)
│   └── package_vercel.py     # dist/ + api/ + private/ → .vercel/output (Build Output API v3) → site.tgz
├── api/                      # Vercel Functions (Node 22, no npm deps): checkout, checkout-complete, session, article, portal, logout, stripe-webhook + lib.js
│                             #   + app-entitlement, app-article, store-verify.js (mobile app store subscriptions — see "Mobilna aplikacija")
├── private/                  # BUILD OUTPUT: subscriber-only article bodies. Never published as static files; bundled only into /api/article
├── site.tgz                  # BUILD OUTPUT: the single file uploaded to Vercel
├── src/assets/               # css (style.css, fonts.css), self-hosted woff2 fonts, js, favicon
└── dist/                     # public static output (teasers only for paid posts) — deployed via site.tgz, not on its own
```

## Build

```bash
python3 build.py                                   # relative links: works on any host or sub-path
python3 build.py --base-url https://USER.github.io/REPO   # production: absolute canonical + hreflang, sitemap.xml, robots.txt, hr/feed.xml, en/feed.xml
python3 scripts/check_links.py                     # must print "0 problems"
```

For GitHub Pages: publish `dist/` (e.g. push its contents to a `gh-pages` branch or use an Actions
"upload-pages-artifact" step with `path: dist`). `dist/.nojekyll` is included. All internal links are
relative, so a project site (`/REPO/`) works without config; pass `--base-url` so that canonical/hreflang
URLs, the sitemap, RSS and the 404 page's asset paths are absolute and correct. Without `--base-url`,
`404.html` assumes the site is served from the domain root.

## URL scheme

| Page | HR | EN |
|---|---|---|
| Root | `/` → JS redirect to remembered language (localStorage `lupa-lang`), else browser language, else HR | |
| Home | `/hr/` | `/en/` |
| Article | `/hr/clanci/<slug.hr>/` | `/en/articles/<slug.en>/` |
| Category | `/hr/rubrika/<slug>/` | `/en/category/<slug>/` |
| Archive | `/hr/arhiva/` | `/en/archive/` |
| About | `/hr/o-nama/` | `/en/about/` |
| Disclaimer | `/hr/izjava-o-odgovornosti/` | `/en/disclaimer/` |
| Newsletter | `/hr/newsletter/` | `/en/newsletter/` |
| Advertising | `/hr/oglasavanje/` | `/en/advertise/` |
| Subscribe | `/hr/pretplata/` | `/en/subscribe/` |
| Account (status, manage/cancel) | `/hr/racun/` | `/en/account/` |
| Privacy policy | `/hr/privatnost/` | `/en/privacy/` |
| Terms of use & subscription | `/hr/uvjeti/` | `/en/terms/` |
| Old donation page (308 → subscribe) | `/hr/podrzi-lupu/` | `/en/support/` |

Every page has `hreflang` alternates and a HR/EN switch that lands on the same piece in the other language.
Categories: `markets` (Tržište/Markets), `small-caps` (Male dionice/Small caps), `bioengineering`
(Bioinženjering/Bioengineering), `quantum` (Kvantno računalstvo/Quantum computing), `research` (Analize firmi/Company research).

## Adding a daily post

1. Fetch prices after the US close (prints each close; also writes `data/snapshots/<session>.json`):
   `python3 scripts/update_prices.py ^GSPC ^IXIC ^DJI ^RUT ^VIX IWM XBI IBB TICKER1 TICKER2`
   (no arguments = refresh every ticker already in prices.json). Never type prices by hand.
2. Scaffold: `python3 scripts/new_post.py 2026-11-12 "hr-slug" "en-slug" markets,small-caps TICKER1 TICKER2`
3. Edit `meta.json`: titles/deks in both languages, `prices_session` = the session date from step 1,
   `order` (higher = earlier on the home page among same-date posts), `sources` (label + URL), remove `"draft": true`.
4. Write `hr.html` and `en.html` (same structure and facts). Allowed HTML: p, h2, h3, ul/ol, blockquote,
   table (wrap in `<div class="tablewrap">`; numeric cells `class="r"`), `<div class="facts"><dl>…</dl></div>`, `<div class="note">`.
5. Access: wraps/radar are `"access": "free"`. Posts in the `research` category are **subscriber-only by default**
   (`"access": "subscribers"`; `new_post.py` sets it). Add `"access": "free"` to unlock one, or `"access": "subscribers"` to lock any other post.
   Paid posts show title, dek, hero and the intro + first `<h2>` section (`"preview_sections": 1`, change per post) — they need at least 2 `<h2>` sections.
6. Build, check and deploy — see **Deploy (Vercel)** below.

Price tokens (resolved from the post's frozen snapshot; build fails loudly if a ticker is missing):
`{{quote:DNA}}` full quote box with sparkline · `{{quotes:A,B,C}}` grid of boxes · `{{q:DNA}}` inline chip ·
`{{px:DNA}}` last · `{{chg:DNA}}` day % · `{{chgabs:DNA}}` day change · `{{prev:DNA}}` previous close ·
`{{m1:DNA}}` 1-month % · `{{hi52:DNA}}` / `{{lo52:DNA}}` · `{{off52:DNA}}` % below 52-week high.
Quote boxes show ticker, name, exchange, last price, currency, day change (amount and %), session date,
Yahoo data time in ET and Zagreb time, 1-month change, source link, and market cap if present in fundamentals.json.
Numbers are formatted per language (HR `7.520,93` / `−0,38 %`; EN `7,520.93` / `−0.38%`).

## Launch articles (all dated 11 Nov 2026, prices = close of 10 Nov 2026)

| # | HR title / slug | EN title / slug | Words HR/EN |
|---|---|---|---|
| 1 | Ginkgo Bioworks: od tvornice organizama do prodavača robotskih laboratorija — `/hr/clanci/ginkgo-bioworks-autonomni-laboratoriji-analiza/` | Ginkgo Bioworks: from organism foundry to seller of robotic labs — `/en/articles/ginkgo-bioworks-autonomous-labs-deep-dive/` | ~1,055 / 1,066 |
| 2 | Infleqtion: kvantna tvrtka koja zarađuje na senzorima dok gradi računalo — `/hr/clanci/infleqtion-neutralni-atomi-kvantni-senzori-analiza/` | Infleqtion: the quantum company earning on sensors while it builds a computer — `/en/articles/infleqtion-neutral-atoms-quantum-sensing-deep-dive/` | ~1,140 / 1,160 |
| 3 | Inflacija vraća kamate u igru — male dionice drže korak bolje od tehnologije — `/hr/clanci/trziste-10-studenoga-2026-inflacija-kamate-male-dionice/` | Inflation puts rates back in play — and small caps are holding up better than tech — `/en/articles/market-wrap-10-november-2026-inflation-rates-small-caps/` | ~865 / 855 |
| 4 | Danas na radaru: šest imena iz bioinženjeringa i kvantnog sektora — `/hr/clanci/danas-na-radaru-11-studenoga-2026/` | On the radar: six names from bioengineering and quantum — `/en/articles/on-the-radar-11-november-2026/` | ~1,135 / 1,130 |

Plus About (`o-nama` / `about`) and Disclaimer (`izjava-o-odgovornosti` / `disclaimer`), 5 category pages and an archive per language.

## Prices used (Yahoo Finance chart API, session 10 Nov 2026; fetched 11 Nov 2026 ~00:15 CET)

Source: `https://query1.finance.yahoo.com/v8/finance/chart/<TICKER>` (public quote pages `https://finance.yahoo.com/quote/<TICKER>`).
Change = close minus previous session close. "Yahoo data time" is Yahoo's `regularMarketTime` (index values are stamped 16:15–17:15 ET).
Full 1-month daily series are in `data/snapshots/2026-11-10.json` (used for the sparklines and 1-month % figures).

| Ticker | Name | Close | Change | Change % | Prev close | 52w low–high | Yahoo data time |
|---|---|---:|---:|---:|---:|---|---|
| ^GSPC | S&P 500 | 7520.9302 USD | -29.01 | -0.38% | 7549.9399 | 6316.91–7844.52 | 2026-11-10 17:00 ET |
| ^IXIC | NASDAQ Composite | 25065.875 USD | -187.3 | -0.74% | 25253.1406 | 20690.25–27722.75 | 2026-11-10 17:15 ET |
| ^DJI | Dow Jones Industrial Average | 52231.8906 USD | -157.9 | -0.30% | 52389.75 | 45057.28–54744.33 | 2026-11-10 17:00 ET |
| ^RUT |  Russell 2000 Index | 2821.3755 USD | -19.43 | -0.68% | 2840.8101 | 2303.46–3069.71 | 2026-11-10 16:30 ET |
| ^VIX | CBOE Volatility Index | 19.46 USD | -0.46 | -2.31% | 19.92 | 13.38–35.3 | 2026-11-10 16:15 ET |
| IWM | iShares Russell 2000 ETF | 280.58 USD | -1.93 | -0.68% | 282.51 | 228.9–305.18 | 2026-11-10 16:00 ET |
| XBI | State Street SPDR S&P Biotech ETF | 155.06 USD | -1.84 | -1.17% | 156.9 | 109.53–169.89 | 2026-11-10 16:00 ET |
| IBB | iShares Biotechnology ETF | 217.18 USD | -2.39 | -1.09% | 219.57 | 159.42–222.29 | 2026-11-10 16:00 ET |
| DNA | Ginkgo Bioworks Holdings, Inc. | 12.01 USD | -0.36 | -2.91% | 12.37 | 5.37–18.22 | 2026-11-10 16:00 ET |
| INFQ | Infleqtion, Inc. | 9.35 USD | -0.31 | -3.21% | 9.66 | 7.01–21.28 | 2026-11-10 16:00 ET |
| ABSI | Absci Corporation | 9.97 USD | -0.83 | -7.69% | 10.8 | 2.24–12.545 | 2026-11-10 16:00 ET |
| CDXS | Codexis, Inc. | 1.0 USD | -0.11 | -9.91% | 1.11 | 0.96–2.98 | 2026-11-10 16:00 ET |
| SANA | Sana Biotechnology, Inc. | 2.43 USD | -0.035 | -1.42% | 2.465 | 2.22–5.49 | 2026-11-10 16:00 ET |
| RGTI | Rigetti Computing, Inc. | 12.15 USD | -0.83 | -6.39% | 12.98 | 9.191–32.18 | 2026-11-10 16:00 ET |
| QBTS | D-Wave Quantum Inc. | 10.48 USD | -0.99 | -8.63% | 11.47 | 8.48–32.39 | 2026-11-10 16:00 ET |
| QUBT | Quantum Computing Inc. | 6.3 USD | -0.56 | -8.16% | 6.86 | 5.39–14.45 | 2026-11-10 16:00 ET |
| NVDA | NVIDIA Corporation | 168.89 USD | -9.78 | -5.47% | 178.67 | 164.27–243.37 | 2026-11-10 16:00 ET |
| IONQ | IonQ, Inc. | 34.99 USD | -0.35 | -0.99% | 35.34 | 24.915–73.65 | 2026-11-10 16:00 ET |

Cross-checks: S&P 500 7,520.93 (−29.01, −0.38%), Dow 52,231.89 (−157.86), Nasdaq 25,065.87 (−187.26) match Reuters/Investing.com
and Anadolu Agency reports for 10 Nov 2026; NVDA 168.89 (−5.47%) matches Reuters' table.

## Market caps (stockanalysis.com, read 11 Nov 2026 ~00:15 CET, based on 10 Nov close) — `data/fundamentals.json`

DNA 808.76M (67.34M sh) · INFQ 2.11B (225.36M sh) · ABSI 1.71B · CDXS 110.05M · SANA 726.61M · RGTI 4.05B · QBTS 3.90B · QUBT 1.43B · IONQ 15.11B.
TTM revenue used in the Infleqtion comparison table (same source): INFQ 42.44M, IONQ 380.44M, RGTI 13.35M, QBTS 13.20M.

## Key facts and their sources

**Market wrap (10 Nov 2026)**
- Oct CPI +0.4% m/m vs 0.3% expected; core +0.3% vs 0.2%; Sept +0.6%; third straight ≥0.4% headline gain; no YoY because Oct 2025 data not collected (shutdown) — Reuters via Investing.com https://www.investing.com/news/stock-market-news/sp-500-dow-futures-climb-as-oil-slide-lifts-sentiment-5014579 ; Anadolu https://www.aa.com.tr/en/economy/us-stocks-close-lower-as-nvidia-slides-inflation-fuels-rate-hike-fears/4119589
- Fed hiked in Sept (first in 3 years); Waller favours 25 bp Dec hike, 50 bp to be considered; CME FedWatch: ≥25 bp fully priced, 50 bp 11.8%; 10y >5% intraday, ~4.99% close; S&P tech −1.4%; SOX −0.4%; Nasdaq intraday −1.7% — Reuters (above), Investopedia https://www.investopedia.com/stock-market-today-dow-jones-s-and-p-500-nasdaq-11102026-12246538
- Nvidia board probe, Joon H. Kim + Wachtell retained — Anadolu (above)
- 5 Nov 2026: S&P 500 −4.4%, worst day since April 2025, AI/midterm fears — AP https://apnews.com/article/stocks-markets-ai-midterm-oil-trump-7ee9c212805aa5e70cf34d25aab7a36e . Daily moves for 4/5/6/9 Nov and 1-month changes are Lupa calculations from Yahoo closes.

**Ginkgo Bioworks (DNA)** — Q3 2026 release (Ex. 99.1, 5 Nov 2026) https://www.sec.gov/Archives/edgar/data/1830214/000162828026071022/ex991earningspr.htm and call transcript https://www.fool.com/earnings/call-transcripts/2026/11/06/ginkgo-bioworks-dna-q3-2026-earnings-call-transcript/
- Revenue Q3 27.711M (Q3'25 29.380M), 9M 67.341M (106.744M); R&D 40.945M; G&A 28.593M; net loss cont. ops 40.984M (73.354M); adj. EBITDA −22M (−53M); cash+securities 285M (84.504 + 200.857); restricted 84.237M; Q3 burn 27M; 9M burn ~120M; FY26 burn guide 125–150M; ATM 9M gross 23.795M, ~7M net in Q3; weighted shares 63.97M vs 55.63M; non-current lease liabilities 397.198M; excess-space cost 13.989M Q3 / 44.063M 9M; accumulated deficit 6.32B; R&D ex-SBC 27M vs 51M (−48%).
- Customers/partners: Novo (autonomous lab sale, Waltham MA), PNNL 97-RAC system, ARPA-H GIVE up to 17.5M, NSF PCL (~400M), Caltech/UMD/Northwestern, MIT Media Lab, X-Labs 1.5B (OSTP, 8 Oct), Takeda/Argenx/Lundbeck/AbbVie consortium, GSK/Novartis/Biogen, OpenAI; Google Cloud restructuring payment 14M (call); 105 RACs; 200–300 tech-hours/day (peak 500); ADME 199 USD vs ~1,000 at WuXi (call); 22 ADME customers in Q3, 20 new.
- Consensus revenue 21.57M — Investing.com https://www.investing.com/news/earnings/ginkgo-bioworks-earnings-beat-by-037-revenue-topped-estimates-5005793 ; analyst rating "Sell", target 8.00 — stockanalysis.com.
- Lupa calculations (labelled in text): ~2-year runway at guided burn; market cap ≈ 2.8× cash; ~0.5B implied value ex-leases.

**Infleqtion (INFQ)** — Q2 release https://ir.infleqtion.com/news-events/press-releases/detail/201/infleqtion-reports-record-q2-revenue-raises-2026-outlook-as-quantum-commercialization-accelerates ; updated Q2 https://ir.infleqtion.com/news-events/press-releases/detail/202/infleqtion-reports-updated-financial-results-for-q2-2026-and-fy26-revenue-guidance ; 10-Q https://www.sec.gov/Archives/edgar/data/2007825/000162828026057508/infq-20260630.htm ; listing https://ir.infleqtion.com/news-events/press-releases/detail/166/infleqtion-and-churchill-capital-corp-x-complete-business-combination
- Listed NYSE 17 Feb 2026 (merger closed 13 Feb) with Churchill Capital Corp X; trust ~401.6M + PIPE 126.5M; Q2 revenue 13.5M (revised from 12.6M), +157%; GAAP op loss 29.9M, non-GAAP 16.2M; FY26 guide ~45.1M; cash etc. 582M, no debt, incl. 27.4M payroll taxes to remit in Q3; Q2 burn ex-timing ~14M; 30 logical qubits target 2026; Illinois IQMP system 2027 (>50 → 100 logical qubits); Commerce LOI up to 100M (not definitive at Q2); Eaton; NASA QGG; 3 DOE Genesis projects; Safran co-selling; NVIDIA NVQLink (Oct 2025) and Ising integration (Apr 2026).
- 6 Oct 2026 Honeywell Aerospace/UCSB optical cavity; 13 Oct 2026 £9M Innovate UK QuDiFi with Leonardo; 30 Oct 2026 Tiqker aboard USN RV Merlin (Maritime Big Play Pacific) — infleqtion.com newsroom (URLs in post sources).
- Q3 report 16 Nov 2026 after close; consensus revenue ~11.03M, EPS −0.05 — TradingView.
- Lupa calculation: EV ≈ 1.55B (2.11B − ~555M), ≈34× 2026 revenue guide.

**Watchlist** — Absci Q2 release (ABS-201 Ph1/2a, ≥65-day half-life, Lilly 40M equity, cash 201.1M, runway into 2H 2028, interim PoC 2H 2026, endometriosis Ph2 Q4 2026); Almirall expansion; AMD blog. Sana Q3 release (cash 121.7M, runway mid-2027, UP421 14-month data, NEJM letter, Mayo Clinic, Q3 GAAP NI 20.4M, non-GAAP loss 43.0M, SC451 IND this year, SG293 data 1H 2027). Codexis 9 Nov release (>90% quality at 100 g, cycle time nearly halved, 3–4× potency) + RTTNews (60M Trinity Capital loan, 48-month interest-only). QCi Q3 release (rev 9.5M vs 384K, GM 4.5%, opex 29.0M, net loss 15.1M, ~1.3B cash/investments, backlog 39.1M, INmune Bio). Rigetti Q3 release (rev 1.4M, 99.5% fidelity on 108Q, 497.1M cash, CHIPS up to 100M, C-DAC) + Investing.com (consensus 3.7M, −8.7% after hours). D-Wave Q3 release (rev 4.5M +21%, bookings 1.9M −19%, 9M 37.4M, RPO 38.3M, cash 503.4M, adj. EBITDA loss 37.7M, DOCOMO, CGI, LG CNS, SkyWater) + Fool transcript (20M FAU system). Earnings dates 12 Nov (ABSI, CDXS, TWST) from stockanalysis.com.

## Known gaps / notes for the publisher

- Prices are delayed end-of-day closes, frozen per article. The home-page tape/"Markets in numbers" show whatever `data/prices.json` holds at build time — rerun `update_prices.py` before each build.
- Market caps are from stockanalysis.com at read time, not recomputed daily; refresh `data/fundamentals.json` when a post uses them.
- Yahoo's chart endpoint is unofficial; if it fails, the script prints FAIL and leaves old data untouched — do not hand-type numbers.
- Infleqtion's Q3 numbers (16 Nov) and Absci/Codexis/Twist Q3 (12 Nov) were not yet published at writing time.
- No author name is shown (byline "Uredništvo Lupe / Lupa research desk"). The disclaimer states that any author position will be disclosed — keep that promise or edit the text.
- No analytics or comments. The only cookie is the strictly necessary httpOnly subscription session cookie (set only after Checkout). The newsletter runs in demo (mailto) mode until a provider is configured (see below). Fonts (Newsreader, IBM Plex Sans/Mono, SIL OFL) are self-hosted — no Google Fonts requests.

## Images

- All images are original illustrations generated for Lupa (no press photos, no real people, labs, products or campuses). Captions say "Ilustracija / Illustration" and, where useful, what they do *not* show.
- Add an image: put `content/images/<name>.jpg` (≥1280 px wide), add `<name>` with `alt` and `caption` in both languages to `content/images.json`, run `python3 scripts/process_images.py` (Pillow), then `python3 build.py`.
- Article hero: `"hero": "<name>"` in the post's `meta.json` (default `home-hero`). It is also the card thumbnail and the OG/Twitter image (`<name>-og.jpg`, only emitted as absolute URL when `--base-url` is set).
- Supporting image inside a body: put `{{img:<name>}}` on its own line.
- Category tiles/banners: `"image"` per category in `content/site.json`.
- Pages: `<picture>` with WebP + JPEG `srcset` (480/800/full), width/height set, lazy-loaded except the hero.

## Zarada / Monetization (all in `content/monetization.json`)

Everything is labelled and works without a backend. Nothing here holds secrets — it is published with the site.

| Piece | Where | Status now | To go live |
|---|---|---|---|
| Newsletter form | home band, end of every article, article sidebar, `/hr/newsletter/` | **Demo**: validates the address, opens a pre-filled email to `contact_email`, says so honestly | Set `newsletter.action_url` (see below) |
| Ad slots | `in_article` (before 3rd section of every article), `sidebar` (article rail ≥1100 px, category/archive pages), `home_band` | **House ad** "Oglasni prostor / Ad space → Oglašavanje na Lupi" | Paste the network/banner HTML into `ads.slots.<slot>`; it is wrapped with an "Oglas / Advertisement" label |
| Sponsored posts | any post | Format ready, no sponsors | Add `"sponsored": {"name": "Partner d.o.o.", "url": "https://…"}` to `meta.json` → "Sponzorirano / Sponsored" kicker on cards + banner with disclosure on the article; link gets `rel="sponsored"` |
| Advertising page | `/hr/oglasavanje/`, `/en/advertise/` | Starting rate card (media kit, "from" prices, excl. VAT): newsletter mention from €150/issue, on-site partner slot from €400/month, sponsored explainer from €1,200/piece; editorial rules; contact CTA | Replace `contact_email`; adjust prices in the page HTML |
| Subscription (replaces the old €3/€7/€15 „Čitateljski krug” donation tiers, retired) | `/hr/pretplata/`, `/en/subscribe/`, paywall on paid articles, `/hr/racun/`, `/en/account/` | One plan: **Pretplata na Lupu / Lupa subscription, 7 € / month**, Stripe Checkout | See **Pretplata / Subscription** below |

**Before launch:** replace `contact_email` (`urednistvo@lupa.example` is a placeholder and does not receive mail).

### Connecting a newsletter provider (public form endpoints only, no API keys)

- **Buttondown:** `"provider": "buttondown", "action_url": "https://buttondown.com/api/emails/embed-subscribe/<USERNAME>", "email_field": "email", "language_field": "tag"` (create tags `hr` and `en` in Buttondown).
- **Mailchimp:** in Audience → Signup forms → Embedded forms copy the `<form action="https://….list-manage.com/subscribe/post?u=…&id=…">` URL into `action_url`; `"email_field": "EMAIL"`; put the hidden bot-field (`b_<u>_<id>`: "") and any group/tag fields in `hidden_fields`; set `language_field` to a merge field (e.g. `"LANG"`) you create.
- **Beehiiv:** Beehiiv's public embed is an iframe; easiest is to set `action_url` to your Beehiiv subscribe page form endpoint if your plan exposes one, or replace `{{newsletter_form}}` on the newsletter page with the Beehiiv embed snippet. Do not put the Beehiiv API key in this repo (it would be public).
In live mode the form submits in a new tab to the provider (which handles double opt-in), and the page shows "check your inbox".

### Disclosures
Privacy policy and terms: `content/pages/privacy/`, `content/pages/terms/` (URLs in the URL-scheme table). They point to the disclaimer rather than repeating it.
`/hr/izjava-o-odgovornosti/` / `/en/disclaimer/` now cover: not investment advice, HANFA (Lupa is not supervised), author positions, commercial relationships, ad/sponsored labelling, affiliate links (none used today), subscribers have no editorial influence, "no paying partners or sponsors as of this statement", and the AI-illustration note. Keep these true as things change.


## Pretplata / Subscription (freemium paywall)

**Rules.** Free: market wraps, „Danas na radaru / On the radar”, every non-article page, all titles/deks/heroes/listings.
Subscribers: company deep dives (`research` category by default, or any post with `"access": "subscribers"`). Today:
Ginkgo Bioworks and Infleqtion are paid; the 10 Nov market wrap and the 11 Nov radar are free. Paid posts carry a
„Za pretplatnike / For subscribers” badge on the home page, cards, lists and the article header.

**No static leak.** `build.py` writes only the teaser (intro + first section) into `dist/`. The rest of each paid body
goes to `private/paid/<post>.<lang>.html`, which `package_vercel.py` copies only into the `/api/article` function bundle.
RSS items carry the dek only; the sitemap lists URLs only. `scripts/check_paywall.py` compares every sentence of the
private bodies with every public file and `package_vercel.py` refuses to package if anything leaks.

**Flow / routes (Vercel Functions, `api/*.js`):**

| Route | What it does |
|---|---|
| `POST /api/checkout` | Same-origin form post (lang, next) → Stripe Checkout Session (`mode=subscription`, `STRIPE_PRICE_ID`, `locale` hr/en). Refuses unless the price is exactly 7.00 EUR / month. Card + Google Pay / Apple Pay come from Stripe Checkout's wallets (Stripe Dashboard → Settings → Payment methods). |
| `GET /api/checkout-complete` | Stripe's success redirect. Retrieves the Checkout Session from the Stripe API, requires `complete` + paid + active subscription + same browser (nonce cookie) or < 30 min old, then sets the session cookie and returns to the article (or the account page). |
| `GET /api/article?post=&lang=` | Returns the paid remainder as JSON **only** after an entitlement check; `401`/`402` otherwise; `Cache-Control: private, no-store`. Loaded by `assets/js/site.js` into `.paid-body`. |
| `GET /api/session` | `{payments, active, lapsed, portal_login_url}` for the subscribe/account pages. No ids or secrets. |
| `POST /api/portal` | Stripe Customer Portal session (update card, invoices, cancel at period end). |
| `POST /api/logout` | Clears the cookie on this device. |
| `POST /api/stripe-webhook` | Verifies `Stripe-Signature` (HMAC, 5-min tolerance) and syncs `customer.metadata.lupa_status`. |

**Session.** Cookie `__Host-lupa_session`: HttpOnly, Secure, SameSite=Lax, 1 year, HMAC-SHA256-signed with
`SESSION_SECRET`; holds only the Stripe customer id and the time of the last check. Access is re-verified against the
Stripe Subscriptions API at least every 10 minutes (active / trialing / past_due = access); a cancelled or unpaid
subscription loses access within 10 minutes. No database.

**Vercel env vars (Project → Settings → Environment Variables, Production + Preview).** After changing any, redeploy.

| Key | Value | Status |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_test_…` now, `sk_live_…` at launch) — or a restricted key with write on Checkout Sessions, Customer portal, Customers and read on Prices, Subscriptions | **Karlo must add** (cannot be read through the Stripe connector) |
| `STRIPE_PRICE_ID` | 7 €/month price | set (test: `price_1UaVDmB52kOGCWyZFl038wJX`, product `prod_VbifmQD3JBnnil`) |
| `STRIPE_WEBHOOK_SECRET` | signing secret of the webhook to `https://lupa-lovat.vercel.app/api/stripe-webhook` | set (test webhook `we_1UaVDuB52kOGCWyZDRRhfiRI`), sensitive |
| `SESSION_SECRET` | ≥32 random chars | set, sensitive |
| `STRIPE_PORTAL_CONFIG_ID` | Customer Portal configuration | set (test `bpc_1UaVEGB52kOGCWyZ953RHTNV`) |
| `STRIPE_PORTAL_LOGIN_URL` | portal email-login link (`https://billing.stripe.com/p/login/…`) | set (test) |
| `SITE_URL` | `https://lupa-lovat.vercel.app` | set |
| `STRIPE_AUTOMATIC_TAX` | `1` to turn on Stripe Tax in Checkout (only after Stripe Tax is configured) | not set |

While `STRIPE_SECRET_KEY` is missing (or the price is wrong), the site says honestly „Plaćanja još nisu aktivna /
Payments are not active yet”, the subscribe button is disabled and nothing can be charged.

**Going live (real money):** in live mode create the same product/price (7 EUR monthly), a webhook to
`/api/stripe-webhook` with events `checkout.session.completed` and `customer.subscription.created|updated|deleted|paused|resumed`
(API version 2024-06-20), a portal configuration (cancel at period end, card update, invoices, login page), then
replace the env vars with the live values and redeploy.

**Known gaps.** (1) Restore on a new device: access is tied to the browser that paid. Stripe's portal login link lets a
subscriber manage/cancel from anywhere, but it does not hand an identity back to Lupa, so a self-serve „sign in by email”
needs a transactional mail provider (e.g. Resend/Postmark) — not built, and the account page says so. (2) VAT: no
Stripe Tax; the price is 7 € flat with `tax_behavior: unspecified`. Decide VAT/OSS treatment with an accountant, then set
`STRIPE_AUTOMATIC_TAX=1`. (3) Legal pages are live (since 11 Nov 2026): privacy policy https://lupa-lovat.vercel.app/hr/privatnost/ ·
https://lupa-lovat.vercel.app/en/privacy/ and terms of use/subscription (incl. the EU 14-day withdrawal right and the
digital-content caveat) https://lupa-lovat.vercel.app/hr/uvjeti/ · https://lupa-lovat.vercel.app/en/terms/ — linked from
the footer, subscribe box, subscribe/account/newsletter pages; the mobile app links to the same four URLs. Still to do:
Checkout does not yet collect the express consent + acknowledgement for immediate access, so the terms say the 14-day
withdrawal right stays in full until it does (add a Stripe Checkout `consent_collection`/custom-text checkbox and link
the terms in the Stripe Customer Portal settings). Have a lawyer review both pages; keep the privacy page in sync if a
newsletter provider or any new third party is added. (4) Without JavaScript a
subscriber sees the teaser only. (5) Replace the placeholder contact email.

## Deploy (Vercel) — use this for every publish, including the daily post

The Vercel project `lupa` is served from a **Build Output API v3** tree packed into one archive, so the static site
and the `/api/*` functions ship together in a single upload.

```bash
python3 build.py --base-url https://lupa-lovat.vercel.app
python3 scripts/check_links.py          # must print 0 problems
python3 scripts/package_vercel.py       # runs check_paywall.py, writes .vercel/output/ and site.tgz
```

Then upload `site.tgz` (Vercel connector `upload_file` with its SHA1 and size) and `create_deployment` with
`files: [{file: "site.tgz", sha, size}]`, `project: lupa`, `target: production`.
Project settings (already saved): Framework **Other**, Install command **empty**, Build command **`tar -xzf site.tgz`**,
Output directory **empty** (Vercel detects `.vercel/output`), Node 22. Do **not** go back to the old “unpack into `out`”
setup — that would serve static files only and the paywall API (and therefore paid articles for subscribers) would break.
Never deploy `dist/` alone and never put `private/` into a public folder.


## Mobilna aplikacija / Mobile app (iOS + Android) — `/workspace/lupa-app/`

The Expo app (one codebase, App Store + Google Play) lives in a **separate project** (`../lupa-app`, its own README) and is
not part of `site.tgz`. The website only provides two things for it, both shipped by the normal deploy above:

| Piece | What | Status |
|---|---|---|
| `dist/app/v1/feed.json` | public content (categories, tape, about/disclaimer, free posts in full, paid posts as the same teaser the web shows + locked section headings). Written by `scripts/export_app_feed.py`, which `package_vercel.py` runs **before** `check_paywall.py`, so the leak check covers it. | added 11 Nov 2026, **not deployed yet** |
| `POST /api/app-entitlement` | `{platform: "ios" or "android", token}` → `{active, expiresAt}`; asks Google Play Developer API / App Store Server API (`api/store-verify.js`) | added, **not deployed yet** |
| `POST /api/app-article` | `{post, lang, platform, token}` → subscriber-only remainder (same `private/paid` bodies as `/api/article`, bundled only into this function) after a store check | added, **not deployed yet** |

Until the env vars below exist, both app routes answer `503 store_verification_not_configured` and unlock nothing; the web
paywall (Stripe, cookie) is unchanged. Store subscriptions and Stripe subscriptions are **not linked** (no user accounts).

| Vercel env var | Value |
|---|---|
| `APP_SUBSCRIPTION_PRODUCT_IDS` | `lupa_monthly` (default) |
| `GOOGLE_PLAY_PACKAGE_NAME` | `com.svenda.lupa` |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | service-account key JSON (raw or base64) invited in Play Console with "View financial data" + "Manage orders and subscriptions" — sensitive |
| `APPLE_BUNDLE_ID` | `com.svenda.lupa` |
| `APPLE_ISSUER_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | App Store Connect → Users and Access → Integrations → In-App Purchase key (.p8 contents) — sensitive |
| `APPLE_ENVIRONMENT` | optional `production` / `sandbox`; default tries production then sandbox (App Review buys in sandbox) |
