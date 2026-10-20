-- Этап 1.3: бакет venue-photos и права на объекты. Данные из seed.sql.
--
-- Демо Бильярд: owner 1111…, admin 2222…, заведение aaaaaaaa-1111…
-- Демо PS-клуб: owner2 3333…, заведение bbbbbbbb-1111…
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

-- Storage API так и удаляет; без этой настройки триггер запрещает delete в SQL.
set local storage.allow_delete_query = 'true';

-- Бакет ----------------------------------------------------------------------

select results_eq(
  $$select public, file_size_limit, allowed_mime_types
    from storage.buckets where id = 'venue-photos'$$,
  $$values (true, 5242880::bigint, array['image/jpeg', 'image/png', 'image/webp'])$$,
  'бакет venue-photos публичный, до 5 МБ, только jpeg/png/webp'
);

select is(public.venue_photo_venue_id('aaaaaaaa-1111-0000-0000-000000000001/x.jpg'),
  'aaaaaaaa-1111-0000-0000-000000000001'::uuid, 'venue_photo_venue_id берёт uuid из папки');
select is(public.venue_photo_venue_id('not-a-uuid/x.jpg'), null::uuid,
  'venue_photo_venue_id возвращает null для пути не по шаблону');

-- Владелец -------------------------------------------------------------------

select pg_temp.login('11111111-1111-1111-1111-111111111111');
select lives_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('venue-photos', 'aaaaaaaa-1111-0000-0000-000000000001/owner.jpg')$$,
  'владелец загружает фото в папку своего заведения'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('venue-photos', 'bbbbbbbb-1111-0000-0000-000000000001/owner.jpg')$$,
  '42501', null,
  'владелец не загружает фото в папку чужого заведения'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('venue-photos', 'owner.jpg')$$,
  '42501', null,
  'файл вне папки заведения не принимается'
);
reset role;

-- Администратор --------------------------------------------------------------

select pg_temp.login('22222222-2222-2222-2222-222222222222');
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('venue-photos', 'aaaaaaaa-1111-0000-0000-000000000001/admin.jpg')$$,
  '42501', null,
  'администратор не загружает фото: это настройки владельца'
);
select isnt_empty(
  $$select 1 from storage.objects
    where name = 'aaaaaaaa-1111-0000-0000-000000000001/owner.jpg'$$,
  'администратор видит объекты своего заведения'
);
delete from storage.objects where name = 'aaaaaaaa-1111-0000-0000-000000000001/owner.jpg';
reset role;

select isnt_empty(
  $$select 1 from storage.objects
    where name = 'aaaaaaaa-1111-0000-0000-000000000001/owner.jpg'$$,
  'администратор не удаляет фото'
);

-- Второй владелец ------------------------------------------------------------

select pg_temp.login('33333333-3333-3333-3333-333333333333');
select is_empty(
  $$select 1 from storage.objects
    where name = 'aaaaaaaa-1111-0000-0000-000000000001/owner.jpg'$$,
  'чужой владелец не видит объекты заведения'
);
delete from storage.objects where name = 'aaaaaaaa-1111-0000-0000-000000000001/owner.jpg';
reset role;

select isnt_empty(
  $$select 1 from storage.objects
    where name = 'aaaaaaaa-1111-0000-0000-000000000001/owner.jpg'$$,
  'чужой владелец не удаляет фото'
);

select throws_ok(
  $$insert into public.venues (org_id, type, name, slug, city)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'ps_club', 'Копия', 'demo-billiards', 'Астана')$$,
  '23505', null,
  'slug, занятый заведением другой организации, отклоняется'
);

-- Владелец удаляет своё ------------------------------------------------------

select pg_temp.login('11111111-1111-1111-1111-111111111111');
delete from storage.objects where name = 'aaaaaaaa-1111-0000-0000-000000000001/owner.jpg';
reset role;

select is_empty(
  $$select 1 from storage.objects
    where name = 'aaaaaaaa-1111-0000-0000-000000000001/owner.jpg'$$,
  'владелец удаляет фото своего заведения'
);

select * from finish();
rollback;
