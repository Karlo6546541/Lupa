import { Image } from 'expo-image';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SITE_URL } from '../lib/config';
import type { Category, Feed, Post, TapeItem } from '../lib/feed';
import { isPaid } from '../lib/feed';
import type { Lang } from '../lib/i18n';
import { useLang } from '../lib/lang';
import { C, F, R } from '../lib/theme';

export const imgUrl = (name: string, w: 480 | 800 = 800) => `${SITE_URL}/assets/img/${name}-${w}.jpg`;

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <View style={s.logo} accessibilityRole="header" accessibilityLabel="Lupa">
      <Text style={[s.logoText, { fontSize: size, lineHeight: size * 1.1 }]}>Lupa</Text>
      <Image source={require('../../assets/mark.png')} style={{ width: size * 0.7, height: size * 0.7, marginTop: size * 0.08 }} contentFit="contain" />
    </View>
  );
}

export function LangSwitch() {
  const { lang, setLang } = useLang();
  return (
    <View style={s.lang} accessibilityRole="tablist">
      {(['hr', 'en'] as Lang[]).map((l) => (
        <Pressable key={l} onPress={() => setLang(l)} accessibilityRole="tab" accessibilityState={{ selected: l === lang }}
          style={[s.langBtn, l === lang && s.langBtnOn]} hitSlop={6}>
          <Text style={[s.langTxt, l === lang && s.langTxtOn]}>{l.toUpperCase()}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function PaidBadge({ small }: { small?: boolean }) {
  const { t } = useLang();
  return (
    <View style={[s.badge, small && { paddingVertical: 2 }]}>
      <Text style={s.badgeTxt}>🔒 {t.paidBadge}</Text>
    </View>
  );
}

export function Kicker({ text, light }: { text: string; light?: boolean }) {
  return <Text style={[s.kicker, light && { color: '#f3d39d' }]}>{text.toUpperCase()}</Text>;
}

export function Tape({ items, asof }: { items: TapeItem[]; asof: string }) {
  if (!items.length) return null;
  return (
    <View style={s.tape}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tapeRow}>
        {items.map((it) => (
          <Text key={it.label} style={s.tapeItem}>
            <Text style={s.tapeLabel}>{it.label} </Text>{it.value}{' '}
            <Text style={{ color: it.dir === 'up' ? C.upL : it.dir === 'down' ? C.downL : '#8fa6a1' }}>{it.change}</Text>
          </Text>
        ))}
        <Text style={[s.tapeItem, { color: '#8fa6a1' }]}>{asof}</Text>
      </ScrollView>
    </View>
  );
}

function meta(p: Post, lang: Lang, read: string) { return `${p.dateLabel[lang]} · ${p.minutes[lang]} ${read}`; }

export function LeadCard({ post, feed, onPress }: { post: Post; feed: Feed; onPress: () => void }) {
  const { lang, t } = useLang();
  const cat = feed.categories.find((c) => c.id === post.categories[0]);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.lead, pressed && { opacity: 0.92 }]} accessibilityRole="link">
      <Image source={{ uri: imgUrl(post.hero) }} style={s.leadImg} contentFit="cover" transition={150} accessibilityLabel={post.heroAlt[lang]} />
      <View style={s.leadShade} />
      <View style={s.leadBody}>
        {cat ? <Kicker text={cat[lang].name} light /> : null}
        <Text style={s.leadTitle}>{post.title[lang]}</Text>
        <Text style={s.leadDek} numberOfLines={3}>{post.dek[lang]}</Text>
        <View style={s.row}>
          {isPaid(post) ? <PaidBadge small /> : null}
          <Text style={s.leadMeta}>{meta(post, lang, t.read)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export function PostCard({ post, feed, onPress }: { post: Post; feed: Feed; onPress: () => void }) {
  const { lang, t } = useLang();
  const cat = feed.categories.find((c) => c.id === post.categories[0]);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, pressed && { opacity: 0.9 }]} accessibilityRole="link">
      <Image source={{ uri: imgUrl(post.hero) }} style={s.cardImg} contentFit="cover" transition={150} accessibilityLabel={post.heroAlt[lang]} />
      <View style={s.cardBody}>
        {cat ? <Kicker text={cat[lang].name} /> : null}
        <Text style={s.cardTitle}>{post.title[lang]}</Text>
        <Text style={s.cardDek} numberOfLines={3}>{post.dek[lang]}</Text>
        <View style={s.row}>
          {isPaid(post) ? <PaidBadge small /> : null}
          <Text style={s.meta}>{meta(post, lang, t.read)}</Text>
        </View>
        {post.tickers.length ? (
          <View style={[s.row, { marginTop: 8 }]}>{post.tickers.map((tk) => <Text key={tk} style={s.chip}>{tk}</Text>)}</View>
        ) : null}
      </View>
    </Pressable>
  );
}

export function CategoryTile({ cat, count, onPress }: { cat: Category; count: number; onPress: () => void }) {
  const { lang, t } = useLang();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.tile, pressed && { opacity: 0.92 }]} accessibilityRole="link">
      {cat.image ? <Image source={{ uri: imgUrl(cat.image, 480) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
      <View style={s.tileShade} />
      <View style={s.tileBody}>
        <Text style={s.tileName}>{cat[lang].name}</Text>
        <Text style={s.tileDesc} numberOfLines={2}>{cat[lang].desc}</Text>
        <Text style={s.tileCount}>{t.articlesCount(count)}</Text>
      </View>
    </Pressable>
  );
}

export function SectionHead({ title }: { title: string }) {
  return <View style={s.sectionHead}><Text style={s.sectionTitle}>{title}</Text></View>;
}

export function Notice({ text }: { text: string }) {
  return <Text style={s.notice}>{text}</Text>;
}

export const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  logoText: { fontFamily: F.serifBold, color: C.ink, letterSpacing: -0.6 },
  lang: { flexDirection: 'row', borderWidth: 1, borderColor: C.rule2, borderRadius: 999, padding: 2 },
  langBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, minWidth: 38, alignItems: 'center' },
  langBtnOn: { backgroundColor: C.ink },
  langTxt: { fontFamily: F.sansBold, fontSize: 12, letterSpacing: 0.8, color: C.ink2 },
  langTxtOn: { color: '#fff' },
  badge: { backgroundColor: C.amberSoft, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3 },
  badgeTxt: { fontFamily: F.sansBold, fontSize: 11, color: C.amberInk, letterSpacing: 0.3 },
  kicker: { fontFamily: F.sansBold, fontSize: 11, letterSpacing: 1.4, color: C.teal, marginBottom: 6 },
  tape: { backgroundColor: C.deep, borderBottomWidth: 1, borderBottomColor: '#1f3a36' },
  tapeRow: { paddingHorizontal: 14, paddingVertical: 8, gap: 22 },
  tapeItem: { fontFamily: F.mono, fontSize: 12, color: '#d9e4e1' },
  tapeLabel: { fontFamily: F.monoMedium, color: '#fff' },
  lead: { marginHorizontal: 16, marginTop: 16, borderRadius: R.r, overflow: 'hidden', backgroundColor: C.deep, minHeight: 360, justifyContent: 'flex-end' },
  leadImg: { ...StyleSheet.absoluteFill },
  leadShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(11,31,29,0.55)' },
  leadBody: { padding: 18, paddingTop: 120 },
  leadTitle: { fontFamily: F.serifBold, fontSize: 27, lineHeight: 32, color: '#fff', letterSpacing: -0.3 },
  leadDek: { fontFamily: F.serif, fontSize: 16, lineHeight: 22, color: '#e5ece9', marginTop: 8, marginBottom: 12 },
  leadMeta: { fontFamily: F.sans, fontSize: 12.5, color: '#cfdad6' },
  card: { marginHorizontal: 16, marginBottom: 16, borderRadius: R.r, overflow: 'hidden', backgroundColor: C.card, borderWidth: 1, borderColor: C.rule,
    shadowColor: '#14201e', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 1 },
  cardImg: { width: '100%', aspectRatio: 16 / 9, backgroundColor: C.paper2 },
  cardBody: { padding: 16 },
  cardTitle: { fontFamily: F.serifBold, fontSize: 21, lineHeight: 26, color: C.ink, letterSpacing: -0.2 },
  cardDek: { fontFamily: F.sans, fontSize: 14.5, lineHeight: 21, color: C.ink2, marginTop: 6, marginBottom: 10 },
  meta: { fontFamily: F.sans, fontSize: 12.5, color: C.muted },
  chip: { fontFamily: F.monoMedium, fontSize: 12, color: C.ink, backgroundColor: C.paper2, borderColor: C.rule, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, overflow: 'hidden' },
  tile: { marginHorizontal: 16, marginBottom: 12, height: 150, borderRadius: R.r, overflow: 'hidden', backgroundColor: C.deep2, justifyContent: 'flex-end' },
  tileShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(11,31,29,0.58)' },
  tileBody: { padding: 16 },
  tileName: { fontFamily: F.serifBold, fontSize: 23, color: '#fff' },
  tileDesc: { fontFamily: F.sans, fontSize: 13.5, lineHeight: 19, color: '#e2e9e6', marginTop: 4 },
  tileCount: { fontFamily: F.sansMedium, fontSize: 11.5, color: '#f3d39d', marginTop: 6, letterSpacing: 0.5 },
  sectionHead: { marginHorizontal: 16, marginTop: 26, marginBottom: 12, borderTopWidth: 2, borderTopColor: C.ink, paddingTop: 10 },
  sectionTitle: { fontFamily: F.serifBold, fontSize: 22, color: C.ink },
  notice: { fontFamily: F.sans, fontSize: 12.5, color: C.muted, marginHorizontal: 16, marginTop: 10 },
});
