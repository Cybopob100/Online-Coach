// Уведомления тренеру о новой оплаченной записи:
//  - письмо через Resend (бесплатно до 3000 писем в месяц; без своего домена
//    Resend отправляет только на email владельца аккаунта — это и есть тренер);
//  - push на телефон через Expo Push Service (бесплатно).
import { adminClient } from "./clients.ts";

const KIND_RU: Record<string, string> = {
  online: "Онлайн-тренировка по тяжёлой атлетике",
  gym: "Тяжёлая атлетика в зале (индивидуально)",
  group: "Групповая тренировка по тяжёлой атлетике",
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", {
    timeZone: "Europe/Warsaw",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function notifyCoachAboutBooking(bookingId: string) {
  const { data: b, error } = await adminClient
    .from("bookings")
    .select(
      "id, slot_id, amount_grosze, user_id, profiles(full_name, phone), slots(starts_at, duration_min, capacity, gyms(name, address), services(kind))",
    )
    .eq("id", bookingId)
    .single();
  if (error || !b) {
    console.error("notify: booking not found", error);
    return;
  }

  // deno-lint-ignore no-explicit-any
  const slot = b.slots as any;
  // deno-lint-ignore no-explicit-any
  const client = b.profiles as any;
  const { data: authUser } = await adminClient.auth.admin.getUserById(b.user_id);

  const what = KIND_RU[slot.services.kind] ?? slot.services.kind;
  const when = fmt(slot.starts_at);
  const where = slot.gyms ? `${slot.gyms.name}, ${slot.gyms.address ?? ""}` : "Онлайн";
  const who = client?.full_name || authUser?.user?.email || "Клиент";
  const price = (b.amount_grosze / 100).toFixed(2).replace(".", ",") + " zł";

  const { count } = await adminClient
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("slot_id", b.slot_id)
    .eq("status", "paid");

  await Promise.allSettled([
    sendEmail({
      subject: `Новая запись: ${who} — ${when}`,
      html: `
        <h2 style="margin:0 0 12px">Новая запись на тренировку</h2>
        <p><b>${escapeHtml(what)}</b><br>${escapeHtml(when)} · ${slot.duration_min} мин<br>${escapeHtml(where)}</p>
        <p>Клиент: <b>${escapeHtml(who)}</b><br>
           Телефон: ${escapeHtml(client?.phone || "—")}<br>
           Email: ${escapeHtml(authUser?.user?.email || "—")}</p>
        <p>Оплачено: <b>${price}</b><br>Записано на эту тренировку: ${count ?? "?"} из ${slot.capacity}</p>`,
    }),
    sendPushToCoaches(`Новая запись: ${who}`, `${what} · ${when}`, { bookingId }),
  ]);
}

async function sendEmail({ subject, html }: { subject: string; html: string }) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const to = Deno.env.get("COACH_EMAIL");
  if (!apiKey || !to) return; // письма не настроены — молча пропускаем

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("EMAIL_FROM") ?? "Online Coach <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) console.error("Resend error", res.status, await res.text());
}

async function sendPushToCoaches(title: string, body: string, data: Record<string, unknown>) {
  const { data: coaches } = await adminClient
    .from("profiles")
    .select("push_token")
    .eq("role", "coach")
    .not("push_token", "is", null);
  const tokens = (coaches ?? []).map((c) => c.push_token as string);
  if (tokens.length === 0) return;

  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(tokens.map((to) => ({ to, title, body, data, sound: "default", channelId: "bookings" }))),
  });
  if (!res.ok) console.error("Expo push error", res.status, await res.text());
}
