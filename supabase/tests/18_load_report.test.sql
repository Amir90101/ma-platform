-- Этап 7.2: загрузка, неявки и доля онлайн-броней на заранее известных
-- данных. Демо Бильярд: 10:00–02:00 каждый день, Asia/Almaty.
-- Период 1–2 сентября 2026: часы работы 2 × 16 ч = 1920 минут.
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

create function pg_temp.seg(p_session text, p_resource text, p_kind text, p_from text, p_to text)
returns void language sql as $$
  insert into public.session_segments (venue_id, session_id, resource_id, kind, started_at, ended_at)
  values ('aaaaaaaa-1111-0000-0000-000000000001', p_session::uuid,
    ('aaaaaaaa-3333-0000-0000-0000000000' || p_resource)::uuid, p_kind::public.segment_kind,
    (p_from || ' Asia/Almaty')::timestamptz, (p_to || ' Asia/Almaty')::timestamptz)
$$;

insert into public.sessions (id, venue_id, status, started_by, started_at) values
  ('ffffffff-1111-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'closed',
   '22222222-2222-2222-2222-222222222222', '2026-09-01 14:00 Asia/Almaty'),
  ('ffffffff-1111-0000-0000-000000000002', 'aaaaaaaa-1111-0000-0000-000000000001', 'closed',
   '22222222-2222-2222-2222-222222222222', '2026-09-02 01:00 Asia/Almaty'),
  ('ffffffff-1111-0000-0000-000000000003', 'aaaaaaaa-1111-0000-0000-000000000001', 'voided',
   '22222222-2222-2222-2222-222222222222', '2026-09-01 18:00 Asia/Almaty'),
  ('ffffffff-1111-0000-0000-000000000004', 'aaaaaaaa-1111-0000-0000-000000000001', 'closed',
   '22222222-2222-2222-2222-222222222222', '2026-09-02 10:00 Asia/Almaty');

-- Стол 1: игра 120 + пауза 30 + ночь 01:00–03:00, из которой в часы работы
-- 60 минут; аннулированный сеанс не считается. Итого 210 из 1920 = 10,9 %.
select pg_temp.seg('ffffffff-1111-0000-0000-000000000001', '01', 'play', '2026-09-01 14:00', '2026-09-01 16:00');
select pg_temp.seg('ffffffff-1111-0000-0000-000000000001', '01', 'pause', '2026-09-01 16:00', '2026-09-01 16:30');
select pg_temp.seg('ffffffff-1111-0000-0000-000000000003', '01', 'play', '2026-09-01 18:00', '2026-09-01 19:00');
select pg_temp.seg('ffffffff-1111-0000-0000-000000000002', '01', 'play', '2026-09-02 01:00', '2026-09-02 03:00');
-- Стол 2: 10:00–18:00 = 480 из 1920 = 25 %.
select pg_temp.seg('ffffffff-1111-0000-0000-000000000004', '02', 'play', '2026-09-02 10:00', '2026-09-02 18:00');

-- Брони: гость B дважды не пришёл в периоде и раз после него.
insert into public.customers (id, venue_id, phone, name) values
  ('cccccccc-2222-0000-0000-00000000000a', 'aaaaaaaa-1111-0000-0000-000000000001', '+77080000001', 'Айдос'),
  ('cccccccc-2222-0000-0000-00000000000b', 'aaaaaaaa-1111-0000-0000-000000000001', '+77080000002', 'Болат'),
  ('cccccccc-2222-0000-0000-00000000000c', 'aaaaaaaa-1111-0000-0000-000000000001', '+77080000003', 'Вера');
insert into public.bookings (venue_id, resource_id, customer_id, starts_at, ends_at, blocked_until, source, status, cancelled_at)
select 'aaaaaaaa-1111-0000-0000-000000000001', ('aaaaaaaa-3333-0000-0000-0000000000' || res)::uuid,
  cust::uuid, (st || ' Asia/Almaty')::timestamptz, (st || ' Asia/Almaty')::timestamptz + interval '1 hour',
  (st || ' Asia/Almaty')::timestamptz + interval '1 hour', src::public.booking_source,
  status::public.booking_status, case when status = 'cancelled' then now() end
from (values
  ('03', 'cccccccc-2222-0000-0000-00000000000a', '2026-09-01 12:00', 'online', 'completed'),
  ('04', 'cccccccc-2222-0000-0000-00000000000b', '2026-09-01 12:00', 'phone', 'no_show'),
  ('04', 'cccccccc-2222-0000-0000-00000000000b', '2026-09-02 12:00', 'online', 'no_show'),
  ('05', 'cccccccc-2222-0000-0000-00000000000c', '2026-09-02 12:00', 'online', 'cancelled'),
  ('04', 'cccccccc-2222-0000-0000-00000000000b', '2026-09-03 12:00', 'online', 'no_show')
) v (res, cust, st, src, status);

select pg_temp.login('11111111-1111-1111-1111-111111111111');
create temp table r as
select public.get_load_report('aaaaaaaa-1111-0000-0000-000000000001', '2026-09-01', '2026-09-02') as j;

select is((select (j ->> 'open_minutes')::int from r), 1920, 'часы работы за два дня — 1920 минут');
select is(
  (select jsonb_agg(x - 'resource_id') from r, jsonb_array_elements(j -> 'resources') x
   where (x ->> 'busy_minutes')::int > 0),
  '[{"name": "Стол 2", "busy_minutes": 480, "percent": 25.0},
    {"name": "Стол 1", "busy_minutes": 210, "percent": 10.9}]'::jsonb,
  'загрузка: пауза считается, ночь — до закрытия, аннулированный сеанс нет');
select is(
  (select count(*)::int from r, jsonb_array_elements(j -> 'resources') x where (x ->> 'percent')::numeric = 0),
  6, 'остальные столы — 0 %');
select is((select j -> 'bookings' from r),
  '{"total": 4, "online": 3, "online_share": 75.0, "no_show": 2, "online_no_show": 1}'::jsonb,
  'брони периода: доля онлайн и неявки');
select is((select j -> 'no_shows_by_day' from r),
  '[{"day": "2026-09-01", "count": 1}, {"day": "2026-09-02", "count": 1}]'::jsonb, 'неявки по дням');
select is((select j -> 'no_shows_by_guest' from r),
  '[{"name": "Болат", "phone": "+77080000002", "count": 2}]'::jsonb, 'неявки по гостям');

-- Сегодняшнее будущее время не считается часами работы.
select ok(
  (public.get_load_report('aaaaaaaa-1111-0000-0000-000000000001',
     (now() at time zone 'Asia/Almaty')::date + 1, (now() at time zone 'Asia/Almaty')::date + 1)
   ->> 'open_minutes')::int = 0,
  'у завтрашнего дня часов работы ещё нет');

select pg_temp.login('22222222-2222-2222-2222-222222222222');
select throws_ok(
  $$select public.get_load_report('aaaaaaaa-1111-0000-0000-000000000001', '2026-09-01', '2026-09-02')$$,
  'P0002', 'venue_not_found', 'администратор отчёт о загрузке не получает');

select * from finish();
rollback;
