-- Тариф-пакет в брони: гость или администратор выбирает тариф («3 часа —
-- 4 000 ₸») вместо длительности. Минуты пакета — длительность брони, а при
-- «Пришёл» сеанс стартует с этим пакетом.

alter table public.bookings add column package_id uuid references public.packages (id);

drop function public.create_public_booking(uuid, timestamptz, int, text, text, int, text, inet, int, int);
drop function public.create_manual_booking(uuid, timestamptz, timestamptz, text, text, int, text, public.booking_source);
drop function public.get_day_bookings(uuid, date);

create function public.create_public_booking(
  p_resource_id uuid,
  p_starts_at timestamptz,
  p_duration_min int,
  p_phone text,
  p_name text,
  p_guests int default null,
  p_comment text default null,
  p_ip inet default null,
  p_max_active_per_phone int default 2,
  p_max_active_per_ip int default 5,
  p_package_id uuid default null
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
  -- Тариф-пакет: активный, этого заведения, подходит к ресурсу, а его
  -- минуты — это и есть длительность брони.
  if p_package_id is not null and not exists (
    select 1 from public.packages
    where id = p_package_id and venue_id = v_venue.id and is_active
      and v_resource.kind = any (resource_kinds) and minutes = p_duration_min
  ) then
    raise exception 'package_not_found' using errcode = 'P0002';
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
      where venue_id = v_venue.id and created_ip = p_ip and source = 'online'
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
      source, guests, comment, created_ip, package_id
    ) values (
      v_venue.id, p_resource_id, v_customer_id, p_starts_at, v_ends_at,
      v_ends_at + make_interval(mins => v_venue.buffer_min),
      'online', p_guests, nullif(trim(p_comment), ''), p_ip, p_package_id
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

create function public.create_manual_booking(
  p_resource_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_customer_phone text,
  p_customer_name text default null,
  p_guests int default null,
  p_comment text default null,
  p_source public.booking_source default 'phone',
  p_package_id uuid default null
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
  -- Тариф-пакет: его минуты — длительность брони.
  if p_package_id is not null and not exists (
    select 1 from public.packages
    where id = p_package_id and venue_id = v_resource.venue_id and is_active
      and v_resource.kind = any (resource_kinds)
      and minutes * interval '1 minute' = p_ends_at - p_starts_at
  ) then
    raise exception 'package_not_found' using errcode = 'P0002';
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
      source, guests, comment, created_by, package_id
    ) values (
      v_resource.venue_id, p_resource_id, v_customer_id, p_starts_at, p_ends_at, v_blocked_until,
      p_source, p_guests, nullif(trim(p_comment), ''), (select auth.uid()), p_package_id
    ) returning id into v_id;
  exception when exclusion_violation then
    raise exception 'booking_overlap' using errcode = 'P0001',
      detail = coalesce(public.booking_conflict(p_resource_id, p_starts_at, v_blocked_until), '{}')::text;
  end;
  return v_id;
end;
$$;

create or replace function public.arrive_booking(p_booking_id uuid, p_package_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_resource public.resources;
  v_session public.sessions;
  v_package_id uuid;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null or not public.is_venue_member(v_booking.venue_id) then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  if v_booking.status <> 'confirmed' then
    raise exception 'booking_not_confirmed' using errcode = 'P0001';
  end if;
  if v_booking.ends_at <= now() then
    raise exception 'booking_ended' using errcode = 'P0001';
  end if;
  select * into v_resource from public.resources where id = v_booking.resource_id;
  if not v_resource.is_active then
    raise exception 'resource_inactive' using errcode = 'P0001';
  end if;
  if p_package_id is not null and not exists (
    select 1 from public.packages
    where id = p_package_id and venue_id = v_booking.venue_id and is_active
      and v_resource.kind = any (resource_kinds)
  ) then
    raise exception 'package_not_found' using errcode = 'P0002';
  end if;
  -- Без явного пакета сеанс берёт тариф, выбранный при брони.
  v_package_id := coalesce(p_package_id, v_booking.package_id);

  insert into public.sessions (
    venue_id, booking_id, customer_id, package_id, expected_end_at, started_by
  ) values (
    v_booking.venue_id, v_booking.id, v_booking.customer_id, v_package_id,
    v_booking.ends_at, (select auth.uid())
  ) returning * into v_session;

  -- Стол занят другим сеансом — resource_busy, транзакция откатится целиком.
  perform public.open_segment(v_session, v_booking.resource_id, 'play', now());
  update public.bookings set status = 'arrived' where id = v_booking.id;
  return v_session.id;
end;
$$;

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
  created_at timestamptz,
  package_name text
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
    b.created_at,
    (select k.name from public.packages k where k.id = b.package_id)
  from public.bookings b
  join public.customers c on c.id = b.customer_id
  where b.venue_id = p_venue_id
    and b.starts_at < v_to and b.ends_at > v_from
  order by b.starts_at, b.resource_id;
end;
$$;

-- Публичный профиль отдаёт id тарифов: гость выбирает тариф при брони.
create or replace function public.get_public_venue(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', v.id,
    'type', v.type,
    'name', v.name,
    'slug', v.slug,
    'city', v.city,
    'address', v.address,
    'phone', v.phone,
    'description', v.description,
    'timezone', v.timezone,
    'working_hours', v.working_hours,
    'online_booking_enabled', v.online_booking_enabled,
    'slot_step_min', v.slot_step_min,
    'min_duration_min', v.min_duration_min,
    'min_lead_min', v.min_lead_min,
    'max_days_ahead', v.max_days_ahead,
    'no_show_after_min', v.no_show_after_min,
    'photos', coalesce((
      select jsonb_agg(p.storage_path order by p.sort, p.created_at)
      from public.venue_photos p where p.venue_id = v.id
    ), '[]'),
    'halls', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id, 'name', h.name, 'width', h.width, 'height', h.height,
        'resources', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', r.id, 'kind', r.kind, 'name', r.name, 'capacity', r.capacity,
            'x', r.x, 'y', r.y, 'w', r.w, 'h', r.h, 'rotation', r.rotation,
            'shape', r.shape, 'bookable_online', r.bookable_online
          ) order by r.name)
          from public.resources r where r.hall_id = h.id and r.is_active
        ), '[]'),
        'objects', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', o.id, 'kind', o.kind, 'label', o.label,
            'x', o.x, 'y', o.y, 'w', o.w, 'h', o.h, 'rotation', o.rotation
          ))
          from public.hall_objects o where o.hall_id = h.id
        ), '[]')
      ) order by h.sort, h.created_at)
      from public.halls h where h.venue_id = v.id
    ), '[]'),
    'tariffs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', t.name, 'resource_kinds', t.resource_kinds, 'price_per_hour', t.price_per_hour,
        'weekdays', t.weekdays, 'time_from', t.time_from, 'time_to', t.time_to
      ) order by t.price_per_hour, t.name)
      from public.tariffs t where t.venue_id = v.id and t.is_active
    ), '[]'),
    'packages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', k.id, 'name', k.name, 'resource_kinds', k.resource_kinds, 'minutes', k.minutes, 'price', k.price
      ) order by k.price, k.name)
      from public.packages k where k.venue_id = v.id and k.is_active
    ), '[]')
  )
  from public.venues v
  where v.slug = lower(p_slug) and v.is_published;
$$;

revoke execute on function
  public.create_public_booking(uuid, timestamptz, int, text, text, int, text, inet, int, int, uuid)
from public, anon, authenticated;
grant execute on function
  public.create_public_booking(uuid, timestamptz, int, text, text, int, text, inet, int, int, uuid)
to service_role;

revoke execute on function
  public.create_manual_booking(uuid, timestamptz, timestamptz, text, text, int, text, public.booking_source, uuid),
  public.get_day_bookings(uuid, date)
from public, anon;
grant execute on function
  public.create_manual_booking(uuid, timestamptz, timestamptz, text, text, int, text, public.booking_source, uuid),
  public.get_day_bookings(uuid, date)
to authenticated;
