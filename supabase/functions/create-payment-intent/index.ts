// Бронирует место в слоте и создаёт PaymentIntent для Stripe PaymentSheet.
import { adminClient, corsHeaders, getOrCreateCustomer, json, stripe, userClient } from "../_shared/clients.ts";

const KNOWN_ERRORS = ["slot_not_found", "slot_in_past", "slot_full", "already_booked", "not_authenticated"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = userClient(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "not_authenticated" }, 401);

    const { slot_id } = await req.json();
    if (!slot_id) return json({ error: "slot_id_required" }, 400);

    // 1. Бронируем место (атомарно, с проверкой вместимости)
    const { data: booking, error: bookErr } = await supabase.rpc("book_slot", { p_slot_id: slot_id });
    if (bookErr) {
      const code = KNOWN_ERRORS.find((e) => bookErr.message.includes(e));
      return json({ error: code ?? "booking_failed" }, code ? 409 : 500);
    }

    // 2. Stripe customer + ephemeral key (чтобы PaymentSheet помнил карты)
    const customerId = await getOrCreateCustomer(user.id, user.email);
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: "2025-02-24.acacia" },
    );

    // 3. PaymentIntent: переиспользуем, если клиент повторяет оплату той же записи
    let paymentIntent;
    if (booking.stripe_payment_intent_id) {
      paymentIntent = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
    }
    if (!paymentIntent || paymentIntent.status === "canceled") {
      paymentIntent = await stripe.paymentIntents.create(
        {
          amount: booking.amount_grosze,
          currency: "pln",
          customer: customerId,
          // Методы (карта, BLIK, Przelewy24, Apple/Google Pay) включаются в Stripe Dashboard
          automatic_payment_methods: { enabled: true },
          metadata: { booking_id: booking.id, slot_id, user_id: user.id },
          description: `Booking ${booking.id}`,
        },
        { idempotencyKey: `booking-${booking.id}` },
      );
      await adminClient
        .from("bookings")
        .update({ stripe_payment_intent_id: paymentIntent.id })
        .eq("id", booking.id);
    }

    return json({
      bookingId: booking.id,
      paymentIntent: paymentIntent.client_secret,
      ephemeralKey: ephemeralKey.secret,
      customer: customerId,
    });
  } catch (e) {
    console.error(e);
    return json({ error: "server_error" }, 500);
  }
});
