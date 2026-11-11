// POST /api/logout → clears the session cookie on this device.
'use strict';
const L = require('./lib');
module.exports = async (req, res) => {
  const qlang = L.lang(L.query(req).get('lang'));
  if (req.method !== 'POST') return L.redirect(res, L.PATHS[qlang].account);
  if (!L.sameOrigin(req)) return L.json(res, 403, { error: 'bad_origin' });
  const form = await L.readForm(req).catch(() => ({}));
  L.clearSession(res);
  return L.redirect(res, L.PATHS[L.lang(form.lang || qlang)].account);
};
