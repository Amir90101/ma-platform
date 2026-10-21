-- Этап 5.3: «Пришёл» превращает бронь в сеанс. Данные из seed.sql.
--
-- Демо Бильярд: admin 2222…, owner 1111…, заведение aaaaaaaa-1111…,
-- столы aaaaaaaa-3333…01–08. Чужой владелец 3333….
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

-- Круглосуточный тариф: закрытие сеанса не упирается в no_tariff.
insert into public.tariffs (venue_id, name, resource_kinds, price_per_hour, weekdays, time_from, time_to, priority)
values ('aaaaaaaa-1111-0000-0000-000000000001', 'Тест сутки',
        '{pool_table,russian_table}', 1200, '{1,2,3,4,5,6,7}', '00:00', '00:00', 100);

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon;

select pg_temp.login('22222222-2222-2222-2222-222222222222');

-- Бронь началась 5 минут назад, гость пришёл.
insert into ids select 'b1', public.create_manual_booking(
  'aaaaaaaa-3333-0000-0000-000000000001', now() - interval '5 minutes', now() + interval '115 minutes',
  '+77020000001', 'Айгерим');
insert into ids select 's1', public.arrive_booking((select id from ids where name = 'b1'));

select results_eq(
  $$select b.status::text, s.status::text, s.expected_end_at = b.ends_at, s.customer_id = b.customer_id
    from public.bookings b join public.sessions s on s.booking_id = b.id
    where b.id = (select id from ids where name = 'b1')$$,
  $$values ('arrived', 'active', true, true)$$,
  '«Пришёл»: бронь arrived, сеанс с ожидаемым окончанием и гостем из брони');
select results_eq(
  $$select resource_id::text, kind::text, ended_at is null from public.session_segments
    where session_id = (select id from ids where name = 's1')$$,
  $$values ('aaaaaaaa-3333-0000-0000-000000000001', 'play', true)$$,
  'сеанс идёт на столе брони');
select throws_ok(
  format($$select public.arrive_booking(%L)$$, (select id from ids where name = 'b1')),
  'P0001', 'booking_not_confirmed', 'второй раз «Пришёл» не срабатывает');

-- Занятый стол: бронь не трогаем, сеанс не создаём.
insert into ids select 'busy', public.start_session('aaaaaaaa-3333-0000-0000-000000000002');
insert into ids select 'b2', public.create_manual_booking(
  'aaaaaaaa-3333-0000-0000-000000000002', now() + interval '30 minutes', now() + interval '90 minutes',
  '+77020000002');
select throws_ok(
  format($$select public.arrive_booking(%L)$$, (select id from ids where name = 'b2')),
  'P0001', 'resource_busy', 'стол занят другим сеансом — отказ');
select results_eq(
  $$select status::text from public.bookings where id = (select id from ids where name = 'b2')$$,
  array['confirmed'], 'бронь остаётся confirmed');
select is(
  (select count(*)::int from public.sessions where booking_id = (select id from ids where name = 'b2')),
  0, 'сеанс по брони не создан');

-- Отменённую бронь нельзя превратить в сеанс.
select public.set_booking_status((select id from ids where name = 'b2'), 'cancelled', 'Не дозвонились');
select throws_ok(
  format($$select public.arrive_booking(%L)$$, (select id from ids where name = 'b2')),
  'P0001', 'booking_not_confirmed', 'отменённая бронь не становится сеансом');

-- Закончившаяся бронь (ещё не отмеченная неявкой).
reset role;
with ended as (
  insert into public.bookings (venue_id, resource_id, customer_id, starts_at, ends_at, blocked_until, source)
  select 'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-3333-0000-0000-000000000003', customer_id,
    now() - interval '2 hours', now() - interval '1 minute', now() - interval '1 minute', 'phone'
  from public.bookings where id = (select id from ids where name = 'b1')
  returning id
)
insert into ids select 'ended', id from ended;
select pg_temp.login('22222222-2222-2222-2222-222222222222');
select throws_ok(
  format($$select public.arrive_booking(%L)$$, (select id from ids where name = 'ended')),
  'P0001', 'booking_ended', 'бронь, время которой прошло, не становится сеансом');

-- Пакет из брони проверяется так же, как при обычном старте.
insert into ids select 'b3', public.create_manual_booking(
  'aaaaaaaa-3333-0000-0000-000000000004', now() + interval '10 minutes', now() + interval '3 hours',
  '+77020000003');
select throws_ok(
  format($$select public.arrive_booking(%L, gen_random_uuid())$$, (select id from ids where name = 'b3')),
  'P0002', 'package_not_found', 'чужой пакет отклоняется');
select lives_ok(
  format($$select public.arrive_booking(%L, 'aaaaaaaa-5555-0000-0000-000000000001')$$,
    (select id from ids where name = 'b3')),
  'гость пришёл раньше брони и взял пакет');
select is(
  (select package_id from public.sessions where booking_id = (select id from ids where name = 'b3')),
  'aaaaaaaa-5555-0000-0000-000000000001'::uuid, 'пакет записан в сеанс');

-- Закрытие и аннулирование завершают бронь -----------------------------------

select lives_ok(
  format($$select public.close_session(%L)$$, (select id from ids where name = 's1')),
  'сеанс по брони закрыт');
select results_eq(
  $$select status::text from public.bookings where id = (select id from ids where name = 'b1')$$,
  array['completed'], 'закрытие сеанса завершает бронь');

select pg_temp.login('11111111-1111-1111-1111-111111111111');
select lives_ok(
  format($$select public.void_session(
    (select id from public.sessions where booking_id = %L), 'Ошибка администратора')$$,
    (select id from ids where name = 'b3')),
  'владелец аннулирует сеанс по брони');
select results_eq(
  $$select status::text from public.bookings where id = (select id from ids where name = 'b3')$$,
  array['completed'], 'аннулирование сеанса тоже завершает бронь');

-- Данные e2e лежат в той же базе: считаем только демо-заведение.
reset role;
select is(
  (select count(*)::int from public.bookings
   where venue_id = 'aaaaaaaa-1111-0000-0000-000000000001' and status = 'arrived'),
  0, 'после закрытия ни одной брони arrived не осталось');

-- Чужое заведение ---------------------------------------------------------------

select pg_temp.login('22222222-2222-2222-2222-222222222222');
insert into ids select 'b4', public.create_manual_booking(
  'aaaaaaaa-3333-0000-0000-000000000005', now() + interval '1 hour', now() + interval '2 hours',
  '+77020000004');
select pg_temp.login('33333333-3333-3333-3333-333333333333');
select throws_ok(
  format($$select public.arrive_booking(%L)$$, (select id from ids where name = 'b4')),
  'P0002', 'booking_not_found', 'владелец другого заведения не отмечает чужую бронь');

set local role anon;
select throws_ok(
  format($$select public.arrive_booking(%L)$$, (select id from ids where name = 'b4')),
  '42501', null, 'anon не вызывает arrive_booking');

select * from finish();
rollback;
