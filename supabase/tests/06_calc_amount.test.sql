-- Этап 3.1: расчёт суммы, раздел «Расчёт суммы» в docs/TESTING.md.
-- Тарифы Демо Бильярда из seed: «Будни день» 1 500 ₸/ч пн–пт 10–18,
-- «Вечер» 2 500 ₸/ч пн–пт 18–02, «Выходные» 3 000 ₸/ч сб–вс 10–02.
-- 2026-10-19 — понедельник, 2026-10-23 — пятница.
begin;
select * from no_plan();

create function pg_temp.login(p_user_id uuid) returns void
language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';
end;
$$;

-- Отрезок по местному времени Алматы.
create function pg_temp.seg(p_resource uuid, p_kind text, p_from text, p_to text)
returns jsonb language sql as $$
  select jsonb_build_object(
    'resource_id', p_resource, 'kind', p_kind,
    'started_at', p_from::timestamp at time zone 'Asia/Almaty',
    'ended_at', p_to::timestamp at time zone 'Asia/Almaty'
  );
$$;

-- Сумма для отрезков на демо-заведении.
create function pg_temp.amount(p_segments jsonb, p_package uuid default null)
returns int language sql as $$
  select (public.calc_play_amount(
    'aaaaaaaa-1111-0000-0000-000000000001', p_segments, p_package
  ) ->> 'amount')::int;
$$;

grant execute on all functions in schema pg_temp to authenticated;

-- Стол 1 (пул) и Русский 1 из seed.
\set pool '''aaaaaaaa-3333-0000-0000-000000000001'''
\set russian '''aaaaaaaa-3333-0000-0000-000000000007'''

select pg_temp.login('22222222-2222-2222-2222-222222222222');

select is(
  pg_temp.amount(jsonb_build_array(pg_temp.seg(:pool, 'play', '2026-10-19 10:00', '2026-10-19 11:00'))),
  1500, '1. 1 час днём в будни = 1 500 ₸');

select is(
  pg_temp.amount(jsonb_build_array(pg_temp.seg(:pool, 'play', '2026-10-19 17:00', '2026-10-19 20:00'))),
  6500, '2. 17:00–20:00 в будни = 1 500 + 2 × 2 500 = 6 500 ₸');

select is(
  pg_temp.amount(jsonb_build_array(pg_temp.seg(:pool, 'play', '2026-10-23 23:00', '2026-10-24 01:00'))),
  5000, '3. пятница 23:00 — суббота 01:00 = 2 × 2 500 = 5 000 ₸, тариф пятницы');

select is(
  pg_temp.amount(jsonb_build_array(pg_temp.seg(:pool, 'play', '2026-10-19 10:00', '2026-10-19 10:40'))),
  1000, '4. 40 минут днём = 1 000 ₸');

select is(
  pg_temp.amount(jsonb_build_array(
    pg_temp.seg(:pool, 'play', '2026-10-19 10:00', '2026-10-19 10:30'),
    pg_temp.seg(:pool, 'pause', '2026-10-19 10:30', '2026-10-19 11:00'),
    pg_temp.seg(:pool, 'play', '2026-10-19 11:00', '2026-10-19 11:30'))),
  1500, '5. пауза 30 минут посреди часа игры не оплачивается');

select throws_ok(
  $$select pg_temp.amount(jsonb_build_array(pg_temp.seg(
    'aaaaaaaa-3333-0000-0000-000000000001', 'play', '2026-10-19 03:00', '2026-10-19 04:00')))$$,
  'P0001', 'no_tariff',
  '7. время вне всех тарифов — ошибка no_tariff, а не 0 ₸');

select is(
  pg_temp.amount(
    jsonb_build_array(pg_temp.seg(:pool, 'play', '2026-10-19 10:00', '2026-10-19 13:30')),
    'aaaaaaaa-5555-0000-0000-000000000001'),
  5750, '9. пакет «3 часа за 5 000 ₸», 3,5 часа днём = 5 000 + 750 = 5 750 ₸');

select results_eq(
  $$select jsonb_path_query_first(public.calc_play_amount(
      'aaaaaaaa-1111-0000-0000-000000000001',
      jsonb_build_array(pg_temp.seg('aaaaaaaa-3333-0000-0000-000000000001', 'play',
        '2026-10-19 17:00', '2026-10-19 20:00'))),
      '$.lines.size()')::int$$,
  array[2],
  'в чеке две строки: «Будни день» и «Вечер»');

select is(
  public.calc_play_amount(
    'aaaaaaaa-1111-0000-0000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'resource_id', 'aaaaaaaa-3333-0000-0000-000000000001', 'kind', 'play',
      'started_at', '2026-10-19 10:00'::timestamp at time zone 'Asia/Almaty',
      'ended_at', null)),
    null,
    '2026-10-19 10:30'::timestamp at time zone 'Asia/Almaty') ->> 'amount',
  '750', 'открытый отрезок считается до момента at');
reset role;

-- 12. Часовой пояс сервера не важен ------------------------------------------

set local timezone = 'America/New_York';
select pg_temp.login('22222222-2222-2222-2222-222222222222');
select is(
  pg_temp.amount(jsonb_build_array(jsonb_build_object(
    'resource_id', 'aaaaaaaa-3333-0000-0000-000000000001', 'kind', 'play',
    'started_at', '2026-10-19T05:00:00Z', 'ended_at', '2026-10-19T06:00:00Z'))),
  1500, '12. время в UTC переводится в часовой пояс заведения, а не сервера');
reset role;
set local timezone = 'UTC';

-- Изменения тарифов делает владелец ------------------------------------------

select pg_temp.login('11111111-1111-1111-1111-111111111111');

-- 6. Перенос: у русского стола свой дневной тариф.
insert into public.tariffs (venue_id, name, resource_kinds, price_per_hour, weekdays, time_from, time_to, priority)
values ('aaaaaaaa-1111-0000-0000-000000000001', 'Русский день', '{russian_table}', 2000,
        '{1,2,3,4,5}', '10:00', '18:00', 10);
select is(
  pg_temp.amount(jsonb_build_array(
    pg_temp.seg(:pool, 'play', '2026-10-19 10:00', '2026-10-19 11:00'),
    pg_temp.seg(:russian, 'play', '2026-10-19 11:00', '2026-10-19 12:00'))),
  3500, '6. перенос с пула на русский: каждый отрезок по тарифу своего стола');

-- 8. Два подходящих тарифа — с большим priority.
insert into public.tariffs (venue_id, name, resource_kinds, price_per_hour, weekdays, time_from, time_to, priority)
values ('aaaaaaaa-1111-0000-0000-000000000001', 'Акция', '{pool_table}', 1000,
        '{1,2,3,4,5}', '10:00', '18:00', 5);
select is(
  pg_temp.amount(jsonb_build_array(pg_temp.seg(:pool, 'play', '2026-10-19 10:00', '2026-10-19 11:00'))),
  1000, '8. два подходящих тарифа — берётся с большим priority');
delete from public.tariffs where name = 'Акция';

-- 10. Округление до 15 минут.
update public.venues set rounding_min = 15 where id = 'aaaaaaaa-1111-0000-0000-000000000001';
select is(
  pg_temp.amount(jsonb_build_array(pg_temp.seg(:pool, 'play', '2026-10-19 10:00', '2026-10-19 11:01'))),
  1875, '10. округление до 15 минут: 61 минута днём = 75 минут = 1 875 ₸');
update public.venues set rounding_min = 1 where id = 'aaaaaaaa-1111-0000-0000-000000000001';

-- 11. Выключенный тариф не применяется.
update public.tariffs set is_active = false where name = 'Будни день';
select throws_ok(
  $$select pg_temp.amount(jsonb_build_array(pg_temp.seg(
    'aaaaaaaa-3333-0000-0000-000000000001', 'play', '2026-10-19 10:00', '2026-10-19 11:00')))$$,
  'P0001', 'no_tariff',
  '11. выключенный тариф не применяется');
update public.tariffs set is_active = true where name = 'Будни день';
reset role;

-- Права -----------------------------------------------------------------------

select pg_temp.login('22222222-2222-2222-2222-222222222222');
select throws_ok(
  $$insert into public.tariffs (venue_id, name, resource_kinds, price_per_hour, weekdays, time_from, time_to)
    values ('aaaaaaaa-1111-0000-0000-000000000001', 'Админ', '{pool_table}', 1, '{1}', '10:00', '11:00')$$,
  '42501', null, 'администратор не создаёт тарифы');
select is_empty(
  $$update public.tariffs set price_per_hour = 1 returning id$$,
  'администратор не меняет тарифы');
select is_empty(
  $$update public.packages set price = 1 returning id$$,
  'администратор не меняет пакеты');
reset role;

select pg_temp.login('33333333-3333-3333-3333-333333333333');
select is_empty($$select 1 from public.tariffs$$, 'чужой владелец не видит тарифы Демо Бильярда');
select throws_ok(
  $$select public.calc_play_amount('aaaaaaaa-1111-0000-0000-000000000001', '[]')$$,
  'P0002', 'venue_not_found',
  'чужой владелец не считает суммы чужого заведения');
reset role;

set local role anon;
select throws_ok('select * from public.tariffs', '42501', null, 'anon не читает tariffs');
select throws_ok('select * from public.packages', '42501', null, 'anon не читает packages');
reset role;

select throws_ok(
  $$insert into public.tariffs (venue_id, name, resource_kinds, price_per_hour, weekdays, time_from, time_to)
    values ('aaaaaaaa-1111-0000-0000-000000000001', 'Плохой', '{pool_table}', 100, '{0,8}', '10:00', '11:00')$$,
  '23514', null, 'дни недели только 1–7');

select * from finish();
rollback;
