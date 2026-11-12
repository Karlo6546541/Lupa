// GET /api/article?post=<post-dir>&lang=hr|en → { html } of the subscriber-only remainder, after a Stripe-verified entitlement check.
// The bodies live in ./paid/ inside this function bundle and are never published as static files.
'use strict';
const fs = require('fs'), path = require('path');
const L = require('./lib');
const INDEX = JSON.parse(fs.readFileSync(path.join(__dirname, 'paid-index.json'), 'utf8'));
module.exports = async (req, res) => {
  res.setHeader('Vary', 'Cookie');
  if (req.method !== 'GET') return L.json(res, 405, { error: 'method' });
  const q = L.query(req), post = q.get('post') || '', lang = q.get('lang');
  if (!Object.prototype.hasOwnProperty.call(INDEX, post) || !['hr', 'en'].includes(lang)) return L.json(res, 404, { error: 'not_found' });
  if (!L.stripeKeysPresent() && !L.demoActive()) return L.json(res, 503, { error: 'payments_not_active' });
  let e;
  try { e = await L.entitlement(req, res); } catch { return L.json(res, 503, { error: 'unavailable' }); }
  if (!e.active) return L.json(res, e.customer ? 402 : 401, { error: 'subscription_required', subscribe: L.PATHS[lang].subscribe });
  const html = fs.readFileSync(path.join(__dirname, 'paid', `${post}.${lang}.html`), 'utf8');
  L.json(res, 200, { html });
};
