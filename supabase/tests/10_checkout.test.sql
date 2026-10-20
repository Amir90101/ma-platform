-- Этап 4.4: товары, закрытие с оплатой. Данные из seed.sql.
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

select pg_temp.login('22222222-2222-2222-2222-222222222222');
insert into ids select 's', public.start_session('aaaaaaaa-3333-0000-0000-000000000001');
reset role;
update public.session_segments set started_at = now() - interval '1 hour'
where session_id = (select id from ids where name = 's');

select pg_temp.login('22222222-2222-2222-2222-222222222222');

-- Товары ----------------------------------------------------------------------

insert into ids select 'cola', public.add_session_item((select id from ids where name = 's'), 'Кола', 500, 2);
insert into ids select 'tea', public.add_session_item((select id from ids where name = 's'), 'Чай', 300, 1);
select throws_ok(
  $$select public.add_session_item((select id from ids where name = 's'), ' ', 100, 1)$$,
  'P0001', 'item_invalid', 'товар без названия не добавляется');
select lives_ok($$select public.remove_session_item((select id from ids where name = 'tea'))$$,
  'товар удаляется из открытого сеанса');
select is(
  (public.calc_session_amount((select id from ids where name = 's')) ->> 'total_amount')::int,
  2200, 'сумма сейчас: 1 200 за час + 2 × 500 за колу');

-- Закрытие с оплатой ---------------------------------------------------------

select throws_ok(
  $$select public.checkout_session((select id from ids where name = 's'), 200,
    '[{"method": "cash", "amount": 2000}]')$$,
  'P0001', 'shift_not_open', 'без открытой смены сеанс с оплатой не закрывается');
select results_eq(
  $$select status::text from public.sessions where id = (select id from ids where name = 's')$$,
  array['active'], 'после ошибки сеанс остаётся открытым');

insert into ids select 'shift', public.open_shift('aaaaaaaa-1111-0000-0000-000000000001', 10000);

select throws_ok(
  $$select public.checkout_session((select id from ids where name = 's'), 200,
    '[{"method": "cash", "amount": 1500}]')$$,
  'P0001', 'payments_mismatch', 'оплаты должны сойтись с итогом');

select lives_ok(
  $$select public.checkout_session((select id from ids where name = 's'), 200,
    '[{"method": "cash", "amount": 1500}, {"method": "kaspi", "amount": 500}]')$$,
  'закрытие со скидкой и раздельной оплатой');
select results_eq(
  $$select status::text, time_amount, items_amount, discount_amount, total_amount
    from public.sessions where id = (select id from ids where name = 's')$$,
  $$values ('closed', 1200, 1000, 200, 2000)$$, 'суммы сеанса записаны');
select results_eq(
  $$select method::text, amount from public.payments
    where session_id = (select id from ids where name = 's') order by amount desc$$,
  $$values ('cash', 1500), ('kaspi', 500)$$, 'оплаты записаны по способам');
select throws_ok(
  $$select public.add_session_item((select id from ids where name = 's'), 'Ещё', 100, 1)$$,
  'P0001', 'session_not_open', 'в закрытый сеанс товар не добавить');

select results_eq(
  $$select expected_cash from public.close_shift((select id from ids where name = 'shift'), 11500)$$,
  array[11500], 'ожидаемые наличные: 10 000 + 1 500');
reset role;

select pg_temp.login('33333333-3333-3333-3333-333333333333');
select throws_ok(
  $$select public.remove_session_item((select id from ids where name = 'cola'))$$,
  'P0002', 'session_not_found', 'чужой владелец не трогает товары');
reset role;

select * from finish();
rollback;
