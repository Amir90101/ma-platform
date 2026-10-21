-- Этап 7.1: выручка за период для владельца.
--
-- Выручка — неотменённые оплаты. День — рабочий день смены: местная дата
-- открытия смены. Так оплаты после полуночи остаются в своём рабочем дне,
-- и выручка за день равна сумме смен, открытых в этот день.
-- По ресурсам оплата сеанса относится к ресурсу, где сеанс шёл дольше всего
-- (при переносе — основной стол), при равенстве — к первому.

create function public.get_revenue_report(p_venue_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
begin
  if not public.is_venue_owner(p_venue_id) then
    raise exception 'venue_not_found' using errcode = 'P0002';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'period_invalid' using errcode = 'P0001';
  end if;
  select timezone into v_tz from public.venues where id = p_venue_id;

  return (
    with pay as (
      select p.amount, p.method, p.session_id,
        (sh.opened_at at time zone v_tz)::date as day
      from public.payments p
      join public.shifts sh on sh.id = p.shift_id
      where p.venue_id = p_venue_id and p.voided_at is null
        and (sh.opened_at at time zone v_tz)::date between p_from and p_to
    ),
    main_resource as (
      select distinct on (x.session_id) x.session_id, x.resource_id
      from (
        select g.session_id, g.resource_id,
          sum(coalesce(g.ended_at, now()) - g.started_at) as spent,
          min(g.started_at) as first_at
        from public.session_segments g
        where g.session_id in (select session_id from pay)
        group by g.session_id, g.resource_id
      ) x
      order by x.session_id, x.spent desc, x.first_at
    ),
    days as (
      select d::date as day,
        coalesce(sum(pay.amount), 0)::int as total,
        coalesce(sum(pay.amount) filter (where pay.method = 'cash'), 0)::int as cash,
        coalesce(sum(pay.amount) filter (where pay.method = 'kaspi'), 0)::int as kaspi,
        coalesce(sum(pay.amount) filter (where pay.method = 'card'), 0)::int as card
      from generate_series(p_from, p_to, interval '1 day') d
      left join pay on pay.day = d::date
      group by d
    ),
    resources as (
      select r.id, r.name, sum(pay.amount)::int as total,
        count(distinct pay.session_id)::int as sessions
      from pay
      join main_resource m on m.session_id = pay.session_id
      join public.resources r on r.id = m.resource_id
      group by r.id, r.name
    )
    select jsonb_build_object(
      'total', coalesce((select sum(amount) from pay), 0)::int,
      'by_method', jsonb_build_object(
        'cash', coalesce((select sum(amount) from pay where method = 'cash'), 0)::int,
        'kaspi', coalesce((select sum(amount) from pay where method = 'kaspi'), 0)::int,
        'card', coalesce((select sum(amount) from pay where method = 'card'), 0)::int
      ),
      'by_day', (select jsonb_agg(to_jsonb(days) order by day) from days),
      'by_resource', coalesce((
        select jsonb_agg(jsonb_build_object(
          'resource_id', id, 'name', name, 'total', total, 'sessions', sessions
        ) order by total desc, name)
        from resources
      ), '[]')
    )
  );
end;
$$;

revoke execute on function public.get_revenue_report(uuid, date, date) from public, anon;
grant execute on function public.get_revenue_report(uuid, date, date) to authenticated;
