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

-- Залы и карта (этап 2.1) ----------------------------------------------------
-- Холст 1200×800 условных единиц. Демо Бильярд: 6 столов пул, 2 русских, бар и вход.

insert into public.halls (id, venue_id, name, width, height, sort) values
  ('aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'Основной зал', 1200, 800, 0),
  ('bbbbbbbb-2222-0000-0000-000000000001', 'bbbbbbbb-1111-0000-0000-000000000001', 'Комнаты', 1200, 800, 0);

insert into public.resources (id, venue_id, hall_id, kind, name, capacity, x, y, w, h, rotation) values
  ('aaaaaaaa-3333-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', 'pool_table', 'Стол 1', null, 100, 120, 180, 100, 0),
  ('aaaaaaaa-3333-0000-0000-000000000002', 'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', 'pool_table', 'Стол 2', null, 340, 120, 180, 100, 0),
  ('aaaaaaaa-3333-0000-0000-000000000003', 'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', 'pool_table', 'Стол 3', null, 580, 120, 180, 100, 0),
  ('aaaaaaaa-3333-0000-0000-000000000004', 'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', 'pool_table', 'Стол 4', null, 100, 320, 180, 100, 0),
  ('aaaaaaaa-3333-0000-0000-000000000005', 'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', 'pool_table', 'Стол 5', null, 340, 320, 180, 100, 0),
  ('aaaaaaaa-3333-0000-0000-000000000006', 'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', 'pool_table', 'Стол 6', null, 580, 320, 180, 100, 0),
  ('aaaaaaaa-3333-0000-0000-000000000007', 'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', 'russian_table', 'Русский 1', null, 860, 120, 220, 120, 0),
  ('aaaaaaaa-3333-0000-0000-000000000008', 'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', 'russian_table', 'Русский 2', null, 860, 340, 220, 120, 0),
  ('bbbbbbbb-3333-0000-0000-000000000001', 'bbbbbbbb-1111-0000-0000-000000000001', 'bbbbbbbb-2222-0000-0000-000000000001', 'ps_zone', 'PS-1', 4, 100, 100, 200, 160, 0),
  ('bbbbbbbb-3333-0000-0000-000000000002', 'bbbbbbbb-1111-0000-0000-000000000001', 'bbbbbbbb-2222-0000-0000-000000000001', 'ps_zone', 'PS-2', 4, 360, 100, 200, 160, 0);

insert into public.hall_objects (hall_id, kind, label, x, y, w, h) values
  ('aaaaaaaa-2222-0000-0000-000000000001', 'bar', 'Бар', 100, 600, 420, 80),
  ('aaaaaaaa-2222-0000-0000-000000000001', 'entrance', 'Вход', 1020, 700, 120, 60),
  ('bbbbbbbb-2222-0000-0000-000000000001', 'entrance', 'Вход', 1020, 700, 120, 60);

-- Тарифы (этап 3.1) ----------------------------------------------------------
-- Совпадают с демо-тарифами из docs/TESTING.md, раздел «Расчёт суммы».

insert into public.tariffs (id, venue_id, name, resource_kinds, price_per_hour, weekdays, time_from, time_to) values
  ('aaaaaaaa-4444-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'Будни день',
   '{pool_table,russian_table}', 1500, '{1,2,3,4,5}', '10:00', '18:00'),
  ('aaaaaaaa-4444-0000-0000-000000000002', 'aaaaaaaa-1111-0000-0000-000000000001', 'Вечер',
   '{pool_table,russian_table}', 2500, '{1,2,3,4,5}', '18:00', '02:00'),
  ('aaaaaaaa-4444-0000-0000-000000000003', 'aaaaaaaa-1111-0000-0000-000000000001', 'Выходные',
   '{pool_table,russian_table}', 3000, '{6,7}', '10:00', '02:00');

insert into public.packages (id, venue_id, name, resource_kinds, minutes, price) values
  ('aaaaaaaa-5555-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', '3 часа за 5 000',
   '{pool_table,russian_table}', 180, 5000);
