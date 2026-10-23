-- Этап 1.1: организации, участники, заведения, фото. Работает на данных из seed.sql.
--
-- Демо Бильярд: owner 1111…, admin 2222…, организация aaaaaaaa-0000…, заведение aaaaaaaa-1111…
-- Демо PS-клуб: owner2 3333…, организация bbbbbbbb-0000…, заведение bbbbbbbb-1111…
begin;
select * from no_plan();

-- Вход от имени пользователя: JWT с sub и роль authenticated.
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

-- Структура -----------------------------------------------------------------

select has_table('public', 'organizations', 'таблица organizations есть');
select has_table('public', 'members', 'таблица members есть');
select has_table('public', 'venues', 'таблица venues есть');
select has_table('public', 'venue_photos', 'таблица venue_photos есть');

select ok(
  (select bool_and(c.relrowsecurity) from pg_class c
   where c.oid in ('public.organizations'::regclass, 'public.members'::regclass,
                   'public.venues'::regclass, 'public.venue_photos'::regclass)),
  'RLS включён на всех четырёх таблицах'
);

-- Триггер: владелец сам попадает в members ----------------------------------

select results_eq(
  $$select role::text from public.members
    where org_id = 'aaaaaaaa-0000-0000-0000-000000000001'
      and user_id = '11111111-1111-1111-1111-111111111111'$$,
  array['owner'],
  'создатель организации записан участником с ролью owner'
);

-- Администратор Демо Бильярда -----------------------------------------------

select pg_temp.login('22222222-2222-2222-2222-222222222222');

select results_eq(
  'select id from public.venues',
  array['aaaaaaaa-1111-0000-0000-000000000001'::uuid],
  'администратор видит только своё заведение'
);
select is_empty(
  $$select 1 from public.organizations where id = 'bbbbbbbb-0000-0000-0000-000000000001'$$,
  'администратор не видит чужую организацию'
);
select is_empty(
  $$select 1 from public.members where org_id = 'bbbbbbbb-0000-0000-0000-000000000001'$$,
  'администратор не видит сотрудников чужой организации'
);
select is_empty(
  $$select 1 from public.venue_photos where venue_id = 'bbbbbbbb-1111-0000-0000-000000000001'$$,
  'администратор не видит фото чужого заведения'
);
select is(
  (select count(*)::int from public.venue_photos),
  1,
  'администратор видит фото своего заведения'
);

select is_empty(
  $$update public.venues set name = 'Взлом' where id = 'aaaaaaaa-1111-0000-0000-000000000001' returning id$$,
  'администратор не меняет профиль заведения'
);
select is_empty(
  $$delete from public.venue_photos where venue_id = 'aaaaaaaa-1111-0000-0000-000000000001' returning id$$,
  'администратор не удаляет фото'
);
select throws_ok(
  $$insert into public.venue_photos (venue_id, storage_path)
    values ('aaaaaaaa-1111-0000-0000-000000000001', 'x.jpg')$$,
  '42501', null,
  'администратор не добавляет фото'
);
select throws_ok(
  $$insert into public.members (org_id, user_id, role)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'admin')$$,
  '42501', null,
  'администратор не добавляет сотрудников'
);
select throws_ok(
  $$insert into public.venues (org_id, type, name, slug, city)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'billiards', 'Ещё', 'admin-venue', 'Алматы')$$,
  '42501', null,
  'администратор не создаёт заведения'
);
select ok(
  public.is_venue_member('aaaaaaaa-1111-0000-0000-000000000001')
    and not public.is_venue_owner('aaaaaaaa-1111-0000-0000-000000000001'),
  'is_venue_member = true, is_venue_owner = false для администратора'
);
reset role;

-- Владелец Демо Бильярда ----------------------------------------------------

select pg_temp.login('11111111-1111-1111-1111-111111111111');

select results_eq(
  'select id from public.venues',
  array['aaaaaaaa-1111-0000-0000-000000000001'::uuid],
  'владелец видит только своё заведение'
);
select is_empty(
  $$update public.venues set name = 'Взлом' where id = 'bbbbbbbb-1111-0000-0000-000000000001' returning id$$,
  'владелец не меняет чужое заведение'
);
select isnt_empty(
  $$update public.venues set description = 'Обновлено' where id = 'aaaaaaaa-1111-0000-0000-000000000001' returning id$$,
  'владелец меняет своё заведение'
);
select throws_ok(
  $$insert into public.venues (org_id, type, name, slug, city)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'billiards', 'Чужое', 'foreign-venue', 'Алматы')$$,
  '42501', null,
  'владелец не создаёт заведение в чужой организации'
);
select throws_ok(
  $$insert into public.venues (org_id, type, name, slug, city)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'karaoke', 'Второе', 'demo-karaoke', 'Алматы')$$,
  '42501', null,
  'владелец не создаёт заведения сам: их подключает владелец платформы (9.2)'
);
select is_empty(
  $$delete from public.members
    where org_id = 'aaaaaaaa-0000-0000-0000-000000000001'
      and user_id = '11111111-1111-1111-1111-111111111111' returning user_id$$,
  'владелец не может удалить строку владельца'
);
select throws_ok(
  $$insert into public.members (org_id, user_id, role)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'owner')$$,
  '42501', null,
  'владелец не назначает второго владельца напрямую'
);
select ok(
  public.is_venue_owner('aaaaaaaa-1111-0000-0000-000000000001')
    and not public.is_venue_member('bbbbbbbb-1111-0000-0000-000000000001'),
  'is_venue_owner = true для своего, is_venue_member = false для чужого'
);
reset role;

-- Второй владелец ------------------------------------------------------------

select pg_temp.login('33333333-3333-3333-3333-333333333333');

select results_eq(
  'select id from public.venues',
  array['bbbbbbbb-1111-0000-0000-000000000001'::uuid],
  'второй владелец видит только своё заведение'
);
select is_empty(
  $$select 1 from public.organizations where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  'второй владелец не видит организацию Демо Бильярда'
);
reset role;

-- Новый пользователь не создаёт организацию: регистрация закрыта (9.2) ----

insert into auth.users (id, email, aud, role)
values ('44444444-4444-4444-4444-444444444444', 'new@demo.local', 'authenticated', 'authenticated');

select pg_temp.login('44444444-4444-4444-4444-444444444444');

select is_empty('select 1 from public.venues', 'новый пользователь не видит ни одного заведения');
select throws_ok(
  $$insert into public.organizations (id, name, owner_id)
    values ('cccccccc-0000-0000-0000-000000000001', 'Новый бизнес', '44444444-4444-4444-4444-444444444444')$$,
  '42501', null,
  'новый пользователь не создаёт организацию'
);
select throws_ok(
  $$insert into public.organizations (name, owner_id)
    values ('Чужой бизнес', '11111111-1111-1111-1111-111111111111')$$,
  '42501', null,
  'нельзя создать организацию на чужое имя'
);
select throws_ok(
  $$insert into public.venues (org_id, type, name, slug, city)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'sauna', 'Новая сауна', 'new-sauna', 'Шымкент')$$,
  '42501', null,
  'и не создаёт заведение'
);
reset role;

-- anon -----------------------------------------------------------------------

set local role anon;
select throws_ok('select * from public.organizations', '42501', null, 'anon не читает organizations');
select throws_ok('select * from public.members', '42501', null, 'anon не читает members');
select throws_ok('select * from public.venues', '42501', null, 'anon не читает venues');
select throws_ok('select * from public.venue_photos', '42501', null, 'anon не читает venue_photos');
reset role;

-- slug -----------------------------------------------------------------------

select throws_ok(
  $$insert into public.venues (org_id, type, name, slug, city)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'billiards', 'X', 'admin', 'Алматы')$$,
  '23514', null,
  'зарезервированный slug отклоняется'
);
select throws_ok(
  $$insert into public.venues (org_id, type, name, slug, city)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'billiards', 'X', 'Demo Club', 'Алматы')$$,
  '23514', null,
  'slug с пробелом и заглавными отклоняется'
);
select throws_ok(
  $$insert into public.venues (org_id, type, name, slug, city)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'billiards', 'X', 'ab', 'Алматы')$$,
  '23514', null,
  'slug короче 3 символов отклоняется'
);
select throws_ok(
  $$insert into public.venues (org_id, type, name, slug, city)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'billiards', 'X', '-club-', 'Алматы')$$,
  '23514', null,
  'slug с дефисом по краям отклоняется'
);
select throws_ok(
  $$insert into public.venues (org_id, type, name, slug, city)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'billiards', 'X', 'demo-ps-club', 'Алматы')$$,
  '23505', null,
  'занятый slug отклоняется'
);

-- Настройки брони ------------------------------------------------------------

select throws_ok(
  $$update public.venues set slot_step_min = 20 where id = 'aaaaaaaa-1111-0000-0000-000000000001'$$,
  '23514', null,
  'шаг слота только 15, 30 или 60'
);

select * from finish();
rollback;
