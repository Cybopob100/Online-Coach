// Экран тренера: добавить тренировку в расписание и посмотреть, кто записался.
// Виден только пользователям с role = 'coach' в таблице profiles.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Badge, Button, Card, Empty, Field } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { formatDateTime, formatPrice, parseLocalDateTime } from '../../lib/format';
import { errorText, t } from '../../lib/i18n';
import { Slot, supabase } from '../../lib/supabase';
import { useColors } from '../../lib/theme';

type Service = { id: string; title: string; price_grosze: number };
type Attendee = { booking_id: string; full_name: string | null; phone: string | null; status: string };

export default function CoachScreen() {
  const c = useColors();
  const { profile } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [attendees, setAttendees] = useState<Record<string, Attendee[]>>({});

  const [serviceId, setServiceId] = useState<string | null>(null);
  const [when, setWhen] = useState('');
  const [capacity, setCapacity] = useState('1');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [{ data: sv }, { data: sl }] = await Promise.all([
      supabase.from('services').select('id, title, price_grosze').eq('is_active', true).order('title'),
      supabase.rpc('get_upcoming_slots', { days_ahead: 60 }),
    ]);
    setServices((sv as Service[]) ?? []);
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
      if (profile?.role === 'coach') load();
    }, [load, profile]),
  );

  async function createSlot() {
    const date = parseLocalDateTime(when);
    if (!date) return Alert.alert(t.error, errorText('invalid_date'));
    if (!serviceId) return;
    setSaving(true);
    const { error } = await supabase.from('slots').insert({
      service_id: serviceId,
      starts_at: date.toISOString(),
      capacity: Math.max(1, parseInt(capacity, 10) || 1),
      location: location.trim() || null,
    });
    setSaving(false);
    if (error) return Alert.alert(t.error, error.message);
    setWhen('');
    await load();
  }

  function cancelSlot(slot: Slot) {
    // Возвраты оплатившим делайте в Stripe Dashboard (Payments → Refund)
    Alert.alert(t.cancelSlot, formatDateTime(slot.starts_at), [
      { text: t.no, style: 'cancel' },
      {
        text: t.yes,
        style: 'destructive',
        onPress: async () => {
          await supabase.from('slots').update({ is_cancelled: true }).eq('id', slot.slot_id);
          await load();
        },
      },
    ]);
  }

  if (profile?.role !== 'coach') return <Empty text="—" />;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Text style={{ color: c.text, fontSize: 20, fontWeight: '800' }}>{t.addSlot}</Text>

      <Text style={{ color: c.muted, fontSize: 13 }}>{t.service}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {services.map((s) => {
          const active = s.id === serviceId;
          return (
            <Pressable
              key={s.id}
              onPress={() => setServiceId(s.id)}
              style={{
                borderWidth: 1.5,
                borderColor: active ? c.accent : c.border,
                backgroundColor: active ? c.accent : c.card,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={{ color: active ? c.accentText : c.text, fontWeight: '600' }}>
                {s.title} · {formatPrice(s.price_grosze)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Field label={t.dateTime} value={when} onChangeText={setWhen} placeholder="2026-10-20 18:00" />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ width: 90 }}>
          <Field label={t.capacity} value={capacity} onChangeText={setCapacity} keyboardType="number-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={t.location} value={location} onChangeText={setLocation} />
        </View>
      </View>
      <Button title={t.create} onPress={createSlot} loading={saving} disabled={!serviceId || !when} />

      <Text style={{ color: c.text, fontSize: 20, fontWeight: '800', marginTop: 16 }}>{t.tabSchedule}</Text>
      {slots.length === 0 && <Empty text={t.noSlots} />}
      {slots.map((s) => (
        <Card key={s.slot_id}>
          <Text style={{ color: c.accent, fontWeight: '800', textTransform: 'capitalize' }}>
            {formatDateTime(s.starts_at)}
          </Text>
          <Text style={{ color: c.text, fontWeight: '700' }}>
            {s.title} · {s.booked}/{s.capacity}
          </Text>
          <Text style={{ color: c.muted, marginTop: 4 }}>{t.attendees}:</Text>
          {(attendees[s.slot_id] ?? []).length === 0 ? (
            <Text style={{ color: c.muted }}>{t.nobodyYet}</Text>
          ) : (
            attendees[s.slot_id].map((a) => (
              <View key={a.booking_id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: c.text }}>
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
    </ScrollView>
  );
}
