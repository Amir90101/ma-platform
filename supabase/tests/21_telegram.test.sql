-- Этап 9.4: Telegram. Коды подключения, чаты заведения, очередь уведомлений.
-- Демо Бильярд: owner 1111…, admin 2222…, заведение aaaaaaaa-1111…, Стол 1 aaaaaaaa-3333…01.
-- Демо PS-клуб: owner2 3333…, заведение bbbbbbbb-1111….
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

-- Локальные демо-данные могут держать открытую смену: закрываем до подключения
-- чатов (в очередь это не попадёт), транзакция всё равно откатится.
update public.shifts set closed_at = now(), closing_cash = 0, expected_cash = 0, closed_by = opened_by
where venue_id = 'aaaaaaaa-1111-0000-0000-000000000001' and closed_at is null;

-- Коды подключения ----------------------------------------------------------------

select pg_temp.login('22222222-2222-2222-2222-222222222222');
select throws_ok(
  $$select public.create_telegram_link_code('aaaaaaaa-1111-0000-0000-000000000001')$$,
  '42501', null, 'администратор не подключает Telegram'
);
reset role;

select pg_temp.login('11111111-1111-1111-1111-111111111111');
create temp table code as
  select public.create_telegram_link_code('aaaaaaaa-1111-0000-0000-000000000001') as v;
select matches((select v from code), '^[0-9A-F]{10}$', 'владелец получает код из 10 знаков');
select throws_ok('select 1 from public.telegram_link_codes', '42501', null,
  'коды напрямую не читаются');
reset role;

-- Без чатов очередь не растёт.
insert into public.bookings (venue_id, resource_id, customer_id, starts_at, ends_at, blocked_until, source)
select 'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-3333-0000-0000-000000000001',
  (select id from public.customers where venue_id = 'aaaaaaaa-1111-0000-0000-000000000001' limit 1),
  now() + interval '30 days', now() + interval '30 days 1 hour', now() + interval '30 days 1 hour', 'phone'
where exists (select 1 from public.customers where venue_id = 'aaaaaaaa-1111-0000-0000-000000000001');
select is(
  (select count(*)::int from public.notification_outbox
    where venue_id = 'aaaaaaaa-1111-0000-0000-000000000001'),
  0, 'без подключённых чатов уведомления не копятся'
);

-- Подключение: неверный код — null, верный — название заведения.
select is(public.telegram_link_chat('WRONGCODE1', 1001, 'Чат'), null, 'неверный код не подключает');
select is(
  public.telegram_link_chat(lower((select v from code)), 1001, 'Админы бильярда'),
  'Демо Бильярд',
  'верный код подключает чат (регистр не важен)'
);
select is(public.telegram_link_chat((select v from code), 1002, 'Ещё'), null,
  'код одноразовый');

-- Чаты видит и отключает только владелец своего заведения.
select pg_temp.login('33333333-3333-3333-3333-333333333333');
select is_empty('select 1 from public.telegram_chats', 'чужой владелец не видит чаты');
select is_empty('delete from public.telegram_chats returning id', 'и не удаляет их');
reset role;
select pg_temp.login('22222222-2222-2222-2222-222222222222');
select is_empty('select 1 from public.telegram_chats', 'администратор не видит чаты');
reset role;
select pg_temp.login('11111111-1111-1111-1111-111111111111');
select is((select title from public.telegram_chats), 'Админы бильярда', 'владелец видит чат');
reset role;

-- События в очередь ------------------------------------------------------------

insert into public.customers (id, venue_id, phone, name) values
  ('dddddddd-2121-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', '+77019998877', 'Телеграм Гость');

insert into public.bookings (id, venue_id, resource_id, customer_id, starts_at, ends_at, blocked_until, source, guests)
values ('cccccccc-2121-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001',
  'aaaaaaaa-3333-0000-0000-000000000001', 'dddddddd-2121-0000-0000-000000000001',
  now() + interval '40 days', now() + interval '40 days 2 hours', now() + interval '40 days 2 hours',
  'online', 3);

select is(
  (select kind from public.notification_outbox order by id desc limit 1),
  'booking_created', 'новая бронь попадает в очередь'
);
select is(
  (select payload ->> 'customer_name' from public.notification_outbox order by id desc limit 1),
  'Телеграм Гость', 'с именем гостя'
);
select is(
  (select payload ->> 'resource' from public.notification_outbox order by id desc limit 1),
  'Стол 1', 'и столом'
);

update public.bookings set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Передумал'
where id = 'cccccccc-2121-0000-0000-000000000001';
select is(
  (select kind || ':' || (payload ->> 'cancel_reason') from public.notification_outbox order by id desc limit 1),
  'booking_cancelled:Передумал', 'отмена с причиной'
);

-- Закрытие смены.
insert into public.shifts (id, venue_id, opened_by, opened_at, opening_cash, closed_by, closed_at, closing_cash)
values ('eeeeeeee-2121-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001',
  '22222222-2222-2222-2222-222222222222', now() - interval '20 days', 1000,
  null, null, null);
update public.shifts set closed_at = now() - interval '20 days' + interval '8 hours',
  closed_by = '22222222-2222-2222-2222-222222222222', closing_cash = 900, expected_cash = 1000
where id = 'eeeeeeee-2121-0000-0000-000000000001';
select is(
  (select kind || ':' || (payload ->> 'closed_by') || ':' || (payload ->> 'closing_cash')
     from public.notification_outbox order by id desc limit 1),
  'shift_closed:Демо Администратор:900', 'закрытие смены с автором и кассой'
);

-- Отправитель забирает очередь порциями, одну строку — один раз.
select is(
  (select count(*)::int from public.telegram_claim_outbox(100)), 3,
  'сервер забирает три события'
);
select is(
  (select count(*)::int from public.telegram_claim_outbox(100)), 0,
  'взятые строки повторно не отдаются'
);

-- Очередь закрыта для пользователей.
select pg_temp.login('11111111-1111-1111-1111-111111111111');
select throws_ok('select 1 from public.notification_outbox', '42501', null,
  'владелец не читает очередь напрямую');
select throws_ok('select * from public.telegram_claim_outbox(1)', '42501', null,
  'и не забирает её');
reset role;

select * from finish();
rollback;
