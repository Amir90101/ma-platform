-- Этап 3.2: tariff_week_grid. Тарифы Демо Бильярда из seed.
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

select pg_temp.login('11111111-1111-1111-1111-111111111111');

select is(
  (select count(*)::int from public.tariff_week_grid('aaaaaaaa-1111-0000-0000-000000000001', 'pool_table')),
  336, 'сетка: 7 дней × 48 получасов');

select results_eq(
  $$select tariff_name from public.tariff_week_grid('aaaaaaaa-1111-0000-0000-000000000001', 'pool_table')
    where (weekday, minute) in ((1, 600), (1, 1080), (2, 60), (6, 60), (6, 600), (1, 180))
    order by weekday, minute$$,
  $$values (null::text), ('Будни день'), ('Вечер'), ('Вечер'), ('Вечер'), ('Выходные')$$,
  'пн 03:00 — нет тарифа, пн 10:00 — день, пн 18:00 — вечер, вт 01:00 — вечер понедельника, сб 01:00 — вечер пятницы, сб 10:00 — выходные'
);

delete from public.tariffs where name = 'Вечер';
select is(
  (select count(*)::int from public.tariff_week_grid('aaaaaaaa-1111-0000-0000-000000000001', 'pool_table')
   where weekday = 1 and minute >= 1080 and tariff_id is null),
  12, 'без вечернего тарифа понедельник с 18:00 до полуночи пустой');
reset role;

select pg_temp.login('33333333-3333-3333-3333-333333333333');
select is(
  (select count(*)::int from public.tariff_week_grid('aaaaaaaa-1111-0000-0000-000000000001', 'pool_table')
   where tariff_id is not null),
  0, 'чужой владелец не видит тарифы в сетке');
reset role;

select * from finish();
rollback;
