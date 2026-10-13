// Веб-версия оплаты. Stripe React Native работает только на телефоне,
// поэтому в браузере доступна лишь демо-оплата. На телефоне — payments.native.tsx.
import { ReactNode } from 'react';
import { confirmDialog } from './alert';
import { t } from './i18n';
import { demoPay, PayerDetails, PaymentInit, PaymentResult } from './paymentsShared';
import { DEMO } from './supabase';

export type { PayerDetails, PaymentInit, PaymentResult } from './paymentsShared';

export function PaymentProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function usePayment() {
  return async (init: PaymentInit, _details: PayerDetails): Promise<PaymentResult> => {
    if (DEMO) return demoPay(init, (text) => confirmDialog(text, '', t.pay, t.no));
    return { status: 'failed', message: 'Оплата работает в мобильном приложении (iOS/Android).' };
  };
}
