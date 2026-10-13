import { StripeProvider } from '@stripe/stripe-react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider, useAuth } from '../lib/auth';
import { useColors } from '../lib/theme';

const STRIPE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

function RootNavigator() {
  const { session, loading } = useAuth();
  const c = useColors();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.text,
        contentStyle: { backgroundColor: c.bg },
        headerShadowVisible: false,
      }}
    >
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="slot/[id]" options={{ title: '' }} />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <StripeProvider
      publishableKey={STRIPE_KEY}
      urlScheme="coachbooking" // для возврата из BLIK / Przelewy24
      merchantIdentifier="merchant.com.example.coachbooking" // Apple Pay
    >
      <AuthProvider>
        <StatusBar style="auto" />
        <RootNavigator />
      </AuthProvider>
    </StripeProvider>
  );
}
