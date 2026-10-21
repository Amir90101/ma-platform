-- Этап 6.1: функции публичной страницы. Данные из seed.sql.
--
-- Демо Бильярд (demo-billiards, опубликован): Asia/Almaty, 10:00–02:00
-- каждый день, шаг 30, минимум 60 минут, буфер 0, min_lead 30,
-- max_days_ahead 14; столы aaaaaaaa-3333…01–06 (pool), 07–08 (russian).
begin;
select * from no_plan();

create function pg_temp.tomorrow() returns date
language sql as $$ select (now() at time zone 'Asia/Almaty')::date + 1 $$;
create function pg_temp.t(p_time text, p_days int default 0) returns timestamptz
language sql as $$
  select ((pg_temp.tomorrow() + p_days) + p_time::time) at time zone 'Asia/Almaty'
$$;
-- Окна стола на завтра (длительность 60).
create function pg_temp.slots(p_table text, p_duration int default 60) returns setof timestamptz
language sql as $$
  select starts_at from public.get_availability(
    'aaaaaaaa-1111-0000-0000-000000000001', pg_temp.tomorrow(), p_duration)
  where resource_id = ('aaaaaaaa-3333-0000-0000-0000000000' || p_table)::uuid
$$;

create temp table ids (name text primary key, id uuid, token text);
grant all on ids to anon, authenticated, service_role;

-- Гость с броней: его данные не должны попасть в публичные ответы.
insert into public.customers (id, venue_id, phone, name) values
  ('cccccccc-1111-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001',
   '+77059999999', 'СекретныйГость');
insert into public.bookings (id, venue_id, resource_id, customer_id, starts_at, ends_at, blocked_until, source)
values ('dddddddd-1111-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001',
  'aaaaaaaa-3333-0000-0000-000000000001', 'cccccccc-1111-0000-0000-000000000001',
  pg_temp.t('14:00'), pg_temp.t('16:00'), pg_temp.t('16:00'), 'phone');

-- get_public_venue ------------------------------------------------------------

set local role anon;
select is(public.get_public_venue('demo-billiards') ->> 'name', 'Демо Бильярд',
  'anon получает опубликованное заведение по slug');
select is(jsonb_array_length(public.get_public_venue('demo-billiards') -> 'halls' -> 0 -> 'resources'), 8,
  'с картой зала и ресурсами');
select ok(jsonb_array_length(public.get_public_venue('demo-billiards') -> 'tariffs') > 0,
  'и ценами');
select ok(public.get_public_venue('demo-billiards')::text not like '%77059999999%'
  and public.get_public_venue('demo-billiards')::text not like '%СекретныйГость%',
  'имён и телефонов гостей в профиле нет');
select is(public.get_public_venue('no-such-venue'), null, 'неизвестный slug — null');

reset role;
update public.venues set is_published = false where slug = 'demo-ps-club';
set local role anon;
select is(public.get_public_venue('demo-ps-club'), null, 'неопубликованное заведение не возвращается');
select is((select count(*)::int from public.get_availability(
    'bbbbbbbb-1111-0000-0000-000000000001', pg_temp.tomorrow(), 60)), 0,
  'и окон у него нет');

-- get_availability -------------------------------------------------------------

select is((select count(*)::int from pg_temp.slots('02')), 31,
  'свободный стол: окна с 10:00 до 01:00 с шагом 30 минут');
select is((select min(s) from pg_temp.slots('02') s), pg_temp.t('10:00'), 'первое окно — открытие');
select is((select max(s) from pg_temp.slots('02') s), pg_temp.t('01:00', 1),
  'последнее окно — 01:00 ночи: часы через полночь учтены');
select is((select count(*)::int from pg_temp.slots('02', 120)), 29,
  'окно длиннее — последнее начало раньше');

select ok(pg_temp.t('13:00') in (select pg_temp.slots('01')), 'окно встык до брони есть');
select ok(pg_temp.t('16:00') in (select pg_temp.slots('01')), 'окно встык после брони есть');
select is((select count(*)::int from pg_temp.slots('01') s
    where s > pg_temp.t('13:00') and s < pg_temp.t('16:00')), 0,
  'окна, пересекающие бронь 14:00–16:00, скрыты');

-- Буфер 15 минут: бронь 18:00–20:00 занимает стол до 20:15.
reset role;
update public.venues set buffer_min = 15 where id = 'aaaaaaaa-1111-0000-0000-000000000001';
insert into public.bookings (venue_id, resource_id, customer_id, starts_at, ends_at, blocked_until, source)
values ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-3333-0000-0000-000000000001',
  'cccccccc-1111-0000-0000-000000000001', pg_temp.t('18:00'), pg_temp.t('20:00'), pg_temp.t('20:15'), 'phone');
set local role anon;
select ok(pg_temp.t('20:00') not in (select pg_temp.slots('01')), 'окно в буфере после брони скрыто');
select ok(pg_temp.t('20:30') in (select pg_temp.slots('01')), 'окно после буфера есть');
select ok(pg_temp.t('17:00') not in (select pg_temp.slots('01')),
  'окно, чей буфер наезжает на следующую бронь, скрыто');
select ok(pg_temp.t('16:30') in (select pg_temp.slots('01')),
  'окно, чей буфер кончается ровно к следующей броне, есть');
select ok(pg_temp.t('16:00') in (select pg_temp.slots('01')),
  'буфер новой брони считается от её конца: 16:00–17:00 + 15 мин до 18:00 помещается');

-- Отменённая бронь окно не занимает.
reset role;
update public.bookings set status = 'cancelled', cancelled_at = now()
where id = 'dddddddd-1111-0000-0000-000000000001';
set local role anon;
select ok(pg_temp.t('14:30') in (select pg_temp.slots('01')), 'отменённая бронь окно не занимает');

-- Открытые сеансы: с ожидаемым окончанием — до него плюс буфер; без — стол закрыт.
reset role;
with s as (
  insert into public.sessions (venue_id, started_by, expected_end_at)
  values ('aaaaaaaa-1111-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', pg_temp.t('15:00'))
  returning id
)
insert into public.session_segments (venue_id, session_id, resource_id, kind, started_at)
select 'aaaaaaaa-1111-0000-0000-000000000001', id, 'aaaaaaaa-3333-0000-0000-000000000002', 'play', now() from s;
with s as (
  insert into public.sessions (venue_id, started_by)
  values ('aaaaaaaa-1111-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222')
  returning id
)
insert into public.session_segments (venue_id, session_id, resource_id, kind, started_at)
select 'aaaaaaaa-1111-0000-0000-000000000001', id, 'aaaaaaaa-3333-0000-0000-000000000003', 'play', now() from s;
set local role anon;
select is((select min(s) from pg_temp.slots('02') s), pg_temp.t('15:30'),
  'сеанс с ожиданием до 15:00 и буфером 15 минут: первое окно 15:30');
select is((select count(*)::int from pg_temp.slots('03')), 0,
  'сеанс без ожидаемого окончания закрывает стол для онлайн-брони');

-- Ресурс без онлайн-брони и выключенная онлайн-бронь.
reset role;
update public.resources set bookable_online = false where id = 'aaaaaaaa-3333-0000-0000-000000000004';
set local role anon;
select is((select count(*)::int from pg_temp.slots('04')), 0, 'ресурс с bookable_online = false не показывается');
reset role;
update public.venues set online_booking_enabled = false where id = 'aaaaaaaa-1111-0000-0000-000000000001';
set local role anon;
select is((select count(*)::int from public.get_availability(
    'aaaaaaaa-1111-0000-0000-000000000001', pg_temp.tomorrow(), 60)), 0,
  'выключенная онлайн-бронь — окон нет');
select is(public.get_public_venue('demo-billiards') ->> 'online_booking_enabled', 'false',
  'а страница остаётся с признаком выключенной брони');
reset role;
update public.venues set online_booking_enabled = true where id = 'aaaaaaaa-1111-0000-0000-000000000001';
set local role anon;

-- Сроки: min_lead_min и max_days_ahead.
select is((select count(*)::int from public.get_availability(
    'aaaaaaaa-1111-0000-0000-000000000001', pg_temp.tomorrow() - 1, 60)
    where starts_at < now() + interval '30 minutes'), 0,
  'окон раньше чем через min_lead_min нет');
select is((select count(*)::int from public.get_availability(
    'aaaaaaaa-1111-0000-0000-000000000001', pg_temp.tomorrow() - 2, 60)), 0,
  'вчерашних окон нет');
select ok((select count(*)::int from public.get_availability(
    'aaaaaaaa-1111-0000-0000-000000000001', pg_temp.tomorrow() + 13, 60)) > 0,
  'окна через 14 дней есть');
select is((select count(*)::int from public.get_availability(
    'aaaaaaaa-1111-0000-0000-000000000001', pg_temp.tomorrow() + 14, 60)), 0,
  'окон дальше max_days_ahead нет');

select throws_ok(
  $$select * from public.get_availability('aaaaaaaa-1111-0000-0000-000000000001', pg_temp.tomorrow(), 30)$$,
  'P0001', 'duration_invalid', 'длительность меньше минимальной отклоняется');
select throws_ok(
  $$select * from public.get_availability('aaaaaaaa-1111-0000-0000-000000000001', pg_temp.tomorrow(), 75)$$,
  'P0001', 'duration_invalid', 'длительность не кратна шагу — отклоняется');

-- create_public_booking ----------------------------------------------------------

select throws_ok(
  $$select public.create_public_booking('aaaaaaaa-3333-0000-0000-000000000005', pg_temp.t('18:00'), 120,
    '+77050000001', 'Гость')$$,
  '42501', null, 'anon не вызывает create_public_booking');
set local role authenticated;
select throws_ok(
  $$select public.create_public_booking('aaaaaaaa-3333-0000-0000-000000000005', pg_temp.t('18:00'), 120,
    '+77050000001', 'Гость')$$,
  '42501', null, 'и администратор тоже: только сервер');

set local role service_role;
insert into ids (name, id, token)
select 'o1', (r ->> 'id')::uuid, r ->> 'manage_token'
from public.create_public_booking('aaaaaaaa-3333-0000-0000-000000000005', pg_temp.t('18:00'), 120,
  '+77050000001', 'Самал', 3, 'У окна', '10.0.0.1') r;
reset role;
select results_eq(
  $$select b.status::text, b.source::text, b.ends_at = b.starts_at + interval '2 hours',
      b.blocked_until = b.ends_at + interval '15 minutes', c.name, c.consent_at is not null
    from public.bookings b join public.customers c on c.id = b.customer_id
    where b.id = (select id from ids where name = 'o1')$$,
  $$values ('confirmed', 'online', true, true, 'Самал', true)$$,
  'онлайн-бронь сразу confirmed, гость создан с согласием');

set local role service_role;
select throws_ok(
  $$select public.create_public_booking('aaaaaaaa-3333-0000-0000-000000000005', pg_temp.t('19:00'), 60,
    '+77050000002', 'Другой')$$,
  'P0001', 'slot_unavailable', 'занятое окно отклоняется');
select throws_ok(
  $$select public.create_public_booking('aaaaaaaa-3333-0000-0000-000000000006', pg_temp.t('18:10'), 60,
    '+77050000002', 'Другой')$$,
  'P0001', 'slot_unavailable', 'время не по сетке окон отклоняется');
select throws_ok(
  $$select public.create_public_booking('aaaaaaaa-3333-0000-0000-000000000004', pg_temp.t('18:00'), 60,
    '+77050000002', 'Другой')$$,
  'P0002', 'resource_not_found', 'ресурс без онлайн-брони отклоняется');
select throws_ok(
  $$select public.create_public_booking('aaaaaaaa-3333-0000-0000-000000000006', pg_temp.t('18:00'), 60,
    '8 705 000 00 02', 'Другой')$$,
  'P0001', 'phone_invalid', 'телефон не в формате +7XXXXXXXXXX отклоняется');
select throws_ok(
  $$select public.create_public_booking('aaaaaaaa-3333-0000-0000-000000000006', pg_temp.t('18:00'), 60,
    '+77050000002', ' ')$$,
  'P0001', 'name_required', 'без имени бронь не создаётся');

-- Повторная бронь с тем же телефоном находит гостя; третья упирается в лимит.
insert into ids (name, id, token)
select 'o2', (r ->> 'id')::uuid, r ->> 'manage_token'
from public.create_public_booking('aaaaaaaa-3333-0000-0000-000000000006', pg_temp.t('12:00'), 60,
  '+77050000001', 'Самал-2', null, null, '10.0.0.1') r;
reset role;
select is((select count(*)::int from public.customers
    where venue_id = 'aaaaaaaa-1111-0000-0000-000000000001' and phone = '+77050000001'), 1,
  'повторная онлайн-бронь находит существующего гостя');
select is((select name from public.customers
    where venue_id = 'aaaaaaaa-1111-0000-0000-000000000001' and phone = '+77050000001'), 'Самал',
  'имя гостя гость сам не перезаписывает');
set local role service_role;
select throws_ok(
  $$select public.create_public_booking('aaaaaaaa-3333-0000-0000-000000000006', pg_temp.t('14:00'), 60,
    '+77050000001', 'Самал', null, null, '10.0.0.2', 2, 5)$$,
  'P0001', 'limit_phone', 'третья активная онлайн-бронь на телефон отклоняется лимитом');
select throws_ok(
  $$select public.create_public_booking('aaaaaaaa-3333-0000-0000-000000000006', pg_temp.t('14:00'), 60,
    '+77050000003', 'Третий', null, null, '10.0.0.1', 2, 2)$$,
  'P0001', 'limit_ip', 'лимит активных онлайн-броней на IP');
select lives_ok(
  $$select public.create_public_booking('aaaaaaaa-3333-0000-0000-000000000006', pg_temp.t('14:00'), 60,
    '+77050000003', 'Третий', null, null, '10.0.0.3', 2, 2)$$,
  'с другого IP и телефона бронь проходит');

-- get_booking_by_token и cancel_booking_by_token -------------------------------------

set local role anon;
select results_eq(
  format($$select r ->> 'status', r ->> 'resource_name', (r ->> 'can_cancel')::boolean, r -> 'venue' ->> 'name'
    from public.get_booking_by_token(%L) r$$, (select token from ids where name = 'o1')),
  $$values ('confirmed', 'Стол 5', true, 'Демо Бильярд')$$,
  'бронь по токену: статус, стол и заведение');
select ok(
  public.get_booking_by_token((select token from ids where name = 'o1'))::text not like '%77050000001%'
  and public.get_booking_by_token((select token from ids where name = 'o1'))::text not like '%Самал%',
  'в ответе по токену нет имени и телефона гостя');
select is(public.get_booking_by_token('нет-такого-токена'), null, 'неверный токен ничего не возвращает');
select throws_ok($$select public.cancel_booking_by_token('нет-такого-токена')$$,
  'P0002', 'booking_not_found', 'неверный токен ничего не отменяет');

select lives_ok(
  format($$select public.cancel_booking_by_token(%L)$$, (select token from ids where name = 'o1')),
  'гость отменяет бронь по ссылке до начала');
reset role;
select results_eq(
  $$select status::text, cancelled_by_guest from public.bookings where id = (select id from ids where name = 'o1')$$,
  $$values ('cancelled', true)$$, 'бронь отменена гостем');
select is((select count(*)::int from public.audit_log
    where action = 'booking.cancelled' and entity_id = (select id from ids where name = 'o1') and user_id is null),
  1, 'отмена гостем записана в журнал без автора');
set local role anon;
select throws_ok(
  format($$select public.cancel_booking_by_token(%L)$$, (select token from ids where name = 'o1')),
  'P0001', 'booking_not_confirmed', 'повторная отмена отклоняется');
select ok(pg_temp.t('18:00') in (select pg_temp.slots('05')), 'отменённая гостем бронь освобождает окно');

-- Бронь уже началась: отмена по ссылке недоступна.
reset role;
with b as (
  insert into public.bookings (venue_id, resource_id, customer_id, starts_at, ends_at, blocked_until, source)
  values ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-3333-0000-0000-000000000007',
    'cccccccc-1111-0000-0000-000000000001', now() - interval '5 minutes', now() + interval '55 minutes',
    now() + interval '55 minutes', 'online')
  returning manage_token
)
insert into ids (name, token) select 'started', manage_token from b;
set local role anon;
select is((public.get_booking_by_token((select token from ids where name = 'started')) ->> 'can_cancel')::boolean,
  false, 'после начала брони can_cancel = false');
select throws_ok(
  format($$select public.cancel_booking_by_token(%L)$$, (select token from ids where name = 'started')),
  'P0001', 'cancel_too_late', 'после начала брони отмена по ссылке отклоняется');

select * from finish();
rollback;
