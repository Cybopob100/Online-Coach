// Расписание одного вида тренировок: выбор зала (для тренировок в зале) и времени.
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { KindArt } from '../../components/KindArt';
import { Badge, Card, Chip, Empty } from '../../components/ui';
import { dayKey, formatDay, formatPrice, formatTime } from '../../lib/format';
import { t } from '../../lib/i18n';
import { useLang } from '../../lib/language';
import { Kind, Slot, supabase } from '../../lib/supabase';
import { useColors } from '../../lib/theme';

export default function KindScreen() {
  const { kind } = useLocalSearchParams<{ kind: Kind }>();
  const c = useColors();
  useLang();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [gymId, setGymId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    const { data } = await supabase.rpc('get_upcoming_slots', { days_ahead: 30 });
    setSlots(((data as Slot[]) ?? []).filter((s) => s.kind === kind));
    setRefreshing(false);
  }, [kind]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Залы, в которых есть тренировки этого вида
  const gyms = useMemo(() => {
    const map = new Map<string, string>();
    slots.forEach((s) => s.gym_id && map.set(s.gym_id, s.gym_name ?? ''));
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [slots]);

  const days = useMemo(() => {
    const visible = gymId ? slots.filter((s) => s.gym_id === gymId) : slots;
    const map = new Map<string, Slot[]>();
    for (const s of visible) map.set(dayKey(s.starts_at), [...(map.get(dayKey(s.starts_at)) ?? []), s]);
    return [...map.values()];
  }, [slots, gymId]);

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={c.accent} />}
    >
      <Stack.Screen options={{ title: t.kinds[kind] }} />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ backgroundColor: c.accentSoft, borderRadius: 16, padding: 4 }}>
          <KindArt kind={kind} size={72} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text, fontSize: 20, fontWeight: '800' }}>{t.kinds[kind]}</Text>
          <Text style={{ color: c.muted }}>{t.kindDesc[kind]}</Text>
        </View>
      </View>

      {kind !== 'online' && gyms.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label={t.allGyms} active={gymId === null} onPress={() => setGymId(null)} />
          {gyms.map((g) => (
            <Chip key={g.id} label={g.name.replace(/^FitFabric\s*(Łódź\s*)?/i, '')} active={gymId === g.id} onPress={() => setGymId(g.id)} />
          ))}
        </ScrollView>
      )}

      {!refreshing && days.length === 0 && <Empty text={t.noSlots} />}

      {days.map((list) => (
        <View key={list[0].starts_at} style={{ gap: 8 }}>
          <Text style={{ color: c.text, fontSize: 17, fontWeight: '800', marginTop: 8 }}>{formatDay(list[0].starts_at)}</Text>
          {list.map((s) => {
            const left = s.capacity - s.booked;
            return (
              <Pressable key={s.slot_id} onPress={() => router.push(`/slot/${s.slot_id}`)} accessibilityRole="button">
                {({ pressed }) => (
                  <Card style={{ opacity: pressed ? 0.85 : 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <Text style={{ color: c.accent, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                        {formatTime(s.starts_at)}
                      </Text>
                      <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{formatPrice(s.price_grosze)}</Text>
                    </View>
                    <Text style={{ color: c.muted }}>
                      {s.duration_min} {t.minutes} · {s.gym_name ?? t.online}
                    </Text>
                    {s.description ? (
                      <Text style={{ color: c.text }} numberOfLines={2}>
                        {s.description}
                      </Text>
                    ) : null}
                    <View style={{ marginTop: 4 }}>
                      {s.my_booking_status === 'paid' ? (
                        <Badge text={t.booked} tone="success" />
                      ) : s.my_booking_status === 'pending_payment' ? (
                        <Badge text={t.awaitingPayment} tone="warning" />
                      ) : left > 0 ? (
                        <Badge text={t.spotsLeft(left)} tone="muted" />
                      ) : (
                        <Badge text={t.full} tone="danger" />
                      )}
                    </View>
                  </Card>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}
