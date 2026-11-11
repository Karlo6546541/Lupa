// Shared pieces of the tracker screens (watchlist tab, company profile).
import Ionicons from '@expo/vector-icons/Ionicons';
import * as WebBrowser from 'expo-web-browser';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Company, TrackerEvent } from '../lib/feed';
import { fmtDate, fmtPct, fmtPrice } from '../lib/format';
import { useLang } from '../lib/lang';
import { C, F, R } from '../lib/theme';
import { useWatch } from '../lib/watchlist';

export const openWeb = (url: string) => WebBrowser.openBrowserAsync(url).catch(() => {});
export const dirColor = (x: number) => (x > 0 ? C.up : x < 0 ? C.down : C.muted);

export function Pct({ value, style }: { value: number; style?: object }) {
  const { lang } = useLang();
  return <Text style={[ts.mono, { color: dirColor(value) }, style]}>{fmtPct(value, lang)}</Text>;
}

/** Star button: follow / unfollow a ticker. The first follow offers notifications (handled by the caller via onFirstFollow). */
export function FollowStar({ ticker, size = 24, onFollow }: { ticker: string; size?: number; onFollow?: () => void }) {
  const { t } = useLang();
  const { isFollowing, toggle } = useWatch();
  const on = isFollowing(ticker);
  return (
    <Pressable onPress={() => { toggle(ticker); if (!on) onFollow?.(); }} hitSlop={10} accessibilityRole="button"
      accessibilityLabel={`${on ? t.following : t.follow} ${ticker}`} accessibilityState={{ selected: on }}>
      <Ionicons name={on ? 'star' : 'star-outline'} size={size} color={on ? C.amber : C.muted} />
    </Pressable>
  );
}

export function CompanyRow({ co, onPress, onFollow }: { co: Company; onPress: () => void; onFollow?: () => void }) {
  const { lang } = useLang();
  const last = co.events.find((e) => e.important) ?? co.events[0];
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [ts.coRow, pressed && { backgroundColor: C.paper2 }]} accessibilityRole="link">
      <FollowStar ticker={co.ticker} onFollow={onFollow} />
      <View style={{ flex: 1 }}>
        <View style={ts.line}>
          <Text style={ts.ticker}>{co.ticker}</Text>
          {co.price ? <Text style={ts.mono}>{fmtPrice(co.price.last, lang)} <Pct value={co.price.change_pct} /></Text> : null}
        </View>
        <Text style={ts.name} numberOfLines={1}>{co.name}</Text>
        {last ? <Text style={ts.last} numberOfLines={2}>{fmtDate(last.date, lang)} · {last.text[lang]}</Text> : null}
      </View>
      <Text style={ts.chev}>›</Text>
    </Pressable>
  );
}

export function EventRow({ ev, showTicker, onTicker }: { ev: TrackerEvent; showTicker?: boolean; onTicker?: (t: string) => void }) {
  const { lang } = useLang();
  const edge = ev.kind === 'buy' ? C.up : ev.kind === 'sell' ? C.down : ev.important ? C.amber : 'transparent';
  const tag = ev.kind === 'buy' ? C.up : ev.kind === 'sell' ? C.down : C.muted;
  return (
    <Pressable onPress={() => openWeb(ev.url)} style={({ pressed }) => [ts.ev, { borderLeftColor: edge }, pressed && { backgroundColor: C.paper2 }]} accessibilityRole="link">
      <View style={ts.line}>
        <Text style={ts.evDate}>{fmtDate(ev.date, lang)}</Text>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          {showTicker ? <Text style={ts.evTicker} onPress={() => onTicker?.(ev.ticker)}>{ev.ticker}</Text> : null}
          <Text style={[ts.form, { color: tag, borderColor: tag === C.muted ? C.rule : tag }]}>{ev.form}</Text>
        </View>
      </View>
      <Text style={ts.evText}>{ev.text[lang]}</Text>
    </Pressable>
  );
}

export const ts = StyleSheet.create({
  mono: { fontFamily: F.mono, fontSize: 13, color: C.ink },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  coRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.rule },
  ticker: { fontFamily: F.monoMedium, fontSize: 16, color: C.ink },
  name: { fontFamily: F.sans, fontSize: 13, color: C.muted, marginTop: 1 },
  last: { fontFamily: F.sans, fontSize: 13, lineHeight: 18, color: C.ink2, marginTop: 5 },
  chev: { fontFamily: F.sans, fontSize: 22, color: C.muted },
  ev: { paddingVertical: 11, paddingLeft: 12, paddingRight: 16, marginLeft: 16, borderLeftWidth: 3, borderBottomWidth: 1, borderBottomColor: C.rule },
  evDate: { fontFamily: F.mono, fontSize: 12, color: C.muted },
  evTicker: { fontFamily: F.monoMedium, fontSize: 12, color: C.teal },
  form: { fontFamily: F.monoMedium, fontSize: 10.5, letterSpacing: 0.4, borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, overflow: 'hidden' },
  evText: { fontFamily: F.sans, fontSize: 14.5, lineHeight: 20, color: C.ink, marginTop: 4 },
  h: { fontFamily: F.sansBold, fontSize: 11.5, letterSpacing: 1.3, color: C.teal, marginTop: 24, marginBottom: 8, paddingHorizontal: 16, textTransform: 'uppercase' },
  box: { marginHorizontal: 16, padding: 14, borderRadius: R.sm, backgroundColor: C.card, borderWidth: 1, borderColor: C.rule },
  fine: { fontFamily: F.sans, fontSize: 12.5, lineHeight: 18, color: C.muted, marginHorizontal: 16, marginTop: 10 },
  btn: { alignSelf: 'flex-start', backgroundColor: C.teal, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, marginTop: 10 },
  btnTxt: { fontFamily: F.sansBold, fontSize: 13.5, color: '#fff' },
});
