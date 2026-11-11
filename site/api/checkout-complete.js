// GET /api/checkout-complete?session_id=cs_...  Stripe redirects here after payment.
// Verifies the Checkout Session with the Stripe API (never trusts the URL alone), then sets the httpOnly session cookie.
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
    const fresh = Date.now() / 1000 - (s.created || 0) < 30 * 60;
    const ok = s.status === 'complete' && s.mode === 'subscription' && s.metadata && s.metadata.site === 'lupa' &&
      (s.payment_status === 'paid' || s.payment_status === 'no_payment_required') && sub && ['active', 'trialing'].includes(sub.status) &&
      typeof s.customer === 'string' && (sameBrowser || fresh);
    if (!ok) { console.warn('checkout-complete rejected', id, s.status, s.payment_status, sub && sub.status); return L.redirect(res, P.account); }
    L.setSession(res, { c: s.customer, ok: 1, chk: Date.now(), iat: Date.now() });
    L.addCookie(res, L.cookieHeader(L.NONCE_COOKIE, '', 0));
    return L.redirect(res, next ? next : P.account + '?welcome=1');
  } catch (e) {
    console.error('checkout-complete failed:', e.message);
    return L.redirect(res, P.account);
  }
};
