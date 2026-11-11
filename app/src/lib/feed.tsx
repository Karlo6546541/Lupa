// Content feed: GET SITE_URL/app/v1/feed.json (written by site/scripts/export_app_feed.py on every site deploy).
// Order of preference: network → last good copy in AsyncStorage → snapshot bundled into the app (assets/feed.snapshot.json).
// The feed contains only public content: free posts in full, paid posts as the same teaser the website shows.
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { FEED_URL } from './config';
import type { Lang } from './i18n';

export type L10n<T = string> = Record<Lang, T>;
export type Category = { id: string; image?: string | null; hr: { name: string; slug: string; desc: string }; en: { name: string; slug: string; desc: string } };
export type Post = {
  id: string; date: string; order: number; access: 'free' | 'subscribers'; categories: string[]; tickers: string[]; hero: string;
  title: L10n; dek: L10n; url: L10n; body: L10n; locked: L10n<string[]>; minutes: L10n<number>; dateLabel: L10n;
  heroAlt: L10n; heroCaption: L10n; sources: { label: L10n; url: string }[]; sponsored?: { name: string; url?: string };
};
export type Page = { title: L10n; dek: L10n; body: L10n; url: L10n };
export type TapeItem = { label: string; value: string; dir: 'up' | 'down' | 'flat'; change: string };
// Company tracker (site/tracker.py → export_app_feed.py). Optional: feeds from before the tracker do not have it.
export type TrackerEvent = { id: string; ticker: string; date: string; kind: 'buy' | 'sell' | 'filing'; form: string; text: L10n; important: boolean; value?: number | null; url: string };
export type ScoreRow = { post: string; ticker: string; name: string; date: string; session: string; then: number; now: number; now_session: string; currency: string; pct: number; bench: string; bench_pct: number | null };
export type Trial = { id: string; title: string; status: string; phase: string | null; primary_completion: string | null; url: string };
export type Company = {
  ticker: string; name: string; sector: string | null; edgar_url: string; url: L10n; card: L10n | null;
  price: { last: number; change_pct: number; session: string; currency: string; high52?: number | null; low52?: number | null } | null;
  posts: string[]; since: ScoreRow | null; since_events: number; events: TrackerEvent[];
  insider: { days: number; buys: number; buy_value: number; sells: number; sell_value: number; other: number };
  trials: Trial[]; next_earnings_estimate: string | null;
};
export type CalendarItem = { date: string; ticker: string | null; type: 'earnings' | 'trial' | 'meeting' | 'fda' | 'other'; estimate: boolean; title: L10n; url?: string | null };
export type Tracker = { generated: string | null; companies: Record<string, Company>; calendar: CalendarItem[]; scorecard: ScoreRow[]; urls: { calendar: L10n; track: L10n } };
export type Feed = {
  version: number; generated: string; name: string; tagline: L10n; description: L10n; categories: Category[];
  tape: L10n<{ items: TapeItem[]; asof: string }>; subscription: { plan: L10n; price_eur: number; interval: string };
  pages: Record<'about' | 'disclaimer', Page>; posts: Post[]; tracker?: Tracker;
};
export type FeedSource = 'network' | 'cache' | 'bundled';

const CACHE_KEY = 'lupa-feed-v1';
const SUPPORTED_VERSION = 1;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const BUNDLED: Feed = require('../../assets/feed.snapshot.json');

function valid(f: unknown): f is Feed {
  const x = f as Feed;
  return !!x && x.version === SUPPORTED_VERSION && Array.isArray(x.posts) && Array.isArray(x.categories);
}

async function fetchWithTimeout(url: string, ms: number) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } }); } finally { clearTimeout(t); }
}

type Ctx = { feed: Feed; source: FeedSource; refreshing: boolean; refresh: () => Promise<void> };
const FeedCtx = createContext<Ctx>({ feed: BUNDLED, source: 'bundled', refreshing: false, refresh: async () => {} });

export function FeedProvider({ children }: { children: React.ReactNode }) {
  const [feed, setFeed] = useState<Feed>(BUNDLED);
  const [source, setSource] = useState<FeedSource>('bundled');
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await fetchWithTimeout(`${FEED_URL}?t=${Math.floor(Date.now() / 60000)}`, 10000);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (!valid(j)) throw new Error('unsupported feed');
      setFeed(j); setSource('network');
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(j)).catch(() => {});
    } catch {
      // Keep whatever we already show (cache or bundled snapshot).
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (raw) {
          const j = JSON.parse(raw);
          if (valid(j) && j.generated >= BUNDLED.generated) { setFeed(j); setSource('cache'); }
        }
      } catch { /* ignore */ }
      refresh();
    })();
  }, [refresh]);

  const value = useMemo(() => ({ feed, source, refreshing, refresh }), [feed, source, refreshing, refresh]);
  return <FeedCtx.Provider value={value}>{children}</FeedCtx.Provider>;
}
export const useFeed = () => useContext(FeedCtx);

export const categoryById = (feed: Feed, id: string) => feed.categories.find((c) => c.id === id);
export const postById = (feed: Feed, id: string) => feed.posts.find((p) => p.id === id);
export const postsInCategory = (feed: Feed, id: string) => feed.posts.filter((p) => p.categories.includes(id));
export const isPaid = (p: Post) => p.access === 'subscribers';

const NO_TRACKER: Tracker = { generated: null, companies: {}, calendar: [], scorecard: [], urls: { calendar: { hr: '/hr/kalendar/', en: '/en/calendar/' }, track: { hr: '/hr/rezultati/', en: '/en/track-record/' } } };
export const trackerOf = (feed: Feed): Tracker => feed.tracker ?? NO_TRACKER;
