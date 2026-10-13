// Демо-режим: включается, когда в .env нет ключей Supabase.
// Подменяет Supabase-клиент данными в памяти, чтобы приложение можно было
// посмотреть без бэкенда. Данные сбрасываются при перезагрузке.
import { locale } from './i18n';

type Row = Record<string, any>;

const DEMO_USER = '00000000-0000-0000-0000-000000000001';
const HOLD_MS = 15 * 60 * 1000;
const isPl = locale.startsWith('pl');

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function at(daysFromToday: number, hour: number, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

// ---------- начальные данные ----------
const services: Row[] = [
  {
    id: 'svc-wl',
    title: isPl ? 'Podnoszenie ciężarów — indywidualnie' : 'Тяжёлая атлетика — индивидуально',
    description: isPl ? 'Rwanie, podrzut, technika i ćwiczenia pomocnicze' : 'Рывок, толчок, техника и подводящие упражнения',
    duration_min: 60,
    price_grosze: 15000,
    is_active: true,
  },
  {
    id: 'svc-pl',
    title: isPl ? 'Trójbój siłowy — indywidualnie' : 'Пауэрлифтинг — индивидуально',
    description: isPl ? 'Przysiad, wyciskanie, martwy ciąg. Plan pod Twoje cele' : 'Присед, жим, тяга. Программа под цели',
    duration_min: 60,
    price_grosze: 15000,
    is_active: true,
  },
  {
    id: 'svc-pt',
    title: isPl ? 'Trening personalny' : 'Персональная тренировка',
    description: isPl ? 'Ogólne przygotowanie fizyczne' : 'Общая физическая подготовка',
    duration_min: 60,
    price_grosze: 12000,
    is_active: true,
  },
  {
    id: 'svc-gr',
    title: isPl ? 'Mini-grupa (do 4 osób)' : 'Мини-группа (до 4 человек)',
    description: isPl ? 'Technika bojów olimpijskich w grupie' : 'Техника олимпийских движений в группе',
    duration_min: 90,
    price_grosze: 8000,
    is_active: true,
  },
];

const LOCATION = 'Łódź, ul. Piotrkowska 100';
const slots: Row[] = [];
const plan: [number, number, number, string, number][] = [
  // [день, час, минута, услуга, мест]
  [0, 19, 0, 'svc-pt', 1],
  [1, 7, 30, 'svc-wl', 1],
  [1, 18, 0, 'svc-gr', 4],
  [2, 8, 0, 'svc-pl', 1],
  [2, 19, 30, 'svc-wl', 1],
  [3, 18, 0, 'svc-gr', 4],
  [4, 7, 30, 'svc-pt', 1],
  [5, 10, 0, 'svc-gr', 4],
  [6, 18, 0, 'svc-wl', 1],
  [8, 18, 0, 'svc-gr', 4],
  [9, 8, 0, 'svc-pl', 1],
];
for (const [d, h, m, s, cap] of plan) {
  slots.push({ id: `slot-${d}-${h}${m}`, service_id: s, starts_at: at(d, h, m), capacity: cap, location: LOCATION, is_cancelled: false });
}
// прошедшая тренировка для истории
slots.push({ id: 'slot-past', service_id: 'svc-wl', starts_at: at(-3, 18), capacity: 1, location: LOCATION, is_cancelled: false });

const profiles: Row[] = [
  // В демо вы — тренер, чтобы была видна и вкладка «Тренер»
  { id: DEMO_USER, full_name: 'Demo', phone: '+48 500 000 000', role: 'coach' },
  { id: 'u-anna', full_name: 'Anna Kowalska', phone: '+48 501 111 222', role: 'client' },
  { id: 'u-piotr', full_name: 'Piotr Nowak', phone: '+48 502 333 444', role: 'client' },
  { id: 'u-marta', full_name: 'Marta Wiśniewska', phone: '+48 503 555 666', role: 'client' },
];

const priceOf = (slotId: string) => services.find((s) => s.id === slots.find((x) => x.id === slotId)!.service_id)!.price_grosze;
const mkBooking = (slot_id: string, user_id: string, status: string, ageMin = 600): Row => ({
  id: uid(),
  slot_id,
  user_id,
  status,
  amount_grosze: priceOf(slot_id),
  created_at: new Date(Date.now() - ageMin * 60000).toISOString(),
});

const bookings: Row[] = [
  mkBooking('slot-1-730', 'u-anna', 'paid'), // занято
  mkBooking('slot-1-180', 'u-piotr', 'paid'),
  mkBooking('slot-1-180', 'u-marta', 'paid'),
  mkBooking('slot-2-1930', DEMO_USER, 'paid'), // ваша предстоящая запись
  mkBooking('slot-3-180', 'u-anna', 'paid'),
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
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .map((s) => {
      const sv = services.find((x) => x.id === s.service_id)!;
      const mine = bookings.find((b) => b.slot_id === s.id && b.user_id === session?.user.id && isActive(b));
      return {
        slot_id: s.id,
        starts_at: s.starts_at,
        location: s.location,
        capacity: s.capacity,
        booked: bookings.filter((b) => b.slot_id === s.id && isActive(b)).length,
        service_id: sv.id,
        title: sv.title,
        description: sv.description,
        duration_min: sv.duration_min,
        price_grosze: sv.price_grosze,
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
  return {
    ...b,
    slots: { id: s.id, starts_at: s.starts_at, location: s.location, services: { title: sv.title, duration_min: sv.duration_min } },
  };
}

// ---------- мини-аналог query builder из supabase-js ----------
const tables: Record<string, Row[]> = { services, slots, profiles, bookings };

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
      const row = { id: uid(), is_cancelled: false, ...this.payload };
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
const fail = (code: string) => Promise.resolve({ data: null, error: { message: code, context: new Response(JSON.stringify({ error: code })) } });

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
            const b = bookings.find((x) => x.id === body.booking_id);
            if (!b) return fail('not_found');
            const slot = slots.find((s) => s.id === b.slot_id)!;
            if (b.status === 'paid' && new Date(slot.starts_at).getTime() - Date.now() < 24 * 36e5) {
              return fail('too_late_to_cancel');
            }
            b.status = b.status === 'paid' ? 'refunded' : 'cancelled';
            return ok({ status: b.status });
          }
        } catch (e) {
          return fail((e as Error).message);
        }
        return fail('unknown_function');
      },
    },
  };
}
