-- Демо-данные для локальной разработки и тестов. Пароль у всех: demo12345.
--
-- Демо Бильярд (demo-billiards): owner@demo.local — владелец, admin@demo.local — администратор.
-- Демо PS-клуб (demo-ps-club): owner2@demo.local — владелец другой организации.
-- Второе заведение нужно тестам RLS: пользователи одного заведения не видят другое.
--
-- id фиксированные, на них ссылаются тесты в supabase/tests.

-- Пользователи --------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('demo12345', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', u.full_name), now(), now(),
  '', '', '', ''
from (values
  ('11111111-1111-1111-1111-111111111111'::uuid, 'owner@demo.local', 'Демо Владелец'),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'admin@demo.local', 'Демо Администратор'),
  ('33333333-3333-3333-3333-333333333333'::uuid, 'owner2@demo.local', 'Второй Владелец')
) as u (id, email, full_name);

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id, u.id::text, 'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  now(), now(), now()
from auth.users u
where u.email like '%@demo.local';

-- Организации и участники ---------------------------------------------------
-- Строку владельца в members добавляет триггер organizations_add_owner_as_member.

insert into public.organizations (id, name, owner_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Демо Бильярд ТОО', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Демо PS ТОО', '33333333-3333-3333-3333-333333333333');

insert into public.members (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'admin');

-- Заведения -----------------------------------------------------------------

insert into public.venues (
  id, org_id, type, name, slug, city, address, phone, description, working_hours, is_published
) values
  (
    'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
    'billiards', 'Демо Бильярд', 'demo-billiards', 'Алматы', 'пр. Абая, 1', '+7 700 000 00 01',
    'Шесть столов пул и два русских. Бар, тихий зал.',
    '[
      {"weekday":1,"open":"10:00","close":"02:00"},
      {"weekday":2,"open":"10:00","close":"02:00"},
      {"weekday":3,"open":"10:00","close":"02:00"},
      {"weekday":4,"open":"10:00","close":"02:00"},
      {"weekday":5,"open":"10:00","close":"02:00"},
      {"weekday":6,"open":"10:00","close":"02:00"},
      {"weekday":7,"open":"10:00","close":"02:00"}
    ]'::jsonb,
    true
  ),
  (
    'bbbbbbbb-1111-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
    'ps_club', 'Демо PS-клуб', 'demo-ps-club', 'Астана', 'ул. Кенесары, 2', '+7 700 000 00 02',
    'PS5, четыре комнаты.',
    '[
      {"weekday":1,"open":"12:00","close":"04:00"},
      {"weekday":2,"open":"12:00","close":"04:00"},
      {"weekday":3,"open":"12:00","close":"04:00"},
      {"weekday":4,"open":"12:00","close":"04:00"},
      {"weekday":5,"open":"12:00","close":"04:00"},
      {"weekday":6,"open":"12:00","close":"04:00"},
      {"weekday":7,"open":"12:00","close":"04:00"}
    ]'::jsonb,
    false
  );

insert into public.venue_photos (venue_id, storage_path, sort) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001/demo-1.jpg', 0),
  ('bbbbbbbb-1111-0000-0000-000000000001', 'bbbbbbbb-1111-0000-0000-000000000001/demo-1.jpg', 0);
