// Unit tests for the Vercel functions in site/api. Zero dependencies: `node --test "site/tests/*.test.js"`.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Readable } = require('stream');

process.env.SESSION_SECRET = 'x'.repeat(40);
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
process.env.STRIPE_PRICE_ID = 'price_test';
process.env.SITE_URL = 'https://lupa.test';
const L = require('../api/lib');

function req({ method = 'GET', url = '/', headers = {}, body = '' } = {}) {
  const r = Readable.from(body ? [Buffer.from(body)] : []);
  Object.assign(r, { method, url, headers: { host: 'lupa.test', ...headers }, socket: { remoteAddress: '127.0.0.1' } });
  return r;
}
function res() {
  const h = {};
  return { statusCode: 200, body: '', headers: h,
    setHeader(k, v) { h[k.toLowerCase()] = v; }, getHeader(k) { return h[k.toLowerCase()]; },
    end(b) { this.body = b || ''; this.done = true; } };
}
const setCookies = (r) => [].concat(r.getHeader('set-cookie') || []);

test('signed tokens: round trip, tamper, purpose separation', () => {
  const t = L.sign({ c: 'cus_1', ok: 1 });
  assert.equal(L.verify(t).c, 'cus_1');
  assert.equal(L.verify(t.slice(0, -2) + 'AA'), null);
  assert.equal(L.verify(t, 'login'), null, 'session cookie must not work as a login link');
  const l = L.sign({ c: 'cus_1', exp: 1 }, 'login');
  assert.equal(L.verify(l), null, 'login link must not work as a session cookie');
  assert.equal(L.verify(l, 'login').c, 'cus_1');
  assert.equal(L.verify(L.sign({ c: 'acct_1' })), null, 'only Stripe customer ids');
});

test('safeNext only allows local article paths', () => {
  assert.equal(L.safeNext('/hr/clanci/x/'), '/hr/clanci/x/');
  for (const v of ['//evil.com', 'https://evil.com', '/de/x', '/hr//evil', '/hr/<x>', 42]) assert.equal(L.safeNext(v), '');
});

test('validEmail', () => {
  assert.ok(L.validEmail('a.b@example.hr'));
  for (const v of ['', 'a@b', 'a b@c.hr', '<a>@b.hr', 'x'.repeat(250) + '@b.hr', null]) assert.ok(!L.validEmail(v), String(v));
});

test('rateLimited', () => {
  for (let i = 0; i < 3; i++) assert.equal(L.rateLimited('t:k', 3, 60000), false);
  assert.equal(L.rateLimited('t:k', 3, 60000), true);
  assert.equal(L.rateLimited('t:other', 3, 60000), false);
});

test('cookies() ignores malformed values', () => {
  const c = L.cookies({ headers: { cookie: 'a=%E0%A4%A; b=ok' } });
  assert.equal(c.b, 'ok');
});

test('stripe webhook signature', () => {
  const { verifySig } = require('../api/stripe-webhook');
  const secret = 'whsec_test', raw = '{"id":"evt_1"}', t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  assert.ok(verifySig(raw, `t=${t},v1=${sig}`, secret));
  assert.ok(!verifySig(raw + ' ', `t=${t},v1=${sig}`, secret));
  assert.ok(!verifySig(raw, `t=${t - 1000},v1=${sig}`, secret), 'old timestamp');
  assert.ok(!verifySig(raw, '', secret));
});

// ---- checkout (success redirect): access only in the browser that started checkout ----
function mockStripeSession(nonce) {
  global.fetch = async (url) => {
    assert.match(String(url), /checkout\/sessions\/cs_test_abc/);
    return { ok: true, status: 200, json: async () => ({
      status: 'complete', mode: 'subscription', payment_status: 'paid', customer: 'cus_9', created: Math.floor(Date.now() / 1000),
      metadata: { site: 'lupa', nonce }, subscription: { status: 'active' } }) };
  };
}
test('checkout success redirect sets session only with matching nonce cookie', async () => {
  const h = require('../api/checkout');
  mockStripeSession('n0nce');
  let r = res();
  await h(req({ url: '/api/checkout?session_id=cs_test_abc&lang=en', headers: { cookie: '__Host-lupa_checkout=n0nce' } }), r);
  assert.equal(r.statusCode, 303);
  assert.ok(setCookies(r).some((c) => c.startsWith('__Host-lupa_session=') && !c.includes('Max-Age=0')));

  r = res();
  await h(req({ url: '/api/checkout?session_id=cs_test_abc&lang=en' }), r);   // leaked URL, other browser
  assert.equal(r.getHeader('location'), '/en/account/?login=paid');
  assert.ok(!setCookies(r).some((c) => c.startsWith('__Host-lupa_session=')));
});

test('login link (GET): valid, expired and session-cookie tokens', async () => {
  const h = require('../api/login');
  let r = res();
  await h(req({ url: '/api/login?lang=hr&t=' + encodeURIComponent(L.sign({ c: 'cus_5', exp: Date.now() + 60000 }, 'login')) }), r);
  assert.equal(r.getHeader('location'), '/hr/racun/?login=ok');
  assert.ok(setCookies(r).some((c) => c.startsWith('__Host-lupa_session=')));
  for (const t of [L.sign({ c: 'cus_5', exp: Date.now() - 1 }, 'login'), L.sign({ c: 'cus_5', ok: 1 })]) {
    r = res();
    await h(req({ url: '/api/login?lang=hr&t=' + encodeURIComponent(t) }), r);
    assert.equal(r.getHeader('location'), '/hr/racun/?login=expired');
    assert.equal(setCookies(r).length, 0);
  }
});

test('login: same answer whether or not the email is a customer; rejects cross-origin', async () => {
  process.env.RESEND_API_KEY = 're_test'; process.env.LOGIN_EMAIL_FROM = 'Lupa <prijava@lupa.test>';
  const h = require('../api/login');
  const sent = [];
  global.fetch = async (url, opt) => {
    const u = String(url);
    if (u.includes('/v1/customers?')) return { ok: true, status: 200, json: async () => ({ data: u.includes('known') ? [{ id: 'cus_7' }] : [] }) };
    if (u.includes('/v1/prices/')) return { ok: true, status: 200, json: async () => ({ active: true, type: 'recurring', unit_amount: 700, currency: 'eur', recurring: { interval: 'month' }, product: 'prod_1' }) };
    if (u.includes('/v1/subscriptions')) return { ok: true, status: 200, json: async () => ({ data: [{ status: 'active', items: { data: [{ price: { id: 'price_test' } }] } }] }) };
    if (u.includes('api.resend.com')) { sent.push(JSON.parse(opt.body)); return { ok: true, status: 200, json: async () => ({}) }; }
    throw new Error('unexpected fetch ' + u);
  };
  const post = (email, origin = 'https://lupa.test') => { const r = res(); return h(req({ method: 'POST', url: '/api/login', headers: { origin, 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': email }, body: `lang=en&email=${encodeURIComponent(email)}` }), r).then(() => r); };
  const a = await post('known@example.com'), b = await post('nobody@example.com');
  assert.equal(a.getHeader('location'), '/en/account/?login=sent');
  assert.equal(b.getHeader('location'), '/en/account/?login=sent');
  assert.equal(sent.length, 1);
  const link = sent[0].text.match(/https:\/\/lupa\.test\/api\/login\?lang=en&t=(\S+)/);
  assert.ok(link, 'email contains the link');
  assert.equal(L.verify(decodeURIComponent(link[1]), 'login').c, 'cus_7');
  assert.equal((await post('bad')).getHeader('location'), '/en/account/?login=bad');
  assert.equal((await post('known@example.com', 'https://evil.test')).statusCode, 403);
});

// ---- DEMO / TEST unlock: self-expiring, never on by default ----
test('demo unlock: off by default; checkout unlocks only inside the window; expiry kills old cookies', async () => {
  const checkout = require('../api/checkout');
  const entitlement = L.entitlement;
  const post = async () => { const r = res(); await checkout(req({ method: 'POST', url: '/api/checkout', headers: { origin: 'https://lupa.test', 'content-type': 'application/x-www-form-urlencoded' }, body: 'lang=hr&next=%2Fhr%2Fclanci%2Fx%2F' }), r); return r; };
  delete process.env.DEMO_UNLOCK_UNTIL;
  assert.equal(L.demoActive(), false);
  global.fetch = async () => { throw new Error('network off'); };
  let r = await post();                                       // not demo → normal path (Stripe lookup fails → back to subscribe page)
  assert.ok(!setCookies(r).some((c) => c.startsWith('__Host-lupa_session=')));

  process.env.DEMO_UNLOCK_UNTIL = new Date(Date.now() + 3600e3).toISOString();
  assert.equal(L.demoActive(), true);
  r = await post();
  assert.equal(r.getHeader('location'), '/hr/clanci/x/');
  const cookie = setCookies(r).find((c) => c.startsWith('__Host-lupa_session=')).split(';')[0];
  let e = await entitlement(req({ headers: { cookie } }), res());
  assert.equal(e.active, true);                              // no Stripe call was needed

  process.env.DEMO_UNLOCK_UNTIL = new Date(Date.now() - 1000).toISOString();   // window closed
  e = await entitlement(req({ headers: { cookie } }), res());
  assert.equal(e.active, false);
  assert.equal(e.customer, null);
  delete process.env.DEMO_UNLOCK_UNTIL;
  assert.equal(L.demoActive(), false);
});

test('demo cookie never grants anything without the window, and garbage dates are off', () => {
  for (const v of ['', 'soon', '2000-01-01T00:00:00Z']) { process.env.DEMO_UNLOCK_UNTIL = v; assert.equal(L.demoActive(), false, v); }
  delete process.env.DEMO_UNLOCK_UNTIL;
});
