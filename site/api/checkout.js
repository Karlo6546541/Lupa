// POST /api/checkout  (form: lang, next) → 303 to Stripe Checkout for the single 7 €/month plan.
// GET  /api/checkout?session_id=cs_…&lang=&next=  → Stripe's success redirect (see complete() below). One function for both:
//      Vercel's Hobby plan allows at most 12 functions per deployment.
'use strict';
const crypto = require('crypto');
const L = require('./lib');
// Verifies the Checkout Session with the Stripe API (never trusts the URL alone), then sets the httpOnly session cookie.
// The cookie is only set in the browser that started checkout (nonce cookie must match the session's metadata), so a
// leaked success URL (history sync, screenshot, shared link) cannot hand someone else the subscriber's access or
// Stripe portal. A reader who finishes payment in another browser signs in with the email link on the account page.
async function complete(req, res) {
  const q = L.query(req), lang = L.lang(q.get('lang')), next = L.safeNext(q.get('next')), P = L.PATHS[lang];
  const id = q.get('session_id') || '';
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id) || !L.stripeKeysPresent()) return L.redirect(res, P.account);
  try {
    const s = await L.stripe('GET', 'checkout/sessions/' + id, { expand: ['subscription'] });
    const sub = s.subscription && typeof s.subscription === 'object' ? s.subscription : null;
    const sameBrowser = s.metadata && s.metadata.nonce && L.cookies(req)[L.NONCE_COOKIE] === s.metadata.nonce;
    const ok = s.status === 'complete' && s.mode === 'subscription' && s.metadata && s.metadata.site === 'lupa' &&
      (s.payment_status === 'paid' || s.payment_status === 'no_payment_required') && sub && ['active', 'trialing'].includes(sub.status) &&
      typeof s.customer === 'string';
    if (!ok) { console.warn('checkout-complete rejected', id, s.status, s.payment_status, sub && sub.status); return L.redirect(res, P.account); }
    if (!sameBrowser) { console.warn('checkout-complete: paid, but nonce cookie missing — asking for email sign-in', id); return L.redirect(res, P.account + '?login=paid'); }
    L.setSession(res, { c: s.customer, ok: 1, chk: Date.now(), iat: Date.now() });
    L.addCookie(res, L.cookieHeader(L.NONCE_COOKIE, '', 0));
    return L.redirect(res, next ? next : P.account + '?welcome=1');
  } catch (e) {
    console.error('checkout-complete failed:', e.message);
    return L.redirect(res, P.account);
  }
}

module.exports = async (req, res) => {
  if (req.method === 'GET' && L.query(req).get('session_id')) return complete(req, res);
  const qlang = L.lang(L.query(req).get('lang'));
  if (req.method !== 'POST') return L.redirect(res, L.PATHS[qlang].subscribe);
  if (!L.sameOrigin(req)) return L.json(res, 403, { error: 'bad_origin' });
  const form = await L.readForm(req).catch(() => ({}));
  const lang = L.lang(form.lang || qlang), next = L.safeNext(form.next);
  const P = L.PATHS[lang];
  if (L.demoActive()) {   // TEST MODE (DEMO_UNLOCK_UNTIL): no payment, just unlock this browser
    L.setSession(res, { c: L.DEMO_CUSTOMER, ok: 1, chk: Date.now(), iat: Date.now() });
    return L.redirect(res, next ? next : P.account + '?welcome=1');
  }
  if (!(await L.paymentsActive())) return L.redirect(res, P.subscribe + '?status=inactive' + (next ? '&next=' + encodeURIComponent(next) : ''));
  let customer;
  try { customer = (await L.entitlement(req, res)).customer; } catch { customer = null; }
  const nonce = crypto.randomBytes(18).toString('base64url');
  const site = L.SITE();
  const params = {
    mode: 'subscription',
    line_items: [{ price: L.env('STRIPE_PRICE_ID'), quantity: 1 }],
    success_url: `${site}/api/checkout?session_id={CHECKOUT_SESSION_ID}&lang=${lang}` + (next ? '&next=' + encodeURIComponent(next) : ''),
    cancel_url: `${site}${P.subscribe}?canceled=1` + (next ? '&next=' + encodeURIComponent(next) : ''),
    locale: lang,
    metadata: { site: 'lupa', nonce },
    subscription_data: { metadata: { site: 'lupa' } },
  };
  if (customer) params.customer = customer;           // returning reader: keep one Stripe customer
  if (L.env('STRIPE_AUTOMATIC_TAX') === '1') { params.automatic_tax = { enabled: true }; if (customer) params.customer_update = { address: 'auto' }; }
  try {
    const s = await L.stripe('POST', 'checkout/sessions', params);
    L.addCookie(res, L.cookieHeader(L.NONCE_COOKIE, nonce, 3600));
    return L.redirect(res, s.url);
  } catch (e) {
    console.error('checkout session failed:', e.message);
    return L.redirect(res, P.subscribe + '?status=inactive');
  }
};
