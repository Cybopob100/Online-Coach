// Демо-режим: включается, когда в .env нет ключей Supabase.
// Подменяет Supabase-клиент данными в памяти, чтобы приложение можно было
// посмотреть без бэкенда. Логика повторяет SQL из supabase/migrations. Данные
// сбрасываются при перезагрузке.

type Row = Record<string, any>;

const DEMO_USER = '00000000-0000-0000-0000-000000000001';
const HOLD_MS = 15 * 60 * 1000;

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function at(daysFromToday: number, hour: number, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

// ---------- начальные данные ----------
const services: Row[] = [
  { id: 'svc-online', kind: 'online', price_grosze: 10000, default_duration_min: 60, default_capacity: 1, is_active: true },
  { id: 'svc-gym', kind: 'gym', price_grosze: 15000, default_duration_min: 60, default_capacity: 1, is_active: true },
  { id: 'svc-group', kind: 'group', price_grosze: 8000, default_duration_min: 90, default_capacity: 6, is_active: true },
];

const gyms: Row[] = [
  { id: 'gym-suk', name: 'FitFabric Łódź Sukcesja', address: 'al. Politechniki 1', is_active: true },
  { id: 'gym-teo', name: 'FitFabric Łódź Teofilów', address: 'ul. Aleksandrowska 38', is_active: true },
  { id: 'gym-rew', name: 'FitFabric Łódź Rewolucji', address: 'ul. Rewolucji 1905 r. 44', is_active: true },
  { id: 'gym-wid', name: 'FitFabric Łódź Widzewska Manufaktura', address: 'al. Piłsudskiego 135', is_active: true },
];

const settings: Row = { id: true, cancel_fee_grosze: 500, refund_hours: 24 };

const slots: Row[] = [];
// [день, час, минута, вид, зал, длительность, мест, описание]
const plan: [number, number, number, string, string | null, number, number, string | null][] = [
  [1, 7, 30, 'gym', 'gym-suk', 60, 1, 'Рывок: техника, подрывы с виса'],
  [1, 18, 0, 'group', 'gym-suk', 90, 6, 'Толчок: подсед и посыл. Разминка с грифом, затем работа по технике'],
  [1, 20, 30, 'online', null, 60, 1, 'Разбор видео ваших подходов + план на неделю'],
  [2, 8, 0, 'gym', 'gym-teo', 60, 1, null],
  [2, 19, 0, 'group', 'gym-rew', 90, 6, 'Рывок в сед, приседания со штангой на груди, ОФП'],
  [3, 18, 0, 'gym', 'gym-suk', 60, 1, 'Толчок от груди, жимовые швунги'],
  [4, 10, 0, 'group', 'gym-wid', 90, 6, 'Субботняя группа: классический рывок и толчок, лёгкий максимум'],
  [4, 12, 0, 'online', null, 45, 1, null],
  [6, 18, 0, 'gym', 'gym-rew', 60, 1, 'Тяги и приседания, работа на силу'],
  [8, 19, 0, 'group', 'gym-suk', 90, 6, 'Техника рывка для начинающих'],
];
for (const [d, h, m, kind, gym, dur, cap, desc] of plan) {
  slots.push({
    id: `slot-${d}-${h}${m}`,
    service_id: `svc-${kind}`,
    gym_id: gym,
    starts_at: at(d, h, m),
    duration_min: dur,
    capacity: cap,
    description: desc,
    is_cancelled: false,
  });
}
slots.push({
  id: 'slot-past', service_id: 'svc-gym', gym_id: 'gym-suk', starts_at: at(-3, 18), duration_min: 60,
  capacity: 1, description: null, is_cancelled: false,
});

const profiles: Row[] = [
  // В демо вы — тренер, чтобы была видна и вкладка «Настройки»
  { id: DEMO_USER, full_name: 'Demo', phone: '+48 500 000 000', role: 'coach' },
  { id: 'u-anna', full_name: 'Anna Kowalska', phone: '+48 501 111 222', role: 'client' },
  { id: 'u-piotr', full_name: 'Piotr Nowak', phone: '+48 502 333 444', role: 'client' },
  { id: 'u-marta', full_name: 'Marta Wiśniewska', phone: '+48 503 555 666', role: 'client' },
  { id: 'u-olena', full_name: 'Olena Shevchenko', phone: '+48 504 777 888', role: 'client' },
];

const serviceOf = (slotId: string) => services.find((s) => s.id === slots.find((x) => x.id === slotId)!.service_id)!;
const mkBooking = (slot_id: string, user_id: string, status: string, ageMin = 600): Row => ({
  id: uid(),
  slot_id,
  user_id,
  status,
  amount_grosze: serviceOf(slot_id).price_grosze,
  refunded_grosze: null,
  created_at: new Date(Date.now() - ageMin * 60000).toISOString(),
});

const bookings: Row[] = [
  mkBooking('slot-1-730', 'u-anna', 'paid'), // индивидуальная занята
  mkBooking('slot-1-180', 'u-piotr', 'paid'),
  mkBooking('slot-1-180', 'u-marta', 'paid'),
  mkBooking('slot-1-180', 'u-olena', 'paid'),
  mkBooking('slot-2-190', 'u-anna', 'paid'),
  mkBooking('slot-3-180', DEMO_USER, 'paid'), // ваша предстоящая запись
  mkBooking('slot-past', DEMO_USER, 'paid'),
];

// ---------- логика, как в SQL ----------
const isActive = (b: Row) =>
  b.status === 'paid' || (b.status === 'pending_payment' && Date.now() - new Date(b.created_at).getTime() < HOLD_MS);

let session: any = null;

function upcomingSlots(daysAhead: number) {
  const now = Date.now();
  const limit = now + daysAhead * 864e5;
  return slots
    .filter((s) => !s.is_cancelled && new Date(s.starts_at).getTime() > now && new Date(s.starts_at).getTime() < limit)
    .filter((s) => services.find((x) => x.id === s.service_id)!.is_active)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .map((s) => {
      const sv = services.find((x) => x.id === s.service_id)!;
      const g = gyms.find((x) => x.id === s.gym_id);
      const mine = bookings.find((b) => b.slot_id === s.id && b.user_id === session?.user.id && isActive(b));
      return {
        slot_id: s.id,
        starts_at: s.starts_at,
        duration_min: s.duration_min,
        capacity: s.capacity,
        booked: bookings.filter((b) => b.slot_id === s.id && isActive(b)).length,
        description: s.description,
        kind: sv.kind,
        price_grosze: sv.price_grosze,
        gym_id: g?.id ?? null,
        gym_name: g?.name ?? null,
        gym_address: g?.address ?? null,
        my_booking_status: mine?.status ?? null,
      };
    });
}

function bookSlot(slotId: string) {
  const slot = slots.find((s) => s.id === slotId);
  if (!slot || slot.is_cancelled) throw new Error('slot_not_found');
  if (new Date(slot.starts_at).getTime() <= Date.now()) throw new Error('slot_in_past');
  const existing = bookings.find((b) => b.slot_id === slotId && b.user_id === session.user.id && isActive(b));
  if (existing) {
    if (existing.status === 'paid') throw new Error('already_booked');
    return existing;
  }
  if (bookings.filter((b) => b.slot_id === slotId && isActive(b)).length >= slot.capacity) throw new Error('slot_full');
  const b = mkBooking(slotId, session.user.id, 'pending_payment', 0);
  bookings.push(b);
  return b;
}

/** Демо-оплата: отмечает запись оплаченной (в реальном режиме это делает вебхук Stripe). */
export function demoMarkPaid(bookingId: string) {
  const b = bookings.find((x) => x.id === bookingId);
  if (b) b.status = 'paid';
}

function bookingWithJoins(b: Row) {
  const s = slots.find((x) => x.id === b.slot_id)!;
  const sv = services.find((x) => x.id === s.service_id)!;
  const g = gyms.find((x) => x.id === s.gym_id);
  return {
    ...b,
    slots: {
      id: s.id,
      starts_at: s.starts_at,
      duration_min: s.duration_min,
      gyms: g ? { name: g.name } : null,
      services: { kind: sv.kind },
    },
  };
}

// ---------- мини-аналог query builder из supabase-js ----------
const tables: Record<string, Row[]> = {
  services,
  gyms,
  slots,
  profiles,
  bookings,
  app_settings: [settings],
};

class Query implements PromiseLike<{ data: any; error: any }> {
  private filters: ((r: Row) => boolean)[] = [];
  private op: 'select' | 'insert' | 'update' = 'select';
  private payload: Row = {};
  private one = false;
  private sortKey?: string;
  private asc = true;
  private max?: number;

  constructor(private table: string) {}

  select() { return this; }
  eq(k: string, v: unknown) { this.filters.push((r) => r[k] === v); return this; }
  in(k: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[k])); return this; }
  order(k: string, o?: { ascending?: boolean }) { this.sortKey = k; this.asc = o?.ascending ?? true; return this; }
  limit(n: number) { this.max = n; return this; }
  single() { this.one = true; return this; }
  insert(p: Row) { this.op = 'insert'; this.payload = p; return this; }
  update(p: Row) { this.op = 'update'; this.payload = p; return this; }

  private run() {
    const rows = tables[this.table];
    if (this.op === 'insert') {
      const row: Row = { id: uid(), is_cancelled: false, is_active: true, ...this.payload };
      if (this.table === 'slots') {
        // как триггер check_slot_gym в SQL
        const kind = services.find((s) => s.id === row.service_id)?.kind;
        if (kind === 'online') row.gym_id = null;
        else if (!row.gym_id) return { data: null, error: { message: 'gym_required' } };
      }
      rows.push(row);
      return { data: row, error: null };
    }
    let result = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === 'update') {
      result.forEach((r) => Object.assign(r, this.payload));
      return { data: result, error: null };
    }
    if (this.sortKey) {
      const k = this.sortKey;
      result = [...result].sort((a, b) => (a[k] > b[k] ? 1 : -1) * (this.asc ? 1 : -1));
    }
    if (this.max) result = result.slice(0, this.max);
    const shaped = this.table === 'bookings' ? result.map(bookingWithJoins) : result.map((r) => ({ ...r }));
    return { data: this.one ? shaped[0] ?? null : shaped, error: null };
  }

  then<A = { data: any; error: any }, B = never>(
    onOk?: ((v: { data: any; error: any }) => A | PromiseLike<A>) | null,
    onErr?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve()
      .then(() => this.run())
      .then(onOk, onErr);
  }
}

// ---------- сам клиент ----------
type Listener = (event: string, s: any) => void;
const listeners: Listener[] = [];
const emit = (event: string) => listeners.forEach((l) => l(event, session));

const ok = <T>(data: T) => Promise.resolve({ data, error: null });
const fail = (code: string) =>
  Promise.resolve({ data: null, error: { message: code, context: new Response(JSON.stringify({ error: code })) } });

export function createDemoClient() {
  return {
    auth: {
      getSession: () => ok({ session }),
      onAuthStateChange: (cb: Listener) => {
        listeners.push(cb);
        return { data: { subscription: { unsubscribe: () => listeners.splice(listeners.indexOf(cb), 1) } } };
      },
      signInWithPassword: ({ email }: { email: string }) => {
        session = { user: { id: DEMO_USER, email } };
        emit('SIGNED_IN');
        return ok({ session, user: session.user });
      },
      signUp: ({ email, options }: { email: string; options?: { data?: { full_name?: string } } }) => {
        if (options?.data?.full_name) profiles[0].full_name = options.data.full_name;
        session = { user: { id: DEMO_USER, email } };
        emit('SIGNED_IN');
        return ok({ session, user: session.user });
      },
      signOut: () => {
        session = null;
        emit('SIGNED_OUT');
        return ok(null);
      },
      startAutoRefresh: () => {},
      stopAutoRefresh: () => {},
    },
    from: (table: string) => new Query(table),
    rpc: (name: string, args: Row) => {
      try {
        switch (name) {
          case 'get_upcoming_slots':
            return ok(upcomingSlots(args.days_ahead ?? 30));
          case 'coach_slot_attendees':
            return ok(
              bookings
                .filter((b) => b.slot_id === args.p_slot_id && isActive(b))
                .map((b) => {
                  const p = profiles.find((x) => x.id === b.user_id)!;
                  return { booking_id: b.id, full_name: p.full_name, phone: p.phone, status: b.status };
                }),
            );
          case 'book_slot':
            return ok(bookSlot(args.p_slot_id));
        }
      } catch (e) {
        return fail((e as Error).message);
      }
      return fail('unknown_rpc');
    },
    functions: {
      invoke: (name: string, { body }: { body: Row }) => {
        try {
          if (name === 'create-payment-intent') {
            const b = bookSlot(body.slot_id as string);
            return ok({ bookingId: b.id, paymentIntent: 'demo', ephemeralKey: 'demo', customer: 'demo', amount: b.amount_grosze });
          }
          if (name === 'cancel-booking') {
            // как edge-функция cancel-booking: возврат = цена − комиссия
            const b = bookings.find((x) => x.id === body.booking_id);
            if (!b) return fail('not_found');
            if (b.status === 'pending_payment') {
              b.status = 'cancelled';
              return ok({ status: 'cancelled', refunded_grosze: 0 });
            }
            const slot = slots.find((s) => s.id === b.slot_id)!;
            if (new Date(slot.starts_at).getTime() - Date.now() < settings.refund_hours * 36e5) {
              return fail('too_late_to_cancel');
            }
            const refund = Math.max(0, b.amount_grosze - settings.cancel_fee_grosze);
            b.status = 'refunded';
            b.refunded_grosze = refund;
            return ok({ status: 'refunded', refunded_grosze: refund });
          }
        } catch (e) {
          return fail((e as Error).message);
        }
        return fail('unknown_function');
      },
    },
  };
}
