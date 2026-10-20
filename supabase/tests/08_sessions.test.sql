-- Этап 4.1: сеансы и смены. Данные из seed.sql.
--
-- Демо Бильярд: owner 1111…, admin 2222…, заведение aaaaaaaa-1111…,
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

-- Круглосуточный тариф с наивысшим приоритетом: суммы не зависят от часа запуска.
insert into public.tariffs (id, venue_id, name, resource_kinds, price_per_hour, weekdays, time_from, time_to, priority)
values ('aaaaaaaa-4444-0000-0000-0000000000ff', 'aaaaaaaa-1111-0000-0000-000000000001', 'Тест сутки',
        '{pool_table,russian_table}', 1200, '{1,2,3,4,5,6,7}', '00:00', '00:00', 100);

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

-- Старт ----------------------------------------------------------------------

select pg_temp.login('22222222-2222-2222-2222-222222222222');

insert into ids select 's1', public.start_session('aaaaaaaa-3333-0000-0000-000000000001');
select results_eq(
  $$select status::text from public.sessions where id = (select id from ids where name = 's1')$$,
  array['active'], 'администратор запускает сеанс на свободном столе');
select results_eq(
  $$select kind::text, ended_at is null from public.session_segments
    where session_id = (select id from ids where name = 's1')$$,
  $$values ('play', true)$$, 'открыт отрезок play');

select throws_ok(
  $$select public.start_session('aaaaaaaa-3333-0000-0000-000000000001')$$,
  'P0001', 'resource_busy', 'второй сеанс на занятом столе отклоняется');

select throws_ok(
  $$insert into public.sessions (venue_id, started_by)
    values ('aaaaaaaa-1111-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222')$$,
  '42501', null, 'писать в sessions напрямую нельзя, только через RPC');

select throws_ok(
  $$select public.start_session('aaaaaaaa-3333-0000-0000-000000000002', now() - interval '1 minute')$$,
  'P0001', 'expected_end_in_past', 'ожидаемое окончание не в прошлом');

-- Гость по телефону создаётся и находится повторно.
insert into ids select 's2', public.start_session(
  'aaaaaaaa-3333-0000-0000-000000000002', now() + interval '2 hours', null, '+77001234567', 'Арман');
select results_eq(
  $$select c.name from public.sessions s join public.customers c on c.id = s.customer_id
    where s.id = (select id from ids where name = 's2')$$,
  array['Арман'], 'гость с телефоном записан в customers');

-- Пауза и продолжение ------------------------------------------------------

select lives_ok($$select public.pause_session((select id from ids where name = 's1'))$$, 'пауза');
select results_eq(
  $$select kind::text, ended_at is null from public.session_segments
    where session_id = (select id from ids where name = 's1') order by started_at, ended_at nulls last$$,
  $$values ('play', false), ('pause', true)$$,
  'пауза закрывает отрезок play и открывает pause');
select throws_ok(
  $$select public.start_session('aaaaaaaa-3333-0000-0000-000000000001')$$,
  'P0001', 'resource_busy', 'на паузе стол остаётся занятым');

select lives_ok($$select public.resume_session((select id from ids where name = 's1'))$$, 'продолжение');
select results_eq(
  $$select kind::text, ended_at is null from public.session_segments
    where session_id = (select id from ids where name = 's1') order by started_at, ended_at nulls last$$,
  $$values ('play', false), ('pause', false), ('play', true)$$,
  'продолжение закрывает pause и открывает play');
select throws_ok(
  $$select public.resume_session((select id from ids where name = 's1'))$$,
  'P0001', 'session_not_paused', 'продолжить можно только сеанс на паузе');

-- Перенос ---------------------------------------------------------------------

select throws_ok(
  $$select public.transfer_session((select id from ids where name = 's1'), 'aaaaaaaa-3333-0000-0000-000000000002')$$,
  'P0001', 'resource_busy', 'перенос на занятый стол отклоняется');
select lives_ok(
  $$select public.transfer_session((select id from ids where name = 's1'), 'aaaaaaaa-3333-0000-0000-000000000007')$$,
  'перенос на свободный русский стол');
select results_eq(
  $$select resource_id from public.session_segments
    where session_id = (select id from ids where name = 's1') and ended_at is null$$,
  array['aaaaaaaa-3333-0000-0000-000000000007'::uuid], 'открытый отрезок на новом столе');
select lives_ok(
  $$select public.start_session('aaaaaaaa-3333-0000-0000-000000000001')$$,
  'старый стол после переноса свободен');
reset role;

-- Закрытие и сумма -----------------------------------------------------------

-- Сеанс s2 шёл полтора часа: сдвигаем начало назад.
update public.sessions set started_at = now() - interval '90 minutes'
where id = (select id from ids where name = 's2');
update public.session_segments set started_at = now() - interval '90 minutes'
where session_id = (select id from ids where name = 's2');

select pg_temp.login('22222222-2222-2222-2222-222222222222');
select is(
  (public.calc_session_amount((select id from ids where name = 's2')) ->> 'total_amount')::int,
  1800, 'calc_session_amount: 1,5 часа по 1 200 ₸ = 1 800 ₸, без записи');
select is(
  (select time_amount from public.sessions where id = (select id from ids where name = 's2')),
  null, 'расчёт ничего не записал');

select throws_ok(
  $$select public.close_session((select id from ids where name = 's2'), 5000)$$,
  'P0001', 'discount_too_big', 'скидка больше суммы отклоняется');
select lives_ok(
  $$select public.close_session((select id from ids where name = 's2'), 300)$$,
  'администратор закрывает сеанс со скидкой');
select results_eq(
  $$select status::text, time_amount, items_amount, discount_amount, total_amount,
           tariff_snapshot #>> '{lines,0,name}'
    from public.sessions where id = (select id from ids where name = 's2')$$,
  $$values ('closed', 1800, 0, 300, 1500, 'Тест сутки')$$,
  'close_session пишет суммы и tariff_snapshot');
select is_empty(
  $$select 1 from public.session_segments
    where session_id = (select id from ids where name = 's2') and ended_at is null$$,
  'после закрытия открытых отрезков нет');
reset role;

update public.tariffs set price_per_hour = 9999 where name = 'Тест сутки';
select results_eq(
  $$select total_amount, (tariff_snapshot #>> '{lines,0,price_per_hour}')::int
    from public.sessions where id = (select id from ids where name = 's2')$$,
  $$values (1500, 1200)$$,
  'изменение тарифа не меняет закрытый сеанс');

-- Аннулирование ----------------------------------------------------------------

select pg_temp.login('22222222-2222-2222-2222-222222222222');
select throws_ok(
  $$select public.void_session((select id from ids where name = 's1'), 'ошибка')$$,
  '42501', null, 'администратор не аннулирует сеанс');
reset role;

select pg_temp.login('33333333-3333-3333-3333-333333333333');
select throws_ok(
  $$select public.pause_session((select id from ids where name = 's1'))$$,
  'P0002', 'session_not_found', 'чужой владелец не управляет сеансом');
select is_empty($$select 1 from public.sessions$$, 'чужой владелец не видит сеансы');
reset role;

select pg_temp.login('11111111-1111-1111-1111-111111111111');
select lives_ok(
  $$select public.void_session((select id from ids where name = 's1'), 'Запустили по ошибке')$$,
  'владелец аннулирует сеанс');
select results_eq(
  $$select status::text, void_reason from public.sessions where id = (select id from ids where name = 's1')$$,
  $$values ('voided', 'Запустили по ошибке')$$, 'сеанс аннулирован с причиной');

-- Ресурс с историей не удаляется, а выключается.
select throws_ok(
  $$delete from public.resources where id = 'aaaaaaaa-3333-0000-0000-000000000007'$$,
  '23503', null, 'ресурс с сеансами нельзя удалить');
select lives_ok(
  $$select public.save_hall_layout(
    'aaaaaaaa-2222-0000-0000-000000000001',
    (select jsonb_agg(to_jsonb(r) - 'venue_id' - 'hall_id' - 'created_at')
     from public.resources r
     where r.hall_id = 'aaaaaaaa-2222-0000-0000-000000000001'
       and r.id <> 'aaaaaaaa-3333-0000-0000-000000000007'),
    (select coalesce(jsonb_agg(to_jsonb(o) - 'hall_id' - 'created_at'), '[]')
     from public.hall_objects o where o.hall_id = 'aaaaaaaa-2222-0000-0000-000000000001'))$$,
  'сохранение карты без стола с историей');
select results_eq(
  $$select is_active from public.resources where id = 'aaaaaaaa-3333-0000-0000-000000000007'$$,
  array[false], 'стол с историей выключен, а не удалён');
reset role;

-- Смены -----------------------------------------------------------------------

select pg_temp.login('22222222-2222-2222-2222-222222222222');
insert into ids select 'shift', public.open_shift('aaaaaaaa-1111-0000-0000-000000000001', 20000);
select throws_ok(
  $$select public.open_shift('aaaaaaaa-1111-0000-0000-000000000001', 0)$$,
  'P0001', 'shift_already_open', 'вторая открытая смена не открывается');
select results_eq(
  $$select closing_cash, expected_cash from public.close_shift((select id from ids where name = 'shift'), 19500)$$,
  $$values (19500, 20000)$$, 'закрытие смены записывает наличные и ожидаемую сумму');
select throws_ok(
  $$select public.close_shift((select id from ids where name = 'shift'), 0)$$,
  'P0001', 'shift_already_closed', 'закрытую смену не закрыть повторно');
reset role;

select pg_temp.login('33333333-3333-3333-3333-333333333333');
select throws_ok(
  $$select public.open_shift('aaaaaaaa-1111-0000-0000-000000000001', 0)$$,
  'P0002', 'venue_not_found', 'чужой владелец не открывает смену');
reset role;

set local role anon;
select throws_ok('select * from public.sessions', '42501', null, 'anon не читает sessions');
select throws_ok('select * from public.customers', '42501', null, 'anon не читает customers');
select throws_ok('select * from public.shifts', '42501', null, 'anon не читает shifts');
reset role;

select * from finish();
rollback;
