-- Этап 9.5: интеграция с iiko. Ключ в Vault, настройки, синхронизация
-- столов, очередь отправки броней.
-- Демо Бильярд: owner 1111…, admin 2222…, заведение aaaaaaaa-1111….
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

-- Ключ ----------------------------------------------------------------------------

select pg_temp.login('22222222-2222-2222-2222-222222222222');
select throws_ok(
  $$select public.set_iiko_api_login('aaaaaaaa-1111-0000-0000-000000000001', 'secret')$$,
  '42501', null, 'администратор не задаёт ключ iiko'
);
reset role;

select pg_temp.login('11111111-1111-1111-1111-111111111111');
select throws_ok(
  $$select public.save_iiko_settings('aaaaaaaa-1111-0000-0000-000000000001',
    null, null, '{}', false)$$,
  'P0001', 'api_login_required', 'без ключа настройки не сохраняются'
);
select lives_ok(
  $$select public.set_iiko_api_login('aaaaaaaa-1111-0000-0000-000000000001', ' key-1 ')$$,
  'владелец сохраняет ключ'
);
select lives_ok(
  $$select public.set_iiko_api_login('aaaaaaaa-1111-0000-0000-000000000001', 'key-2')$$,
  'и заменяет его'
);
select throws_ok(
  $$select public.iiko_api_login('aaaaaaaa-1111-0000-0000-000000000001')$$,
  '42501', null, 'ключ владельцу обратно не отдаётся'
);
select is(
  (select count(*)::int from public.venue_integrations), 1,
  'владелец видит строку интеграции (без ключа)'
);
select throws_ok(
  $$select public.save_iiko_settings('aaaaaaaa-1111-0000-0000-000000000001',
    null, null, '{}', true)$$,
  'P0001', 'iiko_settings_incomplete', 'включить без организации и залов нельзя'
);
reset role;

select is(
  public.iiko_api_login('aaaaaaaa-1111-0000-0000-000000000001'),
  'key-2', 'сервер читает актуальный ключ'
);

select pg_temp.login('33333333-3333-3333-3333-333333333333');
select is_empty('select 1 from public.venue_integrations', 'чужой владелец не видит интеграцию');
reset role;

-- Столы ------------------------------------------------------------------------

select pg_temp.login('11111111-1111-1111-1111-111111111111');
select is(
  public.sync_iiko_tables('aaaaaaaa-1111-0000-0000-000000000001', '[
    {"iiko_table_id":"99999999-0000-0000-0000-000000000001","name":"Стол iiko 1","capacity":4,"kind":"pool_table","x":40,"y":40,"w":140,"h":100},
    {"iiko_table_id":"99999999-0000-0000-0000-000000000002","name":"Стол iiko 2","capacity":6,"kind":"pool_table","x":210,"y":40,"w":140,"h":100}
  ]'::jsonb),
  2, 'загружены два стола'
);
select is(
  (select count(*)::int from public.resources r join public.halls h on h.id = r.hall_id
    where r.venue_id = 'aaaaaaaa-1111-0000-0000-000000000001' and h.name = 'iiko'),
  2, 'в отдельном зале iiko'
);
select lives_ok(
  $$select public.sync_iiko_tables('aaaaaaaa-1111-0000-0000-000000000001', '[
    {"iiko_table_id":"99999999-0000-0000-0000-000000000001","name":"VIP","capacity":8,"kind":"pool_table","x":0,"y":0,"w":140,"h":100}
  ]'::jsonb)$$,
  'повторная загрузка'
);
select results_eq(
  $$select name, capacity, is_active, x from public.resources
    where iiko_table_id = '99999999-0000-0000-0000-000000000001'$$,
  $$values ('VIP'::text, 8, true, 40)$$,
  'название и вместимость обновились, расстановка сохранилась'
);
select is(
  (select is_active from public.resources
    where iiko_table_id = '99999999-0000-0000-0000-000000000002'),
  false, 'стол, которого нет в iiko, выключен'
);
reset role;

select pg_temp.login('22222222-2222-2222-2222-222222222222');
select throws_ok(
  $$select public.sync_iiko_tables('aaaaaaaa-1111-0000-0000-000000000001', '[]'::jsonb)$$,
  '42501', null, 'администратор не синхронизирует столы'
);
reset role;

-- Очередь отправки ---------------------------------------------------------------

insert into public.customers (id, venue_id, phone, name) values
  ('dddddddd-2222-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', '+77017776655', 'Гость iiko');

-- Обмен выключен — в очередь не попадает.
insert into public.bookings (id, venue_id, resource_id, customer_id, starts_at, ends_at, blocked_until, source)
select 'cccccccc-2222-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', id,
  'dddddddd-2222-0000-0000-000000000001',
  now() + interval '50 days', now() + interval '50 days 1 hour', now() + interval '50 days 1 hour', 'online'
from public.resources where iiko_table_id = '99999999-0000-0000-0000-000000000001';
select is((select count(*)::int from public.integration_outbox), 0, 'выключенный обмен не пишет очередь');

select pg_temp.login('11111111-1111-1111-1111-111111111111');
select lives_ok(
  $$select public.save_iiko_settings('aaaaaaaa-1111-0000-0000-000000000001',
    '88888888-0000-0000-0000-000000000001', '88888888-0000-0000-0000-000000000002',
    array['88888888-0000-0000-0000-000000000003'::uuid], true)$$,
  'владелец включает обмен'
);
reset role;

insert into public.bookings (id, venue_id, resource_id, customer_id, starts_at, ends_at, blocked_until, source)
select 'cccccccc-2222-0000-0000-000000000002', 'aaaaaaaa-1111-0000-0000-000000000001', id,
  'dddddddd-2222-0000-0000-000000000001',
  now() + interval '51 days', now() + interval '51 days 1 hour', now() + interval '51 days 1 hour', 'phone'
from public.resources where iiko_table_id = '99999999-0000-0000-0000-000000000001';
select is(
  (select action from public.integration_outbox where booking_id = 'cccccccc-2222-0000-0000-000000000002'),
  'create', 'новая бронь — в очередь на создание'
);
select is(
  (select iiko_status from public.bookings where id = 'cccccccc-2222-0000-0000-000000000002'),
  'pending', 'бронь ждёт отправки'
);
update public.bookings set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Тест'
where id = 'cccccccc-2222-0000-0000-000000000002';
select is(
  (select array_agg(action order by id) from public.integration_outbox
    where booking_id = 'cccccccc-2222-0000-0000-000000000002'),
  array['create', 'cancel'], 'отмена — в очередь на отмену'
);
select is((select count(*)::int from public.iiko_claim_outbox(10)), 2, 'сервер забирает очередь');
select is((select count(*)::int from public.iiko_claim_outbox(10)), 0, 'один раз');

select pg_temp.login('11111111-1111-1111-1111-111111111111');
select throws_ok('select 1 from public.integration_outbox', '42501', null, 'очередь закрыта для пользователей');
reset role;

-- Режим «только онлайн-бронь» меняет владелец.
select pg_temp.login('11111111-1111-1111-1111-111111111111');
select isnt_empty(
  $$update public.venues set booking_only = true
    where id = 'aaaaaaaa-1111-0000-0000-000000000001' returning id$$,
  'владелец включает режим только онлайн-брони'
);
reset role;

select * from finish();
rollback;
