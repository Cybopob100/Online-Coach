import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text } from 'react-native';
import { Button, Field } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { t } from '../../lib/i18n';
import { supabase } from '../../lib/supabase';
import { useColors } from '../../lib/theme';

export default function ProfileScreen() {
  const c = useColors();
  const { session, profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFullName(profile?.full_name ?? '');
    setPhone(profile?.phone ?? '');
  }, [profile]);

  async function save() {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim(), phone: phone.trim() })
      .eq('id', profile.id);
    setSaving(false);
    if (error) return Alert.alert(t.error, error.message);
    await refreshProfile();
    Alert.alert(t.saved);
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Text style={{ color: c.muted }}>{session?.user.email}</Text>
      <Field label={t.fullName} value={fullName} onChangeText={setFullName} autoComplete="name" />
      <Field label={t.phone} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />
      <Button title={t.save} onPress={save} loading={saving} />
      <Button title={t.signOut} variant="secondary" onPress={() => supabase.auth.signOut()} />
    </ScrollView>
  );
}
