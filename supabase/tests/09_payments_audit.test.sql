-- Этап 4.2: оплаты, ожидаемые наличные, журнал действий. Данные из seed.sql.
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

insert into public.tariffs (venue_id, name, resource_kinds, price_per_hour, weekdays, time_from, time_to, priority)
values ('aaaaaaaa-1111-0000-0000-000000000001', 'Тест сутки', '{pool_table,russian_table}',
        1200, '{1,2,3,4,5,6,7}', '00:00', '00:00', 100);

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

-- Сеанс на час, закрытый со скидкой 200: итог 1 000 ₸.
select pg_temp.login('22222222-2222-2222-2222-222222222222');
insert into ids select 's', public.start_session('aaaaaaaa-3333-0000-0000-000000000001');
reset role;
update public.session_segments set started_at = now() - interval '1 hour'
where session_id = (select id from ids where name = 's');

select pg_temp.login('22222222-2222-2222-2222-222222222222');
select public.close_session((select id from ids where name = 's'), 200);

-- Оплата без смены -------------------------------------------------------------

select throws_ok(
  $$select public.add_payment((select id from ids where name = 's'), 500, 'cash')$$,
  'P0001', 'shift_not_open', 'оплата без открытой смены отклоняется');

insert into ids select 'shift', public.open_shift('aaaaaaaa-1111-0000-0000-000000000001', 10000);

-- Раздельная оплата ------------------------------------------------------------

insert into ids select 'cash', public.add_payment((select id from ids where name = 's'), 600, 'cash');
insert into ids select 'kaspi', public.add_payment((select id from ids where name = 's'), 400, 'kaspi');
select is(
  (select sum(amount)::int from public.payments where session_id = (select id from ids where name = 's')),
  1000, 'оплата частью наличными и частью Kaspi');
select throws_ok(
  $$select public.add_payment((select id from ids where name = 's'), 1, 'card')$$,
  'P0001', 'overpayment', 'переплата закрытого сеанса отклоняется');
select throws_ok(
  $$select public.add_payment((select id from ids where name = 's'), 0, 'cash')$$,
  'P0001', 'amount_invalid', 'сумма оплаты больше нуля');
select throws_ok(
  $$insert into public.payments (venue_id, shift_id, session_id, amount, method, created_by)
    values ('aaaaaaaa-1111-0000-0000-000000000001', (select id from ids where name = 'shift'),
            (select id from ids where name = 's'), 1, 'cash', '22222222-2222-2222-2222-222222222222')$$,
  '42501', null, 'писать в payments напрямую нельзя');

-- Отмена оплаты и журнал ---------------------------------------------------------

select throws_ok(
  $$select public.void_payment((select id from ids where name = 'kaspi'), ' ')$$,
  'P0001', 'reason_required', 'отмена оплаты требует причину');
select lives_ok(
  $$select public.void_payment((select id from ids where name = 'kaspi'), 'Гость оплатил картой')$$,
  'администратор отменяет оплату');
insert into ids select 'card', public.add_payment((select id from ids where name = 's'), 400, 'card');

-- Наличные отменённой оплаты в кассу не идут.
select public.void_payment((select id from ids where name = 'cash'), 'Ошиблись суммой');
select public.add_payment((select id from ids where name = 's'), 600, 'cash');

select is_empty($$select 1 from public.audit_log$$, 'администратор не читает журнал');
select throws_ok(
  $$insert into public.audit_log (venue_id, action, entity, entity_id)
    values ('aaaaaaaa-1111-0000-0000-000000000001', 'x', 'x', gen_random_uuid())$$,
  '42501', null, 'администратор не пишет в журнал напрямую');

select results_eq(
  $$select expected_cash from public.close_shift((select id from ids where name = 'shift'), 10500)$$,
  array[10600],
  'expected_cash = 10 000 на открытии + 600 наличными, без отменённых и безналичных');
reset role;

-- Журнал глазами владельца -----------------------------------------------------

select pg_temp.login('11111111-1111-1111-1111-111111111111');
select results_eq(
  $$select action, user_id from public.audit_log order by id$$,
  $$values
    ('session.discount', '22222222-2222-2222-2222-222222222222'::uuid),
    ('payment.voided', '22222222-2222-2222-2222-222222222222'::uuid),
    ('payment.voided', '22222222-2222-2222-2222-222222222222'::uuid)$$,
  'скидка и отмены оплат записаны в журнал с автором');
select results_eq(
  $$select after ->> 'void_reason' from public.audit_log where action = 'payment.voided' order by id limit 1$$,
  array['Гость оплатил картой'], 'в журнале причина отмены');

-- Аннулирование открытого сеанса владельцем.
insert into ids select 's2', public.start_session('aaaaaaaa-3333-0000-0000-000000000002');
select public.void_session((select id from ids where name = 's2'), 'Тестовый запуск');
select results_eq(
  $$select action, user_id, after ->> 'void_reason' from public.audit_log
    where entity_id = (select id from ids where name = 's2')$$,
  $$values ('session.voided', '11111111-1111-1111-1111-111111111111'::uuid, 'Тестовый запуск')$$,
  'аннулирование сеанса записано в журнал с автором');

select throws_ok($$update public.audit_log set action = 'x'$$, '42501', null, 'владелец не меняет журнал');
select throws_ok($$delete from public.audit_log$$, '42501', null, 'владелец не удаляет журнал');
reset role;

-- Даже без RLS журнал не меняется.
select throws_ok($$update public.audit_log set action = 'x'$$, '42501', null,
  'запись журнала нельзя изменить даже суперпользователю без отключения триггера');
select throws_ok($$delete from public.audit_log$$, '42501', null,
  'запись журнала нельзя удалить');

select pg_temp.login('33333333-3333-3333-3333-333333333333');
select is_empty($$select 1 from public.audit_log$$, 'чужой владелец не видит журнал');
select throws_ok(
  $$select public.void_payment((select id from ids where name = 'card'), 'взлом')$$,
  'P0002', 'payment_not_found', 'чужой владелец не отменяет оплату');
reset role;

set local role anon;
select throws_ok('select * from public.payments', '42501', null, 'anon не читает payments');
select throws_ok('select * from public.audit_log', '42501', null, 'anon не читает audit_log');
reset role;

select * from finish();
rollback;
