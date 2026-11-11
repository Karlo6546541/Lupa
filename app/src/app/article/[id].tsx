import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Share, Text, View, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { HtmlView } from '../../components/HtmlView';
import { LangSwitch } from '../../components/ui';
import { FALLBACK_PRICE, SITE_URL } from '../../lib/config';
import { articleHtml, type PaywallState } from '../../lib/articleHtml';
import { useEntitlement } from '../../lib/entitlement';
import { isPaid, postById, useFeed } from '../../lib/feed';
import { useLang } from '../../lib/lang';
import { C, F } from '../../lib/theme';

type Fetch = { key: string; state: PaywallState } | null;

export default function Article() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { feed } = useFeed();
  const { lang, t } = useLang();
  const e = useEntitlement();
  const router = useRouter();
  const post = postById(feed, String(id));
  const paid = !!post && isPaid(post);
  const price = e.product?.displayPrice || FALLBACK_PRICE[lang];
  const subscribed = e.status === 'active' && !!e.owned && e.server !== 'rejected';
  const [fetched, setFetched] = useState<Fetch>(null);
  const [nonce, setNonce] = useState(0);
  const key = `${id}.${lang}.${e.owned?.token ?? ''}.${nonce}`;

  useEffect(() => {
    if (!post || !paid || !subscribed) return;
    let alive = true;
    setFetched({ key, state: { kind: 'loading' } });
    e.fetchPaidBody(post.id, lang).then((r) => {
      if (!alive) return;
      if (r.ok) return setFetched({ key, state: { kind: 'unlocked', html: r.html } });
      const state: PaywallState =
        r.reason === 'not_configured' ? { kind: 'message', text: t.gateNotLive, retry: true }
        : r.reason === 'subscription_required' ? { kind: 'message', text: t.gateRejected, price }
        : r.reason === 'no_subscription' ? { kind: 'locked', price }
        : { kind: 'message', text: t.gateErr, retry: true };
      setFetched({ key, state });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, paid, subscribed]);

  const pw: PaywallState | null = !paid ? null
    : e.status === 'pending' ? { kind: 'message', text: t.pending }
    : !subscribed ? { kind: 'locked', price }
    : fetched?.key === key ? fetched.state : { kind: 'loading' };

  const html = useMemo(() => (post ? articleHtml(post, lang, t, feed.categories, pw) : ''), [post, lang, t, feed.categories, pw && JSON.stringify(pw)]); // eslint-disable-line react-hooks/exhaustive-deps

  const onAction = useCallback(async (a: string) => {
    if (a === 'subscribe') router.navigate('/subscription');
    if (a === 'retry') setNonce((n) => n + 1);
    if (a === 'restore') {
      const r = await e.restore();
      if (r !== 'restored') Alert.alert(t.restore, r === 'none' ? t.restoreNone : t.storeUnavailable);
    }
  }, [e, router, t]);

  const share = () => post && Share.share({ message: `${post.title[lang]} — ${SITE_URL}${post.url[lang]}` }).catch(() => {});

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <Stack.Screen options={{
        title: '',
        headerRight: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            {post ? <Pressable onPress={share} hitSlop={8} accessibilityLabel="Share"><Ionicons name="share-outline" size={22} color={C.ink} /></Pressable> : null}
            <LangSwitch />
          </View>
        ),
      }} />
      {post ? <HtmlView html={html} onAction={onAction} /> : (
        <Text style={{ fontFamily: F.sans, fontSize: 16, color: C.ink2, padding: 24 }}>{t.notFound}</Text>
      )}
    </View>
  );
}
