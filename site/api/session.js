// GET /api/session → { payments, active, lapsed, email_login, portal_login_url }. No secrets, no customer ids.
'use strict';
const L = require('./lib');
module.exports = async (req, res) => {
  const payments = await L.paymentsActive();
  let e = { active: false, lapsed: false };
  if (L.stripeKeysPresent()) { try { e = await L.entitlement(req, res); } catch { return L.json(res, 503, { payments, active: false, error: 'unavailable' }); } }
  const pl = L.env('STRIPE_PORTAL_LOGIN_URL');
  L.json(res, 200, { payments, active: !!e.active, lapsed: !!e.lapsed, email_login: payments && L.emailConfigured(), portal_login_url: payments && /^https:\/\/billing\.stripe\.com\//.test(pl) ? pl : null,
    plan: { name: { hr: 'Pretplata na Lupu', en: 'Lupa subscription' }, amount: 7, currency: 'EUR', interval: 'month' } });
};
