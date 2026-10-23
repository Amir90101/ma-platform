-- Этап 9.2: владелец платформы подключает заведения и видит их список, но
-- не деньги и не гостей. Данные из seed.sql.
--
-- platform 9999…, Демо Бильярд: owner 1111…, admin 2222…, заведение aaaaaaaa-1111….
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

-- Оплата в Демо Бильярде, чтобы было что не показать.
insert into public.shifts (id, venue_id, opened_by, opened_at, opening_cash,
  closed_by, closed_at, closing_cash) values
  ('eeeeeeee-9999-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222', now() - interval '3 days', 0,
   '22222222-2222-2222-2222-222222222222', now() - interval '3 days' + interval '2 hours', 2000);
insert into public.sessions (id, venue_id, status, started_by, started_at, closed_at, total_amount) values
  ('ffffffff-9999-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'closed',
   '22222222-2222-2222-2222-222222222222', now() - interval '3 days', now() - interval '3 days' + interval '1 hour', 2000);
insert into public.payments (venue_id, shift_id, session_id, amount, method, created_by) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'eeeeeeee-9999-0000-0000-000000000001',
   'ffffffff-9999-0000-0000-000000000001', 2000, 'cash', '22222222-2222-2222-2222-222222222222');

insert into auth.users (id, email, aud, role)
values ('44444444-9999-4444-4444-444444444444', 'newowner@demo.local', 'authenticated', 'authenticated');

-- Владелец платформы ----------------------------------------------------------

select pg_temp.login('99999999-9999-9999-9999-999999999999');

select ok(public.is_platform_admin(), 'is_platform_admin = true');
select ok(
  (select count(*) from public.platform_venues()) >= 2,
  'видит все заведения в списке'
);
select is(
  (select owner_email from public.platform_venues()
    where id = 'aaaaaaaa-1111-0000-0000-000000000001'),
  'owner@demo.local',
  'видит email владельца'
);
select is(
  (select resources from public.platform_venues()
    where id = 'aaaaaaaa-1111-0000-0000-000000000001'),
  8,
  'видит готовность настройки: 8 столов'
);

-- Деньги и гости закрыты RLS: в организациях он не состоит.
select is_empty('select 1 from public.payments', 'не видит оплаты');
select is_empty('select 1 from public.sessions', 'не видит сеансы');
select is_empty('select 1 from public.shifts', 'не видит смены');
select is_empty('select 1 from public.customers', 'не видит гостей');
select is_empty('select 1 from public.bookings', 'не видит брони');
select is_empty('select 1 from public.venues', 'не читает заведения напрямую');
select throws_ok(
  $$select public.get_revenue_report('aaaaaaaa-1111-0000-0000-000000000001',
    current_date - 7, current_date)$$,
  null, null,
  'не получает отчёт о выручке'
);

-- Новое заведение новому владельцу: организация создаётся.
select lives_ok(
  $$select public.platform_create_venue(
    '44444444-9999-4444-4444-444444444444', 'ТОО Новый клуб',
    '{"type":"ps_club","name":"Новый клуб","slug":"new-club-92","city":"Алматы",
      "address":null,"phone":null,"description":null,
      "working_hours":[{"weekday":1,"open":"00:00","close":"00:00"}]}'::jsonb)$$,
  'создаёт заведение новому владельцу'
);
-- Второе заведение тому же владельцу — в ту же организацию.
select lives_ok(
  $$select public.platform_create_venue(
    '44444444-9999-4444-4444-444444444444', 'Не нужно',
    '{"type":"karaoke","name":"Караоке","slug":"new-karaoke-92","city":"Алматы"}'::jsonb)$$,
  'второе заведение тому же владельцу'
);
select throws_ok(
  $$select public.platform_create_venue(
    '44444444-9999-4444-4444-444444444444', null,
    '{"type":"karaoke","name":"Дубль","slug":"demo-billiards","city":"Алматы"}'::jsonb)$$,
  '23505', null,
  'занятый адрес страницы отклоняется'
);
reset role;

select is(
  (select count(*)::int from public.organizations
    where owner_id = '44444444-9999-4444-4444-444444444444'),
  1,
  'у нового владельца одна организация'
);
select is(
  (select name from public.organizations
    where owner_id = '44444444-9999-4444-4444-444444444444'),
  'ТОО Новый клуб',
  'с названием из формы'
);
select is(
  (select count(*)::int from public.venues v
    join public.organizations o on o.id = v.org_id
    where o.owner_id = '44444444-9999-4444-4444-444444444444'),
  2,
  'и двумя заведениями'
);
select ok(
  exists (select 1 from public.members
    where user_id = '44444444-9999-4444-4444-444444444444' and role = 'owner'),
  'владелец стал участником своей организации'
);
select ok(
  not exists (select 1 from public.members
    where user_id = '99999999-9999-9999-9999-999999999999'),
  'владелец платформы в организации не добавлен'
);

-- Новый владелец видит своё заведение.
select pg_temp.login('44444444-9999-4444-4444-444444444444');
select is(
  (select count(*)::int from public.venues),
  2,
  'новый владелец видит оба заведения'
);
select ok(not public.is_platform_admin(), 'владелец заведения — не владелец платформы');
select throws_ok(
  'select * from public.platform_venues()',
  '42501', null,
  'владелец заведения не получает список платформы'
);
select throws_ok(
  $$select public.platform_create_venue(
    '44444444-9999-4444-4444-444444444444', null,
    '{"type":"karaoke","name":"Сам","slug":"self-made-92","city":"Алматы"}'::jsonb)$$,
  '42501', null,
  'владелец заведения не создаёт заведения через функцию платформы'
);
reset role;

-- Администратор и anon.
select pg_temp.login('22222222-2222-2222-2222-222222222222');
select throws_ok('select * from public.platform_venues()', '42501', null,
  'администратор не получает список платформы');
select throws_ok('select 1 from public.platform_admins', '42501', null,
  'таблица владельцев платформы закрыта');
reset role;

set local role anon;
select throws_ok('select public.is_platform_admin()', '42501', null,
  'anon не вызывает is_platform_admin');
reset role;

select * from finish();
rollback;
