// Push notifications through Firebase Cloud Messaging TOPICS — no accounts and no server database.
//   news_<lang>          every new article
//   t_<TICKER>_<lang>    filings, insider buys/sales and calendar reminders for one followed company
// The phone subscribes itself to the topics it wants; the site's daily GitHub Action sends to topics
// (site/scripts/send_push.mjs). Lupa never learns who follows what.
//
// Firebase is optional at build time (see app.config.js): without google-services.json / GoogleService-Info.plist,
// or in Expo Go, the native module is missing. Every function here then quietly reports "unavailable".
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PermissionsAndroid, Platform } from 'react-native';
import type { Lang } from './i18n';

const TOPICS_KEY = 'lupa-push-topics-v1';
type Messaging = typeof import('@react-native-firebase/messaging');
type Unsub = () => void;

let mod: Messaging | null | undefined;
function fcm(): Messaging | null {
  if (mod !== undefined) return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('@react-native-firebase/messaging') as Messaging;
    m.getMessaging(); // throws when there is no native module or no Firebase app configured
    mod = m;
  } catch { mod = null; }
  return mod;
}

export const pushAvailable = () => fcm() !== null;
export const topicNews = (lang: Lang) => `news_${lang}`;
/** FCM topic names allow [a-zA-Z0-9-_.~%]; tickers such as BRK.B are fine, anything else is replaced. */
export const topicTicker = (ticker: string, lang: Lang) => `t_${ticker.replace(/[^A-Za-z0-9.\-]/g, '-')}_${lang}`;

/** Asks the OS for permission (Android 13+ runtime permission, iOS alert). Returns true when notifications may be shown. */
export async function requestPushPermission(): Promise<boolean> {
  const m = fcm();
  if (!m) return false;
  try {
    if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
      const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      if (r !== PermissionsAndroid.RESULTS.GRANTED) return false;
    }
    const status = await m.requestPermission(m.getMessaging());
    return status === m.AuthorizationStatus.AUTHORIZED || status === m.AuthorizationStatus.PROVISIONAL;
  } catch { return false; }
}

/** Makes the device's topic subscriptions equal to `wanted` (subscribes to new ones, leaves the rest). Never throws. */
export async function syncTopics(wanted: string[]): Promise<boolean> {
  const m = fcm();
  if (!m) return false;
  try {
    const raw = await AsyncStorage.getItem(TOPICS_KEY);
    const have: string[] = raw ? JSON.parse(raw) : [];
    const msg = m.getMessaging();
    const done = new Set(have);
    for (const t of have) if (!wanted.includes(t)) { await m.unsubscribeFromTopic(msg, t); done.delete(t); }
    for (const t of wanted) if (!done.has(t)) { await m.subscribeToTopic(msg, t); done.add(t); }
    await AsyncStorage.setItem(TOPICS_KEY, JSON.stringify([...done]));
    return true;
  } catch { return false; } // offline etc.: the next sync retries from the stored state
}

/** Calls `open(url)` when the user taps a notification (app in background or closed). The server sends data.url = site path. */
export function onNotificationOpen(open: (url: string) => void): Unsub {
  const m = fcm();
  if (!m) return () => {};
  const msg = m.getMessaging();
  const go = (r: { data?: Record<string, unknown> } | null) => { const u = r?.data?.url; if (typeof u === 'string' && u) open(u); };
  m.getInitialNotification(msg).then(go).catch(() => {});
  return m.onNotificationOpenedApp(msg, go);
}

/** Notifications that arrive while the app is open are not shown by the OS; hand them to the UI instead. */
export function onForegroundMessage(show: (title: string, body: string, url?: string) => void): Unsub {
  const m = fcm();
  if (!m) return () => {};
  return m.onMessage(m.getMessaging(), async (r) => {
    const n = r.notification; const u = r.data?.url;
    if (n?.title) show(n.title, n.body ?? '', typeof u === 'string' ? u : undefined);
  });
}
