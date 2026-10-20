-- Этап 1.4: сотрудники. Данные из seed.sql.
--
-- Демо Бильярд: owner 1111…, admin 2222…, организация aaaaaaaa-0000…
-- Демо PS-клуб: owner2 3333…, организация bbbbbbbb-0000…
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

-- Владелец -------------------------------------------------------------------

select pg_temp.login('11111111-1111-1111-1111-111111111111');
select results_eq(
  $$select email, role::text from public.get_org_staff('aaaaaaaa-0000-0000-0000-000000000001')$$,
  $$values ('owner@demo.local', 'owner'), ('admin@demo.local', 'admin')$$,
  'владелец видит сотрудников своей организации с email'
);
select is_empty(
  $$select 1 from public.get_org_staff('bbbbbbbb-0000-0000-0000-000000000001')$$,
  'владелец не видит сотрудников чужой организации'
);
select throws_ok(
  $$select public.user_id_by_email('admin@demo.local')$$,
  '42501', null,
  'пользователь не ищет других по email'
);
reset role;

-- Администратор --------------------------------------------------------------

select pg_temp.login('22222222-2222-2222-2222-222222222222');
select is_empty(
  $$select 1 from public.get_org_staff('aaaaaaaa-0000-0000-0000-000000000001')$$,
  'администратор не получает список сотрудников с email'
);
select is_empty(
  $$delete from public.members
    where org_id = 'aaaaaaaa-0000-0000-0000-000000000001'
      and user_id = '22222222-2222-2222-2222-222222222222' returning user_id$$,
  'администратор не удаляет сотрудников, даже себя'
);
select is_empty(
  $$update public.members set role = 'owner'
    where org_id = 'aaaaaaaa-0000-0000-0000-000000000001'
      and user_id = '22222222-2222-2222-2222-222222222222' returning user_id$$,
  'администратор не меняет роли'
);
reset role;

-- Владелец удаляет администратора ------------------------------------------

select pg_temp.login('11111111-1111-1111-1111-111111111111');
select isnt_empty(
  $$delete from public.members
    where org_id = 'aaaaaaaa-0000-0000-0000-000000000001'
      and user_id = '22222222-2222-2222-2222-222222222222' returning user_id$$,
  'владелец удаляет администратора'
);
reset role;

-- service_role -------------------------------------------------------------

set local role service_role;
select is(
  public.user_id_by_email(' Admin@Demo.Local '),
  '22222222-2222-2222-2222-222222222222'::uuid,
  'сервер находит пользователя по email без учёта регистра'
);
select is(public.user_id_by_email('nobody@demo.local'), null::uuid,
  'неизвестный email даёт null');
reset role;

select * from finish();
rollback;
