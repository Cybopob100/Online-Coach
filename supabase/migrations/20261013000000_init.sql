-- =========================================================
-- Online Coach: схема базы данных
-- Три вида тренировок: онлайн, индивидуально в зале, группа в зале.
-- Залы (FitFabric Łódź), время, длительность и описание каждой
-- тренировки задаёт тренер в приложении.
-- Суммы хранятся в грошах (1 PLN = 100 groszy).
-- =========================================================

-- ---------- Профили ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  role text not null default 'client' check (role in ('client', 'coach')),
  stripe_customer_id text,
  push_token text, -- Expo push token для уведомлений на телефон
  created_at timestamptz not null default now()
);

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

-- ---------- Залы ----------
create table public.gyms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Виды тренировок ----------
-- Ровно три вида; названия переводятся в приложении по полю kind.
create table public.services (
  id uuid primary key default gen_random_uuid(),
  kind text not null unique check (kind in ('online', 'gym', 'group')),
  price_grosze int not null check (price_grosze >= 200), -- минимум Stripe для PLN = 2 zł
  default_duration_min int not null default 60 check (default_duration_min > 0),
  default_capacity int not null default 1 check (default_capacity > 0),
  is_active boolean not null default true
);

-- ---------- Тренировки в расписании ----------
create table public.slots (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id) on delete restrict,
  gym_id uuid references public.gyms (id) on delete restrict, -- пусто для онлайн
  starts_at timestamptz not null,
  duration_min int not null check (duration_min > 0),
  capacity int not null default 1 check (capacity > 0),
  description text, -- что будет на этой тренировке
  is_cancelled boolean not null default false,
  created_at timestamptz not null default now()
);

create index slots_starts_at_idx on public.slots (starts_at);

-- Онлайн — без зала, в зале и группа — обязательно с залом
create or replace function public.check_slot_gym()
returns trigger
language plpgsql
as $$
declare
  v_kind text;
begin
  select kind into v_kind from public.services where id = new.service_id;
  if v_kind = 'online' then
    new.gym_id := null;
  elsif new.gym_id is null then
    raise exception 'gym_required';
  end if;
  return new;
end;
$$;

create trigger slots_check_gym
  before insert or update on public.slots
  for each row execute function public.check_slot_gym();

-- ---------- Записи ----------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.slots (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'paid', 'cancelled', 'refunded')),
  amount_grosze int not null,
  stripe_payment_intent_id text unique,
  refunded_grosze int, -- сколько вернули клиенту при отмене (цена минус комиссия)
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  cancelled_at timestamptz
);

-- ---------- Настройки тренера (одна строка) ----------
create table public.app_settings (
  id boolean primary key default true check (id), -- гарантирует единственную строку
  cancel_fee_grosze int not null default 500 check (cancel_fee_grosze >= 0), -- комиссия за отмену
  refund_hours int not null default 24 check (refund_hours >= 0) -- отмена с возвратом не позже чем за N часов
);
insert into public.app_settings default values;

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
alter table public.gyms enable row level security;
alter table public.services enable row level security;
alter table public.slots enable row level security;
alter table public.bookings enable row level security;
alter table public.app_settings enable row level security;

create policy "settings: читают все вошедшие"
  on public.app_settings for select to authenticated
  using (true);

create policy "settings: тренер меняет"
  on public.app_settings for update to authenticated
  using (public.is_coach()) with check (public.is_coach());

create policy "profiles: читать свой или тренер все"
  on public.profiles for select
  using (id = auth.uid() or public.is_coach());

create policy "profiles: обновлять свой"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Клиент не может сам назначить себе роль тренера или подменить stripe_customer_id
revoke update on public.profiles from authenticated;
grant update (full_name, phone, push_token) on public.profiles to authenticated;

create policy "gyms: читают все вошедшие"
  on public.gyms for select to authenticated
  using (is_active or public.is_coach());

create policy "gyms: тренер управляет"
  on public.gyms for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

create policy "services: читают все вошедшие"
  on public.services for select to authenticated
  using (is_active or public.is_coach());

create policy "services: тренер управляет"
  on public.services for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

create policy "slots: читают все вошедшие"
  on public.slots for select to authenticated
  using (true);

create policy "slots: тренер управляет"
  on public.slots for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

-- Записи: читать свои (тренер — все). Создание и изменение только через функции ниже
create policy "bookings: читать свои или тренер все"
  on public.bookings for select to authenticated
  using (user_id = auth.uid() or public.is_coach());

-- ---------- RPC: ближайшие тренировки со свободными местами ----------
create or replace function public.get_upcoming_slots(days_ahead int default 30)
returns table (
  slot_id uuid,
  starts_at timestamptz,
  duration_min int,
  capacity int,
  booked int,
  description text,
  kind text,
  price_grosze int,
  gym_id uuid,
  gym_name text,
  gym_address text,
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
    s.duration_min,
    s.capacity,
    (select count(*)::int from bookings b where b.slot_id = s.id and booking_is_active(b)),
    s.description,
    sv.kind,
    sv.price_grosze,
    g.id,
    g.name,
    g.address,
    (select b.status from bookings b
      where b.slot_id = s.id and b.user_id = auth.uid() and booking_is_active(b)
      limit 1)
  from slots s
  join services sv on sv.id = s.service_id
  left join gyms g on g.id = s.gym_id
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

-- ---------- RPC для тренера: записавшиеся на тренировку ----------
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
    and booking_is_active(b)
  order by b.created_at;
$$;

grant execute on function public.coach_slot_attendees(uuid) to authenticated;

-- ---------- Начальные данные (цены и залы можно менять в приложении) ----------
insert into public.services (kind, price_grosze, default_duration_min, default_capacity) values
  ('online', 10000, 60, 1),
  ('gym',    15000, 60, 1),
  ('group',   8000, 90, 6);

insert into public.gyms (name, address) values
  ('FitFabric Łódź Sukcesja', 'al. Politechniki 1'),
  ('FitFabric Łódź Teofilów', 'ul. Aleksandrowska 38'),
  ('FitFabric Łódź Rewolucji', 'ul. Rewolucji 1905 r. 44'),
  ('FitFabric Łódź Widzewska Manufaktura', 'al. Piłsudskiego 135');
