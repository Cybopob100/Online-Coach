-- =========================================================
-- Coach Booking: схема базы данных
-- Клиенты записываются на слоты тренировок и оплачивают через Stripe.
-- Суммы хранятся в грошах (1 PLN = 100 groszy).
-- =========================================================

-- ---------- Профили ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  role text not null default 'client' check (role in ('client', 'coach')),
  stripe_customer_id text,
  created_at timestamptz not null default now()
);

-- Профиль создаётся автоматически при регистрации
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_coach()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'coach'
  );
$$;

-- ---------- Услуги (виды тренировок) ----------
create table public.services (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  duration_min int not null default 60 check (duration_min > 0),
  price_grosze int not null check (price_grosze >= 200), -- минимум Stripe для PLN = 2 zł
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Слоты (конкретное время тренировки) ----------
create table public.slots (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id) on delete restrict,
  starts_at timestamptz not null,
  capacity int not null default 1 check (capacity > 0),
  location text,
  is_cancelled boolean not null default false,
  created_at timestamptz not null default now()
);

create index slots_starts_at_idx on public.slots (starts_at);

-- ---------- Записи ----------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.slots (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'paid', 'cancelled', 'refunded')),
  amount_grosze int not null,
  stripe_payment_intent_id text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  cancelled_at timestamptz
);

create index bookings_slot_idx on public.bookings (slot_id);
create index bookings_user_idx on public.bookings (user_id);

-- Сколько минут неоплаченная запись держит место
create or replace function public.pending_hold_minutes()
returns int language sql immutable as $$ select 15 $$;

-- Запись «занимает место», если оплачена или ожидает оплаты не дольше 15 минут
create or replace function public.booking_is_active(b public.bookings)
returns boolean
language sql
stable
as $$
  select b.status = 'paid'
      or (b.status = 'pending_payment'
          and b.created_at > now() - make_interval(mins => public.pending_hold_minutes()));
$$;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.slots enable row level security;
alter table public.bookings enable row level security;

-- profiles
create policy "profiles: читать свой или тренер все"
  on public.profiles for select
  using (id = auth.uid() or public.is_coach());

create policy "profiles: обновлять свой"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Клиент не может сам назначить себе роль тренера или подменить stripe_customer_id
revoke update on public.profiles from authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

-- services
create policy "services: читают все вошедшие"
  on public.services for select
  to authenticated
  using (is_active or public.is_coach());

create policy "services: тренер управляет"
  on public.services for all
  to authenticated
  using (public.is_coach())
  with check (public.is_coach());

-- slots
create policy "slots: читают все вошедшие"
  on public.slots for select
  to authenticated
  using (true);

create policy "slots: тренер управляет"
  on public.slots for all
  to authenticated
  using (public.is_coach())
  with check (public.is_coach());

-- bookings: читать свои (тренер — все). Создание и изменение только через функции ниже
create policy "bookings: читать свои или тренер все"
  on public.bookings for select
  to authenticated
  using (user_id = auth.uid() or public.is_coach());

-- ---------- RPC: слоты со свободными местами ----------
create or replace function public.get_upcoming_slots(days_ahead int default 30)
returns table (
  slot_id uuid,
  starts_at timestamptz,
  location text,
  capacity int,
  booked int,
  service_id uuid,
  title text,
  description text,
  duration_min int,
  price_grosze int,
  my_booking_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.starts_at,
    s.location,
    s.capacity,
    (select count(*)::int from bookings b where b.slot_id = s.id and booking_is_active(b)),
    sv.id,
    sv.title,
    sv.description,
    sv.duration_min,
    sv.price_grosze,
    (select b.status from bookings b
      where b.slot_id = s.id and b.user_id = auth.uid() and booking_is_active(b)
      limit 1)
  from slots s
  join services sv on sv.id = s.service_id
  where not s.is_cancelled
    and sv.is_active
    and s.starts_at > now()
    and s.starts_at < now() + make_interval(days => days_ahead)
  order by s.starts_at;
$$;

grant execute on function public.get_upcoming_slots(int) to authenticated;

-- ---------- RPC: забронировать место (вызывается из edge-функции от имени клиента) ----------
create or replace function public.book_slot(p_slot_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot slots;
  v_price int;
  v_taken int;
  v_existing bookings;
  v_booking bookings;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  -- Блокируем слот, чтобы два клиента не заняли последнее место одновременно
  select * into v_slot from slots where id = p_slot_id for update;
  if not found or v_slot.is_cancelled then
    raise exception 'slot_not_found';
  end if;
  if v_slot.starts_at <= now() then
    raise exception 'slot_in_past';
  end if;

  -- Уже есть активная запись этого клиента — возвращаем её (повторная попытка оплаты)
  select * into v_existing from bookings b
    where b.slot_id = p_slot_id and b.user_id = auth.uid() and booking_is_active(b)
    limit 1;
  if found then
    if v_existing.status = 'paid' then
      raise exception 'already_booked';
    end if;
    return v_existing;
  end if;

  select count(*) into v_taken from bookings b
    where b.slot_id = p_slot_id and booking_is_active(b);
  if v_taken >= v_slot.capacity then
    raise exception 'slot_full';
  end if;

  select price_grosze into v_price from services where id = v_slot.service_id;

  insert into bookings (slot_id, user_id, amount_grosze)
  values (p_slot_id, auth.uid(), v_price)
  returning * into v_booking;

  return v_booking;
end;
$$;

revoke execute on function public.book_slot(uuid) from public, anon;
grant execute on function public.book_slot(uuid) to authenticated;

-- ---------- RPC для тренера: записавшиеся на слот ----------
create or replace function public.coach_slot_attendees(p_slot_id uuid)
returns table (booking_id uuid, full_name text, phone text, status text)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, p.full_name, p.phone, b.status
  from bookings b
  join profiles p on p.id = b.user_id
  where b.slot_id = p_slot_id
    and public.is_coach()
    and (b.status in ('paid') or booking_is_active(b))
  order by b.created_at;
$$;

grant execute on function public.coach_slot_attendees(uuid) to authenticated;

-- ---------- Демо-данные (удалите или измените под себя) ----------
insert into public.services (title, description, duration_min, price_grosze) values
  ('Тяжёлая атлетика — индивидуально', 'Рывок, толчок, техника и подводящие упражнения', 60, 15000),
  ('Пауэрлифтинг — индивидуально', 'Присед, жим, тяга. Программа под цели', 60, 15000),
  ('Персональная тренировка', 'Общая физическая подготовка', 60, 12000),
  ('Мини-группа (до 4 человек)', 'Техника олимпийских движений в группе', 90, 8000);
