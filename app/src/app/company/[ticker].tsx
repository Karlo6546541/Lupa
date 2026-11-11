// Company profile: price, "since our analysis", insider buys/sales, SEC filings timeline, trials and Lupa's research.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { PaidBadge } from '../../components/ui';
import { EventRow, FollowStar, Pct, openWeb, ts } from '../../components/tracker';
import { SITE_URL } from '../../lib/config';
import { isPaid, postById, trackerOf, useFeed } from '../../lib/feed';
import { fmtDate, fmtPrice, usdShort } from '../../lib/format';
import { useLang } from '../../lib/lang';
import { C, F, R } from '../../lib/theme';
import { useWatch } from '../../lib/watchlist';

export default function CompanyScreen() {
  const { ticker } = useLocalSearchParams<{ ticker: string }>();
  const { feed } = useFeed();
  const { lang, t } = useLang();
  const w = useWatch();
  const router = useRouter();
  const tr = trackerOf(feed);
  const co = tr.companies[String(ticker).toUpperCase()];
  if (!co) return <Text style={{ fontFamily: F.sans, fontSize: 16, color: C.ink2, padding: 24 }}>{t.notFound}</Text>;

  const next = tr.calendar.find((c) => c.ticker === co.ticker && c.type === 'earnings');
  const posts = co.posts.map((id) => postById(feed, id)).filter((p): p is NonNullable<typeof p> => !!p);
  const share = () => Share.share({ message: `${co.name} (${co.ticker}) — Lupa: ${SITE_URL}${co.url[lang]}` }).catch(() => {});
  const onFollow = () => {
    if (w.push !== 'unset') return;
    Alert.alert(t.pushTitle, t.pushText, [{ text: t.back, style: 'cancel' },
      { text: t.pushEnable, onPress: async () => { if (!(await w.enablePush())) Alert.alert(t.pushTitle, t.pushDenied); } }]);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 36 }}>
      <Stack.Screen options={{
        title: co.ticker,
        headerRight: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <Pressable onPress={share} hitSlop={8} accessibilityLabel={t.share}><Ionicons name="share-outline" size={22} color={C.ink} /></Pressable>
            <FollowStar ticker={co.ticker} onFollow={onFollow} />
          </View>
        ),
      }} />
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <Text style={st.name}>{co.name}</Text>
        {co.price ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
              <Text style={st.px}>{fmtPrice(co.price.last, lang)}</Text>
              <Text style={[ts.mono, { color: C.muted }]}>{co.price.currency}</Text>
              <Pct value={co.price.change_pct} style={{ fontSize: 16 }} />
            </View>
            <Text style={st.meta}>{t.close} {fmtDate(co.price.session, lang)}
              {co.price.low52 && co.price.high52 ? ` · ${t.range52} ${fmtPrice(co.price.low52, lang)}–${fmtPrice(co.price.high52, lang)}` : ''}</Text>
          </>
        ) : null}
      </View>

      {co.since ? (
        <View style={[ts.box, st.since]}>
          <View style={ts.line}>
            <Text style={st.boxH}>{t.sinceAnalysis}</Text>
            <Pct value={co.since.pct} style={{ fontFamily: F.monoMedium, fontSize: 20 }} />
          </View>
          <Text style={st.boxP}>{t.then} {fmtPrice(co.since.then, lang)} ({fmtDate(co.since.session, lang)}) → {t.now} {fmtPrice(co.since.now, lang)} {co.since.currency}</Text>
          {co.since.bench_pct !== null ? <Text style={st.boxP}>{t.vsBench}: <Pct value={co.since.bench_pct} /></Text> : null}
          <Text style={st.boxP}>{t.sinceEvents(co.since_events)}</Text>
        </View>
      ) : null}

      {next ? (
        <Text style={[ts.fine, { fontSize: 14, color: C.ink }]}>
          <Text style={{ fontFamily: F.sansBold }}>{t.nextResults}: </Text>{fmtDate(next.date, lang)}{next.estimate ? ` (${t.estimate})` : ''}
        </Text>
      ) : null}

      <Text style={ts.h}>{t.insiders12}</Text>
      <View style={st.grid}>
        <View style={st.cell}><Text style={st.cellK}>{t.buys}</Text><Text style={[st.cellV, { color: C.up }]}>{co.insider.buys}</Text><Text style={ts.mono}>{usdShort(co.insider.buy_value, lang)}</Text></View>
        <View style={st.cell}><Text style={st.cellK}>{t.sells}</Text><Text style={[st.cellV, { color: C.down }]}>{co.insider.sells}</Text><Text style={ts.mono}>{usdShort(co.insider.sell_value, lang)}</Text></View>
      </View>
      <Text style={ts.fine}>{t.routineNote(co.insider.other)}</Text>

      <Text style={ts.h}>{t.timeline}</Text>
      {co.events.map((e) => <EventRow key={e.id} ev={e} />)}
      <Text style={[ts.fine, { color: C.teal, fontFamily: F.sansMedium }]} onPress={() => openWeb(co.edgar_url)}>{t.allFilings} →</Text>

      {co.trials.length ? <Text style={ts.h}>{t.trials}</Text> : null}
      {co.trials.map((x) => (
        <Pressable key={x.id} onPress={() => openWeb(x.url)} style={({ pressed }) => [ts.ev, { borderLeftColor: C.teal }, pressed && { backgroundColor: C.paper2 }]} accessibilityRole="link">
          <Text style={ts.evDate}>{[x.phase, x.status.replace(/_/g, ' ').toLowerCase(), x.primary_completion ? `${t.plannedDone} ${x.primary_completion}` : null].filter(Boolean).join(' · ')}</Text>
          <Text style={ts.evText}>{x.title}</Text>
        </Pressable>
      ))}

      {posts.length ? <Text style={ts.h}>{t.ourResearch}</Text> : null}
      {posts.map((p) => (
        <Pressable key={p.id} onPress={() => router.push({ pathname: '/article/[id]', params: { id: p.id } })}
          style={({ pressed }) => [st.post, pressed && { backgroundColor: C.paper2 }]} accessibilityRole="link">
          <Text style={st.postTitle}>{p.title[lang]}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
            {isPaid(p) ? <PaidBadge small /> : null}<Text style={st.meta}>{p.dateLabel[lang]}</Text>
          </View>
        </Pressable>
      ))}

      {tr.generated ? <Text style={ts.fine}>{t.dataNote(fmtDate(tr.generated, lang))}</Text> : null}
      <Text style={ts.fine}>{t.notAdvice}</Text>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  name: { fontFamily: F.serifBold, fontSize: 25, lineHeight: 30, color: C.ink },
  px: { fontFamily: F.monoMedium, fontSize: 30, color: C.ink },
  meta: { fontFamily: F.sans, fontSize: 12.5, color: C.muted, marginTop: 4 },
  since: { marginTop: 16, borderTopWidth: 3, borderTopColor: C.teal },
  boxH: { fontFamily: F.sansBold, fontSize: 15, color: C.ink },
  boxP: { fontFamily: F.sans, fontSize: 13.5, lineHeight: 19, color: C.ink2, marginTop: 4 },
  grid: { flexDirection: 'row', gap: 10, paddingHorizontal: 16 },
  cell: { flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.rule, borderRadius: R.sm, padding: 12, gap: 2 },
  cellK: { fontFamily: F.sansBold, fontSize: 11, letterSpacing: 1, color: C.muted, textTransform: 'uppercase' },
  cellV: { fontFamily: F.serifBold, fontSize: 28 },
  post: { paddingHorizontal: 16, paddingVertical: 13, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.rule },
  postTitle: { fontFamily: F.serifMedium, fontSize: 17, lineHeight: 22, color: C.ink },
});
