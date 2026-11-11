// POST /api/login  (form: email, lang) → emails a one-time sign-in link (valid 15 min) to a Stripe customer with that email.
// GET  /api/login?t=<signed token>&lang=  → target of that emailed link: checks signature + expiry, sets the session cookie
//      (the subscription itself is re-checked against Stripe on the next page load; the cookie is stored with ok=0).
// One function for both: Vercel's Hobby plan allows at most 12 functions per deployment.
// Lets a subscriber unlock Lupa on a new device or browser. The answer is always the same ("check your inbox"), so the
// form cannot be used to find out who subscribes. Needs RESEND_API_KEY + LOGIN_EMAIL_FROM (see README).
'use strict';
const L = require('./lib');
const LINK_TTL_MS = 15 * 60 * 1000;

const TEXT = {
  hr: { subject: 'Prijava u Lupu', hi: 'Kliknite poveznicu da otključate pretplatu na Lupu u ovom pregledniku:',
        note: 'Poveznica vrijedi 15 minuta. Ako niste tražili prijavu, zanemarite ovu poruku.', btn: 'Prijavi se u Lupu' },
  en: { subject: 'Sign in to Lupa', hi: 'Click the link to unlock your Lupa subscription in this browser:',
        note: 'The link is valid for 15 minutes. If you did not ask to sign in, ignore this email.', btn: 'Sign in to Lupa' },
};

async function findCustomer(email) {
  // Stripe's email filter is case-sensitive: try the address as typed and lower-cased.
  const seen = new Set(); const list = [];
  for (const e of [...new Set([email, email.toLowerCase()])]) {
    const r = await L.stripe('GET', 'customers', { email: e, limit: 10 });
    for (const c of r.data || []) if (!seen.has(c.id) && !c.deleted) { seen.add(c.id); list.push(c); }
  }
  for (const c of list) if (await L.customerHasSubscription(c.id)) return c.id;
  return list[0] ? list[0].id : null;   // lapsed customer: link still lets them see invoices / renew via the portal
}

function verifyLink(req, res) {
  const q = L.query(req), P = L.PATHS[L.lang(q.get('lang'))];
  const tok = L.verify(q.get('t') || '', 'login');
  if (!tok || typeof tok.exp !== 'number' || tok.exp < Date.now()) return L.redirect(res, P.account + '?login=expired');
  L.setSession(res, { c: tok.c, ok: 0, chk: 0, iat: Date.now() });
  return L.redirect(res, P.account + '?login=ok');
}

module.exports = async (req, res) => {
  const qlang = L.lang(L.query(req).get('lang'));
  if (req.method === 'GET' && L.query(req).get('t')) return verifyLink(req, res);
  if (req.method !== 'POST') return L.redirect(res, L.PATHS[qlang].account);
  if (!L.sameOrigin(req)) return L.json(res, 403, { error: 'bad_origin' });
  const form = await L.readForm(req).catch(() => ({}));
  const lang = L.lang(form.lang || qlang), P = L.PATHS[lang];
  const email = String(form.email || '').trim();
  if (!L.validEmail(email)) return L.redirect(res, P.account + '?login=bad');
  if (!L.stripeKeysPresent() || !L.emailConfigured()) return L.redirect(res, P.account + '?login=off');
  if (L.rateLimited('login-ip:' + L.clientIp(req), 10, 60 * 60 * 1000) || L.rateLimited('login-mail:' + email.toLowerCase(), 3, 15 * 60 * 1000)) {
    return L.redirect(res, P.account + '?login=wait');
  }
  try {
    const customer = await findCustomer(email);
    if (customer) {
      const token = L.sign({ c: customer, exp: Date.now() + LINK_TTL_MS }, 'login');
      const link = `${L.SITE()}/api/login?lang=${lang}&t=${encodeURIComponent(token)}`;
      const t = TEXT[lang];
      await L.sendEmail({
        to: email, subject: t.subject,
        text: `${t.hi}\n\n${link}\n\n${t.note}\n\n— Lupa`,
        html: `<p>${t.hi}</p><p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#0e5a50;color:#fff;text-decoration:none;border-radius:6px">${t.btn}</a></p>`
            + `<p style="color:#555;font-size:13px">${t.note}</p><p style="color:#555;font-size:13px">— Lupa</p>`,
      });
    }
  } catch (e) {
    console.error('login link failed:', e.message);
    return L.redirect(res, P.account + '?login=error');
  }
  return L.redirect(res, P.account + '?login=sent');
};
