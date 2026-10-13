import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { showAlert } from '../../lib/alert';
import { Badge, Button, Card } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { formatDateTime, formatPrice } from '../../lib/format';
import { errorText, t } from '../../lib/i18n';
import { PaymentInit, usePayment } from '../../lib/payments';
import { callFunction, Slot, supabase } from '../../lib/supabase';
import { useColors } from '../../lib/theme';

const REFUND_HOURS = 24; // должно совпадать с REFUND_HOURS в edge-функции cancel-booking

export default function SlotScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const { session, profile } = useAuth();
  const payWith = usePayment();
  const [slot, setSlot] = useState<Slot | null>(null);
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('get_upcoming_slots', { days_ahead: 365 });
    setSlot(((data as Slot[]) ?? []).find((s) => s.slot_id === id) ?? null);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function pay() {
    if (!slot) return;
    setPaying(true);
    try {
      // 1. Бронь + PaymentIntent на сервере
      const init = await callFunction<PaymentInit>('create-payment-intent', { slot_id: slot.slot_id });

      // 2. Форма оплаты Stripe (карта, BLIK, Przelewy24, Apple/Google Pay)
      const result = await payWith(
        { ...init, amount: slot.price_grosze },
        { email: session?.user.email, name: profile?.full_name ?? undefined },
      );
      if (result.status !== 'paid') {
        if (result.status === 'cancelled') showAlert(t.appName, t.paymentCancelled);
        else showAlert(t.error, result.message);
        await load();
        return;
      }

      // 3. Успех. Статус «paid» ставит вебхук Stripe — он приходит через секунду-две
      showAlert(t.appName, t.paymentSuccess, [{ text: 'OK', onPress: () => router.replace('/bookings') }]);
    } catch (e) {
      showAlert(t.error, errorText((e as Error).message));
      await load();
    } finally {
      setPaying(false);
    }
  }

  if (!slot) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  const left = slot.capacity - slot.booked;
  const isPaid = slot.my_booking_status === 'paid';
  const isPending = slot.my_booking_status === 'pending_payment';

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Stack.Screen options={{ title: slot.title }} />

      <View style={{ gap: 4 }}>
        <Text style={{ color: c.text, fontSize: 26, fontWeight: '800' }}>{slot.title}</Text>
        <Text style={{ color: c.accent, fontSize: 18, fontWeight: '700' }}>
          {formatDateTime(slot.starts_at)}
        </Text>
      </View>

      <Card>
        {slot.description ? <Text style={{ color: c.text, fontSize: 15, lineHeight: 21 }}>{slot.description}</Text> : null}
        <Row label={t.duration} value={`${slot.duration_min} ${t.minutes}`} />
        {slot.location ? <Row label={t.location} value={slot.location} /> : null}
        <Row label="" value={formatPrice(slot.price_grosze)} bold />
      </Card>

      {isPaid ? (
        <Badge text={t.booked} tone="success" />
      ) : left <= 0 && !isPending ? (
        <Badge text={t.full} tone="danger" />
      ) : (
        <Button
          title={isPending ? t.continuePayment : t.bookAndPay(formatPrice(slot.price_grosze))}
          onPress={pay}
          loading={paying}
        />
      )}

      <Text style={{ color: c.muted, fontSize: 13 }}>{t.cancellationPolicy(REFUND_HOURS)}</Text>
    </ScrollView>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
      <Text style={{ color: c.muted }}>{label}</Text>
      <Text style={{ color: c.text, fontWeight: bold ? '800' : '500', fontSize: bold ? 18 : 15 }}>{value}</Text>
    </View>
  );
}
