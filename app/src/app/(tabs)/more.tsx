import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LangSwitch, Logo } from '../../components/ui';
import { LEGAL, SITE_URL } from '../../lib/config';
import { useFeed } from '../../lib/feed';
import { useLang } from '../../lib/lang';
import { C, F } from '../../lib/theme';
import { useWatch } from '../../lib/watchlist';

function Row({ label, onPress, right }: { label: string; onPress?: () => void; right?: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [st.row, pressed && onPress ? { backgroundColor: C.paper2 } : null]} accessibilityRole={onPress ? 'link' : undefined}>
      <Text style={st.rowTxt}>{label}</Text>{right ?? (onPress ? <Text style={st.chev}>›</Text> : null)}
    </Pressable>
  );
}

export default function More() {
  const { lang, t } = useLang();
  const { feed } = useFeed();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const w = useWatch();
  const setPush = async (on: boolean) => { if (!on) return w.disablePush(); if (!(await w.enablePush())) Alert.alert(t.pushTitle, t.pushDenied); };
  const page = (key: 'about' | 'disclaimer') => router.push({ pathname: '/page/[key]', params: { key } });
  const web = (url: string) => WebBrowser.openBrowserAsync(url).catch(() => {});
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.paper, marginTop: insets.top }} contentContainerStyle={{ paddingTop: 16, paddingBottom: 32 }}>
      <View style={{ paddingHorizontal: 16, marginBottom: 6 }}>
        <Logo size={34} />
        <Text style={{ fontFamily: F.serifItalic, fontSize: 16, color: C.muted, marginTop: 2 }}>{t.tagline}</Text>
        <Text style={{ fontFamily: F.sans, fontSize: 14, lineHeight: 20, color: C.ink2, marginTop: 10 }}>{feed.description[lang]}</Text>
      </View>
      <Text style={st.h}>{t.settings}</Text>
      <Row label={t.language} right={<LangSwitch />} />
      <Row label={t.pushTitle} right={w.push === 'unavailable'
        ? <Text style={{ fontFamily: F.sans, fontSize: 12.5, color: C.muted, flexShrink: 1, textAlign: 'right', marginLeft: 12 }}>{t.pushUnavailable}</Text>
        : <Switch value={w.push === 'on'} onValueChange={setPush} trackColor={{ true: C.teal, false: C.rule2 }} thumbColor="#fff" />} />
      <Text style={st.h}>Lupa</Text>
      <Row label={feed.pages.about.title[lang] || t.about} onPress={() => page('about')} />
      <Row label={t.website} onPress={() => web(`${SITE_URL}/${lang}/`)} />
      <Text style={st.h}>{t.legal}</Text>
      <Row label={feed.pages.disclaimer.title[lang] || t.disclaimer} onPress={() => page('disclaimer')} />
      <Row label={t.privacy} onPress={() => web(LEGAL.privacy[lang])} />
      <Row label={t.terms} onPress={() => web(Platform.OS === 'ios' ? LEGAL.appleStandardEula : LEGAL.terms[lang])} />
      <Text style={st.ver}>{t.version} {Constants.expoConfig?.version ?? '1.0.0'} · {t.byline}</Text>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  h: { fontFamily: F.sansBold, fontSize: 11.5, letterSpacing: 1.3, color: C.teal, marginTop: 22, marginBottom: 6, paddingHorizontal: 16, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.rule, backgroundColor: C.card },
  rowTxt: { fontFamily: F.sans, fontSize: 16, color: C.ink },
  chev: { fontFamily: F.sans, fontSize: 22, color: C.muted },
  ver: { fontFamily: F.mono, fontSize: 12, color: C.muted, marginTop: 24, paddingHorizontal: 16 },
});
