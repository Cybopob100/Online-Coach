import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, SectionList, Text, View } from 'react-native';
import { showAlert } from '../../lib/alert';
import { Badge, Button, Card, Empty } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { formatDateTime, formatPrice } from '../../lib/format';
import { errorText, t } from '../../lib/i18n';
import { Booking, BookingStatus, callFunction, supabase } from '../../lib/supabase';
import { useColors } from '../../lib/theme';

const tone: Record<BookingStatus, 'success' | 'warning' | 'danger' | 'muted'> = {
  paid: 'success',
  pending_payment: 'warning',
  cancelled: 'muted',
  refunded: 'muted',
};

export default function BookingsScreen() {
  const c = useColors();
  const { session } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setRefreshing(true);
    const { data } = await supabase
      .from('bookings')
      .select('id, status, amount_grosze, created_at, slots(id, starts_at, location, services(title, duration_min))')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    setBookings((data as unknown as Booking[]) ?? []);
    setRefreshing(false);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const sections = useMemo(() => {
    const now = Date.now();
    const byStart = (a: Booking, b: Booking) =>
      new Date(a.slots.starts_at).getTime() - new Date(b.slots.starts_at).getTime();
    const upcoming = bookings
      .filter((b) => new Date(b.slots.starts_at).getTime() > now && ['paid', 'pending_payment'].includes(b.status))
      .sort(byStart);
    const past = bookings.filter((b) => !upcoming.includes(b)).sort((a, b) => byStart(b, a));
    return [
      { title: t.upcoming, data: upcoming },
      { title: t.past, data: past },
    ].filter((s) => s.data.length > 0);
  }, [bookings]);

  function confirmCancel(b: Booking) {
    showAlert(t.cancelConfirmTitle, b.status === 'paid' ? t.cancelConfirmPaid : t.cancelConfirmPending, [
      { text: t.no, style: 'cancel' },
      {
        text: t.yes,
        style: 'destructive',
        onPress: async () => {
          setCancelling(b.id);
          try {
            await callFunction('cancel-booking', { booking_id: b.id });
            await load();
          } catch (e) {
            showAlert(t.error, errorText((e as Error).message));
          } finally {
            setCancelling(null);
          }
        },
      },
    ]);
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(b) => b.id}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={c.accent} />}
      ListEmptyComponent={refreshing ? null : <Empty text={t.noBookings} />}
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) => (
        <Text style={{ color: c.text, fontSize: 18, fontWeight: '800', marginTop: 12 }}>{section.title}</Text>
      )}
      renderItem={({ item, section }) => (
        <Card>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{item.slots.services.title}</Text>
          <Text style={{ color: c.muted }}>{formatDateTime(item.slots.starts_at)}</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <Badge text={t.status[item.status]} tone={tone[item.status]} />
            <Text style={{ color: c.text, fontWeight: '600' }}>{formatPrice(item.amount_grosze)}</Text>
          </View>
          {section.title === t.upcoming && (
            <View style={{ marginTop: 8 }}>
              <Button
                title={t.cancel}
                variant="danger"
                onPress={() => confirmCancel(item)}
                loading={cancelling === item.id}
              />
            </View>
          )}
        </Card>
      )}
    />
  );
}
