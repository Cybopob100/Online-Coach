import { PaymentSheetError, StripeProvider, useStripe } from '@stripe/stripe-react-native';
import * as Linking from 'expo-linking';
import { ReactNode } from 'react';
import { t } from './i18n';
import { demoPay, PayerDetails, PaymentInit, PaymentResult } from './paymentsShared';
import { DEMO } from './supabase';

export type { PayerDetails, PaymentInit, PaymentResult } from './paymentsShared';

const STRIPE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

export function PaymentProvider({ children }: { children: ReactNode }) {
  return (
    <StripeProvider
      publishableKey={STRIPE_KEY}
      urlScheme="coachbooking" // для возврата из BLIK / Przelewy24
      merchantIdentifier="merchant.com.example.coachbooking" // Apple Pay
    >
      <>{children}</>
    </StripeProvider>
  );
}

export function usePayment() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  return async (init: PaymentInit, details: PayerDetails): Promise<PaymentResult> => {
    if (DEMO) return demoPay(init);

    // Готовим платёжную форму Stripe (карта, BLIK, Przelewy24, Apple/Google Pay)
    const { error: initError } = await initPaymentSheet({
      merchantDisplayName: t.appName,
      customerId: init.customer,
      customerEphemeralKeySecret: init.ephemeralKey,
      paymentIntentClientSecret: init.paymentIntent,
      allowsDelayedPaymentMethods: false,
      returnURL: Linking.createURL('stripe-redirect'),
      defaultBillingDetails: details,
      applePay: { merchantCountryCode: 'PL' },
      googlePay: { merchantCountryCode: 'PL', currencyCode: 'PLN', testEnv: __DEV__ },
    });
    if (initError) return { status: 'failed', message: initError.message };

    const { error } = await presentPaymentSheet();
    if (!error) return { status: 'paid' };
    if (error.code === PaymentSheetError.Canceled) return { status: 'cancelled' };
    return { status: 'failed', message: error.message };
  };
}
