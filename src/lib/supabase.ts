import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Заполните EXPO_PUBLIC_SUPABASE_URL и EXPO_PUBLIC_SUPABASE_ANON_KEY в файле .env');
}

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Обновлять токен только когда приложение на экране
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Вызов edge-функции; бросает Error с кодом ошибки сервера (например, slot_full). */
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let code = 'server_error';
    try {
      const ctx = (error as { context?: Response }).context;
      const payload = ctx ? await ctx.json() : null;
      if (payload?.error) code = payload.error;
    } catch {
      // тело ответа не JSON — оставляем общий код
    }
    throw new Error(code);
  }
  return data as T;
}

export type Slot = {
  slot_id: string;
  starts_at: string;
  location: string | null;
  capacity: number;
  booked: number;
  service_id: string;
  title: string;
  description: string | null;
  duration_min: number;
  price_grosze: number;
  my_booking_status: 'pending_payment' | 'paid' | null;
};

export type BookingStatus = 'pending_payment' | 'paid' | 'cancelled' | 'refunded';

export type Booking = {
  id: string;
  status: BookingStatus;
  amount_grosze: number;
  created_at: string;
  slots: {
    id: string;
    starts_at: string;
    location: string | null;
    services: { title: string; duration_min: number };
  };
};

export type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: 'client' | 'coach';
};
