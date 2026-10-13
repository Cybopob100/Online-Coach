import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Field } from '../../components/ui';
import { t } from '../../lib/i18n';
import { supabase } from '../../lib/supabase';
import { useColors } from '../../lib/theme';

export default function LoginScreen() {
  const c = useColors();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    const creds = { email: email.trim(), password };
    const { data, error } =
      mode === 'signIn'
        ? await supabase.auth.signInWithPassword(creds)
        : await supabase.auth.signUp({ ...creds, options: { data: { full_name: fullName.trim() } } });
    setLoading(false);

    if (error) return Alert.alert(t.error, error.message);
    // Если в Supabase включено подтверждение email — сессии ещё нет
    if (mode === 'signUp' && !data.session) {
      Alert.alert(t.appName, t.checkEmail);
      setMode('signIn');
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
          <View style={{ marginBottom: 16 }}>
            <Text style={{ color: c.accent, fontSize: 14, fontWeight: '800', letterSpacing: 2 }}>COACH</Text>
            <Text style={{ color: c.text, fontSize: 30, fontWeight: '800' }}>{t.appName}</Text>
          </View>

          {mode === 'signUp' && (
            <Field label={t.fullName} value={fullName} onChangeText={setFullName} autoComplete="name" />
          )}
          <Field
            label={t.email}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <Field
            label={t.password}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
          />

          <Button
            title={mode === 'signIn' ? t.signIn : t.signUp}
            onPress={submit}
            loading={loading}
            disabled={!email || password.length < 6}
          />

          <Pressable onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')} style={{ padding: 8 }}>
            <Text style={{ color: c.muted, textAlign: 'center' }}>
              {mode === 'signIn' ? t.noAccount : t.haveAccount}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
