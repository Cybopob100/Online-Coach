import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { showAlert } from '../../lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Chip, Field } from '../../components/ui';
import { LANGS, t } from '../../lib/i18n';
import { useLang } from '../../lib/language';
import { DEMO, supabase } from '../../lib/supabase';
import { useColors } from '../../lib/theme';

export default function LoginScreen() {
  const c = useColors();
  const { lang, setLang } = useLang();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState(DEMO ? 'demo@coach.pl' : '');
  const [password, setPassword] = useState(DEMO ? 'demo123' : '');
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

    if (error) return showAlert(t.error, error.message);
    // Если в Supabase включено подтверждение email — сессии ещё нет
    if (mode === 'signUp' && !data.session) {
      showAlert(t.appName, t.checkEmail);
      setMode('signIn');
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {LANGS.map((l) => (
              <Chip key={l.code} label={l.name} active={lang === l.code} onPress={() => setLang(l.code)} />
            ))}
          </View>
          <View style={{ marginBottom: 16 }}>
            <Text style={{ color: c.accent, fontSize: 14, fontWeight: '800', letterSpacing: 2 }}>COACH</Text>
            <Text style={{ color: c.text, fontSize: 30, fontWeight: '800' }}>{t.appName}</Text>
            {DEMO && (
              <Text style={{ color: c.muted, marginTop: 8 }}>{t.demoHint}</Text>
            )}
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
