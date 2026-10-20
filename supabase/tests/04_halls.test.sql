-- Этап 2.1: залы, ресурсы, декор. Данные из seed.sql.
--
-- Демо Бильярд: owner 1111…, admin 2222…, заведение aaaaaaaa-1111…, зал aaaaaaaa-2222…
-- Демо PS-клуб: owner2 3333…, заведение bbbbbbbb-1111…, зал bbbbbbbb-2222…
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

select ok(
  (select bool_and(c.relrowsecurity) from pg_class c
   where c.oid in ('public.halls'::regclass, 'public.resources'::regclass,
                   'public.hall_objects'::regclass)),
  'RLS включён на halls, resources, hall_objects'
);

-- Целостность ----------------------------------------------------------------

select throws_ok(
  $$insert into public.resources (venue_id, hall_id, kind, name, x, y, w, h)
    values ('aaaaaaaa-1111-0000-0000-000000000001', 'bbbbbbbb-2222-0000-0000-000000000001',
            'pool_table', 'Чужой зал', 0, 0, 100, 50)$$,
  '23503', null,
  'ресурс нельзя поставить в зал другого заведения'
);
select throws_ok(
  $$update public.resources set rotation = 360 where id = 'aaaaaaaa-3333-0000-0000-000000000001'$$,
  '23514', null,
  'поворот только 0–359'
);
select throws_ok(
  $$update public.resources set shape = 'triangle' where id = 'aaaaaaaa-3333-0000-0000-000000000001'$$,
  '23514', null,
  'форма только rect или circle'
);
select throws_ok(
  $$delete from public.halls where id = 'aaaaaaaa-2222-0000-0000-000000000001'$$,
  '23503', null,
  'зал с ресурсами не удаляется'
);

-- Администратор Демо Бильярда ----------------------------------------------

select pg_temp.login('22222222-2222-2222-2222-222222222222');
select is(
  (select count(*)::int from public.resources),
  8,
  'администратор видит 8 столов своего заведения и не видит чужие'
);
select is(
  (select count(*)::int from public.hall_objects),
  2,
  'администратор видит декор только своего зала'
);
select is_empty(
  $$update public.resources set x = 0 where id = 'aaaaaaaa-3333-0000-0000-000000000001' returning id$$,
  'администратор не двигает столы'
);
select is_empty(
  $$update public.hall_objects set x = 0 returning id$$,
  'администратор не двигает декор'
);
select throws_ok(
  $$insert into public.halls (venue_id, name) values ('aaaaaaaa-1111-0000-0000-000000000001', 'VIP')$$,
  '42501', null,
  'администратор не создаёт залы'
);
select throws_ok(
  $$insert into public.resources (venue_id, hall_id, kind, name, x, y, w, h)
    values ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001',
            'pool_table', 'Стол 9', 0, 0, 180, 100)$$,
  '42501', null,
  'администратор не добавляет столы'
);
select is_empty(
  $$delete from public.resources where id = 'aaaaaaaa-3333-0000-0000-000000000001' returning id$$,
  'администратор не удаляет столы'
);
reset role;

-- Второй владелец ------------------------------------------------------------

select pg_temp.login('33333333-3333-3333-3333-333333333333');
select is_empty(
  $$select 1 from public.resources where venue_id = 'aaaaaaaa-1111-0000-0000-000000000001'$$,
  'чужой владелец не видит столы Демо Бильярда'
);
select is_empty(
  $$select 1 from public.halls where venue_id = 'aaaaaaaa-1111-0000-0000-000000000001'$$,
  'чужой владелец не видит залы Демо Бильярда'
);
select is_empty(
  $$update public.resources set name = 'Взлом' where venue_id = 'aaaaaaaa-1111-0000-0000-000000000001' returning id$$,
  'чужой владелец не меняет столы Демо Бильярда'
);
select throws_ok(
  $$insert into public.hall_objects (hall_id, kind, x, y, w, h)
    values ('aaaaaaaa-2222-0000-0000-000000000001', 'bar', 0, 0, 100, 50)$$,
  '42501', null,
  'чужой владелец не добавляет декор в чужой зал'
);
reset role;

-- Владелец -------------------------------------------------------------------

select pg_temp.login('11111111-1111-1111-1111-111111111111');
select lives_ok(
  $$insert into public.halls (id, venue_id, name)
    values ('aaaaaaaa-2222-0000-0000-000000000002', 'aaaaaaaa-1111-0000-0000-000000000001', 'VIP')$$,
  'владелец создаёт второй зал'
);
select lives_ok(
  $$insert into public.resources (venue_id, hall_id, kind, name, x, y, w, h, rotation)
    values ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000002',
            'russian_table', 'VIP 1', 100, 100, 220, 120, 90)$$,
  'владелец ставит стол во второй зал'
);
select isnt_empty(
  $$update public.resources set is_active = false
    where id = 'aaaaaaaa-3333-0000-0000-000000000008' returning id$$,
  'владелец выключает стол'
);
select isnt_empty(
  $$insert into public.hall_objects (hall_id, kind, label, x, y, w, h)
    values ('aaaaaaaa-2222-0000-0000-000000000002', 'label', 'VIP', 10, 10, 100, 40) returning id$$,
  'владелец добавляет подпись'
);
reset role;

-- anon -----------------------------------------------------------------------

set local role anon;
select throws_ok('select * from public.halls', '42501', null, 'anon не читает halls');
select throws_ok('select * from public.resources', '42501', null, 'anon не читает resources');
select throws_ok('select * from public.hall_objects', '42501', null, 'anon не читает hall_objects');
reset role;

select * from finish();
rollback;
