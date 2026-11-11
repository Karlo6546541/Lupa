import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LangSwitch, LeadCard, Logo, Notice, PostCard, SectionHead, Tape, s as ui } from '../../components/ui';
import { postsInCategory, useFeed } from '../../lib/feed';
import { useLang } from '../../lib/lang';
import { C, F } from '../../lib/theme';

export default function Home() {
  const { feed, source, refreshing, refresh } = useFeed();
  const { lang, t } = useLang();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [lead, ...rest] = feed.posts;
  const open = (id: string) => router.push({ pathname: '/article/[id]', params: { id } });
  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <View style={{ paddingTop: insets.top, backgroundColor: C.paper, borderBottomWidth: 1, borderBottomColor: C.rule }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12 }}>
          <Logo />
          <Text style={{ fontFamily: F.serifItalic, color: C.muted, fontSize: 15, flex: 1, borderLeftWidth: 1, borderLeftColor: C.rule2, paddingLeft: 10 }} numberOfLines={1}>{t.tagline}</Text>
          <LangSwitch />
        </View>
      </View>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.teal} colors={[C.teal]} />}
        contentContainerStyle={{ paddingBottom: 28 }}>
        <Tape items={feed.tape[lang].items} asof={feed.tape[lang].asof} />
        {source !== 'network' ? <Notice text={source === 'bundled' ? t.snapshotNote : t.offlineNote} /> : null}
        {lead ? <LeadCard post={lead} feed={feed} onPress={() => open(lead.id)} /> : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, gap: 8 }}>
          {feed.categories.map((c) => (
            <Pressable key={c.id} onPress={() => router.push({ pathname: '/category/[id]', params: { id: c.id } })}
              style={({ pressed }) => ({ borderWidth: 1, borderColor: C.rule2, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: pressed ? C.paper2 : C.card })}>
              <Text style={{ fontFamily: F.sansMedium, fontSize: 13, color: C.ink2 }}>{c[lang].name} <Text style={{ color: C.muted }}>{postsInCategory(feed, c.id).length}</Text></Text>
            </Pressable>
          ))}
        </ScrollView>
        <SectionHead title={t.latest} />
        {rest.map((p) => <PostCard key={p.id} post={p} feed={feed} onPress={() => open(p.id)} />)}
        <View style={{ marginHorizontal: 16, marginTop: 8, padding: 14, borderRadius: 8, backgroundColor: C.paper2 }}>
          <Text style={[ui.meta, { lineHeight: 19 }]}>{t.notAdvice}{' '}
            <Text style={{ color: C.teal, fontFamily: F.sansMedium }} onPress={() => router.push({ pathname: '/page/[key]', params: { key: 'disclaimer' } })}>{t.disclaimer}</Text>
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
