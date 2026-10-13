// Отмена записи клиентом.
// Неоплаченная — отменяется сразу, без комиссии.
// Оплаченная — возврат (цена минус комиссия), если до тренировки не меньше refund_hours.
// Комиссия и срок задаются тренером в настройках приложения (таблица app_settings).
import { adminClient, corsHeaders, json, stripe, userClient } from "../_shared/clients.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { data: { user } } = await userClient(req).auth.getUser();
    if (!user) return json({ error: "not_authenticated" }, 401);

    const { booking_id } = await req.json();
    const { data: booking } = await adminClient
      .from("bookings")
      .select("id, user_id, status, amount_grosze, stripe_payment_intent_id, slots(starts_at)")
      .eq("id", booking_id)
      .single();

    if (!booking || booking.user_id !== user.id) return json({ error: "not_found" }, 404);

    const now = new Date().toISOString();

    if (booking.status === "pending_payment") {
      if (booking.stripe_payment_intent_id) {
        await stripe.paymentIntents.cancel(booking.stripe_payment_intent_id).catch(() => {});
      }
      await adminClient.from("bookings").update({ status: "cancelled", cancelled_at: now }).eq("id", booking.id);
      return json({ status: "cancelled", refunded_grosze: 0, fee_grosze: 0 });
    }

    if (booking.status === "paid") {
      const { data: settings } = await adminClient
        .from("app_settings")
        .select("cancel_fee_grosze, refund_hours")
        .single();
      const fee = settings?.cancel_fee_grosze ?? 0;
      const refundHours = settings?.refund_hours ?? 24;

      // deno-lint-ignore no-explicit-any
      const startsAt = new Date((booking.slots as any).starts_at).getTime();
      if ((startsAt - Date.now()) / 36e5 < refundHours) {
        return json({ error: "too_late_to_cancel", refund_hours: refundHours }, 409);
      }

      const refund = Math.max(0, booking.amount_grosze - fee);
      if (refund > 0) {
        await stripe.refunds.create(
          { payment_intent: booking.stripe_payment_intent_id!, amount: refund },
          { idempotencyKey: `refund-${booking.id}` },
        );
      }
      await adminClient
        .from("bookings")
        .update({ status: "refunded", refunded_grosze: refund, cancelled_at: now })
        .eq("id", booking.id);
      return json({ status: "refunded", refunded_grosze: refund, fee_grosze: booking.amount_grosze - refund });
    }

    return json({ error: "not_cancellable" }, 409);
  } catch (e) {
    console.error(e);
    return json({ error: "server_error" }, 500);
  }
});
