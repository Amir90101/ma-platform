-- Этап 3.1: тарифы, пакеты и расчёт суммы за время игры.

-- tariffs -------------------------------------------------------------------

create table public.tariffs (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  resource_kinds public.resource_kind[] not null check (cardinality(resource_kinds) > 0),
  -- Тенге за час, целое число.
  price_per_hour int not null check (price_per_hour >= 0),
  -- 1 = понедельник … 7 = воскресенье. Для ночного тарифа — день начала интервала.
  weekdays int[] not null check (
    cardinality(weekdays) > 0 and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]
  ),
  time_from time not null,
  -- time_to <= time_from: интервал через полночь (равные — сутки).
  time_to time not null,
  priority int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index tariffs_venue_id_idx on public.tariffs (venue_id);

-- packages ------------------------------------------------------------------

create table public.packages (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  resource_kinds public.resource_kind[] not null check (cardinality(resource_kinds) > 0),
  minutes int not null check (minutes > 0),
  price int not null check (price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index packages_venue_id_idx on public.packages (venue_id);

-- RLS: читают участники, меняет владелец ------------------------------------

alter table public.tariffs enable row level security;
alter table public.packages enable row level security;

revoke all on public.tariffs, public.packages from anon;

create policy tariffs_select on public.tariffs
  for select to authenticated
  using ((select public.is_venue_member(venue_id)));
create policy tariffs_insert on public.tariffs
  for insert to authenticated
  with check ((select public.is_venue_owner(venue_id)));
create policy tariffs_update on public.tariffs
  for update to authenticated
  using ((select public.is_venue_owner(venue_id)))
  with check ((select public.is_venue_owner(venue_id)));
create policy tariffs_delete on public.tariffs
  for delete to authenticated
  using ((select public.is_venue_owner(venue_id)));

create policy packages_select on public.packages
  for select to authenticated
  using ((select public.is_venue_member(venue_id)));
create policy packages_insert on public.packages
  for insert to authenticated
  with check ((select public.is_venue_owner(venue_id)));
create policy packages_update on public.packages
  for update to authenticated
  using ((select public.is_venue_owner(venue_id)))
  with check ((select public.is_venue_owner(venue_id)));
create policy packages_delete on public.packages
  for delete to authenticated
  using ((select public.is_venue_owner(venue_id)));

-- Подходящий тариф ----------------------------------------------------------
-- Активный тариф заведения для вида ресурса в местный момент p_local.
-- Ночной тариф (time_to <= time_from) действует с time_from дня из weekdays
-- до time_to следующего дня. Из нескольких берётся с большим priority.

create function public.find_tariff(
  p_venue_id uuid,
  p_kind public.resource_kind,
  p_local timestamp
)
returns public.tariffs
language sql
stable
security invoker
set search_path = ''
as $$
  select t.*
  from public.tariffs t
  where t.venue_id = p_venue_id
    and t.is_active
    and p_kind = any (t.resource_kinds)
    and (
      (t.time_from < t.time_to
        and extract(isodow from p_local)::int = any (t.weekdays)
        and p_local::time >= t.time_from
        and p_local::time < t.time_to)
      or (t.time_to <= t.time_from
        and ((extract(isodow from p_local)::int = any (t.weekdays)
              and p_local::time >= t.time_from)
          or (extract(isodow from p_local - interval '1 day')::int = any (t.weekdays)
              and p_local::time < t.time_to)))
    )
  order by t.priority desc, t.created_at
  limit 1;
$$;

-- Сумма за время игры ---------------------------------------------------------
-- Единственное место, где считаются деньги за время (см. AGENTS.md и
-- «Как считает calc_session_amount» в docs/DATABASE.md). На этапе 4
-- calc_session_amount(session_id) передаст сюда отрезки сеанса.
--
-- p_segments: [{resource_id, kind: play|pause, started_at, ended_at|null}]
-- Открытый отрезок считается до p_at.
-- Результат: {amount, minutes, lines: [{tariff_id, name, price_per_hour,
--   minutes, amount}], package: {id, name, minutes, price, covered_minutes} | null}
-- Нет тарифа на оплачиваемое время — ошибка no_tariff.

create function public.calc_play_amount(
  p_venue_id uuid,
  p_segments jsonb,
  p_package_id uuid default null,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_tz text;
  v_rounding int;
  v_package public.packages;
  v_package_left numeric := 0;
  v_seg jsonb;
  v_kind public.resource_kind;
  v_start timestamp;
  v_end timestamp;
  v_bounds timestamp[];
  v_pieces jsonb := '[]';
  v_piece jsonb;
  v_actual numeric;
  v_extra numeric;
  v_minutes numeric;
  v_covered numeric;
  v_charged numeric;
  v_tariff public.tariffs;
  v_exact numeric := 0;
  v_total_minutes numeric := 0;
  v_lines jsonb := '{}';
  v_line jsonb;
  i int;
begin
  select timezone, rounding_min into v_tz, v_rounding
  from public.venues where id = p_venue_id;
  if v_tz is null then
    raise exception 'venue_not_found' using errcode = 'P0002';
  end if;

  if p_package_id is not null then
    select * into v_package from public.packages
    where id = p_package_id and venue_id = p_venue_id and is_active;
    if v_package.id is null then
      raise exception 'package_not_found' using errcode = 'P0002';
    end if;
    v_package_left := v_package.minutes;
  end if;

  -- 1. Отрезки игры по порядку, в местном времени, порезанные по границам тарифов.
  for v_seg in
    select s from jsonb_array_elements(p_segments) s
    where s ->> 'kind' = 'play'
    order by (s ->> 'started_at')::timestamptz
  loop
    v_start := (v_seg ->> 'started_at')::timestamptz at time zone v_tz;
    v_end := coalesce((v_seg ->> 'ended_at')::timestamptz, p_at) at time zone v_tz;
    continue when v_end <= v_start;

    select kind into v_kind from public.resources
    where id = (v_seg ->> 'resource_id')::uuid and venue_id = p_venue_id;
    if v_kind is null then
      raise exception 'resource_not_found' using errcode = 'P0002';
    end if;

    -- Границы: начала и концы тарифов этого вида и полночи на каждый день отрезка.
    select array_agg(b order by b) into v_bounds
    from (
      select distinct b from (
        select d::date + t.time_from as b
        from public.tariffs t,
             generate_series(v_start::date - 1, v_end::date, interval '1 day') d
        where t.venue_id = p_venue_id and t.is_active and v_kind = any (t.resource_kinds)
        union all
        select d::date + t.time_to
        from public.tariffs t,
             generate_series(v_start::date - 1, v_end::date, interval '1 day') d
        where t.venue_id = p_venue_id and t.is_active and v_kind = any (t.resource_kinds)
        union all
        select d::date::timestamp
        from generate_series(v_start::date, v_end::date + 1, interval '1 day') d
      ) all_bounds
      where b > v_start and b < v_end
    ) inner_bounds;
    v_bounds := array[v_start] || coalesce(v_bounds, '{}') || array[v_end];

    -- 6. Округление вверх до rounding_min; добавка идёт к последнему куску.
    v_actual := extract(epoch from v_end - v_start) / 60;
    v_extra := ceil(v_actual / v_rounding) * v_rounding - v_actual;

    for i in 1 .. array_length(v_bounds, 1) - 1 loop
      v_minutes := extract(epoch from v_bounds[i + 1] - v_bounds[i]) / 60;
      if i = array_length(v_bounds, 1) - 1 then
        v_minutes := v_minutes + v_extra;
      end if;
      v_pieces := v_pieces || jsonb_build_object(
        'kind', v_kind, 'at', v_bounds[i], 'minutes', v_minutes
      );
    end loop;
  end loop;

  -- 2–5, 7. Пакет покрывает первые минуты, остальное — по тарифам.
  for v_piece in select p from jsonb_array_elements(v_pieces) p loop
    v_minutes := (v_piece ->> 'minutes')::numeric;
    v_kind := (v_piece ->> 'kind')::public.resource_kind;
    v_total_minutes := v_total_minutes + v_minutes;

    v_covered := 0;
    if v_package_left > 0 and v_kind = any (v_package.resource_kinds) then
      v_covered := least(v_minutes, v_package_left);
      v_package_left := v_package_left - v_covered;
    end if;
    v_charged := v_minutes - v_covered;
    continue when v_charged <= 0;

    v_tariff := public.find_tariff(p_venue_id, v_kind, (v_piece ->> 'at')::timestamp);
    if v_tariff.id is null then
      raise exception 'no_tariff'
        using detail = format('resource_kind=%s local_time=%s', v_kind, v_piece ->> 'at'),
              hint = 'Задайте тариф на эти часы';
    end if;

    v_exact := v_exact + v_tariff.price_per_hour * v_charged / 60;
    v_line := coalesce(v_lines -> v_tariff.id::text, jsonb_build_object(
      'tariff_id', v_tariff.id, 'name', v_tariff.name,
      'price_per_hour', v_tariff.price_per_hour, 'minutes', 0, 'exact', 0
    ));
    v_lines := jsonb_set(v_lines, array[v_tariff.id::text], v_line || jsonb_build_object(
      'minutes', (v_line ->> 'minutes')::numeric + v_charged,
      'exact', (v_line ->> 'exact')::numeric + v_tariff.price_per_hour * v_charged / 60
    ));
  end loop;

  return jsonb_build_object(
    'amount', round(v_exact)::int + coalesce(v_package.price, 0),
    'minutes', round(v_total_minutes)::int,
    'lines', coalesce((
      select jsonb_agg(
        (l - 'exact') || jsonb_build_object(
          'minutes', round((l ->> 'minutes')::numeric)::int,
          'amount', round((l ->> 'exact')::numeric)::int
        )
      )
      from jsonb_each(v_lines) e(k, l)
    ), '[]'),
    'package', case when v_package.id is null then null else jsonb_build_object(
      'id', v_package.id, 'name', v_package.name, 'minutes', v_package.minutes,
      'price', v_package.price,
      'covered_minutes', round(v_package.minutes - v_package_left)::int
    ) end
  );
end;
$$;

revoke execute on function
  public.find_tariff(uuid, public.resource_kind, timestamp),
  public.calc_play_amount(uuid, jsonb, uuid, timestamptz)
from public, anon;
grant execute on function
  public.find_tariff(uuid, public.resource_kind, timestamp),
  public.calc_play_amount(uuid, jsonb, uuid, timestamptz)
to authenticated;
