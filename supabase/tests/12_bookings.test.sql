-- Этап 5.1: брони. Данные из seed.sql.
--
-- Демо Бильярд: admin 2222…, заведение aaaaaaaa-1111… (Asia/Almaty,
-- 10:00–02:00 каждый день), столы aaaaaaaa-3333…01–08. Чужой владелец 3333….
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

-- Местное время завтрашнего дня в заведении: pg_temp.t('14:00').
create function pg_temp.tomorrow() returns date
language sql as $$ select (now() at time zone 'Asia/Almaty')::date + 1 $$;
create function pg_temp.t(p_time text, p_days int default 0) returns timestamptz
language sql as $$
  select ((pg_temp.tomorrow() + p_days) + p_time::time) at time zone 'Asia/Almaty'
$$;

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

-- Пересечения при буфере 0 ---------------------------------------------------

select pg_temp.login('22222222-2222-2222-2222-222222222222');

insert into ids select 'b1', public.create_manual_booking(
  'aaaaaaaa-3333-0000-0000-000000000001', pg_temp.t('14:00'), pg_temp.t('16:00'),
  '+77010000001', 'Ержан', 4, 'День рождения');
select results_eq(
  $$select status::text, source::text, blocked_until = ends_at, created_by
    from public.bookings where id = (select id from ids where name = 'b1')$$,
  $$values ('confirmed', 'phone', true, '22222222-2222-2222-2222-222222222222'::uuid)$$,
  'бронь по звонку сразу подтверждена, при буфере 0 blocked_until = ends_at');

select throws_ok(
  $$select public.create_manual_booking('aaaaaaaa-3333-0000-0000-000000000001',
    pg_temp.t('15:00'), pg_temp.t('17:00'), '+77010000002')$$,
  'P0001', 'booking_overlap', 'пересекающаяся бронь отклоняется');

-- detail называет мешающую бронь.
create function pg_temp.overlap_detail(p_from text, p_to text) returns jsonb
language plpgsql as $$
declare
  v_detail text;
begin
  perform public.create_manual_booking('aaaaaaaa-3333-0000-0000-000000000001',
    pg_temp.t(p_from), pg_temp.t(p_to), '+77010000002');
  return null;
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return v_detail::jsonb;
end;
$$;
select is(
  pg_temp.overlap_detail('13:00', '14:30') ->> 'customer_name', 'Ержан',
  'в detail ошибки — имя гостя мешающей брони');
select is(
  (pg_temp.overlap_detail('13:00', '14:30') ->> 'id')::uuid, (select id from ids where name = 'b1'),
  'в detail ошибки — id мешающей брони');

select lives_ok(
  $$select public.create_manual_booking('aaaaaaaa-3333-0000-0000-000000000001',
    pg_temp.t('16:00'), pg_temp.t('17:00'), '+77010000002')$$,
  'бронь встык после другой проходит при буфере 0');
select lives_ok(
  $$select public.create_manual_booking('aaaaaaaa-3333-0000-0000-000000000001',
    pg_temp.t('12:00'), pg_temp.t('14:00'), '+77010000003')$$,
  'бронь встык до другой проходит при буфере 0');
select lives_ok(
  $$select public.create_manual_booking('aaaaaaaa-3333-0000-0000-000000000002',
    pg_temp.t('14:00'), pg_temp.t('16:00'), '+77010000002')$$,
  'то же время на другом столе свободно');

-- Ограничение держит и прямую вставку в обход RPC.
reset role;
select throws_ok(
  $$insert into public.bookings (venue_id, resource_id, customer_id, starts_at, ends_at, blocked_until, source)
    select 'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-3333-0000-0000-000000000001',
      customer_id, pg_temp.t('15:30'), pg_temp.t('15:45'), pg_temp.t('15:45'), 'manual'
    from public.bookings where id = (select id from ids where name = 'b1')$$,
  '23P01', null, 'bookings_no_overlap отклоняет пересечение и без RPC');

-- Буфер 15 минут --------------------------------------------------------------

update public.venues set buffer_min = 15 where id = 'aaaaaaaa-1111-0000-0000-000000000001';
select pg_temp.login('22222222-2222-2222-2222-222222222222');

insert into ids select 'b2', public.create_manual_booking(
  'aaaaaaaa-3333-0000-0000-000000000003', pg_temp.t('18:00'), pg_temp.t('20:00'), '+77010000004');
select is(
  (select blocked_until from public.bookings where id = (select id from ids where name = 'b2')),
  pg_temp.t('20:15'), 'blocked_until = ends_at + буфер');
select throws_ok(
  $$select public.create_manual_booking('aaaaaaaa-3333-0000-0000-000000000003',
    pg_temp.t('20:10'), pg_temp.t('21:00'), '+77010000005')$$,
  'P0001', 'booking_overlap', 'с буфером 15 минут бронь через 10 минут после окончания отклоняется');
select throws_ok(
  $$select public.create_manual_booking('aaaaaaaa-3333-0000-0000-000000000003',
    pg_temp.t('17:00'), pg_temp.t('17:50'), '+77010000005')$$,
  'P0001', 'booking_overlap', 'буфер новой брони не наезжает на следующую');
select lives_ok(
  $$select public.create_manual_booking('aaaaaaaa-3333-0000-0000-000000000003',
    pg_temp.t('20:15'), pg_temp.t('21:00'), '+77010000005')$$,
  'бронь сразу после буфера проходит');

-- Проверки ввода -------------------------------------------------------------

select throws_ok(
  $$select public.create_manual_booking('aaaaaaaa-3333-0000-0000-000000000004',
    pg_temp.t('14:00'), pg_temp.t('14:00'), '+77010000006')$$,
  'P0001', 'booking_time_invalid', 'окончание раньше начала отклоняется');
select throws_ok(
  $$select public.create_manual_booking('aaaaaaaa-3333-0000-0000-000000000004',
    now() - interval '3 hours', now() - interval '1 hour', '+77010000006')$$,
  'P0001', 'booking_in_past', 'бронь в прошлом отклоняется');
select throws_ok(
  $$select public.create_manual_booking('aaaaaaaa-3333-0000-0000-000000000004',
    pg_temp.t('14:00'), pg_temp.t('15:00'), ' ')$$,
  'P0001', 'phone_required', 'без телефона бронь не создаётся');
select throws_ok(
  $$select public.create_manual_booking('aaaaaaaa-3333-0000-0000-000000000004',
    pg_temp.t('14:00'), pg_temp.t('15:00'), '+77010000006', null, null, null, 'online')$$,
  'P0001', 'source_invalid', 'администратор не создаёт онлайн-бронь');
select throws_ok(
  $$insert into public.bookings (venue_id, resource_id, customer_id, starts_at, ends_at, blocked_until, source)
    values ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-3333-0000-0000-000000000004',
      gen_random_uuid(), now(), now() + interval '1 hour', now() + interval '1 hour', 'manual')$$,
  '42501', null, 'писать в bookings напрямую нельзя, только через RPC');

-- Отмена, неявка и освобождение стола ------------------------------------------

select throws_ok(
  format($$select public.set_booking_status(%L, 'cancelled', ' ')$$, (select id from ids where name = 'b1')),
  'P0001', 'reason_required', 'отмена администратором требует причину');
select throws_ok(
  format($$select public.set_booking_status(%L, 'arrived')$$, (select id from ids where name = 'b1')),
  'P0001', 'booking_status_invalid', 'arrived через set_booking_status не ставится');
select lives_ok(
  format($$select public.set_booking_status(%L, 'cancelled', 'Гость перенёс')$$, (select id from ids where name = 'b1')),
  'администратор отменяет бронь');
select results_eq(
  $$select status::text, cancel_reason, cancelled_at is not null
    from public.bookings where id = (select id from ids where name = 'b1')$$,
  $$values ('cancelled', 'Гость перенёс', true)$$,
  'отмена записывает причину и время');
select throws_ok(
  format($$select public.set_booking_status(%L, 'no_show')$$, (select id from ids where name = 'b1')),
  'P0001', 'booking_not_confirmed', 'отменённую бронь нельзя перевести в неявку');
select lives_ok(
  $$select public.create_manual_booking('aaaaaaaa-3333-0000-0000-000000000001',
    pg_temp.t('14:30'), pg_temp.t('15:30'), '+77010000007')$$,
  'отменённая бронь не занимает стол');

insert into ids select 'b3', public.create_manual_booking(
  'aaaaaaaa-3333-0000-0000-000000000005', pg_temp.t('11:00'), pg_temp.t('12:00'), '+77010000008');
select lives_ok(
  format($$select public.set_booking_status(%L, 'no_show')$$, (select id from ids where name = 'b3')),
  'администратор отмечает неявку');
select lives_ok(
  $$select public.create_manual_booking('aaaaaaaa-3333-0000-0000-000000000005',
    pg_temp.t('11:00'), pg_temp.t('12:00'), '+77010000009')$$,
  'no_show не занимает стол');

reset role;
select is(
  (select count(*)::int from public.audit_log
    where action = 'booking.cancelled' and entity_id = (select id from ids where name = 'b1')
      and user_id = '22222222-2222-2222-2222-222222222222'),
  1, 'отмена брони записана в журнал с автором');

-- Завершённая бронь тоже не занимает стол.
update public.bookings set status = 'completed' where id = (select id from ids where name = 'b2');
select pg_temp.login('22222222-2222-2222-2222-222222222222');
select lives_ok(
  $$select public.create_manual_booking('aaaaaaaa-3333-0000-0000-000000000003',
    pg_temp.t('18:00'), pg_temp.t('19:00'), '+77010000010')$$,
  'completed не занимает стол');

-- mark_no_shows и счётчик неявок ---------------------------------------------

reset role;
-- Неявки, накопленные e2e в той же базе, отмечаем заранее: дальше
-- mark_no_shows видит только брони этого теста.
select public.mark_no_shows();
-- Гость +77010000011: две прошлые неявки по времени (одна уже отмечена,
-- вторая ждёт mark_no_shows), одна опоздавшая в пределах лимита, одна завтра.
insert into public.customers (id, venue_id, phone, name) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', '+77010000011', 'Опоздун');
insert into public.bookings (id, venue_id, resource_id, customer_id, starts_at, ends_at, blocked_until, source, status) values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-3333-0000-0000-000000000006',
   'cccccccc-0000-0000-0000-000000000001', now() - interval '3 days', now() - interval '3 days' + interval '1 hour',
   now() - interval '3 days' + interval '1 hour', 'phone', 'no_show'),
  ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-3333-0000-0000-000000000006',
   'cccccccc-0000-0000-0000-000000000001', now() - interval '20 minutes', now() + interval '40 minutes',
   now() + interval '40 minutes', 'phone', 'confirmed'),
  ('dddddddd-0000-0000-0000-000000000003', 'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-3333-0000-0000-000000000007',
   'cccccccc-0000-0000-0000-000000000001', now() - interval '10 minutes', now() + interval '50 minutes',
   now() + interval '50 minutes', 'phone', 'confirmed'),
  ('dddddddd-0000-0000-0000-000000000004', 'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-3333-0000-0000-000000000008',
   'cccccccc-0000-0000-0000-000000000001', pg_temp.t('15:00'), pg_temp.t('16:00'), pg_temp.t('16:00'), 'phone', 'confirmed');
-- Опоздавший на 30 минут, но уже за столом: сеанс по брони есть.
insert into public.bookings (id, venue_id, resource_id, customer_id, starts_at, ends_at, blocked_until, source, status) values
  ('dddddddd-0000-0000-0000-000000000005', 'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-3333-0000-0000-000000000004',
   'cccccccc-0000-0000-0000-000000000001', now() - interval '30 minutes', now() + interval '30 minutes',
   now() + interval '30 minutes', 'phone', 'confirmed');
insert into public.sessions (venue_id, booking_id, started_by)
values ('aaaaaaaa-1111-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000005',
        '22222222-2222-2222-2222-222222222222');

select is(public.mark_no_shows(), 1, 'mark_no_shows отмечает одну бронь');
select results_eq(
  $$select id::text, status::text from public.bookings
    where customer_id = 'cccccccc-0000-0000-0000-000000000001' order by id$$,
  $$values
    ('dddddddd-0000-0000-0000-000000000001', 'no_show'),
    ('dddddddd-0000-0000-0000-000000000002', 'no_show'),
    ('dddddddd-0000-0000-0000-000000000003', 'confirmed'),
    ('dddddddd-0000-0000-0000-000000000004', 'confirmed'),
    ('dddddddd-0000-0000-0000-000000000005', 'confirmed')$$,
  'опоздание больше no_show_after_min без сеанса — no_show; в пределах лимита и с сеансом — нет');
select is(public.mark_no_shows(), 0, 'повторный запуск ничего не меняет');

select is(
  (select count(*)::int from cron.job where jobname = 'mark_no_shows' and schedule = '* * * * *'),
  1, 'pg_cron запускает mark_no_shows каждую минуту');

select pg_temp.login('22222222-2222-2222-2222-222222222222');
select throws_ok($$select public.mark_no_shows()$$, '42501', null,
  'mark_no_shows не вызывается из админки');

-- get_day_bookings ------------------------------------------------------------

select is(
  (select no_show_count from public.get_day_bookings('aaaaaaaa-1111-0000-0000-000000000001', pg_temp.tomorrow())
    where id = 'dddddddd-0000-0000-0000-000000000004'),
  2, 'get_day_bookings считает прошлые неявки гостя');
select is(
  (select no_show_count from public.get_day_bookings('aaaaaaaa-1111-0000-0000-000000000001',
     (pg_temp.tomorrow() - 4))
    where id = 'dddddddd-0000-0000-0000-000000000001'),
  1, 'сама неявка в счётчик этой брони не входит');
select is(
  (select session_id is not null from public.get_day_bookings('aaaaaaaa-1111-0000-0000-000000000001',
     ((now() - interval '30 minutes') at time zone 'Asia/Almaty')::date)
    where id = 'dddddddd-0000-0000-0000-000000000005'),
  true, 'get_day_bookings отдаёт сеанс брони');
select is(
  (select count(*)::int from public.get_day_bookings('aaaaaaaa-1111-0000-0000-000000000001', pg_temp.tomorrow())
    where status = 'cancelled'),
  1, 'лента дня показывает и отменённые брони');

-- Ночная бронь: в своём рабочем дне (до 02:00) и в календарном.
select lives_ok(
  $$insert into ids select 'night', public.create_manual_booking('aaaaaaaa-3333-0000-0000-000000000002',
    pg_temp.t('01:00', 1), pg_temp.t('01:45', 1), '+77010000012')$$,
  'бронь в 01:00 ночи');
select ok(
  exists (select 1 from public.get_day_bookings('aaaaaaaa-1111-0000-0000-000000000001', pg_temp.tomorrow())
    where id = (select id from ids where name = 'night')),
  'ночная бронь видна в рабочем дне, который закрывается в 02:00');
select ok(
  exists (select 1 from public.get_day_bookings('aaaaaaaa-1111-0000-0000-000000000001', pg_temp.tomorrow() + 1)
    where id = (select id from ids where name = 'night')),
  'и в своём календарном дне');
select ok(
  not exists (select 1 from public.get_day_bookings('aaaaaaaa-1111-0000-0000-000000000001', pg_temp.tomorrow() + 2)
    where id = (select id from ids where name = 'night')),
  'в следующий день её нет');

-- Чужое заведение ---------------------------------------------------------------

select pg_temp.login('33333333-3333-3333-3333-333333333333');
select is((select count(*)::int from public.bookings), 0, 'владелец другого заведения не видит брони');
select throws_ok(
  $$select * from public.get_day_bookings('aaaaaaaa-1111-0000-0000-000000000001', pg_temp.tomorrow())$$,
  'P0002', 'venue_not_found', 'и не получает ленту чужого заведения');
select throws_ok(
  $$select public.create_manual_booking('aaaaaaaa-3333-0000-0000-000000000004',
    pg_temp.t('10:00'), pg_temp.t('11:00'), '+77010000013')$$,
  'P0002', 'resource_not_found', 'и не бронирует его стол');
select throws_ok(
  $$select public.set_booking_status('dddddddd-0000-0000-0000-000000000004', 'cancelled', 'x')$$,
  'P0002', 'booking_not_found', 'и не отменяет его бронь');

set local role anon;
select throws_ok($$select count(*) from public.bookings$$, '42501', null, 'anon не читает bookings');

select * from finish();
rollback;
