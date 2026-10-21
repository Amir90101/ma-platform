-- Замер get_availability (проверка этапа 8.1): 30 ресурсов, 14 дней вперёд,
-- плотные брони. Всё в транзакции с откатом — база не меняется.
-- Запуск: docker exec -i supabase_db_<проект> psql -U postgres < supabase/bench/availability.sql
begin;
set local client_min_messages = notice;

insert into public.organizations (id, name, owner_id)
values ('99999999-0000-0000-0000-000000000001', 'Bench', '11111111-1111-1111-1111-111111111111');
insert into public.venues (id, org_id, type, name, slug, city, is_published, working_hours)
values ('99999999-1111-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001',
  'billiards', 'Bench', 'bench-venue', 'Алматы', true,
  (select jsonb_agg(jsonb_build_object('weekday', d, 'open', '10:00', 'close', '02:00'))
   from generate_series(1, 7) d));
insert into public.halls (id, venue_id, name)
values ('99999999-2222-0000-0000-000000000001', '99999999-1111-0000-0000-000000000001', 'Зал');
insert into public.resources (venue_id, hall_id, kind, name, x, y, w, h)
select '99999999-1111-0000-0000-000000000001', '99999999-2222-0000-0000-000000000001',
  'pool_table', 'Стол ' || i, 10 * i, 10, 100, 60
from generate_series(1, 30) i;
insert into public.customers (id, venue_id, phone, name)
values ('99999999-3333-0000-0000-000000000001', '99999999-1111-0000-0000-000000000001', '+77000000099', 'Bench');

-- Каждый день 15 дней: на каждом столе 4 брони по 2 часа с перерывами.
insert into public.bookings (venue_id, resource_id, customer_id, starts_at, ends_at, blocked_until, source)
select r.venue_id, r.id, '99999999-3333-0000-0000-000000000001', s, s + interval '2 hours',
  s + interval '2 hours', 'phone'
from public.resources r
cross join generate_series(0, 14) d
cross join unnest(array['12:00', '15:00', '18:00', '21:00']) t
cross join lateral (select (((now() at time zone 'Asia/Almaty')::date + d) + t::time)
  at time zone 'Asia/Almaty' as s) x
where r.venue_id = '99999999-1111-0000-0000-000000000001';

analyze public.bookings;

do $$
declare
  v_start timestamptz;
  v_ms numeric;
  v_max numeric := 0;
  v_total numeric := 0;
  v_rows int;
  v_today date := (now() at time zone 'Asia/Almaty')::date;
begin
  for d in 0..14 loop
    v_start := clock_timestamp();
    select count(*) into v_rows
    from public.get_availability('99999999-1111-0000-0000-000000000001', v_today + d, 60);
    v_ms := extract(epoch from clock_timestamp() - v_start) * 1000;
    v_max := greatest(v_max, v_ms);
    v_total := v_total + v_ms;
    raise notice 'день +%: % окон, % мс', d, v_rows, round(v_ms, 1);
  end loop;
  raise notice 'итого 15 вызовов: % мс, самый медленный: % мс', round(v_total, 1), round(v_max, 1);
end;
$$;

rollback;
