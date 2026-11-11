// Store subscriptions for BOTH platforms through one API (expo-iap → StoreKit 2 on iOS, Google Play Billing on Android).
//
//  purchase:  requestPurchase({type:'subs'}) → store sheet (Apple ID / Google account; no card entry in the app)
//             → purchaseUpdatedListener → verify on Lupa's server → finishTransaction (acknowledges on Android)
//  restore:   restorePurchases() + getAvailablePurchases() — required by App Store review, useful on a new phone
//  unlock:    paid bodies are never shipped in the app; each one is fetched from /api/app-article with the store token,
//             and the SERVER asks Apple/Google whether the subscription is active (site/api/store-verify.js).
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  deepLinkToSubscriptions, endConnection, ErrorCode, fetchProducts, finishTransaction, getAvailablePurchases, initConnection,
  purchaseErrorListener, purchaseUpdatedListener, requestPurchase, restorePurchases,
  type Purchase, type ProductSubscription,
} from 'expo-iap';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { ANDROID_PACKAGE, API, SUBSCRIPTION_SKU } from './config';
import type { Lang } from './i18n';

export type StorePlatform = 'ios' | 'android';
export type OwnedSub = { platform: StorePlatform; productId: string; token: string; transactionDate?: number; expiresAt?: string | null; autoRenewing?: boolean };
/** none = no subscription on this store account; active = store reports an active sub; pending = payment awaiting confirmation */
export type SubStatus = 'unknown' | 'none' | 'pending' | 'active';
/** What Lupa's server said about the token: verified, rejected (expired/refunded), or unavailable (not configured / offline). */
export type ServerState = 'unchecked' | 'verified' | 'rejected' | 'unavailable';
export type PaidBodyResult = { ok: true; html: string } | { ok: false; reason: 'no_subscription' | 'subscription_required' | 'not_configured' | 'unavailable' | 'not_found' };

const TOKEN_KEY = 'lupa-store-sub-v1';
const platform: StorePlatform | null = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : null;

type Ctx = {
  storeReady: boolean; storeError: string | null; product: ProductSubscription | null;
  status: SubStatus; owned: OwnedSub | null; server: ServerState; busy: boolean; lastError: string | null;
  subscribe: () => Promise<void>; restore: () => Promise<'restored' | 'none' | 'error'>; manage: () => Promise<void>;
  fetchPaidBody: (postId: string, lang: Lang) => Promise<PaidBodyResult>; clearError: () => void;
};
const EntCtx = createContext<Ctx | null>(null);

function toOwned(p: Purchase): OwnedSub | null {
  if (!platform || p.productId !== SUBSCRIPTION_SKU || !p.purchaseToken) return null;
  const anyP = p as Purchase & { expirationDateIOS?: number | null; autoRenewingAndroid?: boolean | null };
  return {
    platform, productId: p.productId, token: p.purchaseToken, transactionDate: p.transactionDate,
    expiresAt: anyP.expirationDateIOS ? new Date(anyP.expirationDateIOS).toISOString() : null,
    autoRenewing: anyP.autoRenewingAndroid ?? p.isAutoRenewing,
  };
}

async function postJson(url: string, body: unknown, ms = 15000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    let j: any = null; try { j = await r.json(); } catch { /* Vercel 404 page = route not deployed yet */ }
    return { status: r.status, json: j };
  } finally { clearTimeout(t); }
}

export function EntitlementProvider({ children }: { children: React.ReactNode }) {
  const [storeReady, setStoreReady] = useState(false);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [product, setProduct] = useState<ProductSubscription | null>(null);
  const [status, setStatus] = useState<SubStatus>('unknown');
  const [owned, setOwned] = useState<OwnedSub | null>(null);
  const [server, setServer] = useState<ServerState>('unchecked');
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const ownedRef = useRef<OwnedSub | null>(null);
  const bodyCache = useRef(new Map<string, string>());

  const remember = useCallback((o: OwnedSub | null) => {
    ownedRef.current = o; setOwned(o);
    if (o) AsyncStorage.setItem(TOKEN_KEY, JSON.stringify(o)).catch(() => {}); else AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
    bodyCache.current.clear();
  }, []);

  /** Ask Lupa's server (which asks Apple/Google). Never throws. */
  const verify = useCallback(async (o: OwnedSub): Promise<ServerState> => {
    try {
      const { status: http, json } = await postJson(API.entitlement, { platform: o.platform, token: o.token });
      if (http === 200 && json) {
        if (json.active) { setServer('verified'); if (json.expiresAt) { const n = { ...o, expiresAt: json.expiresAt }; ownedRef.current = n; setOwned(n); } return 'verified'; }
        setServer('rejected'); return 'rejected';
      }
      setServer('unavailable'); return 'unavailable';
    } catch { setServer('unavailable'); return 'unavailable'; }
  }, []);

  /** Read what the store says this account owns right now. */
  const syncOwned = useCallback(async (): Promise<OwnedSub | null> => {
    const purchases = await getAvailablePurchases({ onlyIncludeActiveItemsIOS: true });
    const mine = purchases.filter((p) => p.productId === SUBSCRIPTION_SKU).sort((a, b) => (b.transactionDate ?? 0) - (a.transactionDate ?? 0));
    const p = mine[0];
    if (!p) { remember(null); setStatus('none'); setServer('unchecked'); return null; }
    if (p.purchaseState === 'pending') { setStatus('pending'); return null; }
    const o = toOwned(p); remember(o); setStatus(o ? 'active' : 'none');
    // Android: a restored but never-acknowledged purchase would be refunded after 3 days — acknowledge it.
    if (Platform.OS === 'android' && (p as any).isAcknowledgedAndroid === false) finishTransaction({ purchase: p, isConsumable: false }).catch(() => {});
    return o;
  }, [remember]);

  useEffect(() => {
    if (!platform) { setStoreError('unsupported_platform'); setStatus('none'); return; }
    let alive = true;
    const subs: { remove: () => void }[] = [];
    (async () => {
      // Last known token first, so paid posts can open immediately; the store and the server re-check it below.
      try { const raw = await AsyncStorage.getItem(TOKEN_KEY); if (raw && alive) { const o = JSON.parse(raw) as OwnedSub; ownedRef.current = o; setOwned(o); setStatus('active'); } } catch { /* ignore */ }
      try {
        subs.push(purchaseUpdatedListener(async (p: Purchase) => {
          if (p.productId !== SUBSCRIPTION_SKU) return;
          if (p.purchaseState === 'pending') { setStatus('pending'); setBusy(false); return; }
          const o = toOwned(p);
          if (!o) return;
          remember(o); setStatus('active'); setBusy(false); setLastError(null);
          const s = await verify(o);
          // Finish (Android: acknowledge) unless the server positively rejected the token. When the server is not
          // configured yet we still finish: entitlement is re-checked server-side on every paid article request,
          // and an unacknowledged Play purchase would be auto-refunded after 3 days.
          if (s !== 'rejected') finishTransaction({ purchase: p, isConsumable: false }).catch(() => {});
        }));
        subs.push(purchaseErrorListener((e) => {
          setBusy(false);
          if (e.code === ErrorCode.UserCancelled) return;
          if (e.code === ErrorCode.AlreadyOwned) { syncOwned().catch(() => {}); return; }
          setLastError(e.message || String(e.code));
        }));
        const connected = await initConnection();
        if (!alive) return;
        if (connected === false) throw new Error('store_unavailable'); // e.g. no Play Store / not signed in
        // Unknown SKUs are omitted (→ product null = "not live in the store yet"); a throw means the store itself is unreachable.
        const list = (await fetchProducts({ skus: [SUBSCRIPTION_SKU], type: 'subs' })) as ProductSubscription[] | null;
        if (!alive) return;
        setProduct(list?.find((x) => x.id === SUBSCRIPTION_SKU) ?? null);
        const o = await syncOwned();
        if (!alive) return;
        setStoreReady(true); setStoreError(null);
        if (o) verify(o);
      } catch (e: any) {
        if (!alive) return;
        setStoreReady(false);
        // Expo Go, emulator without Play Store, sideloaded APK without a Play account, etc.
        setStoreError(e?.message ?? 'store_unavailable');
        if (!ownedRef.current) setStatus('none');
      }
    })();
    return () => { alive = false; subs.forEach((s) => s.remove()); endConnection().catch(() => {}); };
  }, [remember, syncOwned, verify]);

  const subscribe = useCallback(async () => {
    setLastError(null);
    if (!storeReady || !product) return;
    setBusy(true);
    try {
      // Android needs the offer token of the base plan (7 € / month); iOS only the product id.
      const offers = (product.subscriptionOffers ?? []).filter((o) => !!o.offerTokenAndroid);
      const basePlan = offers.find((o) => !o.id || o.id === o.basePlanIdAndroid) ?? offers[0];
      await requestPurchase({
        type: 'subs',
        request: {
          apple: { sku: SUBSCRIPTION_SKU },
          google: { skus: [SUBSCRIPTION_SKU], subscriptionOffers: basePlan?.offerTokenAndroid ? [{ sku: SUBSCRIPTION_SKU, offerToken: basePlan.offerTokenAndroid }] : undefined },
        },
      });
      // Result arrives in purchaseUpdatedListener / purchaseErrorListener.
    } catch (e: any) {
      setBusy(false);
      if (e?.code !== ErrorCode.UserCancelled) setLastError(e?.message ?? 'purchase_failed');
    }
  }, [storeReady, product]);

  const restore = useCallback(async (): Promise<'restored' | 'none' | 'error'> => {
    setLastError(null);
    if (!storeReady) return 'error';
    setBusy(true);
    try {
      await restorePurchases();
      const o = await syncOwned();
      if (!o) return 'none';
      const s = await verify(o);
      return s === 'rejected' ? 'none' : 'restored';
    } catch (e: any) { setLastError(e?.message ?? 'restore_failed'); return 'error'; } finally { setBusy(false); }
  }, [storeReady, syncOwned, verify]);

  const manage = useCallback(async () => {
    try { await deepLinkToSubscriptions({ skuAndroid: SUBSCRIPTION_SKU, packageNameAndroid: ANDROID_PACKAGE }); } catch (e: any) { setLastError(e?.message ?? 'manage_failed'); }
  }, []);

  const fetchPaidBody = useCallback(async (postId: string, lang: Lang): Promise<PaidBodyResult> => {
    const o = ownedRef.current;
    if (!o) return { ok: false, reason: 'no_subscription' };
    const key = `${postId}.${lang}`;
    const hit = bodyCache.current.get(key);
    if (hit) return { ok: true, html: hit };
    try {
      const { status: http, json } = await postJson(API.article, { post: postId, lang, platform: o.platform, token: o.token });
      if (http === 200 && json?.html) { bodyCache.current.set(key, json.html); setServer('verified'); return { ok: true, html: json.html }; }
      if (http === 402) { setServer('rejected'); return { ok: false, reason: 'subscription_required' }; }
      if (http === 503 && json?.error === 'store_verification_not_configured') { setServer('unavailable'); return { ok: false, reason: 'not_configured' }; }
      if (http === 404 && json?.error === 'not_found') return { ok: false, reason: 'not_found' };
      if (http === 404) { setServer('unavailable'); return { ok: false, reason: 'not_configured' }; } // route not deployed yet
      return { ok: false, reason: 'unavailable' };
    } catch { return { ok: false, reason: 'unavailable' }; }
  }, []);

  const value = useMemo<Ctx>(() => ({
    storeReady, storeError, product, status, owned, server, busy, lastError,
    subscribe, restore, manage, fetchPaidBody, clearError: () => setLastError(null),
  }), [storeReady, storeError, product, status, owned, server, busy, lastError, subscribe, restore, manage, fetchPaidBody]);
  return <EntCtx.Provider value={value}>{children}</EntCtx.Provider>;
}

export function useEntitlement() {
  const c = useContext(EntCtx);
  if (!c) throw new Error('useEntitlement outside EntitlementProvider');
  return c;
}
export const storePlatform = platform;
