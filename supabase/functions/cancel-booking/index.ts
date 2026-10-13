// Отмена записи клиентом.
// Неоплаченная — отменяется сразу. Оплаченная — возврат денег, если до тренировки больше REFUND_HOURS.
import { adminClient, corsHeaders, json, stripe, userClient } from "../_shared/clients.ts";

const REFUND_HOURS = Number(Deno.env.get("REFUND_HOURS") ?? 24);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { data: { user } } = await userClient(req).auth.getUser();
    if (!user) return json({ error: "not_authenticated" }, 401);

    const { booking_id } = await req.json();
    const { data: booking } = await adminClient
      .from("bookings")
      .select("id, user_id, status, stripe_payment_intent_id, slots(starts_at)")
      .eq("id", booking_id)
      .single();

    if (!booking || booking.user_id !== user.id) return json({ error: "not_found" }, 404);

    const now = new Date().toISOString();

    if (booking.status === "pending_payment") {
      if (booking.stripe_payment_intent_id) {
        await stripe.paymentIntents.cancel(booking.stripe_payment_intent_id).catch(() => {});
      }
      await adminClient.from("bookings").update({ status: "cancelled", cancelled_at: now }).eq("id", booking.id);
      return json({ status: "cancelled" });
    }

    if (booking.status === "paid") {
      // deno-lint-ignore no-explicit-any
      const startsAt = new Date((booking.slots as any).starts_at).getTime();
      const hoursLeft = (startsAt - Date.now()) / 36e5;
      if (hoursLeft < REFUND_HOURS) {
        return json({ error: "too_late_to_cancel", refund_hours: REFUND_HOURS }, 409);
      }
      await stripe.refunds.create(
        { payment_intent: booking.stripe_payment_intent_id! },
        { idempotencyKey: `refund-${booking.id}` },
      );
      await adminClient.from("bookings").update({ status: "refunded", cancelled_at: now }).eq("id", booking.id);
      return json({ status: "refunded" });
    }

    return json({ error: "not_cancellable" }, 409);
  } catch (e) {
    console.error(e);
    return json({ error: "server_error" }, 500);
  }
});
