// GET /api/checkout-complete?session_id=cs_...  Stripe redirects here after payment.
// Verifies the Checkout Session with the Stripe API (never trusts the URL alone), then sets the httpOnly session cookie.
// The cookie is only set in the browser that started checkout (nonce cookie must match the session's metadata), so a
// leaked success URL (history sync, screenshot, shared link) cannot hand someone else the subscriber's access or
// Stripe portal. A reader who finishes payment in another browser signs in with the email link on the account page.
'use strict';
const L = require('./lib');
module.exports = async (req, res) => {
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
};
