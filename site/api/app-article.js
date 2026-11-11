// POST /api/app-article  {post, lang, platform, token} → {html} of the subscriber-only remainder for the mobile app.
// Same private bodies as /api/article (bundled into this function only), but entitlement = a store subscription
// verified with Google Play / the App Store (store-verify.js) instead of the web's Stripe session cookie.
'use strict';
const fs = require('fs'), path = require('path');
const L = require('./lib');
const S = require('./store-verify');
const INDEX = JSON.parse(fs.readFileSync(path.join(__dirname, 'paid-index.json'), 'utf8'));
module.exports = async (req, res) => {
  if (req.method !== 'POST') return L.json(res, 405, { error: 'method' });
  // Each unknown token costs a Google / Apple API call: cap requests per client (generous for real readers).
  if (L.rateLimited('app:' + L.clientIp(req), 120, 10 * 60 * 1000)) { res.setHeader('Retry-After', '600'); return L.json(res, 429, { error: 'rate_limited' }); }
  let b;
  try { b = JSON.parse((await L.readBody(req, 4e4)).toString('utf8') || '{}'); } catch { return L.json(res, 400, { error: 'bad_json' }); }
  const post = String(b.post || ''), lang = b.lang;
  if (!Object.prototype.hasOwnProperty.call(INDEX, post) || !['hr', 'en'].includes(lang)) return L.json(res, 404, { error: 'not_found' });
  let r;
  try { r = await S.verifyStorePurchase(b.platform, b.token); } catch (e) { console.error('store verify failed:', e.message); return L.json(res, 503, { error: 'unavailable' }); }
  if (r.status) return L.json(res, r.status, { error: r.reason });
  if (!r.active) return L.json(res, 402, { error: 'subscription_required', reason: r.reason || null });
  const html = fs.readFileSync(path.join(__dirname, 'paid', `${post}.${lang}.html`), 'utf8');
  L.json(res, 200, { html, expiresAt: r.expiresAt || null });
};
