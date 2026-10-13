import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppSettings, supabase } from './supabase';

const DEFAULTS: AppSettings = { cancel_fee_grosze: 500, refund_hours: 24 };

/** Правила отмены (комиссия, срок) из настроек тренера. Обновляются при каждом открытии экрана. */
export function useAppSettings(): AppSettings {
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS);
  useFocusEffect(
    useCallback(() => {
      supabase
        .from('app_settings')
        .select('cancel_fee_grosze, refund_hours')
        .single()
        .then(({ data }) => data && setSettings(data as AppSettings));
    }, []),
  );
  return settings;
}

/** Сколько вернётся клиенту при отмене оплаченной записи. */
export const refundFor = (amount: number, s: AppSettings) => Math.max(0, amount - s.cancel_fee_grosze);
/** Фактическая комиссия (не больше цены). */
export const feeFor = (amount: number, s: AppSettings) => Math.min(amount, s.cancel_fee_grosze);
