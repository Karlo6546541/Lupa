// Content feed: GET SITE_URL/app/v1/feed.json (written by lupa/scripts/export_app_feed.py on every site deploy).
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
export type Feed = {
  version: number; generated: string; name: string; tagline: L10n; description: L10n; categories: Category[];
  tape: L10n<{ items: TapeItem[]; asof: string }>; subscription: { plan: L10n; price_eur: number; interval: string };
  pages: Record<'about' | 'disclaimer', Page>; posts: Post[];
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
