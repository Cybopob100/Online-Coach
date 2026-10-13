import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { createDemoClient } from './demo';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** Нет ключей в .env → демо-режим с тестовыми данными в памяти. */
export const DEMO = !url || !anonKey;

export const supabase: SupabaseClient = DEMO
  ? (createDemoClient() as unknown as SupabaseClient)
  : createClient(url!, anonKey!, {
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

export type Kind = 'online' | 'gym' | 'group';

export type Slot = {
  slot_id: string;
  starts_at: string;
  duration_min: number;
  capacity: number;
  booked: number;
  description: string | null;
  kind: Kind;
  price_grosze: number;
  gym_id: string | null;
  gym_name: string | null;
  gym_address: string | null;
  my_booking_status: 'pending_payment' | 'paid' | null;
};

export type BookingStatus = 'pending_payment' | 'paid' | 'cancelled' | 'refunded';

export type Booking = {
  id: string;
  status: BookingStatus;
  amount_grosze: number;
  refunded_grosze: number | null;
  created_at: string;
  slots: {
    id: string;
    starts_at: string;
    duration_min: number;
    gyms: { name: string } | null;
    services: { kind: Kind };
  };
};

export type Gym = { id: string; name: string; address: string | null; is_active: boolean };

export type Service = {
  id: string;
  kind: Kind;
  price_grosze: number;
  default_duration_min: number;
  default_capacity: number;
};

export type AppSettings = { cancel_fee_grosze: number; refund_hours: number };

export type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: 'client' | 'coach';
};
