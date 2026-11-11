import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { EntitlementProvider } from '../lib/entitlement';
import { FeedProvider } from '../lib/feed';
import { LangProvider, useLang } from '../lib/lang';
import { C, F, FONT_FILES } from '../lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Nav() {
  const { t } = useLang();
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
            <StatusBar style="dark" />
            <Nav />
          </EntitlementProvider>
        </FeedProvider>
      </LangProvider>
    </SafeAreaProvider>
  );
}
