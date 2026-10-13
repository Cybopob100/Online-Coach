import { Tabs } from 'expo-router/tabs';
import { useEffect } from 'react';
import { ColorValue, Text } from 'react-native';
import { useAuth } from '../../lib/auth';
import { t } from '../../lib/i18n';
import { useLang } from '../../lib/language';
import { registerForPush } from '../../lib/push';
import { useColors } from '../../lib/theme';

const icon = (glyph: string) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ fontSize: 20, color }}>{glyph}</Text>;
  };

export default function TabsLayout() {
  const c = useColors();
  useLang(); // перерисовать подписи вкладок при смене языка
  const { profile } = useAuth();
  const isCoach = profile?.role === 'coach';

  // Тренер получает push о новых записях: тихо обновляем токен, если разрешение уже дано
  useEffect(() => {
    if (isCoach && profile) registerForPush(profile.id, false).catch(() => {});
  }, [isCoach, profile]);

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.text,
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t.tabTrainings, tabBarIcon: icon('▦') }} />
      <Tabs.Screen name="bookings" options={{ title: t.tabBookings, tabBarIcon: icon('✓') }} />
      <Tabs.Screen
        name="coach"
        options={{ title: t.tabSettings, tabBarIcon: icon('⚙'), href: isCoach ? undefined : null }}
      />
      <Tabs.Screen name="profile" options={{ title: t.tabProfile, tabBarIcon: icon('●') }} />
    </Tabs>
  );
}
