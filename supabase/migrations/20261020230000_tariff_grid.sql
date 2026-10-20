-- Этап 3.2: сетка недели для экрана тарифов. Какой тариф действует в каждые
-- полчаса недели для вида ресурса. Использует find_tariff, поэтому правила
-- выбора (ночные интервалы, priority, выключенные тарифы) те же, что в расчёте.

create function public.tariff_week_grid(p_venue_id uuid, p_kind public.resource_kind)
returns table (
  weekday int,
  minute int,
  tariff_id uuid,
  tariff_name text,
  price_per_hour int
)
language sql
stable
security invoker
set search_path = ''
as $$
  -- 2024-01-01 — понедельник: опорная неделя для местного времени.
  select
    d.weekday,
    m.minute,
    t.id,
    t.name,
    t.price_per_hour
  from generate_series(1, 7) d(weekday)
  cross join generate_series(0, 1410, 30) m(minute)
  left join lateral public.find_tariff(
    p_venue_id,
    p_kind,
    timestamp '2024-01-01' + (d.weekday - 1) * interval '1 day' + m.minute * interval '1 minute'
  ) t on true
  order by d.weekday, m.minute;
$$;

revoke execute on function public.tariff_week_grid(uuid, public.resource_kind) from public, anon;
grant execute on function public.tariff_week_grid(uuid, public.resource_kind) to authenticated;
