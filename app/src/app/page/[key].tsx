import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { HtmlView } from '../../components/HtmlView';
import { LangSwitch } from '../../components/ui';
import { pageHtml } from '../../lib/articleHtml';
import { useFeed } from '../../lib/feed';
import { useLang } from '../../lib/lang';
import { C } from '../../lib/theme';

export default function PageScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { feed } = useFeed();
  const { lang } = useLang();
  const k = key === 'about' ? 'about' : 'disclaimer';
  const pg = feed.pages[k];
  const html = useMemo(() => pageHtml(pg, k, lang), [pg, k, lang]);
  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <Stack.Screen options={{ title: '', headerRight: () => <LangSwitch /> }} />
      <HtmlView html={html} />
    </View>
  );
}
