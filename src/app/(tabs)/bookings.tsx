import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, SectionList, Text, View } from 'react-native';
import { KindArt } from '../../components/KindArt';
import { Badge, Button, Card, Empty } from '../../components/ui';
import { confirmDialog, showAlert } from '../../lib/alert';
import { useAuth } from '../../lib/auth';
import { formatDateTime, formatPrice } from '../../lib/format';
import { errorText, t } from '../../lib/i18n';
import { useLang } from '../../lib/language';
import { feeFor, refundFor, useAppSettings } from '../../lib/settings';
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
  useLang();
  const { session } = useAuth();
  const settings = useAppSettings();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setRefreshing(true);
    const { data } = await supabase
      .from('bookings')
      .select(
        'id, status, amount_grosze, refunded_grosze, created_at, slots(id, starts_at, duration_min, gyms(name), services(kind))',
      )
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
    const time = (b: Booking) => new Date(b.slots.starts_at).getTime();
    const upcoming = bookings
      .filter((b) => time(b) > now && (b.status === 'paid' || b.status === 'pending_payment'))
      .sort((a, b) => time(a) - time(b));
    const past = bookings.filter((b) => !upcoming.includes(b)).sort((a, b) => time(b) - time(a));
    return [
      { key: 'upcoming', title: t.upcoming, data: upcoming },
      { key: 'past', title: t.past, data: past },
    ].filter((s) => s.data.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, t.upcoming]);

  async function cancel(b: Booking) {
    const hoursLeft = (new Date(b.slots.starts_at).getTime() - Date.now()) / 36e5;
    if (b.status === 'paid' && hoursLeft < settings.refund_hours) {
      return showAlert(t.error, t.errors.too_late_to_cancel);
    }
    const refund = formatPrice(refundFor(b.amount_grosze, settings));
    const fee = formatPrice(feeFor(b.amount_grosze, settings));
    const ok = await confirmDialog(
      t.cancelConfirmTitle,
      b.status === 'paid' ? t.cancelConfirmPaid(refund, fee) : t.cancelConfirmPending,
      t.yes,
      t.no,
    );
    if (!ok) return;

    setCancelling(b.id);
    try {
      const res = await callFunction<{ status: string; refunded_grosze: number }>('cancel-booking', { booking_id: b.id });
      showAlert(t.appName, res.status === 'refunded' ? t.cancelledRefund(formatPrice(res.refunded_grosze)) : t.cancelledDone);
      await load();
    } catch (e) {
      showAlert(t.error, errorText((e as Error).message));
    } finally {
      setCancelling(null);
    }
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
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <View style={{ backgroundColor: c.accentSoft, borderRadius: 12, padding: 2 }}>
              <KindArt kind={item.slots.services.kind} size={44} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{t.kinds[item.slots.services.kind]}</Text>
              <Text style={{ color: c.muted }}>{formatDateTime(item.slots.starts_at)}</Text>
              <Text style={{ color: c.muted }}>
                {item.slots.duration_min} {t.minutes} · {item.slots.gyms?.name ?? t.online}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
            <Badge
              text={
                item.status === 'refunded' && item.refunded_grosze != null
                  ? t.refunded(formatPrice(item.refunded_grosze))
                  : t.status[item.status]
              }
              tone={tone[item.status]}
            />
            <Text style={{ color: c.text, fontWeight: '600' }}>{formatPrice(item.amount_grosze)}</Text>
          </View>
          {section.key === 'upcoming' && (
            <View style={{ marginTop: 8 }}>
              <Button title={t.cancel} variant="danger" onPress={() => cancel(item)} loading={cancelling === item.id} />
            </View>
          )}
        </Card>
      )}
    />
  );
}
