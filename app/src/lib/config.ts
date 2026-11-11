import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as { siteUrl?: string; subscriptionProductId?: string };

/** The Lupa website. The app reads its public JSON feed and calls its /api/app-* functions. */
export const SITE_URL = (extra.siteUrl ?? 'https://lupa-lovat.vercel.app').replace(/\/+$/, '');
export const FEED_URL = `${SITE_URL}/app/v1/feed.json`;
export const API = {
  /** POST {platform, token} → {active, expiresAt} — server asks Google Play / App Store (lupa/api/store-verify.js). */
  entitlement: `${SITE_URL}/api/app-entitlement`,
  /** POST {post, lang, platform, token} → {html} — subscriber-only remainder of a paid post. */
  article: `${SITE_URL}/api/app-article`,
};

/**
 * Store product id of the 7 € / month auto-renewable subscription. PLACEHOLDER until Karlo creates it:
 *  - Google Play Console → Monetize → Subscriptions → product id `lupa_monthly`, base plan `monthly` (1 month, 7,00 EUR, auto-renewing)
 *  - App Store Connect → Subscriptions → group "Lupa" → product id `lupa_monthly` (1 month, 7,00 EUR price point)
 * The same id is used on both stores so one codebase needs no per-platform branching. Change it in app.json → extra.
 */
export const SUBSCRIPTION_SKU = extra.subscriptionProductId ?? 'lupa_monthly';
export const ANDROID_PACKAGE = Constants.expoConfig?.android?.package ?? 'com.svenda.lupa';

/** Fallback text if the store has not returned a localized price yet. */
export const FALLBACK_PRICE = { hr: '7,00 €', en: '€7.00' };

/**
 * Legal links shown next to the subscribe button (required by App Store guideline 3.1.2 and Google Play).
 * TODO before store submission: publish these pages on the website (they do not exist yet).
 * Terms: Apple's standard EULA is acceptable on iOS if Lupa does not publish its own terms.
 */
export const LEGAL = {
  privacy: { hr: `${SITE_URL}/hr/privatnost/`, en: `${SITE_URL}/en/privacy/` },
  terms: { hr: `${SITE_URL}/hr/uvjeti/`, en: `${SITE_URL}/en/terms/` },
  appleStandardEula: 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/',
};
