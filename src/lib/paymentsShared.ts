// Общие типы и демо-оплата для payments.tsx (веб) и payments.native.tsx (телефон).
import { demoMarkPaid } from './demo';
import { formatPrice } from './format';

export type PaymentInit = {
  bookingId: string;
  paymentIntent: string;
  ephemeralKey: string;
  customer: string;
  amount?: number;
};
export type PayerDetails = { email?: string; name?: string };
export type PaymentResult = { status: 'paid' } | { status: 'cancelled' } | { status: 'failed'; message: string };

/** Имитация Stripe PaymentSheet в демо-режиме: подтверждение → запись оплачена. */
export async function demoPay(init: PaymentInit, confirm: (text: string) => Promise<boolean>): Promise<PaymentResult> {
  const ok = await confirm(`DEMO · Stripe\n\n${formatPrice(init.amount ?? 0)}\nVisa •••• 4242`);
  if (!ok) return { status: 'cancelled' };
  demoMarkPaid(init.bookingId);
  return { status: 'paid' };
}
