-- Этап 9.5: интеграция с iiko. Ключ в Vault, настройки, синхронизация
-- столов, очередь отправки броней. Управляет только владелец платформы.
-- Демо Бильярд: owner 1111…, admin 2222…, заведение aaaaaaaa-1111…; platform 9999….
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

-- Локальные данные могли изменить режим заведения: начинаем с полной CRM.
update public.venues set booking_only = false
where id = 'aaaaaaaa-1111-0000-0000-000000000001';

-- Ключ ----------------------------------------------------------------------------

select pg_temp.login('22222222-2222-2222-2222-222222222222');
select throws_ok(
  $$select public.set_iiko_api_login('aaaaaaaa-1111-0000-0000-000000000001', 'secret')$$,
  '42501', null, 'администратор не задаёт ключ iiko'
);
reset role;

select pg_temp.login('11111111-1111-1111-1111-111111111111');
select throws_ok(
  $$select public.set_iiko_api_login('aaaaaaaa-1111-0000-0000-000000000001', 'key')$$,
  '42501', null, 'владелец заведения не задаёт ключ iiko'
);
select throws_ok(
  $$select public.save_iiko_settings('aaaaaaaa-1111-0000-0000-000000000001',
    null, null, '{}', false)$$,
  '42501', null, 'и не меняет настройки'
);
select throws_ok(
  $$select public.set_venue_booking_only('aaaaaaaa-1111-0000-0000-000000000001', true)$$,
  '42501', null, 'и не включает режим «только онлайн-бронь»'
);
select throws_ok(
  $$update public.venues set booking_only = true
    where id = 'aaaaaaaa-1111-0000-0000-000000000001'$$,
  '42501', null, 'даже прямым изменением своей строки'
);
select lives_ok(
  $$update public.venues set description = 'Можно'
    where id = 'aaaaaaaa-1111-0000-0000-000000000001'$$,
  'остальной профиль владелец правит как раньше'
);
reset role;

select pg_temp.login('99999999-9999-9999-9999-999999999999');
select throws_ok(
  $$select public.save_iiko_settings('aaaaaaaa-1111-0000-0000-000000000001',
    null, null, '{}', false)$$,
  'P0001', 'api_login_required', 'без ключа настройки не сохраняются'
);
select lives_ok(
  $$select public.set_iiko_api_login('aaaaaaaa-1111-0000-0000-000000000001', ' key-1 ')$$,
  'владелец платформы сохраняет ключ'
);
select lives_ok(
  $$select public.set_iiko_api_login('aaaaaaaa-1111-0000-0000-000000000001', 'key-2')$$,
  'и заменяет его'
);
select throws_ok(
  $$select public.iiko_api_login('aaaaaaaa-1111-0000-0000-000000000001')$$,
  '42501', null, 'ключ обратно не отдаётся никому, кроме сервера'
);
select is(
  (select count(*)::int from public.venue_integrations
    where venue_id = 'aaaaaaaa-1111-0000-0000-000000000001'), 1,
  'владелец платформы видит строку интеграции'
);
select throws_ok(
  $$select public.save_iiko_settings('aaaaaaaa-1111-0000-0000-000000000001',
    null, null, '{}', true)$$,
  'P0001', 'iiko_settings_incomplete', 'включить без организации и залов нельзя'
);
reset role;

select pg_temp.login('11111111-1111-1111-1111-111111111111');
select is(
  (select count(*)::int from public.venue_integrations), 1,
  'владелец заведения видит состояние интеграции'
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
select throws_ok(
  $$select public.sync_iiko_tables('aaaaaaaa-1111-0000-0000-000000000001', '[]'::jsonb)$$,
  '42501', null, 'владелец заведения не загружает столы'
);
reset role;

select pg_temp.login('99999999-9999-9999-9999-999999999999');
select is(
  public.sync_iiko_tables('aaaaaaaa-1111-0000-0000-000000000001', '[
    {"iiko_table_id":"99999999-0000-0000-0000-000000000001","name":"Стол iiko 1","capacity":4,"kind":"pool_table","x":40,"y":40,"w":140,"h":100},
    {"iiko_table_id":"99999999-0000-0000-0000-000000000002","name":"Стол iiko 2","capacity":6,"kind":"pool_table","x":210,"y":40,"w":140,"h":100}
  ]'::jsonb),
  2, 'загружены два стола'
);
reset role;
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
reset role;
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
select is(
  (select count(*)::int from public.integration_outbox
    where booking_id = 'cccccccc-2222-0000-0000-000000000001'),
  0, 'выключенный обмен не пишет очередь'
);

select pg_temp.login('99999999-9999-9999-9999-999999999999');
select lives_ok(
  $$select public.save_iiko_settings('aaaaaaaa-1111-0000-0000-000000000001',
    '88888888-0000-0000-0000-000000000001', '88888888-0000-0000-0000-000000000002',
    array['88888888-0000-0000-0000-000000000003'::uuid], true)$$,
  'владелец платформы включает обмен'
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

-- Режим «только онлайн-бронь» меняет владелец платформы.
select pg_temp.login('99999999-9999-9999-9999-999999999999');
select lives_ok(
  $$select public.set_venue_booking_only('aaaaaaaa-1111-0000-0000-000000000001', true)$$,
  'владелец платформы включает режим только онлайн-брони'
);
reset role;
select is(
  (select booking_only from public.venues where id = 'aaaaaaaa-1111-0000-0000-000000000001'),
  true, 'режим включён'
);

-- Новое заведение сразу с iiko одной транзакцией.
insert into auth.users (id, email, aud, role)
values ('44444444-2222-4444-4444-444444444444', 'iikoowner@demo.local', 'authenticated', 'authenticated');
select pg_temp.login('99999999-9999-9999-9999-999999999999');
create temp table iiko_venue as
select public.platform_create_venue_iiko(
  '44444444-2222-4444-4444-444444444444', 'ТОО Ресторан',
  '{"type":"karaoke","name":"Караоке iiko","slug":"karaoke-iiko-22","city":"Алматы"}'::jsonb,
  'iiko-key', '88888888-0000-0000-0000-000000000011', '88888888-0000-0000-0000-000000000012',
  array['88888888-0000-0000-0000-000000000013'::uuid],
  '[{"iiko_table_id":"99999999-0000-0000-0000-000000000021","name":"Кабинка 1","capacity":6,"kind":"karaoke_room","x":40,"y":40,"w":140,"h":100}]'::jsonb
) as id;
reset role;
select results_eq(
  $$select v.booking_only, i.enabled, (select count(*)::int from public.resources r where r.venue_id = v.id)
    from public.venues v join public.venue_integrations i on i.venue_id = v.id
    where v.id = (select id from iiko_venue)$$,
  $$values (true, true, 1)$$,
  'заведение создано в режиме только брони, обмен включён, стол загружен'
);
select is(
  public.iiko_api_login((select id from iiko_venue)), 'iiko-key', 'ключ сохранён'
);
select pg_temp.login('44444444-2222-4444-4444-444444444444');
select throws_ok(
  $$select public.platform_create_venue_iiko('44444444-2222-4444-4444-444444444444', null,
    '{"type":"karaoke","name":"Сам","slug":"self-iiko-22","city":"Алматы"}'::jsonb,
    'k', null, null, '{}', '[]'::jsonb)$$,
  '42501', null, 'владелец заведения так заведения не создаёт'
);
reset role;

select * from finish();
rollback;
