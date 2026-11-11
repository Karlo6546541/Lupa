// Watchlist: the tickers this reader follows. Stored ONLY on the phone (AsyncStorage) — no account, no server.
// Push topics follow the list: following INFQ subscribes the device to t_INFQ_<lang> (see push.ts).
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLang } from './lang';
import { pushAvailable, requestPushPermission, syncTopics, topicNews, topicTicker } from './push';

const LIST_KEY = 'lupa-watch-v1';
const PUSH_KEY = 'lupa-push-v1';       // 'on' | 'off'; unset = never asked
export type PushState = 'unavailable' | 'unset' | 'on' | 'off';

type Ctx = {
  tickers: string[]; isFollowing: (t: string) => boolean; toggle: (t: string) => void;
  push: PushState; enablePush: () => Promise<boolean>; disablePush: () => void;
};
const WatchCtx = createContext<Ctx>({ tickers: [], isFollowing: () => false, toggle: () => {}, push: 'unavailable', enablePush: async () => false, disablePush: () => {} });

export function WatchProvider({ children }: { children: React.ReactNode }) {
  const { lang, ready: langReady } = useLang();
  const [tickers, setTickers] = useState<string[]>([]);
  const [push, setPush] = useState<PushState>(pushAvailable() ? 'unset' : 'unavailable');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [list, p] = await Promise.all([AsyncStorage.getItem(LIST_KEY), AsyncStorage.getItem(PUSH_KEY)]);
        if (list) { const j = JSON.parse(list); if (Array.isArray(j)) setTickers(j.filter((x) => typeof x === 'string')); }
        if (pushAvailable() && (p === 'on' || p === 'off')) setPush(p);
      } catch { /* start empty */ }
      setLoaded(true);
    })();
  }, []);

  // Keep the device's topic subscriptions equal to: news + every followed ticker, in the current language.
  useEffect(() => {
    if (!loaded || !langReady || push === 'unavailable' || push === 'unset') return;
    syncTopics(push === 'on' ? [topicNews(lang), ...tickers.map((t) => topicTicker(t, lang))] : []);
  }, [loaded, langReady, push, lang, tickers]);

  const toggle = useCallback((t: string) => {
    setTickers((cur) => {
      const next = cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t];
      AsyncStorage.setItem(LIST_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);
  const enablePush = useCallback(async () => {
    if (!pushAvailable()) return false;
    const ok = await requestPushPermission();
    setPush(ok ? 'on' : 'off'); AsyncStorage.setItem(PUSH_KEY, ok ? 'on' : 'off').catch(() => {});
    return ok;
  }, []);
  const disablePush = useCallback(() => { if (pushAvailable()) { setPush('off'); AsyncStorage.setItem(PUSH_KEY, 'off').catch(() => {}); } }, []);

  const value = useMemo<Ctx>(() => ({ tickers, isFollowing: (t) => tickers.includes(t), toggle, push, enablePush, disablePush }),
    [tickers, toggle, push, enablePush, disablePush]);
  return <WatchCtx.Provider value={value}>{children}</WatchCtx.Provider>;
}
export const useWatch = () => useContext(WatchCtx);
