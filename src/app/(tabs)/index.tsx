import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, SectionList, Text, View } from 'react-native';
import { Badge, Card, Empty } from '../../components/ui';
import { dayKey, formatDay, formatPrice, formatTime } from '../../lib/format';
import { t } from '../../lib/i18n';
import { Slot, supabase } from '../../lib/supabase';
import { useColors } from '../../lib/theme';

export default function ScheduleScreen() {
  const c = useColors();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    const { data } = await supabase.rpc('get_upcoming_slots', { days_ahead: 30 });
    setSlots((data as Slot[]) ?? []);
    setRefreshing(false);
  }, []);

  // Обновляем при каждом возврате на вкладку (после оплаты места меняются)
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const sections = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      const k = dayKey(s.starts_at);
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    return [...map.values()].map((data) => ({ title: formatDay(data[0].starts_at), data }));
  }, [slots]);

  return (
    <SectionList
      sections={sections}
      keyExtractor={(s) => s.slot_id}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={c.accent} />}
      ListEmptyComponent={refreshing ? null : <Empty text={t.noSlots} />}
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) => (
        <Text style={{ color: c.text, fontSize: 18, fontWeight: '800', marginTop: 12, textTransform: 'capitalize' }}>
          {section.title}
        </Text>
      )}
      renderItem={({ item }) => {
        const left = item.capacity - item.booked;
        return (
          <Pressable onPress={() => router.push(`/slot/${item.slot_id}`)}>
            {({ pressed }) => (
              <Card style={{ opacity: pressed ? 0.8 : 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Text style={{ color: c.accent, fontSize: 22, fontWeight: '800' }}>{formatTime(item.starts_at)}</Text>
                  <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{formatPrice(item.price_grosze)}</Text>
                </View>
                <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>{item.title}</Text>
                <Text style={{ color: c.muted }}>
                  {item.duration_min} {t.minutes}
                  {item.location ? ` · ${item.location}` : ''}
                </Text>
                <View style={{ marginTop: 4 }}>
                  {item.my_booking_status === 'paid' ? (
                    <Badge text={t.booked} tone="success" />
                  ) : item.my_booking_status === 'pending_payment' ? (
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
      }}
    />
  );
}
