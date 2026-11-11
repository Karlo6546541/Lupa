// POST /api/stripe-webhook — Stripe events, verified with STRIPE_WEBHOOK_SECRET (HMAC-SHA256, 5-minute tolerance).
// Keeps the customer's metadata.lupa_status in sync and logs subscription changes. Access itself is always re-checked
// live against the Stripe API (≤10 minutes old), so a cancelled or failed subscription loses access without a database.
'use strict';
const crypto = require('crypto');
const L = require('./lib');
function verifySig(raw, header, secret) {
  const parts = Object.create(null); const v1 = [];
  for (const kv of String(header || '').split(',')) { const [k, v] = kv.split('='); if (k === 'v1') v1.push(v); else parts[k] = v; }
  const t = Number(parts.t); if (!t || !v1.length) return false;
  if (Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest();
  return v1.some((sig) => { const b = Buffer.from(sig, 'hex'); return b.length === expected.length && crypto.timingSafeEqual(b, expected); });
}
module.exports = async (req, res) => {
  if (req.method !== 'POST') return L.json(res, 405, { error: 'method' });
  const secret = L.env('STRIPE_WEBHOOK_SECRET');
  if (!secret || !L.env('STRIPE_SECRET_KEY')) return L.json(res, 503, { error: 'webhook_not_configured' });
  const raw = (await L.readBody(req)).toString('utf8');
  if (!verifySig(raw, req.headers['stripe-signature'], secret)) return L.json(res, 400, { error: 'bad_signature' });
  let ev; try { ev = JSON.parse(raw); } catch { return L.json(res, 400, { error: 'bad_json' }); }
  try {
    const o = ev.data && ev.data.object || {};
    let customer = null, status = null;
    if (ev.type === 'checkout.session.completed' && o.mode === 'subscription') { customer = o.customer; status = 'active'; }
    if (/^customer\.subscription\.(created|updated|deleted|paused|resumed)$/.test(ev.type)) { customer = o.customer; status = ev.type.endsWith('deleted') ? 'canceled' : o.status; }
    if (customer && status) {
      await L.stripe('POST', 'customers/' + encodeURIComponent(customer), { metadata: { lupa_status: status, lupa_updated: new Date().toISOString() } });
      console.log('webhook', ev.type, customer, status);
    }
  } catch (e) {
    console.error('webhook handling failed:', ev.type, e.message);
    return L.json(res, 500, { error: 'handler_failed' }); // Stripe retries
  }
  L.json(res, 200, { received: true });
};
module.exports.verifySig = verifySig; // exported for tests
