// POST /api/checkout  (form: lang, next) → 303 to Stripe Checkout for the single 7 €/month plan.
'use strict';
const crypto = require('crypto');
const L = require('./lib');
module.exports = async (req, res) => {
  const qlang = L.lang(L.query(req).get('lang'));
  if (req.method !== 'POST') return L.redirect(res, L.PATHS[qlang].subscribe);
  if (!L.sameOrigin(req)) return L.json(res, 403, { error: 'bad_origin' });
  const form = await L.readForm(req).catch(() => ({}));
  const lang = L.lang(form.lang || qlang), next = L.safeNext(form.next);
  const P = L.PATHS[lang];
  if (!(await L.paymentsActive())) return L.redirect(res, P.subscribe + '?status=inactive' + (next ? '&next=' + encodeURIComponent(next) : ''));
  let customer;
  try { customer = (await L.entitlement(req, res)).customer; } catch { customer = null; }
  const nonce = crypto.randomBytes(18).toString('base64url');
  const site = L.SITE();
  const params = {
    mode: 'subscription',
    line_items: [{ price: L.env('STRIPE_PRICE_ID'), quantity: 1 }],
    success_url: `${site}/api/checkout-complete?session_id={CHECKOUT_SESSION_ID}&lang=${lang}` + (next ? '&next=' + encodeURIComponent(next) : ''),
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
