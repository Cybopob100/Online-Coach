// Главный экран клиента: выбор одного из трёх видов тренировок.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { KindArt } from '../../components/KindArt';
import { formatPrice } from '../../lib/format';
import { t } from '../../lib/i18n';
import { useLang } from '../../lib/language';
import { Kind, Service, Slot, supabase } from '../../lib/supabase';
import { useColors } from '../../lib/theme';

const KINDS: Kind[] = ['gym', 'group', 'online'];

export default function TrainingsScreen() {
  const c = useColors();
  useLang();
  const [prices, setPrices] = useState<Partial<Record<Kind, number>>>({});
  const [open, setOpen] = useState<Partial<Record<Kind, number>>>({});

  const load = useCallback(async () => {
    const [{ data: sv }, { data: sl }] = await Promise.all([
      supabase.from('services').select('kind, price_grosze').eq('is_active', true),
      supabase.rpc('get_upcoming_slots', { days_ahead: 30 }),
    ]);
    setPrices(Object.fromEntries(((sv as Service[]) ?? []).map((s) => [s.kind, s.price_grosze])));
    const counts: Partial<Record<Kind, number>> = {};
    for (const s of (sl as Slot[]) ?? []) {
      if (s.booked < s.capacity) counts[s.kind] = (counts[s.kind] ?? 0) + 1;
    }
    setOpen(counts);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Text style={{ color: c.text, fontSize: 24, fontWeight: '800', marginBottom: 2 }}>{t.chooseTraining}</Text>
      {KINDS.filter((k) => prices[k] !== undefined).map((kind) => (
        <Pressable
          key={kind}
          onPress={() => router.push(`/kind/${kind}`)}
          accessibilityRole="button"
          accessibilityLabel={t.kinds[kind]}
        >
          {({ pressed }) => (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                backgroundColor: c.card,
                borderColor: c.border,
                borderWidth: 1,
                borderRadius: 18,
                padding: 14,
                opacity: pressed ? 0.85 : 1,
              }}
            >
              <View style={{ backgroundColor: c.accentSoft, borderRadius: 14, padding: 4 }}>
                <KindArt kind={kind} size={84} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: c.text, fontSize: 17, fontWeight: '800' }}>{t.kinds[kind]}</Text>
                <Text style={{ color: c.muted, fontSize: 14 }}>{t.kindDesc[kind]}</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, gap: 8 }}>
                  <Text style={{ color: c.accent, fontWeight: '800', fontSize: 16 }}>
                    {formatPrice(prices[kind] ?? 0)}
                  </Text>
                  <Text style={{ color: c.muted, fontSize: 13, flexShrink: 1, textAlign: 'right' }}>
                    {t.nextSessions(open[kind] ?? 0)}
                  </Text>
                </View>
              </View>
            </View>
          )}
        </Pressable>
      ))}
    </ScrollView>
  );
}
