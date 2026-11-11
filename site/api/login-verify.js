// GET /api/login-verify?t=<signed token>&lang=hr|en  — target of the email sign-in link (see login.js).
// Checks the HMAC and the 15-minute expiry, then sets the normal session cookie; the subscription itself is
// re-verified against Stripe on the next page load as usual (cookie is stored with ok=0 so it is checked at once).
'use strict';
const L = require('./lib');
module.exports = async (req, res) => {
  const q = L.query(req), P = L.PATHS[L.lang(q.get('lang'))];
  const tok = L.verify(q.get('t') || '', 'login');
  if (!tok || typeof tok.exp !== 'number' || tok.exp < Date.now()) return L.redirect(res, P.account + '?login=expired');
  L.setSession(res, { c: tok.c, ok: 0, chk: 0, iat: Date.now() });
  return L.redirect(res, P.account + '?login=ok');
};
