// Карточка тренировки: детали, описание, правила отмены с комиссией и оплата.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { KindArt } from '../../components/KindArt';
import { Badge, Button, Card } from '../../components/ui';
import { confirmDialog, showAlert } from '../../lib/alert';
import { useAuth } from '../../lib/auth';
import { formatDateTime, formatPrice } from '../../lib/format';
import { errorText, t } from '../../lib/i18n';
import { useLang } from '../../lib/language';
import { PaymentInit, usePayment } from '../../lib/payments';
import { feeFor, useAppSettings } from '../../lib/settings';
import { callFunction, Slot, supabase } from '../../lib/supabase';
import { useColors } from '../../lib/theme';

export default function SlotScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  useLang();
  const { session, profile } = useAuth();
  const settings = useAppSettings();
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
    const policy = t.cancellationPolicy(settings.refund_hours, formatPrice(feeFor(slot.price_grosze, settings)));

    // 1. Клиент заранее видит сумму и комиссию за отмену и подтверждает
    const ok = await confirmDialog(
      `${t.payConfirmTitle}: ${formatPrice(slot.price_grosze)}`,
      `${t.kinds[slot.kind]}\n${formatDateTime(slot.starts_at)}\n\n${policy}`,
      t.pay,
      t.no,
    );
    if (!ok) return;

    setPaying(true);
    try {
      // 2. Бронь + PaymentIntent на сервере
      const init = await callFunction<PaymentInit>('create-payment-intent', { slot_id: slot.slot_id });

      // 3. Форма оплаты Stripe (карта, BLIK, Przelewy24, Apple/Google Pay)
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

      // 4. Успех. Статус «paid» ставит вебхук Stripe через секунду-две
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
  const fee = formatPrice(feeFor(slot.price_grosze, settings));

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Stack.Screen options={{ title: t.kinds[slot.kind] }} />

      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <View style={{ backgroundColor: c.accentSoft, borderRadius: 16, padding: 4 }}>
          <KindArt kind={slot.kind} size={72} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: c.text, fontSize: 20, fontWeight: '800' }}>{t.kinds[slot.kind]}</Text>
          <Text style={{ color: c.accent, fontSize: 16, fontWeight: '700' }}>{formatDateTime(slot.starts_at)}</Text>
        </View>
      </View>

      <Card>
        <Row label={t.duration} value={`${slot.duration_min} ${t.minutes}`} />
        <Row label={t.gym} value={slot.gym_name ?? t.online} />
        {slot.gym_address ? <Text style={{ color: c.muted, textAlign: 'right' }}>{slot.gym_address}</Text> : null}
        {slot.kind === 'online' ? <Text style={{ color: c.muted }}>{t.onlineNote}</Text> : null}
        {slot.kind === 'group' ? <Row label={t.capacity} value={`${slot.booked}/${slot.capacity}`} /> : null}
        <Row label="" value={formatPrice(slot.price_grosze)} bold />
      </Card>

      {slot.description ? (
        <Card>
          <Text style={{ color: c.muted, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 }}>
            {t.aboutSession.toUpperCase()}
          </Text>
          <Text style={{ color: c.text, fontSize: 15, lineHeight: 22 }}>{slot.description}</Text>
        </Card>
      ) : null}

      {/* Правила отмены видны до оплаты */}
      <View style={{ borderLeftWidth: 3, borderLeftColor: c.warning, paddingLeft: 12 }}>
        <Text style={{ color: c.text, fontSize: 14, lineHeight: 20 }}>
          {t.cancellationPolicy(settings.refund_hours, fee)}
        </Text>
      </View>

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
    </ScrollView>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, gap: 12 }}>
      <Text style={{ color: c.muted }}>{label}</Text>
      <Text style={{ color: c.text, fontWeight: bold ? '800' : '500', fontSize: bold ? 18 : 15, flexShrink: 1, textAlign: 'right' }}>
        {value}
      </Text>
    </View>
  );
}
