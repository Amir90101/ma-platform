-- Этап 4.1: гости, смены, сеансы, отрезки и товары сеанса.
--
-- Читают участники заведения, пишут только RPC ниже. RPC объявлены
-- security definer: прямых прав на запись у authenticated нет, поэтому
-- каждая функция сама проверяет участника или владельца заведения.

create type public.session_status as enum ('active', 'paused', 'closed', 'voided');
create type public.segment_kind as enum ('play', 'pause');

-- customers -----------------------------------------------------------------

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  phone text not null check (phone ~ '^\+7\d{10}$'),
  name text check (name is null or length(name) <= 100),
  notes text,
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (venue_id, phone)
);

-- shifts --------------------------------------------------------------------

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  opened_by uuid not null references auth.users (id),
  opened_at timestamptz not null default now(),
  opening_cash int not null check (opening_cash >= 0),
  closed_by uuid references auth.users (id),
  closed_at timestamptz,
  closing_cash int check (closing_cash >= 0),
  expected_cash int,
  check ((closed_at is null) = (closed_by is null))
);

-- Одна открытая смена на заведение.
create unique index shifts_one_open on public.shifts (venue_id) where closed_at is null;

-- sessions ------------------------------------------------------------------

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  -- Внешний ключ на bookings добавит этап 5.
  booking_id uuid unique,
  customer_id uuid references public.customers (id),
  package_id uuid references public.packages (id),
  status public.session_status not null default 'active',
  expected_end_at timestamptz,
  started_by uuid not null references auth.users (id),
  started_at timestamptz not null default now(),
  closed_by uuid references auth.users (id),
  closed_at timestamptz,
  time_amount int check (time_amount >= 0),
  items_amount int check (items_amount >= 0),
  discount_amount int not null default 0 check (discount_amount >= 0),
  total_amount int check (total_amount >= 0),
  tariff_snapshot jsonb,
  void_reason text
);

create index sessions_venue_status_idx on public.sessions (venue_id, status);

-- session_segments ----------------------------------------------------------

create table public.session_segments (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  -- restrict: ресурс с историей нельзя удалить, только выключить.
  resource_id uuid not null references public.resources (id) on delete restrict,
  kind public.segment_kind not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  check (ended_at is null or ended_at >= started_at)
);

-- На одном ресурсе одновременно открыт не больше одного отрезка:
-- второй сеанс на занятом столе отклоняет база, даже при гонке.
create unique index session_segments_one_open
  on public.session_segments (resource_id) where ended_at is null;
-- У сеанса не больше одного открытого отрезка.
create unique index session_segments_one_open_per_session
  on public.session_segments (session_id) where ended_at is null;
create index session_segments_session_idx on public.session_segments (session_id, started_at);

-- session_items -------------------------------------------------------------

create table public.session_items (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  price int not null check (price >= 0),
  qty int not null default 1 check (qty > 0),
  created_at timestamptz not null default now()
);

create index session_items_session_idx on public.session_items (session_id);

-- RLS: читают участники, пишут только RPC -------------------------------------

alter table public.customers enable row level security;
alter table public.shifts enable row level security;
alter table public.sessions enable row level security;
alter table public.session_segments enable row level security;
alter table public.session_items enable row level security;

revoke all on public.customers, public.shifts, public.sessions,
  public.session_segments, public.session_items from anon;
revoke insert, update, delete on public.customers, public.shifts, public.sessions,
  public.session_segments, public.session_items from authenticated;

create policy customers_select on public.customers
  for select to authenticated using ((select public.is_venue_member(venue_id)));
create policy shifts_select on public.shifts
  for select to authenticated using ((select public.is_venue_member(venue_id)));
create policy sessions_select on public.sessions
  for select to authenticated using ((select public.is_venue_member(venue_id)));
create policy session_segments_select on public.session_segments
  for select to authenticated using ((select public.is_venue_member(venue_id)));
create policy session_items_select on public.session_items
  for select to authenticated using ((select public.is_venue_member(venue_id)));

-- Общие проверки ------------------------------------------------------------

-- Сеанс для изменения: существует, пользователь — участник заведения.
-- Блокирует строку сеанса до конца транзакции.
create function public.lock_session(p_session_id uuid)
returns public.sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
begin
  select * into v_session from public.sessions where id = p_session_id for update;
  if v_session.id is null or not public.is_venue_member(v_session.venue_id) then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  return v_session;
end;
$$;

-- Закрывает открытый отрезок сеанса в момент p_at, возвращает его.
create function public.close_open_segment(p_session_id uuid, p_at timestamptz)
returns public.session_segments
language sql
security definer
set search_path = ''
as $$
  update public.session_segments set ended_at = p_at
  where session_id = p_session_id and ended_at is null
  returning *;
$$;

-- Открывает отрезок. Занятый ресурс — понятная ошибка resource_busy.
create function public.open_segment(
  p_session public.sessions,
  p_resource_id uuid,
  p_kind public.segment_kind,
  p_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.session_segments (venue_id, session_id, resource_id, kind, started_at)
  values (p_session.venue_id, p_session.id, p_resource_id, p_kind, p_at);
exception when unique_violation then
  raise exception 'resource_busy' using errcode = 'P0001';
end;
$$;

revoke execute on function
  public.lock_session(uuid),
  public.close_open_segment(uuid, timestamptz),
  public.open_segment(public.sessions, uuid, public.segment_kind, timestamptz)
from public, anon, authenticated;

-- Сумма сеанса --------------------------------------------------------------
-- Единственный вход для денег за сеанс: отрезки сеанса уходят в
-- calc_play_amount. Ничего не записывает.

create function public.calc_session_amount(p_session_id uuid, p_at timestamptz default now())
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_time jsonb;
  v_items int;
begin
  select * into v_session from public.sessions where id = p_session_id;
  if v_session.id is null or not public.is_venue_member(v_session.venue_id) then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  v_time := public.calc_play_amount(
    v_session.venue_id,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'resource_id', s.resource_id, 'kind', s.kind,
        'started_at', s.started_at, 'ended_at', s.ended_at
      ) order by s.started_at)
      from public.session_segments s where s.session_id = p_session_id
    ), '[]'),
    v_session.package_id,
    p_at
  );
  select coalesce(sum(price * qty), 0)::int into v_items
  from public.session_items where session_id = p_session_id;

  return v_time || jsonb_build_object(
    'time_amount', (v_time ->> 'amount')::int,
    'items_amount', v_items,
    'discount_amount', v_session.discount_amount,
    'total_amount', greatest((v_time ->> 'amount')::int + v_items - v_session.discount_amount, 0)
  );
end;
$$;

-- Старт ---------------------------------------------------------------------

create function public.start_session(
  p_resource_id uuid,
  p_expected_end_at timestamptz default null,
  p_package_id uuid default null,
  p_customer_phone text default null,
  p_customer_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resource public.resources;
  v_session public.sessions;
  v_customer_id uuid;
begin
  select * into v_resource from public.resources where id = p_resource_id;
  if v_resource.id is null or not public.is_venue_member(v_resource.venue_id) then
    raise exception 'resource_not_found' using errcode = 'P0002';
  end if;
  if not v_resource.is_active then
    raise exception 'resource_inactive' using errcode = 'P0001';
  end if;
  if p_expected_end_at is not null and p_expected_end_at <= now() then
    raise exception 'expected_end_in_past' using errcode = 'P0001';
  end if;
  if p_package_id is not null and not exists (
    select 1 from public.packages
    where id = p_package_id and venue_id = v_resource.venue_id and is_active
      and v_resource.kind = any (resource_kinds)
  ) then
    raise exception 'package_not_found' using errcode = 'P0002';
  end if;

  -- Гость по телефону: находим или создаём, имя обновляем, если дали новое.
  if nullif(trim(p_customer_phone), '') is not null then
    insert into public.customers (venue_id, phone, name)
    values (v_resource.venue_id, trim(p_customer_phone), nullif(trim(p_customer_name), ''))
    on conflict (venue_id, phone) do update
      set name = coalesce(excluded.name, public.customers.name)
    returning id into v_customer_id;
  end if;

  insert into public.sessions (venue_id, customer_id, package_id, expected_end_at, started_by)
  values (v_resource.venue_id, v_customer_id, p_package_id, p_expected_end_at, (select auth.uid()))
  returning * into v_session;

  perform public.open_segment(v_session, p_resource_id, 'play', now());
  return v_session.id;
end;
$$;

-- Пауза и продолжение -------------------------------------------------------

create function public.pause_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions := public.lock_session(p_session_id);
  v_segment public.session_segments;
begin
  if v_session.status <> 'active' then
    raise exception 'session_not_active' using errcode = 'P0001';
  end if;
  v_segment := public.close_open_segment(p_session_id, now());
  perform public.open_segment(v_session, v_segment.resource_id, 'pause', now());
  update public.sessions set status = 'paused' where id = p_session_id;
end;
$$;

create function public.resume_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions := public.lock_session(p_session_id);
  v_segment public.session_segments;
begin
  if v_session.status <> 'paused' then
    raise exception 'session_not_paused' using errcode = 'P0001';
  end if;
  v_segment := public.close_open_segment(p_session_id, now());
  perform public.open_segment(v_session, v_segment.resource_id, 'play', now());
  update public.sessions set status = 'active' where id = p_session_id;
end;
$$;

-- Перенос: время до переноса — по тарифу старого стола, после — нового.
create function public.transfer_session(p_session_id uuid, p_resource_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions := public.lock_session(p_session_id);
  v_target public.resources;
  v_segment public.session_segments;
begin
  if v_session.status not in ('active', 'paused') then
    raise exception 'session_not_open' using errcode = 'P0001';
  end if;
  select * into v_target from public.resources
  where id = p_resource_id and venue_id = v_session.venue_id;
  if v_target.id is null then
    raise exception 'resource_not_found' using errcode = 'P0002';
  end if;
  if not v_target.is_active then
    raise exception 'resource_inactive' using errcode = 'P0001';
  end if;

  v_segment := public.close_open_segment(p_session_id, now());
  if v_segment.resource_id = p_resource_id then
    raise exception 'same_resource' using errcode = 'P0001';
  end if;
  perform public.open_segment(v_session, p_resource_id, v_segment.kind, now());
end;
$$;

-- Закрытие ------------------------------------------------------------------
-- Сумма считается в момент закрытия и записывается вместе со снимком
-- тарифов: дальнейшие правки тарифов закрытый сеанс не меняют.
-- Нет тарифа — ошибка no_tariff, сеанс остаётся открытым.

create function public.close_session(p_session_id uuid, p_discount_amount int default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions := public.lock_session(p_session_id);
  v_amount jsonb;
  v_subtotal int;
begin
  if v_session.status not in ('active', 'paused') then
    raise exception 'session_not_open' using errcode = 'P0001';
  end if;
  if p_discount_amount is null or p_discount_amount < 0 then
    raise exception 'discount_invalid' using errcode = 'P0001';
  end if;

  perform public.close_open_segment(p_session_id, now());
  v_amount := public.calc_session_amount(p_session_id, now());
  v_subtotal := (v_amount ->> 'time_amount')::int + (v_amount ->> 'items_amount')::int;
  if p_discount_amount > v_subtotal then
    raise exception 'discount_too_big' using errcode = 'P0001';
  end if;

  update public.sessions set
    status = 'closed',
    closed_by = (select auth.uid()),
    closed_at = now(),
    time_amount = (v_amount ->> 'time_amount')::int,
    items_amount = (v_amount ->> 'items_amount')::int,
    discount_amount = p_discount_amount,
    total_amount = v_subtotal - p_discount_amount,
    tariff_snapshot = jsonb_build_object(
      'lines', v_amount -> 'lines',
      'package', v_amount -> 'package',
      'minutes', v_amount -> 'minutes'
    )
  where id = p_session_id
  returning * into v_session;

  return to_jsonb(v_session);
end;
$$;

-- Аннулирование: только владелец. Причина остаётся в сеансе, журнал — этап 4.2.
create function public.void_session(p_session_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions := public.lock_session(p_session_id);
begin
  if not public.is_venue_owner(v_session.venue_id) then
    raise exception 'only the owner can void a session' using errcode = '42501';
  end if;
  if v_session.status = 'voided' then
    raise exception 'session_already_voided' using errcode = 'P0001';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  perform public.close_open_segment(p_session_id, now());
  update public.sessions
  set status = 'voided', void_reason = trim(p_reason)
  where id = p_session_id;
end;
$$;

-- Смены ---------------------------------------------------------------------

create function public.open_shift(p_venue_id uuid, p_opening_cash int)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_venue_member(p_venue_id) then
    raise exception 'venue_not_found' using errcode = 'P0002';
  end if;
  if p_opening_cash is null or p_opening_cash < 0 then
    raise exception 'cash_invalid' using errcode = 'P0001';
  end if;
  insert into public.shifts (venue_id, opened_by, opening_cash)
  values (p_venue_id, (select auth.uid()), p_opening_cash)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'shift_already_open' using errcode = 'P0001';
end;
$$;

-- Ожидаемые наличные = наличные на открытии; оплаты добавит этап 4.2.
create function public.close_shift(p_shift_id uuid, p_closing_cash int)
returns public.shifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shift public.shifts;
begin
  select * into v_shift from public.shifts where id = p_shift_id for update;
  if v_shift.id is null or not public.is_venue_member(v_shift.venue_id) then
    raise exception 'shift_not_found' using errcode = 'P0002';
  end if;
  if v_shift.closed_at is not null then
    raise exception 'shift_already_closed' using errcode = 'P0001';
  end if;
  if p_closing_cash is null or p_closing_cash < 0 then
    raise exception 'cash_invalid' using errcode = 'P0001';
  end if;
  update public.shifts set
    closed_by = (select auth.uid()),
    closed_at = now(),
    closing_cash = p_closing_cash,
    expected_cash = v_shift.opening_cash
  where id = p_shift_id
  returning * into v_shift;
  return v_shift;
end;
$$;

revoke execute on function
  public.calc_session_amount(uuid, timestamptz),
  public.start_session(uuid, timestamptz, uuid, text, text),
  public.pause_session(uuid),
  public.resume_session(uuid),
  public.transfer_session(uuid, uuid),
  public.close_session(uuid, int),
  public.void_session(uuid, text),
  public.open_shift(uuid, int),
  public.close_shift(uuid, int)
from public, anon;
grant execute on function
  public.calc_session_amount(uuid, timestamptz),
  public.start_session(uuid, timestamptz, uuid, text, text),
  public.pause_session(uuid),
  public.resume_session(uuid),
  public.transfer_session(uuid, uuid),
  public.close_session(uuid, int),
  public.void_session(uuid, text),
  public.open_shift(uuid, int),
  public.close_shift(uuid, int)
to authenticated;
