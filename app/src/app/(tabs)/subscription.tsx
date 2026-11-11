import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FALLBACK_PRICE, LEGAL } from '../../lib/config';
import { useEntitlement } from '../../lib/entitlement';
import { formatDate } from '../../lib/i18n';
import { useLang } from '../../lib/lang';
import { C, F, R } from '../../lib/theme';

export default function Subscription() {
  const { lang, t } = useLang();
  const e = useEntitlement();
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState<string | null>(null);
  const os = Platform.OS === 'ios' ? 'ios' : 'android';
  const price = e.product?.displayPrice || FALLBACK_PRICE[lang];
  const subscribed = e.status === 'active' && e.server !== 'rejected';
  const canBuy = e.storeReady && !!e.product && !e.busy;

  const onRestore = async () => {
    setMsg(null);
    const r = await e.restore();
    setMsg(r === 'restored' ? t.restoreOk : r === 'none' ? t.restoreNone : t.storeUnavailable);
  };
  const openLegal = (url: string) => WebBrowser.openBrowserAsync(url).catch(() => {});

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.paper, marginTop: insets.top }} contentContainerStyle={{ paddingTop: 12, paddingBottom: 32, paddingHorizontal: 16 }}>
      <Text style={st.h1}>{t.planName}</Text>
      <Text style={st.lead}>{t.planLead}</Text>

      {subscribed ? (
        <View style={[st.card, { borderColor: C.teal }]}>
          <Text style={st.kicker}>✓ {t.active.toUpperCase()}</Text>
          {e.owned?.expiresAt ? <Text style={st.p}>{t.activeUntil(formatDate(e.owned.expiresAt, lang))}</Text> : null}
          {e.owned?.autoRenewing !== false ? <Text style={st.p}>{t.renews}</Text> : null}
          {e.server === 'unavailable' ? <Text style={st.fine}>{t.gateNotLive}</Text> : null}
          <Pressable style={st.btnGhost} onPress={e.manage} accessibilityRole="button"><Text style={st.btnGhostTxt}>{t.manage}</Text></Pressable>
        </View>
      ) : (
        <View style={st.card}>
          <Text style={st.kicker}>{t.paidBadge.toUpperCase()}</Text>
          <Text style={st.price}>{price} <Text style={st.per}>/ {t.perMonth}</Text></Text>
          <Text style={st.sub}>{t.cancelAny}</Text>
          {t.planList.map((li) => <Text key={li} style={st.li}>✓  {li}</Text>)}
          {e.status === 'pending' ? <Text style={st.note}>{t.pending}</Text> : null}
          <Pressable style={[st.btn, !canBuy && { opacity: 0.5 }]} disabled={!canBuy} onPress={e.subscribe} accessibilityRole="button">
            {e.busy ? <ActivityIndicator color="#1b1206" /> : <Text style={st.btnTxt}>{t.subscribeBtn(price)}</Text>}
          </Pressable>
          {!e.storeReady ? <Text style={st.note}>{t.storeUnavailable}</Text> : !e.product ? <Text style={st.note}>{t.productMissing}</Text> : null}
          <Text style={st.fine}>{t.storeNote[os]}</Text>
        </View>
      )}

      <Pressable style={st.btnGhost} onPress={onRestore} disabled={e.busy} accessibilityRole="button"><Text style={st.btnGhostTxt}>{t.restore}</Text></Pressable>
      {msg ? <Text style={st.note}>{msg}</Text> : null}
      {e.lastError ? <Text style={[st.note, { color: C.down }]} onPress={() => { Alert.alert(t.purchaseFailed, e.lastError ?? ''); e.clearError(); }}>{t.purchaseFailed}</Text> : null}

      <Text style={[st.fine, { marginTop: 18 }]}>{t.renewFine[os]}</Text>
      <Text style={st.fine}>{t.sameAccount}</Text>
      <View style={{ flexDirection: 'row', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
        <Text style={st.link} onPress={() => openLegal(LEGAL.privacy[lang])}>{t.privacy}</Text>
        <Text style={st.link} onPress={() => openLegal(os === 'ios' ? LEGAL.appleStandardEula : LEGAL.terms[lang])}>{t.terms}</Text>
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  h1: { fontFamily: F.serifBold, fontSize: 30, color: C.ink, letterSpacing: -0.3 },
  lead: { fontFamily: F.serif, fontSize: 18, lineHeight: 25, color: C.ink2, marginTop: 6, marginBottom: 16 },
  card: { backgroundColor: C.card, borderRadius: R.r, borderWidth: 1.5, borderColor: C.amber, padding: 18, marginBottom: 14 },
  kicker: { fontFamily: F.sansBold, fontSize: 11.5, letterSpacing: 1.3, color: C.teal, marginBottom: 8 },
  price: { fontFamily: F.serifBold, fontSize: 40, color: C.ink },
  per: { fontFamily: F.sans, fontSize: 16, color: C.muted },
  sub: { fontFamily: F.sans, fontSize: 14, color: C.muted, marginBottom: 12 },
  li: { fontFamily: F.sans, fontSize: 15, lineHeight: 22, color: C.ink2, marginBottom: 4 },
  p: { fontFamily: F.sans, fontSize: 15, color: C.ink2, marginBottom: 4 },
  btn: { backgroundColor: C.amber, borderRadius: 999, paddingVertical: 15, alignItems: 'center', marginTop: 16 },
  btnTxt: { fontFamily: F.sansBold, fontSize: 16, color: '#1b1206' },
  btnGhost: { borderWidth: 1.5, borderColor: C.teal, borderRadius: 999, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  btnGhostTxt: { fontFamily: F.sansBold, fontSize: 15, color: C.teal },
  note: { fontFamily: F.sans, fontSize: 13.5, lineHeight: 19, color: C.ink2, marginTop: 10 },
  fine: { fontFamily: F.sans, fontSize: 12.5, lineHeight: 18, color: C.muted, marginTop: 10 },
  link: { fontFamily: F.sansMedium, fontSize: 14, color: C.teal, textDecorationLine: 'underline' },
});
