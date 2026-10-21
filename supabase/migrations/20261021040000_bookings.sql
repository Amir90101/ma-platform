-- Этап 5.1: брони.
--
-- Двойные брони отсекает EXCLUDE-ограничение bookings_no_overlap: две
-- активные брони (confirmed, arrived) одного ресурса не пересекаются с
-- учётом буфера. RPC ловят его нарушение только ради понятного сообщения.
-- Читают участники заведения, пишут только RPC ниже (security definer
-- с явной проверкой участника, как у сеансов).

create type public.booking_status as enum ('confirmed', 'arrived', 'completed', 'cancelled', 'no_show');
create type public.booking_source as enum ('online', 'phone', 'manual');

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  -- restrict: ресурс с бронями нельзя удалить, save_hall_layout его выключит.
  resource_id uuid not null references public.resources (id) on delete restrict,
  customer_id uuid not null references public.customers (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- ends_at плюс буфер заведения на момент создания.
  blocked_until timestamptz not null,
  status public.booking_status not null default 'confirmed',
  source public.booking_source not null,
  guests int check (guests is null or guests between 1 and 100),
  comment text check (comment is null or length(comment) <= 500),
  manage_token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  created_by uuid references auth.users (id),
  cancelled_at timestamptz,
  cancelled_by_guest boolean not null default false,
  cancel_reason text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (blocked_until >= ends_at),
  check ((status = 'cancelled') = (cancelled_at is not null))
);

alter table public.bookings add constraint bookings_no_overlap
  exclude using gist (
    resource_id with =,
    tstzrange(starts_at, blocked_until, '[)') with &&
  ) where (status in ('confirmed', 'arrived'));

create index bookings_venue_starts_idx on public.bookings (venue_id, starts_at);
create index bookings_customer_idx on public.bookings (customer_id, status);
-- Для mark_no_shows: только ждущие брони.
create index bookings_confirmed_idx on public.bookings (starts_at) where status = 'confirmed';

alter table public.sessions
  add constraint sessions_booking_id_fkey foreign key (booking_id) references public.bookings (id);

-- RLS: читают участники, пишут только RPC -----------------------------------

alter table public.bookings enable row level security;
revoke all on public.bookings from anon;
revoke insert, update, delete on public.bookings from authenticated;

create policy bookings_select on public.bookings
  for select to authenticated using ((select public.is_venue_member(venue_id)));

-- Журнал: отмена брони -----------------------------------------------------

create function public.audit_bookings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    perform public.write_audit(new.venue_id, 'booking.cancelled', 'bookings', new.id,
      jsonb_build_object('status', old.status),
      jsonb_build_object('status', new.status, 'cancel_reason', new.cancel_reason,
                         'cancelled_by_guest', new.cancelled_by_guest,
                         'starts_at', new.starts_at));
  end if;
  return new;
end;
$$;

create trigger bookings_audit
after update on public.bookings
for each row execute function public.audit_bookings();

revoke execute on function public.audit_bookings() from public, anon, authenticated;

-- Мешающая бронь ------------------------------------------------------------
-- Для сообщения об отказе: активная бронь ресурса, с которой пересекается
-- интервал [starts_at, blocked_until).

create function public.booking_conflict(p_resource_id uuid, p_starts_at timestamptz, p_blocked_until timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', b.id, 'starts_at', b.starts_at, 'ends_at', b.ends_at, 'customer_name', c.name)
  from public.bookings b
  join public.customers c on c.id = b.customer_id
  where b.resource_id = p_resource_id
    and b.status in ('confirmed', 'arrived')
    and tstzrange(b.starts_at, b.blocked_until, '[)') && tstzrange(p_starts_at, p_blocked_until, '[)')
  order by b.starts_at
  limit 1;
$$;

revoke execute on function public.booking_conflict(uuid, timestamptz, timestamptz)
from public, anon, authenticated;

-- Бронь по звонку -----------------------------------------------------------
-- Пересечение — ошибка booking_overlap, в detail мешающая бронь (jsonb).

create function public.create_manual_booking(
  p_resource_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_customer_phone text,
  p_customer_name text default null,
  p_guests int default null,
  p_comment text default null,
  p_source public.booking_source default 'phone'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resource public.resources;
  v_buffer int;
  v_blocked_until timestamptz;
  v_customer_id uuid;
  v_id uuid;
begin
  select * into v_resource from public.resources where id = p_resource_id;
  if v_resource.id is null or not public.is_venue_member(v_resource.venue_id) then
    raise exception 'resource_not_found' using errcode = 'P0002';
  end if;
  if not v_resource.is_active then
    raise exception 'resource_inactive' using errcode = 'P0001';
  end if;
  if p_source = 'online' then
    raise exception 'source_invalid' using errcode = 'P0001';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'booking_time_invalid' using errcode = 'P0001';
  end if;
  if p_ends_at <= now() then
    raise exception 'booking_in_past' using errcode = 'P0001';
  end if;
  if nullif(trim(p_customer_phone), '') is null then
    raise exception 'phone_required' using errcode = 'P0001';
  end if;

  select buffer_min into v_buffer from public.venues where id = v_resource.venue_id;
  v_blocked_until := p_ends_at + make_interval(mins => v_buffer);

  insert into public.customers (venue_id, phone, name)
  values (v_resource.venue_id, trim(p_customer_phone), nullif(trim(p_customer_name), ''))
  on conflict (venue_id, phone) do update
    set name = coalesce(excluded.name, public.customers.name)
  returning id into v_customer_id;

  begin
    insert into public.bookings (
      venue_id, resource_id, customer_id, starts_at, ends_at, blocked_until,
      source, guests, comment, created_by
    ) values (
      v_resource.venue_id, p_resource_id, v_customer_id, p_starts_at, p_ends_at, v_blocked_until,
      p_source, p_guests, nullif(trim(p_comment), ''), (select auth.uid())
    ) returning id into v_id;
  exception when exclusion_violation then
    raise exception 'booking_overlap' using errcode = 'P0001',
      detail = coalesce(public.booking_conflict(p_resource_id, p_starts_at, v_blocked_until), '{}')::text;
  end;
  return v_id;
end;
$$;

-- Отмена и неявка -----------------------------------------------------------
-- Из confirmed администратор переводит бронь в cancelled (с причиной) или
-- no_show. arrived и completed ставят сеансы (этап 5.3).

create function public.set_booking_status(
  p_booking_id uuid,
  p_status public.booking_status,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null or not public.is_venue_member(v_booking.venue_id) then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  if p_status not in ('cancelled', 'no_show') then
    raise exception 'booking_status_invalid' using errcode = 'P0001';
  end if;
  if v_booking.status <> 'confirmed' then
    raise exception 'booking_not_confirmed' using errcode = 'P0001';
  end if;

  if p_status = 'cancelled' then
    if nullif(trim(p_reason), '') is null then
      raise exception 'reason_required' using errcode = 'P0001';
    end if;
    update public.bookings
    set status = 'cancelled', cancelled_at = now(), cancel_reason = trim(p_reason)
    where id = p_booking_id;
  else
    update public.bookings set status = 'no_show' where id = p_booking_id;
  end if;
end;
$$;

-- Брони на день -------------------------------------------------------------
-- День — местные сутки даты в часовом поясе заведения, продлённые до
-- закрытия, если в этот день заведение работает через полночь. Ночная бронь
-- видна и в своём рабочем дне, и в календарном.

create function public.get_day_bookings(p_venue_id uuid, p_date date)
returns table (
  id uuid,
  resource_id uuid,
  customer_id uuid,
  customer_name text,
  customer_phone text,
  no_show_count int,
  starts_at timestamptz,
  ends_at timestamptz,
  blocked_until timestamptz,
  status public.booking_status,
  source public.booking_source,
  guests int,
  comment text,
  cancel_reason text,
  cancelled_by_guest boolean,
  session_id uuid,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_venue public.venues;
  v_close time;
  v_from timestamptz;
  v_to timestamptz;
begin
  select * into v_venue from public.venues v where v.id = p_venue_id;
  if v_venue.id is null or not public.is_venue_member(p_venue_id) then
    raise exception 'venue_not_found' using errcode = 'P0002';
  end if;

  v_from := p_date::timestamp at time zone v_venue.timezone;
  v_to := (p_date + 1)::timestamp at time zone v_venue.timezone;
  -- Ночные часы этого дня (close <= open) продлевают его до закрытия.
  select max((d ->> 'close')::time) into v_close
  from jsonb_array_elements(v_venue.working_hours) d
  where (d ->> 'weekday')::int = extract(isodow from p_date)::int
    and (d ->> 'close')::time <= (d ->> 'open')::time;
  if v_close is not null then
    v_to := greatest(v_to, ((p_date + 1) + v_close) at time zone v_venue.timezone);
  end if;

  return query
  select b.id, b.resource_id, b.customer_id, c.name, c.phone,
    (select count(*)::int from public.bookings p
      where p.customer_id = b.customer_id and p.status = 'no_show' and p.id <> b.id),
    b.starts_at, b.ends_at, b.blocked_until, b.status, b.source, b.guests, b.comment,
    b.cancel_reason, b.cancelled_by_guest,
    (select s.id from public.sessions s where s.booking_id = b.id),
    b.created_at
  from public.bookings b
  join public.customers c on c.id = b.customer_id
  where b.venue_id = p_venue_id
    and b.starts_at < v_to and b.ends_at > v_from
  order by b.starts_at, b.resource_id;
end;
$$;

-- Неявки --------------------------------------------------------------------
-- Каждую минуту: confirmed, у которых прошло starts_at + no_show_after_min,
-- а сеанса по брони нет, становятся no_show и освобождают ресурс.

create function public.mark_no_shows()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  update public.bookings b set status = 'no_show'
  from public.venues v
  where v.id = b.venue_id
    and b.status = 'confirmed'
    and b.starts_at + make_interval(mins => v.no_show_after_min) < now()
    and not exists (select 1 from public.sessions s where s.booking_id = b.id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.mark_no_shows() from public, anon, authenticated;

select cron.schedule('mark_no_shows', '* * * * *', 'select public.mark_no_shows()');

revoke execute on function
  public.create_manual_booking(uuid, timestamptz, timestamptz, text, text, int, text, public.booking_source),
  public.set_booking_status(uuid, public.booking_status, text),
  public.get_day_bookings(uuid, date)
from public, anon;
grant execute on function
  public.create_manual_booking(uuid, timestamptz, timestamptz, text, text, int, text, public.booking_source),
  public.set_booking_status(uuid, public.booking_status, text),
  public.get_day_bookings(uuid, date)
to authenticated;
