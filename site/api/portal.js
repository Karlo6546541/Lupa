// POST /api/portal → 303 to the Stripe Customer Portal (update card, invoices, cancel) for this browser's customer.
'use strict';
const L = require('./lib');
module.exports = async (req, res) => {
  const qlang = L.lang(L.query(req).get('lang'));
  if (req.method !== 'POST') return L.redirect(res, L.PATHS[qlang].account);
  if (!L.sameOrigin(req)) return L.json(res, 403, { error: 'bad_origin' });
  const form = await L.readForm(req).catch(() => ({}));
  const lang = L.lang(form.lang || qlang), P = L.PATHS[lang];
  if (!L.stripeKeysPresent() || L.demoActive()) return L.redirect(res, P.account);
  let e; try { e = await L.entitlement(req, res); } catch { return L.redirect(res, P.account); }
  if (!e.customer) return L.redirect(res, P.account);
  try {
    const params = { customer: e.customer, return_url: L.SITE() + P.account, locale: lang };
    if (L.env('STRIPE_PORTAL_CONFIG_ID')) params.configuration = L.env('STRIPE_PORTAL_CONFIG_ID');
    const s = await L.stripe('POST', 'billing_portal/sessions', params);
    return L.redirect(res, s.url);
  } catch (err) {
    console.error('portal session failed:', err.message);
    return L.redirect(res, P.account);
  }
};
