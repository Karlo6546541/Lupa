// "Praćenje / Tracker" tab: my watchlist, the catalyst calendar and the track record.
// Data: feed.tracker (SEC EDGAR + ClinicalTrials.gov, refreshed daily by the site). The watchlist lives only on the phone.
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Notice } from '../../components/ui';
import { CompanyRow, EventRow, Pct, openWeb, ts } from '../../components/tracker';
import { SITE_URL } from '../../lib/config';
import { postById, trackerOf, useFeed, type CalendarItem } from '../../lib/feed';
import { daysUntil, fmtDate, fmtMonth, fmtPrice } from '../../lib/format';
import { useLang } from '../../lib/lang';
import { C, F } from '../../lib/theme';
import { useWatch } from '../../lib/watchlist';

type Seg = 'list' | 'calendar' | 'track';

export default function Watch() {
  const { feed, refreshing, refresh } = useFeed();
  const { lang, t } = useLang();
  const w = useWatch();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [seg, setSeg] = useState<Seg>('list');
  const [onlyMine, setOnlyMine] = useState(false);
  const tr = trackerOf(feed);
  const all = useMemo(() => Object.values(tr.companies), [tr]);
  const mine = all.filter((c) => w.tickers.includes(c.ticker));
  const others = all.filter((c) => !w.tickers.includes(c.ticker));
  const openCo = (ticker: string) => router.push({ pathname: '/company/[ticker]', params: { ticker } });

  const enablePush = async () => { const ok = await w.enablePush(); if (!ok) Alert.alert(t.pushTitle, t.pushDenied); };
  // After the first follow, offer notifications once (only when the build has push and the reader was never asked).
  const onFollow = () => { if (w.push === 'unset') Alert.alert(t.pushTitle, t.pushText, [{ text: t.back, style: 'cancel' }, { text: t.pushEnable, onPress: enablePush }]); };

  const events = useMemo(() => (mine.length ? mine : all).flatMap((c) => c.events.filter((e) => e.important).slice(0, 6))
    .sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 15), [mine, all]);

  const cal = tr.calendar.filter((c) => !onlyMine || (c.ticker && w.tickers.includes(c.ticker)));
  const months: [string, CalendarItem[]][] = [];
  for (const c of cal) { const m = c.date.slice(0, 7); const last = months[months.length - 1]; if (last && last[0] === m) last[1].push(c); else months.push([m, [c]]); }
  const when = (iso: string) => { const d = daysUntil(iso); return d === 0 ? t.today : d === 1 ? t.tomorrow : d > 1 && d <= 30 ? t.inDays(d) : ''; };

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <View style={{ paddingTop: insets.top, borderBottomWidth: 1, borderBottomColor: C.rule }}>
        <Text style={st.title}>{t.tabWatch}</Text>
        <View style={st.segs} accessibilityRole="tablist">
          {([['list', t.segList], ['calendar', t.segCalendar], ['track', t.segTrack]] as [Seg, string][]).map(([k, label]) => (
            <Pressable key={k} onPress={() => setSeg(k)} style={[st.seg, seg === k && st.segOn]} accessibilityRole="tab" accessibilityState={{ selected: seg === k }}>
              <Text style={[st.segTxt, seg === k && st.segTxtOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.teal} colors={[C.teal]} />} contentContainerStyle={{ paddingBottom: 32 }}>
        {!all.length ? <Notice text={t.noTracker} /> : null}

        {seg === 'list' && all.length ? (
          <>
            {w.push === 'unset' || w.push === 'off' ? (
              <View style={[ts.box, { marginTop: 16 }]}>
                <Text style={st.boxTitle}>{t.pushTitle}</Text>
                <Text style={st.boxText}>{t.pushText}</Text>
                <Pressable onPress={enablePush} style={ts.btn} accessibilityRole="button"><Text style={ts.btnTxt}>{t.pushEnable}</Text></Pressable>
              </View>
            ) : null}
            <Text style={ts.h}>{t.myCompanies}</Text>
            {mine.length ? mine.map((c) => <CompanyRow key={c.ticker} co={c} onPress={() => openCo(c.ticker)} />)
              : <Text style={[ts.fine, { marginTop: 0 }]}>{t.watchEmpty}</Text>}
            {others.length ? <Text style={ts.h}>{t.allCompanies}</Text> : null}
            {others.map((c) => <CompanyRow key={c.ticker} co={c} onPress={() => openCo(c.ticker)} onFollow={onFollow} />)}
            {events.length ? <Text style={ts.h}>{t.latestEvents}</Text> : null}
            {events.map((e) => <EventRow key={e.id} ev={e} showTicker onTicker={openCo} />)}
          </>
        ) : null}

        {seg === 'calendar' && all.length ? (
          <>
            <View style={st.filter}>
              <Text style={st.filterTxt}>{t.calOnlyMine}</Text>
              <Switch value={onlyMine} onValueChange={setOnlyMine} trackColor={{ true: C.teal, false: C.rule2 }} thumbColor="#fff" />
            </View>
            {!months.length ? <Text style={ts.fine}>{t.calEmpty}</Text> : null}
            {months.map(([m, items]) => (
              <View key={m}>
                <Text style={ts.h}>{fmtMonth(m, lang)}</Text>
                {items.map((c, i) => (
                  <Pressable key={`${c.date}-${c.ticker}-${i}`} onPress={() => (c.ticker && tr.companies[c.ticker] ? openCo(c.ticker) : c.url ? openWeb(c.url) : undefined)}
                    style={({ pressed }) => [ts.ev, { borderLeftColor: c.type === 'earnings' ? C.amber : C.teal }, pressed && { backgroundColor: C.paper2 }]}>
                    <View style={ts.line}>
                      <Text style={ts.evDate}>{fmtDate(c.date, lang)}{c.estimate ? ` · ${t.estimate}` : ''}</Text>
                      <Text style={[ts.evDate, { color: C.amberInk }]}>{when(c.date)}</Text>
                    </View>
                    <Text style={ts.evText}><Text style={ts.evTicker}>{c.ticker ? `${c.ticker}  ` : ''}</Text>{c.title[lang]}</Text>
                    <Text style={[ts.form, { alignSelf: 'flex-start', marginTop: 6, color: C.muted, borderColor: C.rule }]}>{t.calType[c.type] ?? t.calType.other}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </>
        ) : null}

        {seg === 'track' && all.length ? (
          <>
            <Text style={[ts.fine, { fontSize: 14, lineHeight: 20, color: C.ink2, marginTop: 16 }]}>{t.trackLead}</Text>
            {tr.scorecard.map((r) => {
              const post = postById(feed, r.post);
              return (
                <Pressable key={r.post} onPress={() => post && router.push({ pathname: '/article/[id]', params: { id: post.id } })}
                  style={({ pressed }) => [ts.box, { marginTop: 12 }, pressed && { backgroundColor: C.paper2 }]} accessibilityRole="link">
                  <View style={ts.line}>
                    <Text style={ts.ticker} onPress={() => openCo(r.ticker)}>{r.ticker}</Text>
                    <Pct value={r.pct} style={{ fontFamily: F.monoMedium, fontSize: 20 }} />
                  </View>
                  <Text style={[st.boxText, { color: C.ink, fontFamily: F.serifMedium, fontSize: 16.5, lineHeight: 22 }]}>{post?.title[lang] ?? r.name}</Text>
                  <Text style={[ts.mono, { color: C.muted, marginTop: 8, fontSize: 12 }]}>
                    {t.then} {fmtPrice(r.then, lang)} ({fmtDate(r.session, lang)}) → {t.now} {fmtPrice(r.now, lang)} {r.currency}
                  </Text>
                  {r.bench_pct !== null ? <Text style={[ts.mono, { color: C.muted, marginTop: 3, fontSize: 12 }]}>{t.vsBench}: <Pct value={r.bench_pct} style={{ fontSize: 12 }} /></Text> : null}
                </Pressable>
              );
            })}
            <Pressable onPress={() => Share.share({ message: `Lupa — ${t.segTrack}: ${SITE_URL}${tr.urls.track[lang]}` }).catch(() => {})} style={[ts.btn, { marginLeft: 16, marginTop: 16 }]} accessibilityRole="button">
              <Text style={ts.btnTxt}>{t.share}</Text>
            </Pressable>
            <Text style={ts.fine}>{t.trackNote}</Text>
          </>
        ) : null}

        {tr.generated ? <Text style={ts.fine}>{t.dataNote(fmtDate(tr.generated, lang))}</Text> : null}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  title: { fontFamily: F.serifBold, fontSize: 26, color: C.ink, paddingHorizontal: 16, paddingTop: 10 },
  segs: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingVertical: 10 },
  seg: { borderWidth: 1, borderColor: C.rule2, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 7, backgroundColor: C.card },
  segOn: { backgroundColor: C.deep, borderColor: C.deep },
  segTxt: { fontFamily: F.sansMedium, fontSize: 13, color: C.ink2 },
  segTxtOn: { color: '#fff' },
  boxTitle: { fontFamily: F.sansBold, fontSize: 15, color: C.ink },
  boxText: { fontFamily: F.sans, fontSize: 14, lineHeight: 20, color: C.ink2, marginTop: 4 },
  filter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12 },
  filterTxt: { fontFamily: F.sans, fontSize: 14.5, color: C.ink },
});
