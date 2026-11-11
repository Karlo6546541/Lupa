// POST /api/app-entitlement  {platform: "ios"|"android", token}  → {active, productId, expiresAt, environment}
// Called by the Lupa mobile app after a purchase / restore. The token is the store's purchase token (Android) or the
// signed transaction JWS (iOS); entitlement is decided by Google / Apple (see store-verify.js), never by the client.
'use strict';
const L = require('./lib');
const S = require('./store-verify');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return L.json(res, 405, { error: 'method' });
  // Each unknown token costs a Google / Apple API call: cap requests per client (generous for real readers).
  if (L.rateLimited('app:' + L.clientIp(req), 120, 10 * 60 * 1000)) { res.setHeader('Retry-After', '600'); return L.json(res, 429, { error: 'rate_limited' }); }
  let b;
  try { b = JSON.parse((await L.readBody(req, 4e4)).toString('utf8') || '{}'); } catch { return L.json(res, 400, { error: 'bad_json' }); }
  let r;
  try { r = await S.verifyStorePurchase(b.platform, b.token); } catch (e) { console.error('store verify failed:', e.message); return L.json(res, 503, { error: 'unavailable' }); }
  if (r.status) return L.json(res, r.status, { error: r.reason, active: false });
  L.json(res, 200, { active: !!r.active, productId: r.productId || null, expiresAt: r.expiresAt || null, environment: r.environment || null, reason: r.reason || null });
};
