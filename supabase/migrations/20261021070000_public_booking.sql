-- Этап 6.1: функции публичной страницы.
--
-- anon не читает таблицы напрямую. Публичная страница получает данные
-- только через эти функции (security definer), и они отдают лишь
-- безопасные поля: ни имён, ни телефонов гостей.

-- IP, с которого создана онлайн-бронь: для лимита активных броней на один IP.
alter table public.bookings add column created_ip inet;

-- Профиль опубликованного заведения ----------------------------------------
-- null — заведения нет или оно не опубликовано.

create function public.get_public_venue(p_slug text)
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
        'name', k.name, 'resource_kinds', k.resource_kinds, 'minutes', k.minutes, 'price', k.price
      ) order by k.price, k.name)
      from public.packages k where k.venue_id = v.id and k.is_active
    ), '[]')
  )
  from public.venues v
  where v.slug = lower(p_slug) and v.is_published;
$$;

-- Свободен ли ресурс для онлайн-брони на [p_from, p_blocked_until) -----------
-- Мешают активные брони с их буфером и открытые сеансы: сеанс с ожидаемым
-- окончанием занимает стол до него (или до сейчас, если гости засиделись)
-- плюс буфер, сеанс без окончания закрывает стол целиком.

create function public.online_slot_free(
  p_resource_id uuid,
  p_from timestamptz,
  p_blocked_until timestamptz,
  p_buffer_min int
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
      select 1 from public.bookings b
      where b.resource_id = p_resource_id
        and b.status in ('confirmed', 'arrived')
        and tstzrange(b.starts_at, b.blocked_until, '[)') && tstzrange(p_from, p_blocked_until, '[)')
    )
    and not exists (
      select 1 from public.session_segments g
      join public.sessions s on s.id = g.session_id
      where g.resource_id = p_resource_id and g.ended_at is null
        and (s.expected_end_at is null
             or greatest(s.expected_end_at, now()) + make_interval(mins => p_buffer_min) > p_from)
    );
$$;

revoke execute on function public.online_slot_free(uuid, timestamptz, timestamptz, int)
from public, anon, authenticated;

-- Свободные окна ---------------------------------------------------------------
-- Начала броней длительностью p_duration_min на рабочий день p_date: от
-- открытия с шагом slot_step_min, бронь целиком до закрытия (ночные часы —
-- до закрытия на следующие сутки). Не раньше чем через min_lead_min и не
-- дальше max_days_ahead дней. Только активные ресурсы с bookable_online.

create function public.get_availability(p_venue_id uuid, p_date date, p_duration_min int)
returns table (resource_id uuid, starts_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_venue public.venues;
  v_today date;
  v_open time;
  v_close time;
  v_from timestamptz;
  v_to timestamptz;
begin
  select * into v_venue from public.venues v
  where v.id = p_venue_id and v.is_published and v.online_booking_enabled;
  if v_venue.id is null then
    return;
  end if;
  if p_duration_min is null or p_duration_min < v_venue.min_duration_min
     or p_duration_min > 24 * 60 or p_duration_min % v_venue.slot_step_min <> 0 then
    raise exception 'duration_invalid' using errcode = 'P0001';
  end if;

  v_today := (now() at time zone v_venue.timezone)::date;
  if p_date is null or p_date < v_today or p_date > v_today + v_venue.max_days_ahead then
    return;
  end if;

  select (d ->> 'open')::time, (d ->> 'close')::time into v_open, v_close
  from jsonb_array_elements(v_venue.working_hours) d
  where (d ->> 'weekday')::int = extract(isodow from p_date)::int
  limit 1;
  if v_open is null then
    return;
  end if;
  v_from := (p_date + v_open) at time zone v_venue.timezone;
  v_to := ((case when v_close <= v_open then p_date + 1 else p_date end) + v_close)
    at time zone v_venue.timezone;

  return query
  select r.id, s.at
  from public.resources r
  cross join generate_series(
    v_from, v_to - make_interval(mins => p_duration_min), make_interval(mins => v_venue.slot_step_min)
  ) s (at)
  where r.venue_id = v_venue.id and r.is_active and r.bookable_online
    and s.at >= now() + make_interval(mins => v_venue.min_lead_min)
    and public.online_slot_free(
      r.id, s.at, s.at + make_interval(mins => p_duration_min + v_venue.buffer_min), v_venue.buffer_min)
  order by r.name, r.id, s.at;
end;
$$;

-- Онлайн-бронь -----------------------------------------------------------------
-- Вызывает только сервер (Route Handler) после Turnstile: время должно быть
-- одним из свободных окон, гость находится или создаётся по телефону, бронь
-- сразу confirmed. Лимиты активных онлайн-броней на телефон и IP передаёт
-- сервер из окружения. Двойную бронь при гонке отсекает bookings_no_overlap.

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

-- Бронь по ссылке /b/{token} -----------------------------------------------------
-- Неверный токен — null. Имени и телефона гостя в ответе нет.

create function public.get_booking_by_token(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'code', upper(left(replace(b.id::text, '-', ''), 8)),
    'status', b.status,
    'starts_at', b.starts_at,
    'ends_at', b.ends_at,
    'guests', b.guests,
    'cancelled_by_guest', b.cancelled_by_guest,
    'can_cancel', b.status = 'confirmed' and now() < b.starts_at,
    'resource_name', r.name,
    'venue', jsonb_build_object(
      'name', v.name, 'slug', v.slug, 'address', v.address, 'phone', v.phone,
      'timezone', v.timezone, 'no_show_after_min', v.no_show_after_min
    )
  )
  from public.bookings b
  join public.resources r on r.id = b.resource_id
  join public.venues v on v.id = b.venue_id
  where b.manage_token = p_token;
$$;

create function public.cancel_booking_by_token(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where manage_token = p_token for update;
  if v_booking.id is null then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  if v_booking.status <> 'confirmed' then
    raise exception 'booking_not_confirmed' using errcode = 'P0001';
  end if;
  if now() >= v_booking.starts_at then
    raise exception 'cancel_too_late' using errcode = 'P0001';
  end if;
  update public.bookings
  set status = 'cancelled', cancelled_at = now(), cancelled_by_guest = true
  where id = v_booking.id;
end;
$$;

revoke execute on function
  public.get_public_venue(text),
  public.get_availability(uuid, date, int),
  public.create_public_booking(uuid, timestamptz, int, text, text, int, text, inet, int, int),
  public.get_booking_by_token(text),
  public.cancel_booking_by_token(text)
from public, anon, authenticated;
grant execute on function
  public.get_public_venue(text),
  public.get_availability(uuid, date, int),
  public.get_booking_by_token(text),
  public.cancel_booking_by_token(text)
to anon, authenticated;
grant execute on function
  public.create_public_booking(uuid, timestamptz, int, text, text, int, text, inet, int, int)
to service_role;
