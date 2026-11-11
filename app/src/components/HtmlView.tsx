import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { SITE_URL } from '../lib/config';
import { useFeed } from '../lib/feed';
import { openRoute, routeForUrl } from '../lib/links';
import { C } from '../lib/theme';

const BASE = SITE_URL + '/';

/** Renders Lupa HTML with the site's CSS. JavaScript is OFF; every tap on a link is routed natively. */
export function HtmlView({ html, onAction }: { html: string; onAction?: (action: string) => void }) {
  const router = useRouter();
  const { feed } = useFeed();
  const onNav = (req: WebViewNavigation & { navigationType?: string; isTopFrame?: boolean }) => {
    const url = req.url;
    if (url === 'about:blank' || ((url === BASE || url === SITE_URL) && req.navigationType !== 'click')) return true;
    if (req.isTopFrame === false) return true;
    if (url.startsWith('lupa://')) {
      const action = url.slice('lupa://'.length).split('/')[0];
      if (['subscribe', 'restore', 'retry'].includes(action)) { onAction?.(action); return false; }
    }
    const r = routeForUrl(url, feed);
    if (r) openRoute(r, router);
    return false;
  };
  return (
    <WebView
      originWhitelist={['*']}
      source={{ html, baseUrl: BASE }}
      onShouldStartLoadWithRequest={onNav}
      javaScriptEnabled={false}
      setSupportMultipleWindows={false}
      allowsLinkPreview={false}
      startInLoadingState
      renderLoading={() => <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.paper }}><ActivityIndicator color={C.teal} /></View>}
      style={{ flex: 1, backgroundColor: C.paper }}
      containerStyle={{ backgroundColor: C.paper }}
    />
  );
}
