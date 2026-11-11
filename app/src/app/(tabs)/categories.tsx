import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CategoryTile } from '../../components/ui';
import { postsInCategory, useFeed } from '../../lib/feed';
import { useLang } from '../../lib/lang';
import { C, F } from '../../lib/theme';

export default function Categories() {
  const { feed } = useFeed();
  const { t } = useLang();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.paper, marginTop: insets.top }} contentContainerStyle={{ paddingTop: 12, paddingBottom: 24 }}>
      <View style={{ paddingHorizontal: 16, marginBottom: 14 }}>
        <Text style={{ fontFamily: F.serifBold, fontSize: 30, color: C.ink }}>{t.allCategories}</Text>
      </View>
      {feed.categories.map((c) => (
        <CategoryTile key={c.id} cat={c} count={postsInCategory(feed, c.id).length}
          onPress={() => router.push({ pathname: '/category/[id]', params: { id: c.id } })} />
      ))}
    </ScrollView>
  );
}
