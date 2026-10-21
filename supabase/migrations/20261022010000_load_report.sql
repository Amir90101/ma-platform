-- Этап 7.2: загрузка ресурсов, неявки и доля онлайн-броней за период.
--
-- Загрузка = время, когда ресурс был занят сеансом (игра и пауза, кроме
-- аннулированных сеансов), внутри часов работы / часы работы за период.
-- Часы работы — рабочие дни периода (ночные часы до закрытия относятся к
-- своему дню), будущее время не считается. Брони относятся к местной дате
-- начала.

create function public.get_load_report(p_venue_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_venue public.venues;
begin
  if not public.is_venue_owner(p_venue_id) then
    raise exception 'venue_not_found' using errcode = 'P0002';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'period_invalid' using errcode = 'P0001';
  end if;
  select * into v_venue from public.venues where id = p_venue_id;

  return (
    with open_hours as (
      -- Интервалы работы каждого дня периода, обрезанные текущим моментом.
      select tstzrange(
          (d::date + (h ->> 'open')::time) at time zone v_venue.timezone,
          least(
            ((case when (h ->> 'close')::time <= (h ->> 'open')::time
                   then d::date + 1 else d::date end) + (h ->> 'close')::time)
              at time zone v_venue.timezone,
            now()),
          '[)') as r
      from generate_series(p_from, p_to, interval '1 day') d
      join jsonb_array_elements(v_venue.working_hours) h
        on (h ->> 'weekday')::int = extract(isodow from d)::int
      where (d::date + (h ->> 'open')::time) at time zone v_venue.timezone < now()
    ),
    open_total as (
      select coalesce(sum(extract(epoch from upper(r) - lower(r))), 0) / 60 as minutes
      from open_hours where not isempty(r)
    ),
    busy as (
      select g.resource_id,
        sum(extract(epoch from upper(o.r * tstzrange(g.started_at, coalesce(g.ended_at, now()), '[)'))
                           - lower(o.r * tstzrange(g.started_at, coalesce(g.ended_at, now()), '[)')))) / 60
          as minutes
      from public.session_segments g
      join public.sessions s on s.id = g.session_id and s.status <> 'voided'
      join open_hours o on o.r && tstzrange(g.started_at, coalesce(g.ended_at, now()), '[)')
      where g.venue_id = p_venue_id
      group by g.resource_id
    ),
    bookings as (
      select b.*, (b.starts_at at time zone v_venue.timezone)::date as day
      from public.bookings b
      where b.venue_id = p_venue_id
        and (b.starts_at at time zone v_venue.timezone)::date between p_from and p_to
    )
    select jsonb_build_object(
      'open_minutes', (select round(minutes)::int from open_total),
      'resources', coalesce((
        select jsonb_agg(jsonb_build_object(
          'resource_id', r.id,
          'name', r.name,
          'busy_minutes', round(coalesce(b.minutes, 0))::int,
          'percent', case when ot.minutes > 0
            then round((coalesce(b.minutes, 0) * 100 / ot.minutes)::numeric, 1) end
        ) order by coalesce(b.minutes, 0) desc, r.name)
        from public.resources r
        cross join open_total ot
        left join busy b on b.resource_id = r.id
        where r.venue_id = p_venue_id and (r.is_active or b.minutes > 0)
      ), '[]'),
      'bookings', (
        select jsonb_build_object(
          'total', count(*),
          'online', count(*) filter (where source = 'online'),
          'online_share', case when count(*) > 0
            then round(count(*) filter (where source = 'online') * 100.0 / count(*), 1) end,
          'no_show', count(*) filter (where status = 'no_show'),
          'online_no_show', count(*) filter (where status = 'no_show' and source = 'online')
        )
        from bookings
      ),
      'no_shows_by_day', coalesce((
        select jsonb_agg(jsonb_build_object('day', day, 'count', n) order by day)
        from (select day, count(*)::int as n from bookings
              where status = 'no_show' group by day) x
      ), '[]'),
      'no_shows_by_guest', coalesce((
        select jsonb_agg(jsonb_build_object('name', name, 'phone', phone, 'count', n)
                         order by n desc, name)
        from (
          select c.name, c.phone, count(*)::int as n
          from bookings b join public.customers c on c.id = b.customer_id
          where b.status = 'no_show'
          group by c.id, c.name, c.phone
          order by n desc, c.name
          limit 20
        ) x
      ), '[]')
    )
  );
end;
$$;

revoke execute on function public.get_load_report(uuid, date, date) from public, anon;
grant execute on function public.get_load_report(uuid, date, date) to authenticated;
