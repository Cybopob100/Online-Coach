// Настройки тренера: новая тренировка (вид, зал, день, время, длительность, описание),
// ближайшие тренировки с записавшимися, цены и комиссия за отмену, залы, уведомления.
// Вкладка видна только пользователям с role = 'coach'.
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Badge, Button, Card, Chip, Empty, Field, SectionTitle } from '../../components/ui';
import { confirmDialog, showAlert } from '../../lib/alert';
import { useAuth } from '../../lib/auth';
import { combineDayTime, formatDateTime, formatDayShort, formatPrice } from '../../lib/format';
import { errorText, t } from '../../lib/i18n';
import { useLang } from '../../lib/language';
import { PushStatus, registerForPush } from '../../lib/push';
import { AppSettings, Gym, Kind, Service, Slot, supabase } from '../../lib/supabase';
import { useColors } from '../../lib/theme';

type Attendee = { booking_id: string; full_name: string | null; phone: string | null; status: string };
const KINDS: Kind[] = ['gym', 'group', 'online'];

const toZl = (grosze: number) => (grosze / 100).toString().replace('.', ',');
const fromZl = (text: string) => Math.round(parseFloat(text.replace(',', '.')) * 100);

export default function CoachScreen() {
  const c = useColors();
  useLang();
  const { profile } = useAuth();

  const [services, setServices] = useState<Service[]>([]);
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [attendees, setAttendees] = useState<Record<string, Attendee[]>>({});
  const [push, setPush] = useState<PushStatus | null>(null);

  // форма новой тренировки
  const [kind, setKind] = useState<Kind>('group');
  const [gymId, setGymId] = useState<string | null>(null);
  const [dayIndex, setDayIndex] = useState(1);
  const [time, setTime] = useState('18:00');
  const [duration, setDuration] = useState('90');
  const [capacity, setCapacity] = useState('6');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  // цены и правила отмены
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [fee, setFee] = useState('5');
  const [refundHours, setRefundHours] = useState('24');
  const [savingPrices, setSavingPrices] = useState(false);

  // новый зал
  const [gymName, setGymName] = useState('FitFabric Łódź ');
  const [gymAddress, setGymAddress] = useState('');

  const days = useMemo(
    () =>
      Array.from({ length: 21 }, (_, i) => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + i);
        return d;
      }),
    [],
  );

  const load = useCallback(async () => {
    const [{ data: sv }, { data: gy }, { data: sl }, { data: st }] = await Promise.all([
      supabase.from('services').select('id, kind, price_grosze, default_duration_min, default_capacity'),
      supabase.from('gyms').select('id, name, address, is_active').order('name'),
      supabase.rpc('get_upcoming_slots', { days_ahead: 60 }),
      supabase.from('app_settings').select('cancel_fee_grosze, refund_hours').single(),
    ]);
    const svList = (sv as Service[]) ?? [];
    setServices(svList);
    setPrices(Object.fromEntries(svList.map((s) => [s.kind, toZl(s.price_grosze)])));
    const gyList = (gy as Gym[]) ?? [];
    setGyms(gyList);
    setGymId((cur) => cur ?? gyList.find((g) => g.is_active)?.id ?? null);
    if (st) {
      setFee(toZl((st as AppSettings).cancel_fee_grosze));
      setRefundHours(String((st as AppSettings).refund_hours));
    }

    const list = (sl as Slot[]) ?? [];
    setSlots(list);
    const entries = await Promise.all(
      list.map(async (s) => {
        const { data } = await supabase.rpc('coach_slot_attendees', { p_slot_id: s.slot_id });
        return [s.slot_id, (data as Attendee[]) ?? []] as const;
      }),
    );
    setAttendees(Object.fromEntries(entries));
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (profile?.role !== 'coach') return;
      load();
      registerForPush(profile.id, false).then(setPush).catch(() => setPush('unsupported'));
    }, [load, profile]),
  );

  function chooseKind(k: Kind) {
    setKind(k);
    const s = services.find((x) => x.kind === k);
    if (s) {
      setDuration(String(s.default_duration_min));
      setCapacity(String(s.default_capacity));
    }
  }

  async function createSlot() {
    const service = services.find((s) => s.kind === kind);
    const startsAt = combineDayTime(days[dayIndex], time);
    if (!startsAt) return showAlert(t.error, errorText('invalid_time'));
    if (kind !== 'online' && !gymId) return showAlert(t.error, errorText('gym_required'));
    if (!service) return;

    setCreating(true);
    const { error } = await supabase.from('slots').insert({
      service_id: service.id,
      gym_id: kind === 'online' ? null : gymId,
      starts_at: startsAt.toISOString(),
      duration_min: Math.max(15, parseInt(duration, 10) || service.default_duration_min),
      capacity: kind === 'group' ? Math.max(1, parseInt(capacity, 10) || 1) : 1,
      description: description.trim() || null,
    });
    setCreating(false);
    if (error) return showAlert(t.error, errorText(error.message));
    setDescription('');
    showAlert(t.created, `${t.kinds[kind]}\n${formatDateTime(startsAt.toISOString())}`);
    await load();
  }

  async function cancelSlot(slot: Slot) {
    // Возвраты оплатившим делайте в Stripe Dashboard (Payments → Refund)
    const ok = await confirmDialog(t.cancelSlot, `${t.kinds[slot.kind]}\n${formatDateTime(slot.starts_at)}`, t.yes, t.no);
    if (!ok) return;
    await supabase.from('slots').update({ is_cancelled: true }).eq('id', slot.slot_id);
    await load();
  }

  async function savePrices() {
    setSavingPrices(true);
    for (const s of services) {
      const value = fromZl(prices[s.kind] ?? '');
      if (Number.isFinite(value) && value >= 200 && value !== s.price_grosze) {
        await supabase.from('services').update({ price_grosze: value }).eq('id', s.id);
      }
    }
    const feeValue = fromZl(fee);
    await supabase
      .from('app_settings')
      .update({
        cancel_fee_grosze: Number.isFinite(feeValue) ? Math.max(0, feeValue) : 0,
        refund_hours: Math.max(0, parseInt(refundHours, 10) || 0),
      })
      .eq('id', true);
    setSavingPrices(false);
    showAlert(t.saved);
    await load();
  }

  async function addGym() {
    if (!gymName.trim()) return;
    const { error } = await supabase.from('gyms').insert({ name: gymName.trim(), address: gymAddress.trim() || null });
    if (error) return showAlert(t.error, error.message);
    setGymName('FitFabric Łódź ');
    setGymAddress('');
    await load();
  }

  async function toggleGym(g: Gym) {
    await supabase.from('gyms').update({ is_active: !g.is_active }).eq('id', g.id);
    await load();
  }

  async function enablePush() {
    if (!profile) return;
    setPush(await registerForPush(profile.id, true));
  }

  if (profile?.role !== 'coach') return <Empty text="—" />;

  const activeGyms = gyms.filter((g) => g.is_active);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      {/* ---------- Новая тренировка ---------- */}
      <SectionTitle>{t.newSession}</SectionTitle>
      <Label text={t.type} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {KINDS.map((k) => (
          <Chip key={k} label={t.kinds[k]} active={kind === k} onPress={() => chooseKind(k)} />
        ))}
      </View>

      {kind !== 'online' && (
        <>
          <Label text={t.gym} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {activeGyms.map((g) => (
              <Chip key={g.id} label={g.name.replace(/^FitFabric\s*(Łódź\s*)?/i, '')} active={gymId === g.id} onPress={() => setGymId(g.id)} />
            ))}
          </View>
        </>
      )}

      <Label text={t.day} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {days.map((d, i) => (
          <Chip key={d.toISOString()} label={formatDayShort(d)} active={dayIndex === i} onPress={() => setDayIndex(i)} />
        ))}
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Field label={t.time} value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={t.durationMin} value={duration} onChangeText={setDuration} keyboardType="number-pad" />
        </View>
        {kind === 'group' && (
          <View style={{ width: 80 }}>
            <Field label={t.capacity} value={capacity} onChangeText={setCapacity} keyboardType="number-pad" />
          </View>
        )}
      </View>

      <Field
        label={t.description}
        value={description}
        onChangeText={setDescription}
        placeholder={t.descriptionPh}
        multiline
        style={{ minHeight: 80, textAlignVertical: 'top' }}
      />
      <Button title={t.create} onPress={createSlot} loading={creating} />

      {/* ---------- Ближайшие тренировки ---------- */}
      <SectionTitle>{t.upcomingSessions}</SectionTitle>
      {slots.length === 0 && <Empty text={t.noSlots} />}
      {slots.map((s) => (
        <Card key={s.slot_id}>
          <Text style={{ color: c.accent, fontWeight: '800' }}>{formatDateTime(s.starts_at)}</Text>
          <Text style={{ color: c.text, fontWeight: '700' }}>
            {t.kinds[s.kind]} · {s.booked}/{s.capacity}
          </Text>
          <Text style={{ color: c.muted }}>
            {s.duration_min} {t.minutes} · {s.gym_name ?? t.online}
          </Text>
          {s.description ? <Text style={{ color: c.text }}>{s.description}</Text> : null}
          <Text style={{ color: c.muted, marginTop: 4 }}>{t.attendees}:</Text>
          {(attendees[s.slot_id] ?? []).length === 0 ? (
            <Text style={{ color: c.muted }}>{t.nobodyYet}</Text>
          ) : (
            attendees[s.slot_id].map((a) => (
              <View key={a.booking_id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: c.text, flexShrink: 1 }}>
                  {a.full_name || '—'}
                  {a.phone ? ` · ${a.phone}` : ''}
                </Text>
                <Badge
                  text={t.status[a.status as keyof typeof t.status] ?? a.status}
                  tone={a.status === 'paid' ? 'success' : 'warning'}
                />
              </View>
            ))
          )}
          <View style={{ marginTop: 8 }}>
            <Button title={t.cancelSlot} variant="danger" onPress={() => cancelSlot(s)} />
          </View>
        </Card>
      ))}

      {/* ---------- Цены и отмена ---------- */}
      <SectionTitle>{t.prices}</SectionTitle>
      {KINDS.map((k) => (
        <Field
          key={k}
          label={`${t.kinds[k]} — ${t.priceZl}`}
          value={prices[k] ?? ''}
          onChangeText={(v) => setPrices((p) => ({ ...p, [k]: v }))}
          keyboardType="decimal-pad"
        />
      ))}
      <Text style={{ color: c.text, fontWeight: '700', marginTop: 4 }}>{t.cancellation}</Text>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Field label={t.cancelFeeZl} value={fee} onChangeText={setFee} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={t.refundHours} value={refundHours} onChangeText={setRefundHours} keyboardType="number-pad" />
        </View>
      </View>
      <Text style={{ color: c.muted, fontSize: 13 }}>
        {t.cancellationPolicy(parseInt(refundHours, 10) || 0, formatPrice(Math.max(0, fromZl(fee) || 0)))}
      </Text>
      <Button title={t.save} onPress={savePrices} loading={savingPrices} />

      {/* ---------- Залы ---------- */}
      <SectionTitle>{t.gyms}</SectionTitle>
      {gyms.map((g) => (
        <Card key={g.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: g.is_active ? c.text : c.muted, fontWeight: '700' }}>{g.name}</Text>
            {g.address ? <Text style={{ color: c.muted }}>{g.address}</Text> : null}
            {!g.is_active && <Text style={{ color: c.muted, fontSize: 12 }}>{t.hidden}</Text>}
          </View>
          <Chip label={g.is_active ? t.hide : t.show} active={false} onPress={() => toggleGym(g)} />
        </Card>
      ))}
      <Field label={t.gymName} value={gymName} onChangeText={setGymName} />
      <Field label={t.gymAddress} value={gymAddress} onChangeText={setGymAddress} placeholder="ul. …" />
      <Button title={t.addGym} variant="secondary" onPress={addGym} />

      {/* ---------- Уведомления ---------- */}
      <SectionTitle>{t.notifications}</SectionTitle>
      <Text style={{ color: c.text }}>
        {push === 'enabled' ? t.pushEnabled : push === 'denied' ? t.pushDenied : t.pushUnsupported}
      </Text>
      {push === 'denied' && <Button title={t.enablePush} variant="secondary" onPress={enablePush} />}
      <Text style={{ color: c.muted, fontSize: 13, marginBottom: 24 }}>{t.emailNote}</Text>
    </ScrollView>
  );
}

function Label({ text }: { text: string }) {
  const c = useColors();
  return <Text style={{ color: c.muted, fontSize: 13 }}>{text}</Text>;
}
