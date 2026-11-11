import { useFonts } from 'expo-font';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { EntitlementProvider } from '../lib/entitlement';
import { FeedProvider, useFeed } from '../lib/feed';
import { LangProvider, useLang } from '../lib/lang';
import { openRoute, routeForUrl } from '../lib/links';
import { onForegroundMessage, onNotificationOpen } from '../lib/push';
import { C, F, FONT_FILES } from '../lib/theme';
import { WatchProvider } from '../lib/watchlist';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Nav() {
  const { t } = useLang();
  const router = useRouter();
  const { feed, refresh } = useFeed();
  const feedRef = useRef(feed); feedRef.current = feed;
  // Push notifications carry data.url = a path on the website; open the matching app screen (and refresh the feed,
  // because the notification is about something newer than what the app has).
  useEffect(() => {
    const open = (url: string) => { refresh(); const r = routeForUrl(url, feedRef.current); if (r) openRoute(r, router); };
    const a = onNotificationOpen(open);
    const b = onForegroundMessage((title, body, url) => Alert.alert(title, body, url ? [{ text: t.back, style: 'cancel' }, { text: 'OK', onPress: () => open(url) }] : undefined));
    return () => { a(); b(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: C.paper }, headerTintColor: C.ink, headerShadowVisible: false,
      headerTitleStyle: { fontFamily: F.serifBold, fontSize: 20 }, contentStyle: { backgroundColor: C.paper },
      headerBackTitle: t.back,
    }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="article/[id]" options={{ title: '' }} />
      <Stack.Screen name="category/[id]" options={{ title: '' }} />
      <Stack.Screen name="page/[key]" options={{ title: '' }} />
      <Stack.Screen name="company/[ticker]" options={{ title: '' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts(FONT_FILES);
  useEffect(() => { if (loaded || error) SplashScreen.hideAsync().catch(() => {}); }, [loaded, error]);
  if (!loaded && !error) return null;
  return (
    <SafeAreaProvider>
      <LangProvider>
        <FeedProvider>
          <EntitlementProvider>
            <WatchProvider>
              <StatusBar style="dark" />
              <Nav />
            </WatchProvider>
          </EntitlementProvider>
        </FeedProvider>
      </LangProvider>
    </SafeAreaProvider>
  );
}
