#!/usr/bin/env node
// Send push notifications for what is NEW in the app feed. Firebase Cloud Messaging topics, zero dependencies (Node 22).
//
//   node scripts/send_push.mjs --old old-feed.json --new dist/app/v1/feed.json [--dry-run]
//
// "old" is the feed that is live right now (downloaded before the deploy), "new" the one just built. The difference:
//   • a post that was not there before            → topic news_<lang>
//   • an important filing / insider buy or sale   → topic t_<TICKER>_<lang>   (only events dated in the last 5 days)
//   • a confirmed calendar event dated tomorrow   → topic t_<TICKER>_<lang>
// The phone subscribes to topics itself (app/src/lib/push.ts), so there is no list of devices or readers anywhere.
// Needs FIREBASE_SERVICE_ACCOUNT (service-account key JSON, raw or base64) — a GitHub Actions secret, never in the repo.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const LANGS = ['hr', 'en'];
const MAX_PER_TICKER = 3;
export const topicNews = (lang) => `news_${lang}`;
export const topicTicker = (ticker, lang) => `t_${ticker.replace(/[^A-Za-z0-9.\-]/g, '-')}_${lang}`;   // same rule as the app
const clip = (s, n = 170) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const isoDay = (d) => d.toISOString().slice(0, 10);

/** Pure: which messages to send. `today` = YYYY-MM-DD in Zagreb. */
export function planMessages(oldFeed, newFeed, today) {
  const out = [];
  if (!oldFeed || !Array.isArray(oldFeed.posts)) return out;          // no baseline (first deploy, download failed): send nothing
  const t0 = new Date(today + 'T00:00:00Z');
  const recent = isoDay(new Date(t0.getTime() - 5 * 86400000)), tomorrow = isoDay(new Date(t0.getTime() + 86400000));
  const had = new Set(oldFeed.posts.map((p) => p.id));
  for (const p of newFeed.posts || []) {
    if (had.has(p.id)) continue;
    for (const L of LANGS) out.push({ topic: topicNews(L), title: L === 'hr' ? 'Lupa: nova objava' : 'Lupa: new article', body: clip(p.title[L]), url: p.url[L] });
  }
  const oldCo = oldFeed.tracker && oldFeed.tracker.companies, newCo = (newFeed.tracker && newFeed.tracker.companies) || {};
  if (oldCo) {
    for (const [t, co] of Object.entries(newCo)) {
      if (!oldCo[t]) continue;                                        // company just added: its history is not news
      const seen = new Set(oldCo[t].events.map((e) => e.id));
      const fresh = co.events.filter((e) => e.important && !seen.has(e.id) && e.date >= recent).slice(0, MAX_PER_TICKER);
      for (const e of fresh) for (const L of LANGS) out.push({ topic: topicTicker(t, L), title: `${t} · ${co.name}`, body: clip(e.text[L]), url: co.url[L] });
    }
  }
  for (const c of (newFeed.tracker && newFeed.tracker.calendar) || []) {
    if (c.date !== tomorrow || c.estimate || !c.ticker || !newCo[c.ticker]) continue;
    for (const L of LANGS) out.push({ topic: topicTicker(c.ticker, L), title: L === 'hr' ? `${c.ticker}: sutra` : `${c.ticker}: tomorrow`, body: clip(c.title[L]), url: newCo[c.ticker].url[L] });
  }
  return out;
}

const b64u = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000), aud = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const unsigned = b64u({ alg: 'RS256', typ: 'JWT' }) + '.' + b64u({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud, iat: now, exp: now + 3600 });
  const sig = crypto.sign('RSA-SHA256', Buffer.from(unsigned), sa.private_key).toString('base64url');
  const r = await fetch(aud, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + sig }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('Google OAuth failed: HTTP ' + r.status);
  return j.access_token;
}

async function main() {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const dry = process.argv.includes('--dry-run');
  const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
  const oldFeed = read(arg('--old')), newFeed = read(arg('--new'));
  if (!newFeed) { console.error('send_push: cannot read --new feed'); process.exit(1); }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zagreb' }).format(new Date());
  const msgs = planMessages(oldFeed, newFeed, today);
  console.log(`send_push: ${msgs.length} message(s)` + (oldFeed ? '' : ' (no baseline feed: nothing to compare with)'));
  for (const m of msgs) console.log(`  → ${m.topic}: ${m.title} — ${m.body}`);
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (dry || !msgs.length) return;
  if (!raw) { console.log('send_push: FIREBASE_SERVICE_ACCOUNT not set — nothing sent'); return; }
  const sa = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
  const token = await accessToken(sa);
  let failed = 0;
  for (const m of msgs) {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { topic: m.topic, notification: { title: m.title, body: m.body }, data: { url: m.url } } }),
    });
    if (!r.ok) { failed += 1; console.error(`  FAIL ${m.topic}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`); }
  }
  if (failed) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error('send_push:', e.message); process.exit(1); });
