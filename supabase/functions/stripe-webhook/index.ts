// Принимает события Stripe и обновляет статус записи.
// Деплоить с --no-verify-jwt: Stripe не присылает токен Supabase, подпись проверяем сами.
import Stripe from "npm:stripe@17.7.0";
import { adminClient, stripe } from "../_shared/clients.ts";
import { notifyCoachAboutBooking } from "../_shared/notify.ts";

const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  const signature = req.headers.get("Stripe-Signature");
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature!,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!,
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    console.error("Bad signature", err);
    return new Response("Bad signature", { status: 400 });
  }

  const pi = event.data.object as Stripe.PaymentIntent;
  const bookingId = pi.metadata?.booking_id;
  if (!bookingId) return new Response("ignored", { status: 200 });

  switch (event.type) {
    case "payment_intent.succeeded": {
      const { data: updated } = await adminClient
        .from("bookings")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", bookingId)
        .in("status", ["pending_payment", "cancelled"]) // оплата могла прийти после истечения 15 мин
        .select("id");
      // Уведомляем только при первом переходе в «оплачено» (Stripe может прислать событие повторно)
      if (updated && updated.length > 0) {
        try {
          await notifyCoachAboutBooking(bookingId);
        } catch (e) {
          console.error("notify failed", e); // уведомление не должно ломать оплату
        }
      }
      break;
    }
    case "payment_intent.canceled":
      await adminClient
        .from("bookings")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", bookingId)
        .eq("status", "pending_payment");
      break;
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
