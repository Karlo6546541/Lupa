import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import React from 'react';
import { useLang } from '../../lib/lang';
import { C, F } from '../../lib/theme';

export default function TabsLayout() {
  const { t } = useLang();
  const icon = (name: keyof typeof Ionicons.glyphMap) => ({ color, size }: { color: any; size: number }) => <Ionicons name={name} color={color} size={size - 2} />;
  return (
    <Tabs screenOptions={{
      headerShown: false, tabBarActiveTintColor: C.teal, tabBarInactiveTintColor: C.muted,
      tabBarStyle: { backgroundColor: C.card, borderTopColor: C.rule },
      tabBarLabelStyle: { fontFamily: F.sansMedium, fontSize: 11 },
      sceneStyle: { backgroundColor: C.paper },
    }}>
      <Tabs.Screen name="index" options={{ title: t.tabHome, tabBarIcon: icon('newspaper-outline') }} />
      <Tabs.Screen name="categories" options={{ title: t.tabCategories, tabBarIcon: icon('albums-outline') }} />
      <Tabs.Screen name="subscription" options={{ title: t.tabSubscription, tabBarIcon: icon('star-outline') }} />
      <Tabs.Screen name="more" options={{ title: t.tabMore, tabBarIcon: icon('ellipsis-horizontal-circle-outline') }} />
    </Tabs>
  );
}
