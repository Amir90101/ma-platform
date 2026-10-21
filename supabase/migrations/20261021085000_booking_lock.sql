-- Найдено на этапе 6.3 прогоном e2e: две одновременные брони одного стола
-- иногда падали с deadlock_detected вместо booking_overlap. EXCLUDE всё так
-- же не пускает двойную бронь; блокировка только делает отказ понятным.

-- Транзакционная advisory-блокировка на ресурс: до конца транзакции.
create function public.lock_resource_bookings(p_resource_id uuid)
returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('bookings:' || p_resource_id::text, 0));
$$;

revoke execute on function public.lock_resource_bookings(uuid) from public, anon, authenticated;

create or replace function public.create_manual_booking(
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

  -- Брони одного ресурса создаются по очереди: при одновременной вставке
  -- EXCLUDE-ограничение может разрешить конфликт взаимоблокировкой, и гость
  -- получил бы непонятную ошибку вместо booking_overlap.
  perform public.lock_resource_bookings(p_resource_id);
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

create or replace function public.create_public_booking(
  p_resource_id uuid,
  p_starts_at timestamptz,
  p_duration_min int,
  p_phone text,
  p_name text,
  p_guests int default null,
  p_comment text default null,
  p_ip inet default null,
  p_max_active_per_phone int default 2,
  p_max_active_per_ip int default 5
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resource public.resources;
  v_venue public.venues;
  v_local date;
  v_customer_id uuid;
  v_ends_at timestamptz;
  v_booking public.bookings;
begin
  select * into v_resource from public.resources where id = p_resource_id;
  select * into v_venue from public.venues where id = v_resource.venue_id;
  if v_resource.id is null or not v_resource.is_active or not v_resource.bookable_online
     or not v_venue.is_published or not v_venue.online_booking_enabled then
    raise exception 'resource_not_found' using errcode = 'P0002';
  end if;
  if p_phone is null or trim(p_phone) !~ '^\+7\d{10}$' then
    raise exception 'phone_invalid' using errcode = 'P0001';
  end if;
  if nullif(trim(p_name), '') is null or length(trim(p_name)) > 100 then
    raise exception 'name_required' using errcode = 'P0001';
  end if;

  -- Время — одно из свободных окон своего рабочего дня. Ночная бронь
  -- принадлежит рабочему дню, который начался накануне.
  v_local := (p_starts_at at time zone v_venue.timezone)::date;
  if not exists (
    select 1 from (values (v_local), (v_local - 1)) d (day)
    cross join lateral public.get_availability(v_venue.id, d.day, p_duration_min) a
    where a.resource_id = p_resource_id and a.starts_at = p_starts_at
  ) then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end if;

  insert into public.customers (venue_id, phone, name, consent_at)
  values (v_venue.id, trim(p_phone), trim(p_name), now())
  on conflict (venue_id, phone) do update
    set name = coalesce(public.customers.name, excluded.name),
        consent_at = excluded.consent_at
  returning id into v_customer_id;

  if (select count(*) from public.bookings
      where customer_id = v_customer_id and source = 'online'
        and status = 'confirmed' and starts_at > now()) >= p_max_active_per_phone then
    raise exception 'limit_phone' using errcode = 'P0001';
  end if;
  if p_ip is not null and (select count(*) from public.bookings
      where created_ip = p_ip and source = 'online'
        and status = 'confirmed' and starts_at > now()) >= p_max_active_per_ip then
    raise exception 'limit_ip' using errcode = 'P0001';
  end if;

  v_ends_at := p_starts_at + make_interval(mins => p_duration_min);
  -- Брони одного ресурса создаются по очереди: при одновременной вставке
  -- EXCLUDE-ограничение может разрешить конфликт взаимоблокировкой, и гость
  -- получил бы непонятную ошибку вместо booking_overlap.
  perform public.lock_resource_bookings(p_resource_id);
  begin
    insert into public.bookings (
      venue_id, resource_id, customer_id, starts_at, ends_at, blocked_until,
      source, guests, comment, created_ip
    ) values (
      v_venue.id, p_resource_id, v_customer_id, p_starts_at, v_ends_at,
      v_ends_at + make_interval(mins => v_venue.buffer_min),
      'online', p_guests, nullif(trim(p_comment), ''), p_ip
    ) returning * into v_booking;
  exception when exclusion_violation then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end;

  return jsonb_build_object(
    'id', v_booking.id,
    'manage_token', v_booking.manage_token,
    'starts_at', v_booking.starts_at,
    'ends_at', v_booking.ends_at
  );
end;
$$;
