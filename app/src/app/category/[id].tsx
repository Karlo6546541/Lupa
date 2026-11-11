import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { imgUrl, LangSwitch, PostCard } from '../../components/ui';
import { categoryById, postsInCategory, useFeed } from '../../lib/feed';
import { useLang } from '../../lib/lang';
import { C, F, R } from '../../lib/theme';

export default function CategoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { feed } = useFeed();
  const { lang, t } = useLang();
  const router = useRouter();
  const cat = categoryById(feed, String(id));
  const posts = cat ? postsInCategory(feed, cat.id) : [];
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.paper }} contentContainerStyle={{ paddingBottom: 24 }}>
      <Stack.Screen options={{ title: cat ? cat[lang].name : '', headerRight: () => <LangSwitch /> }} />
      {cat ? (
        <View style={st.banner}>
          {cat.image ? <Image source={{ uri: imgUrl(cat.image) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
          <View style={st.shade} />
          <Text style={st.title}>{cat[lang].name}</Text>
          <Text style={st.desc}>{cat[lang].desc}</Text>
          <Text style={st.count}>{t.articlesCount(posts.length)}</Text>
        </View>
      ) : null}
      {posts.map((p) => <PostCard key={p.id} post={p} feed={feed} onPress={() => router.push({ pathname: '/article/[id]', params: { id: p.id } })} />)}
    </ScrollView>
  );
}
const st = StyleSheet.create({
  banner: { margin: 16, borderRadius: R.r, overflow: 'hidden', backgroundColor: C.deep2, padding: 18, paddingTop: 90 },
  shade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(11,31,29,0.6)' },
  title: { fontFamily: F.serifBold, fontSize: 30, color: '#fff' },
  desc: { fontFamily: F.serif, fontSize: 16, lineHeight: 22, color: '#e5ece9', marginTop: 6 },
  count: { fontFamily: F.sansMedium, fontSize: 12, color: '#f3d39d', marginTop: 8 },
});
