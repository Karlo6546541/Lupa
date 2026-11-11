// Builds the HTML document an article / page is rendered in. It reuses the website's own stylesheet and markup
// classes (article-head, prose, quote, facts, paywall, sources…), so quote boxes, tables and figures look like the site.
import { SITE_FONTS_CSS, SITE_STYLE_CSS } from './siteCss.generated';
import type { Category, Page, Post } from './feed';
import type { Lang, Strings } from './i18n';

export const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const LOCK_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/></svg>';
export const paidBadgeHtml = (t: Strings) => `<span class="badge-paid">${LOCK_SVG}${esc(t.paidBadge)}</span>`;

// App-only adjustments on top of the site CSS: single column, no sticky site chrome, in-app paywall states.
const APP_CSS = `
html{scroll-padding-top:0}
body{background:var(--paper);padding:0 0 2.5rem}
.app{max-width:46rem;margin:0 auto;padding:0 1.1rem}
.article-head{padding-top:1.1rem}
.article-head h1{font-size:clamp(1.75rem,7vw,2.6rem)}
.figure-hero{margin-left:-1.1rem;margin-right:-1.1rem}
.figure-hero img{width:100%;height:auto;aspect-ratio:16/9;object-fit:cover}
.figure-hero figcaption{padding:0 1.1rem}
.post-grid{display:block}
.rail,.ad,.nl-band,.related,.support-strip{display:none!important}
.post-end,.post-end>*{max-width:none!important;margin-left:0!important}
.paywall .btn{font-size:1rem;padding:.95rem 1.3rem}
.pw-state{font-size:.92rem;color:var(--ink-2);background:var(--card);border:1px solid var(--rule);border-radius:var(--r-sm);padding:.8rem 1rem;margin:1rem 0}
.pw-state a{font-weight:600}
.paid-body{display:block!important;animation:none}
a{-webkit-tap-highlight-color:rgba(201,133,42,.25)}
`;

function doc(lang: Lang, inner: string) {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>${SITE_FONTS_CSS}\n${SITE_STYLE_CSS}\n${APP_CSS}</style></head><body data-lang="${lang}"><main class="app">${inner}</main></body></html>`;
}

function heroFigure(name: string, alt: string, caption: string, t: Strings) {
  const src = (w: number) => `/assets/img/${name}-${w}.jpg`;
  return `<figure class="figure figure-hero"><img src="${src(800)}" srcset="${src(480)} 480w, ${src(800)} 800w" sizes="100vw" alt="${esc(alt)}" decoding="async">` +
    (caption ? `<figcaption>${esc(caption)} <span class="credit">${esc(t.illustration)}</span></figcaption>` : '') + `</figure>`;
}

export type PaywallState =
  | { kind: 'locked'; price: string }              // not subscribed → subscribe CTA
  | { kind: 'loading' }                             // subscribed, fetching the body
  | { kind: 'unlocked'; html: string }
  | { kind: 'message'; text: string; retry?: boolean; price?: string };

export function articleHtml(p: Post, lang: Lang, t: Strings, cats: Category[], pw: PaywallState | null) {
  const paid = p.access === 'subscribers';
  const catLinks = p.categories.map((id) => cats.find((c) => c.id === id)).filter(Boolean)
    .map((c) => `<a href="lupa://category/${esc(c!.id)}">${esc(c![lang].name)}</a>`).join(' · ');
  const head = `<header class="article-head">${p.sponsored ? `<div class="sponsor-banner" role="note"><strong>${lang === 'hr' ? 'Sponzorirano' : 'Sponsored'}</strong> · ${esc(p.sponsored.name)}</div>` : ''}` +
    `<div class="meta cats">${catLinks}${paid ? ' · ' + paidBadgeHtml(t) : ''}</div><h1>${esc(p.title[lang])}</h1><p class="dek">${esc(p.dek[lang])}</p>` +
    `<div class="byline"><span class="by">${esc(t.byline)}</span><span>${esc(t.published)} <time datetime="${esc(p.date)}">${esc(p.dateLabel[lang])}</time></span><span>${p.minutes[lang]} ${esc(t.read)}</span></div></header>`;
  let body = p.body[lang];
  if (paid && pw) {
    if (pw.kind === 'unlocked') {
      body += `<div class="paid-body">${pw.html}</div>`;
    } else {
      const nexts = (p.locked[lang] || []).map((h) => `<li>${esc(h)}</li>`).join('');
      const price = pw.kind === 'locked' ? pw.price : pw.kind === 'message' ? pw.price : undefined;
      let action = '';
      if (pw.kind === 'locked') action = `<p><a class="btn btn-accent" href="lupa://subscribe">${esc(t.gateBtn)} — ${esc(price || '')}</a></p><p class="pw-links"><a href="lupa://restore">${esc(t.restore)}</a></p>`;
      if (pw.kind === 'loading') action = `<p class="pw-state">${esc(t.gateChecking)}</p>`;
      if (pw.kind === 'message') action = `<p class="pw-state">${esc(pw.text)}${pw.retry ? ` <a href="lupa://retry">${esc(t.retry)}</a>` : ''}</p>` +
        (pw.price ? `<p><a class="btn btn-accent" href="lupa://subscribe">${esc(t.gateBtn)} — ${esc(pw.price)}</a></p><p class="pw-links"><a href="lupa://restore">${esc(t.restore)}</a></p>` : '');
      body += `<section class="paywall" aria-labelledby="pw"><div class="pw-fade" aria-hidden="true"></div><div class="pw-card"><p class="kicker">${paidBadgeHtml(t)}</p>` +
        `<h2 id="pw">${esc(t.gateTitle)}</h2><p>${esc(t.gateText)}</p>` +
        (nexts ? `<div class="pw-next"><p class="pw-next-h">${esc(t.gateNext)}</p><ul>${nexts}</ul></div>` : '') +
        (price ? `<p class="pw-price"><strong>${esc(t.planName)}</strong> · ${esc(price)} ${esc(t.perMonth)} · ${esc(t.cancelAny)}</p>` : '') +
        action + `</div></section>`;
    }
  }
  const srcs = p.sources.map((s) => `<li><a href="${esc(s.url)}">${esc(s.label[lang])}</a></li>`).join('');
  const end = `<div class="post-end">${srcs ? `<section class="sources"><h2>${esc(t.sources)}</h2><ol>${srcs}</ol></section>` : ''}` +
    `<aside class="disclaimer-box">${esc(t.notAdvice)} <a href="lupa://page/disclaimer">${esc(t.disclaimer)}</a>.</aside></div>`;
  return doc(lang, `<article class="post">${head}${heroFigure(p.hero, p.heroAlt[lang], p.heroCaption[lang], t)}<div class="post-grid"><div class="prose">${body}</div></div>${end}</article>`);
}

export function pageHtml(pg: Page, key: string, lang: Lang) {
  return doc(lang, `<article class="page page-${esc(key)}"><header class="article-head"><h1>${esc(pg.title[lang])}</h1><p class="dek">${esc(pg.dek[lang])}</p></header>` +
    `<div class="prose prose-page">${pg.body[lang]}</div></article>`);
}
