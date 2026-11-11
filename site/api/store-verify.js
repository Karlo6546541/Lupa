// Lupa mobile app — server-side verification of App Store / Google Play subscriptions. Zero dependencies (Node 22).
// Used by /api/app-entitlement and /api/app-article. Secrets come ONLY from Vercel environment variables:
//
//   APP_SUBSCRIPTION_PRODUCT_IDS     comma list of store product ids that unlock paid posts (default: lupa_monthly)
//   GOOGLE_PLAY_PACKAGE_NAME         Android applicationId, e.g. com.svenda.lupa
//   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON service-account key JSON (raw or base64) with access to the app in Play Console
//   APPLE_BUNDLE_ID                  iOS bundle id, e.g. com.svenda.lupa
//   APPLE_ISSUER_ID / APPLE_KEY_ID   App Store Connect → Users and Access → Integrations → In-App Purchase key
//   APPLE_PRIVATE_KEY                the .p8 key contents (PEM; literal "\n" sequences are accepted)
//
// The client never decides entitlement: it sends the store's purchase token (Android purchaseToken, iOS signed
// transaction JWS) and this module asks Google / Apple directly over HTTPS. Results are cached in memory ≤10 min.
'use strict';
const crypto = require('crypto');
const env = (k) => (process.env[k] || '').trim();

const CACHE_MS = 10 * 60 * 1000;
const cache = new Map(); // sha256(platform:token) → { at, result }

function productIds() { return (env('APP_SUBSCRIPTION_PRODUCT_IDS') || 'lupa_monthly').split(',').map((s) => s.trim()).filter(Boolean); }
function googleConfigured() { return !!(env('GOOGLE_PLAY_PACKAGE_NAME') && env('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON')); }
function appleConfigured() { return !!(env('APPLE_BUNDLE_ID') && env('APPLE_ISSUER_ID') && env('APPLE_KEY_ID') && env('APPLE_PRIVATE_KEY')); }
function configured(platform) { return platform === 'android' ? googleConfigured() : platform === 'ios' ? appleConfigured() : false; }

const b64u = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
function decodeJwsPayload(jws) {
  const parts = String(jws || '').split('.');
  if (parts.length !== 3) return null;
  try { return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { return null; }
}
function pem(v) { return v.includes('\\n') ? v.replace(/\\n/g, '\n') : v; }

// ---------- Google Play Developer API ----------
let googleTok = null; // { token, exp }
function serviceAccount() {
  const raw = env('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
  const txt = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  const sa = JSON.parse(txt);
  if (!sa.client_email || !sa.private_key) throw new Error('service account JSON lacks client_email/private_key');
  return sa;
}
async function googleAccessToken() {
  if (googleTok && googleTok.exp - 60 > Date.now() / 1000) return googleTok.token;
  const sa = serviceAccount(), now = Math.floor(Date.now() / 1000);
  const aud = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const unsigned = b64u({ alg: 'RS256', typ: 'JWT' }) + '.' + b64u({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud, iat: now, exp: now + 3600 });
  const sig = crypto.sign('RSA-SHA256', Buffer.from(unsigned), pem(sa.private_key)).toString('base64url');
  const r = await fetch(aud, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + sig }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('Google OAuth failed: HTTP ' + r.status);
  googleTok = { token: j.access_token, exp: now + (j.expires_in || 3600) };
  return googleTok.token;
}
const GOOGLE_ENTITLED = new Set(['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED']);
async function verifyGoogle(token) {
  const pkg = env('GOOGLE_PLAY_PACKAGE_NAME'), at = await googleAccessToken();
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(pkg)}/purchases`;
  const r = await fetch(`${base}/subscriptionsv2/tokens/${encodeURIComponent(token)}`, { headers: { Authorization: 'Bearer ' + at } });
  if (r.status === 404 || r.status === 400 || r.status === 410) return { active: false, reason: 'unknown_token' };
  if (!r.ok) throw new Error('Google Play API HTTP ' + r.status);
  const s = await r.json();
  const allowed = productIds(), now = Date.now();
  // CANCELED = auto-renew switched off, access continues until expiryTime.
  const items = (s.lineItems || []).filter((li) => allowed.includes(li.productId));
  const expiry = Math.max(0, ...items.map((li) => Date.parse(li.expiryTime) || 0));
  const active = GOOGLE_ENTITLED.has(s.subscriptionState) && items.length > 0 && (expiry > now || s.subscriptionState === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD');
  if (active && s.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING') {
    // Unacknowledged purchases are refunded by Google after 3 days; the app acknowledges too, this is a safety net.
    fetch(`${base}/subscriptions/${encodeURIComponent(items[0].productId)}/tokens/${encodeURIComponent(token)}:acknowledge`,
      { method: 'POST', headers: { Authorization: 'Bearer ' + at, 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
  }
  return { active, platform: 'android', productId: items[0] ? items[0].productId : null, expiresAt: expiry ? new Date(expiry).toISOString() : null,
    state: s.subscriptionState, environment: s.testPurchase ? 'test' : 'production' };
}

// ---------- App Store Server API ----------
let appleJwt = null; // { token, exp }
function appleToken() {
  const now = Math.floor(Date.now() / 1000);
  if (appleJwt && appleJwt.exp - 60 > now) return appleJwt.token;
  const unsigned = b64u({ alg: 'ES256', kid: env('APPLE_KEY_ID'), typ: 'JWT' }) + '.' +
    b64u({ iss: env('APPLE_ISSUER_ID'), iat: now, exp: now + 1800, aud: 'appstoreconnect-v1', bid: env('APPLE_BUNDLE_ID') });
  const sig = crypto.sign('sha256', Buffer.from(unsigned), { key: pem(env('APPLE_PRIVATE_KEY')), dsaEncoding: 'ieee-p1363' }).toString('base64url');
  appleJwt = { token: unsigned + '.' + sig, exp: now + 1800 };
  return appleJwt.token;
}
const APPLE_HOSTS = { production: 'https://api.storekit.itunes.apple.com', sandbox: 'https://api.storekit-sandbox.itunes.apple.com' };
async function verifyApple(jws) {
  // The client's JWS is used ONLY to find the originalTransactionId; the decision comes from Apple's server response.
  const claimed = decodeJwsPayload(jws);
  if (!claimed || !claimed.originalTransactionId) return { active: false, reason: 'bad_token' };
  if (claimed.bundleId && claimed.bundleId !== env('APPLE_BUNDLE_ID')) return { active: false, reason: 'wrong_bundle' };
  // Production first; App Review and TestFlight purchases live in the sandbox (Apple's recommended fallback).
  const order = env('APPLE_ENVIRONMENT') === 'sandbox' ? ['sandbox'] : env('APPLE_ENVIRONMENT') === 'production' ? ['production'] : ['production', 'sandbox'];
  for (const envName of order) {
    const r = await fetch(`${APPLE_HOSTS[envName]}/inApps/v1/subscriptions/${encodeURIComponent(claimed.originalTransactionId)}`,
      { headers: { Authorization: 'Bearer ' + appleToken() } });
    if (r.status === 404) continue;
    if (r.status === 401) { appleJwt = null; throw new Error('App Store Server API unauthorized (check APPLE_* env vars)'); }
    if (!r.ok) throw new Error('App Store Server API HTTP ' + r.status);
    const j = await r.json(), allowed = productIds(), now = Date.now();
    let best = null;
    for (const group of j.data || []) for (const t of group.lastTransactions || []) {
      const info = decodeJwsPayload(t.signedTransactionInfo) || {}; // fetched from Apple over TLS with our key
      if (!allowed.includes(info.productId) || info.bundleId !== env('APPLE_BUNDLE_ID')) continue;
      if (info.revocationDate) continue;
      // status: 1 active, 2 expired, 3 billing retry, 4 billing grace period, 5 revoked
      const ok = t.status === 1 || t.status === 4;
      const cand = { active: ok && (t.status === 4 || (info.expiresDate || 0) > now), platform: 'ios', productId: info.productId,
        expiresAt: info.expiresDate ? new Date(info.expiresDate).toISOString() : null, state: t.status, environment: envName };
      if (!best || (cand.active && !best.active)) best = cand;
    }
    return best || { active: false, reason: 'no_matching_subscription', environment: envName };
  }
  return { active: false, reason: 'unknown_transaction' };
}

// ---------- public ----------
async function verifyStorePurchase(platform, token) {
  if (!['ios', 'android'].includes(platform) || typeof token !== 'string' || token.length < 10 || token.length > 20000) {
    return { active: false, reason: 'bad_request', status: 400 };
  }
  if (!configured(platform)) return { active: false, reason: 'store_verification_not_configured', status: 503 };
  const key = crypto.createHash('sha256').update(platform + ':' + token).digest('hex');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result;
  const result = platform === 'android' ? await verifyGoogle(token) : await verifyApple(token);
  if (cache.size > 5000) cache.clear();
  cache.set(key, { at: Date.now(), result });
  return result;
}

module.exports = { verifyStorePurchase, configured, productIds, decodeJwsPayload };
