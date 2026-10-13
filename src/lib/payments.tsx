// Веб-версия оплаты. Stripe React Native работает только на телефоне,
// поэтому в браузере доступна лишь демо-оплата. На телефоне — payments.native.tsx.
import { ReactNode } from 'react';
import { demoPay, PayerDetails, PaymentInit, PaymentResult } from './paymentsShared';
import { DEMO } from './supabase';

export type { PayerDetails, PaymentInit, PaymentResult } from './paymentsShared';

export function PaymentProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function usePayment() {
  return async (init: PaymentInit, _details: PayerDetails): Promise<PaymentResult> => {
    if (DEMO) return demoPay(init);
    return { status: 'failed', message: 'Payments work in the mobile app (iOS/Android).' };
  };
}
