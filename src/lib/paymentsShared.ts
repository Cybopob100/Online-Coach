// Общие типы и демо-оплата для payments.tsx (веб) и payments.native.tsx (телефон).
import { demoMarkPaid } from './demo';

export type PaymentInit = {
  bookingId: string;
  paymentIntent: string;
  ephemeralKey: string;
  customer: string;
  amount?: number;
};
export type PayerDetails = { email?: string; name?: string };
export type PaymentResult = { status: 'paid' } | { status: 'cancelled' } | { status: 'failed'; message: string };

/** Демо-режим: клиент уже подтвердил оплату на экране тренировки — сразу отмечаем запись оплаченной. */
export async function demoPay(init: PaymentInit): Promise<PaymentResult> {
  demoMarkPaid(init.bookingId);
  return { status: 'paid' };
}
