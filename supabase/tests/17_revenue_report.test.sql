-- Этап 7.1: выручка за период. Данные из seed.sql плюс сеансы и оплаты
-- прошлого месяца, вставленные напрямую.
--
-- Демо Бильярд (Asia/Almaty): owner 1111…, admin 2222…, столы aaaaaaaa-3333…01–03.
begin;
select * from no_plan();

create function pg_temp.login(p_user_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

-- Смены: A — 1 сентября 10:00 до 02:30 ночи, B — 2 сентября, C — 3 сентября.
insert into public.shifts (id, venue_id, opened_by, opened_at, opening_cash, closed_by, closed_at, closing_cash) values
  ('eeeeeeee-0000-0000-0000-00000000000a', 'aaaaaaaa-1111-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   '2026-09-01 10:00 Asia/Almaty', 0, '22222222-2222-2222-2222-222222222222', '2026-09-02 02:30 Asia/Almaty', 0),
  ('eeeeeeee-0000-0000-0000-00000000000b', 'aaaaaaaa-1111-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   '2026-09-02 12:00 Asia/Almaty', 0, '22222222-2222-2222-2222-222222222222', '2026-09-02 23:00 Asia/Almaty', 0),
  ('eeeeeeee-0000-0000-0000-00000000000c', 'aaaaaaaa-1111-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   '2026-09-03 12:00 Asia/Almaty', 0, '22222222-2222-2222-2222-222222222222', '2026-09-03 23:00 Asia/Almaty', 0);

insert into public.sessions (id, venue_id, status, started_by, started_at, closed_at) values
  ('ffffffff-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'closed',
   '22222222-2222-2222-2222-222222222222', '2026-09-01 14:00 Asia/Almaty', '2026-09-01 16:00 Asia/Almaty'),
  ('ffffffff-0000-0000-0000-000000000002', 'aaaaaaaa-1111-0000-0000-000000000001', 'closed',
   '22222222-2222-2222-2222-222222222222', '2026-09-01 20:00 Asia/Almaty', '2026-09-01 22:00 Asia/Almaty'),
  ('ffffffff-0000-0000-0000-000000000003', 'aaaaaaaa-1111-0000-0000-000000000001', 'closed',
   '22222222-2222-2222-2222-222222222222', '2026-09-02 15:00 Asia/Almaty', '2026-09-02 16:00 Asia/Almaty'),
  ('ffffffff-0000-0000-0000-000000000004', 'aaaaaaaa-1111-0000-0000-000000000001', 'closed',
   '22222222-2222-2222-2222-222222222222', '2026-09-03 15:00 Asia/Almaty', '2026-09-03 16:00 Asia/Almaty');

-- S2 перенесли: 30 минут на Столе 2, 90 минут на Столе 3 — основной Стол 3.
insert into public.session_segments (venue_id, session_id, resource_id, kind, started_at, ended_at) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001', 'aaaaaaaa-3333-0000-0000-000000000001',
   'play', '2026-09-01 14:00 Asia/Almaty', '2026-09-01 16:00 Asia/Almaty'),
  ('aaaaaaaa-1111-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000002', 'aaaaaaaa-3333-0000-0000-000000000002',
   'play', '2026-09-01 20:00 Asia/Almaty', '2026-09-01 20:30 Asia/Almaty'),
  ('aaaaaaaa-1111-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000002', 'aaaaaaaa-3333-0000-0000-000000000003',
   'play', '2026-09-01 20:30 Asia/Almaty', '2026-09-01 22:00 Asia/Almaty'),
  ('aaaaaaaa-1111-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000003', 'aaaaaaaa-3333-0000-0000-000000000001',
   'play', '2026-09-02 15:00 Asia/Almaty', '2026-09-02 16:00 Asia/Almaty'),
  ('aaaaaaaa-1111-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000004', 'aaaaaaaa-3333-0000-0000-000000000001',
   'play', '2026-09-03 15:00 Asia/Almaty', '2026-09-03 16:00 Asia/Almaty');

insert into public.payments (venue_id, shift_id, session_id, amount, method, created_by, created_at, voided_at, voided_by, void_reason) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-00000000000a', 'ffffffff-0000-0000-0000-000000000001',
   3000, 'cash', '22222222-2222-2222-2222-222222222222', '2026-09-01 16:00 Asia/Almaty', null, null, null),
  ('aaaaaaaa-1111-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-00000000000a', 'ffffffff-0000-0000-0000-000000000001',
   2000, 'kaspi', '22222222-2222-2222-2222-222222222222', '2026-09-01 16:00 Asia/Almaty', null, null, null),
  -- Оплата в 01:30 ночи — в смене A, значит в рабочем дне 1 сентября.
  ('aaaaaaaa-1111-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-00000000000a', 'ffffffff-0000-0000-0000-000000000002',
   4000, 'card', '22222222-2222-2222-2222-222222222222', '2026-09-02 01:30 Asia/Almaty', null, null, null),
  ('aaaaaaaa-1111-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-00000000000b', 'ffffffff-0000-0000-0000-000000000003',
   1500, 'cash', '22222222-2222-2222-2222-222222222222', '2026-09-02 16:00 Asia/Almaty', null, null, null),
  ('aaaaaaaa-1111-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-00000000000b', 'ffffffff-0000-0000-0000-000000000003',
   999, 'cash', '22222222-2222-2222-2222-222222222222', '2026-09-02 16:00 Asia/Almaty',
   '2026-09-02 16:05 Asia/Almaty', '22222222-2222-2222-2222-222222222222', 'Ошибка'),
  ('aaaaaaaa-1111-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-00000000000c', 'ffffffff-0000-0000-0000-000000000004',
   7000, 'cash', '22222222-2222-2222-2222-222222222222', '2026-09-03 16:00 Asia/Almaty', null, null, null);

select pg_temp.login('11111111-1111-1111-1111-111111111111');
create temp table r as
select public.get_revenue_report('aaaaaaaa-1111-0000-0000-000000000001', '2026-09-01', '2026-09-02') as j;

select is((select (j ->> 'total')::int from r), 10500, 'итог за период без отменённых оплат и чужих дней');
select is((select j -> 'by_method' from r),
  '{"cash": 4500, "kaspi": 2000, "card": 4000}'::jsonb, 'по способам оплаты');
select is((select j -> 'by_day' from r),
  '[{"day": "2026-09-01", "total": 9000, "cash": 3000, "kaspi": 2000, "card": 4000},
    {"day": "2026-09-02", "total": 1500, "cash": 1500, "kaspi": 0, "card": 0}]'::jsonb,
  'по дням: ночная оплата в рабочем дне своей смены');
select is((select jsonb_agg(x - 'resource_id') from r, jsonb_array_elements(j -> 'by_resource') x),
  '[{"name": "Стол 1", "total": 6500, "sessions": 2}, {"name": "Стол 3", "total": 4000, "sessions": 1}]'::jsonb,
  'по столам: перенесённый сеанс — на основном столе');

-- Проверка этапа: выручка за день = сумма закрытых смен, открытых в этот день.
reset role;
select is(
  (select jsonb_object_agg(d ->> 'day', (d ->> 'total')::int) from r, jsonb_array_elements(j -> 'by_day') d),
  (select jsonb_object_agg(day, total) from (
     select (sh.opened_at at time zone 'Asia/Almaty')::date::text as day, sum(p.amount)::int as total
     from public.shifts sh join public.payments p on p.shift_id = sh.id and p.voided_at is null
     where sh.venue_id = 'aaaaaaaa-1111-0000-0000-000000000001' and sh.closed_at is not null
       and (sh.opened_at at time zone 'Asia/Almaty')::date between '2026-09-01' and '2026-09-02'
     group by 1) s),
  'выручка каждого дня совпадает с суммой закрытых смен этого дня');

select pg_temp.login('11111111-1111-1111-1111-111111111111');
select is((public.get_revenue_report('aaaaaaaa-1111-0000-0000-000000000001', '2026-09-05', '2026-09-05') ->> 'total')::int,
  0, 'день без оплат — ноль');
select throws_ok(
  $$select public.get_revenue_report('aaaaaaaa-1111-0000-0000-000000000001', '2026-09-02', '2026-09-01')$$,
  'P0001', 'period_invalid', 'конец раньше начала отклоняется');
select throws_ok(
  $$select public.get_revenue_report('aaaaaaaa-1111-0000-0000-000000000001', '2025-01-01', '2026-09-01')$$,
  'P0001', 'period_invalid', 'период больше года отклоняется');

select pg_temp.login('22222222-2222-2222-2222-222222222222');
select throws_ok(
  $$select public.get_revenue_report('aaaaaaaa-1111-0000-0000-000000000001', '2026-09-01', '2026-09-02')$$,
  'P0002', 'venue_not_found', 'администратор отчёт о выручке не получает');
select pg_temp.login('33333333-3333-3333-3333-333333333333');
select throws_ok(
  $$select public.get_revenue_report('aaaaaaaa-1111-0000-0000-000000000001', '2026-09-01', '2026-09-02')$$,
  'P0002', 'venue_not_found', 'и владелец другого заведения тоже');

select * from finish();
rollback;
