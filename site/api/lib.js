// Lupa subscription backend — shared helpers. Zero dependencies (Node 22 built-ins + fetch).
// Secrets come ONLY from Vercel environment variables; nothing secret is ever sent to the browser.
'use strict';
const crypto = require('crypto');

const env = (k) => (process.env[k] || '').trim();
const SITE = () => (env('SITE_URL') || 'https://lupa-lovat.vercel.app').replace(/\/+$/, '');
const PATHS = {
  hr: { subscribe: '/hr/pretplata/', account: '/hr/racun/' },
  en: { subscribe: '/en/subscribe/', account: '/en/account/' },
};
// The only plan Lupa sells. Checkout refuses to start if STRIPE_PRICE_ID is not exactly this.
const EXPECTED = { unit_amount: 700, currency: 'eur', interval: 'month', interval_count: 1 };
const COOKIE = '__Host-lupa_session';
const NONCE_COOKIE = '__Host-lupa_checkout';
const COOKIE_MAX_AGE = 365 * 24 * 3600;     // the cookie only says "this browser belongs to Stripe customer X"
const RECHECK_MS = 10 * 60 * 1000;          // re-verify the subscription with Stripe at least every 10 minutes
const GRACE_MS = 24 * 3600 * 1000;          // if Stripe is unreachable, trust a check younger than this
const ENTITLED = new Set(['active', 'trialing', 'past_due']); // past_due = Stripe is still retrying the card

const lang = (v) => (v === 'en' ? 'en' : 'hr');
const safeNext = (v) => (typeof v === 'string' && /^\/(hr|en)\/[a-z0-9\-\/]*$/.test(v) && !v.includes('//') ? v : '');

function sessionSecret() { const s = env('SESSION_SECRET'); return s.length >= 32 ? s : ''; }
// ---------- DEMO / TEST unlock (self-expiring) ----------
// With DEMO_UNLOCK_UNTIL=<ISO date-time> set (e.g. 2026-11-13T12:00:00Z), the "Subscribe" button skips Stripe and unlocks
// paid articles in that browser, until that moment. It switches itself off: the deadline is checked on every request, so
// even cookies that were already handed out stop working. Leave the variable unset (the default) for real payments.
const DEMO_CUSTOMER = 'cus_demo';
function demoActive() {
  const t = Date.parse(env('DEMO_UNLOCK_UNTIL'));
  return Number.isFinite(t) && t > Date.now() && !!sessionSecret();
}
function stripeKeysPresent() { return !!(env('STRIPE_SECRET_KEY') && env('STRIPE_PRICE_ID') && sessionSecret()); }

// ---------- Stripe REST (form-encoded) ----------
function encode(obj, prefix, out) {
  out = out || [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') encode(v, key, out);
    else out.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(v)));
  }
  return out.join('&');
}
async function stripe(method, path, params) {
  const q = params ? encode(params) : '';
  const url = 'https://api.stripe.com/v1/' + path + (method === 'GET' && q ? '?' + q : '');
  const r = await fetch(url, {
    method,
    headers: { Authorization: 'Bearer ' + env('STRIPE_SECRET_KEY'), 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20' },
    body: method === 'GET' ? undefined : q,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error((j.error && j.error.message) || 'Stripe HTTP ' + r.status); e.status = r.status; throw e; }
  return j;
}

let priceCache = null; // { ok, product, at }
async function priceInfo() {
  if (!stripeKeysPresent()) return { ok: false, reason: 'missing_env' };
  if (priceCache && Date.now() - priceCache.at < 10 * 60 * 1000) return priceCache;
  try {
    const p = await stripe('GET', 'prices/' + encodeURIComponent(env('STRIPE_PRICE_ID')));
    const ok = p.active && p.type === 'recurring' && p.unit_amount === EXPECTED.unit_amount && p.currency === EXPECTED.currency &&
      p.recurring && p.recurring.interval === EXPECTED.interval && (p.recurring.interval_count || 1) === EXPECTED.interval_count;
    if (!ok) console.error('STRIPE_PRICE_ID is not an active 7.00 EUR / month recurring price — checkout disabled');
    priceCache = { ok, product: typeof p.product === 'string' ? p.product : p.product && p.product.id, at: Date.now(), reason: ok ? '' : 'price_mismatch' };
  } catch (e) {
    console.error('Stripe price lookup failed:', e.message);
    priceCache = { ok: false, reason: 'stripe_error', at: Date.now() - 9 * 60 * 1000 }; // retry in ~1 min
  }
  return priceCache;
}
async function paymentsActive() { return demoActive() || (await priceInfo()).ok === true; }

// ---------- signed session cookie ----------
const b64u = (buf) => Buffer.from(buf).toString('base64url');
// `purpose` separates token kinds: a session cookie can never be replayed as an email sign-in link, and vice versa.
function mac(body, purpose) { return crypto.createHmac('sha256', sessionSecret()).update(purpose ? purpose + '.' + body : body).digest(); }
function sign(payload, purpose = '') {
  const body = b64u(JSON.stringify(payload));
  return body + '.' + mac(body, purpose).toString('base64url');
}
function verify(token, purpose = '') {
  if (!token || typeof token !== 'string' || !sessionSecret()) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const good = mac(body, purpose);
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== good.length || !crypto.timingSafeEqual(got, good)) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p && typeof p.c === 'string' && p.c.startsWith('cus_') ? p : null; } catch { return null; }
}
function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i < 0) continue;
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* malformed cookie: ignore */ }
  }
  return out;
}
function cookieHeader(name, value, maxAge) {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}
function addCookie(res, c) { const prev = res.getHeader('Set-Cookie'); res.setHeader('Set-Cookie', prev ? [].concat(prev, c) : [c]); }
function setSession(res, payload) { addCookie(res, cookieHeader(COOKIE, sign(payload), COOKIE_MAX_AGE)); }
function clearSession(res) { addCookie(res, cookieHeader(COOKIE, '', 0)); }

// Does this Stripe customer have a live Lupa subscription right now? (Throws if Stripe is unreachable.)
async function customerHasSubscription(customer) {
  const price = await priceInfo();
  const subs = await stripe('GET', 'subscriptions', { customer, status: 'all', limit: 20 });
  return (subs.data || []).some((s) => ENTITLED.has(s.status) && (s.items && s.items.data || []).some((it) =>
    it.price && (it.price.id === env('STRIPE_PRICE_ID') || (price.product && it.price.product === price.product))));
}

// Is this browser's Stripe customer currently subscribed? Verified against the Stripe API (cached ≤10 min in the signed cookie).
async function entitlement(req, res) {
  const tok = verify(cookies(req)[COOKIE]);
  if (!tok) return { active: false, customer: null, lapsed: false };
  if (tok.c === DEMO_CUSTOMER) {   // demo cookie: never asks Stripe; valid only while the demo window is open
    const on = demoActive();
    return { active: on, customer: null, lapsed: !on, demo: on };
  }
  const now = Date.now();
  if (tok.ok && now - (tok.chk || 0) < RECHECK_MS) return { active: true, customer: tok.c, lapsed: false };
  try {
    const active = await customerHasSubscription(tok.c);
    setSession(res, { c: tok.c, ok: active ? 1 : 0, chk: now, iat: tok.iat || now });
    return { active, customer: tok.c, lapsed: !active };
  } catch (e) {
    console.error('Stripe subscription check failed:', e.message);
    if (tok.ok && now - (tok.chk || 0) < GRACE_MS) return { active: true, customer: tok.c, lapsed: false };
    const err = new Error('entitlement_unavailable'); err.status = 503; throw err;
  }
}

// ---------- tiny HTTP helpers (functions run without Vercel's request helpers so the webhook gets the raw body) ----------
function readBody(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > limit) { reject(new Error('body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readForm(req) {
  const raw = (await readBody(req, 1e4)).toString('utf8');
  if ((req.headers['content-type'] || '').includes('application/json')) { try { return JSON.parse(raw) || {}; } catch { return {}; } }
  return Object.fromEntries(new URLSearchParams(raw));
}
function query(req) { return new URL(req.url, 'https://x').searchParams; }
function sameOrigin(req) {
  const o = req.headers.origin; if (!o || o === 'null') return !o; // browsers send Origin on POST; "null" = opaque → reject
  try { return new URL(o).host === req.headers.host || new URL(o).origin === SITE(); } catch { return false; }
}
// Best-effort in-memory rate limit (per warm function instance). Stops casual abuse; not a substitute for a WAF.
const buckets = new Map();
function rateLimited(key, max, windowMs) {
  const now = Date.now();
  if (buckets.size > 10000) for (const [k, b] of buckets) if (now - b.at > windowMs) buckets.delete(k);
  const b = buckets.get(key);
  if (!b || now - b.at > windowMs) { buckets.set(key, { at: now, n: 1 }); return false; }
  b.n += 1;
  return b.n > max;
}
function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || String(req.headers['x-real-ip'] || '') || (req.socket && req.socket.remoteAddress) || 'unknown';
}

// ---------- email (Resend HTTP API; optional) ----------
function emailConfigured() { return !!(env('RESEND_API_KEY') && env('LOGIN_EMAIL_FROM') && sessionSecret()); }
async function sendEmail({ to, subject, text, html }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env('RESEND_API_KEY'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env('LOGIN_EMAIL_FROM'), to: [to], subject, text, html }),
  });
  if (!r.ok) throw new Error('email HTTP ' + r.status);
}
const validEmail = (v) => typeof v === 'string' && v.length <= 254 && /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/.test(v);

function noStore(res) { res.setHeader('Cache-Control', 'private, no-store, max-age=0'); res.setHeader('X-Robots-Tag', 'noindex'); }
function json(res, status, obj) { noStore(res); res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); }
function redirect(res, location) { noStore(res); res.statusCode = 303; res.setHeader('Location', location); res.end(); }

module.exports = { env, DEMO_CUSTOMER, demoActive, SITE, PATHS, EXPECTED, COOKIE, NONCE_COOKIE, lang, safeNext, stripe, priceInfo, paymentsActive, stripeKeysPresent,
  sessionSecret, sign, verify, cookies, cookieHeader, addCookie, setSession, clearSession, customerHasSubscription, entitlement,
  readBody, readForm, query, sameOrigin, rateLimited, clientIp, emailConfigured, sendEmail, validEmail, noStore, json, redirect };
