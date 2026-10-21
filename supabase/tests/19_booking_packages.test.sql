-- Тариф-пакет в брони. Демо Бильярд: пакет aaaaaaaa-5555…01 «3 часа за
-- 5 000» (180 минут, пул и русский), шаг 30, столы aaaaaaaa-3333….
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
create function pg_temp.t(p_time text) returns timestamptz
language sql as $$
  select (((now() at time zone 'Asia/Almaty')::date + 1) + p_time::time) at time zone 'Asia/Almaty'
$$;
create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, service_role;

-- Пакет только для PS-зон: к бильярдному столу не подходит.
insert into public.packages (id, venue_id, name, resource_kinds, minutes, price)
values ('aaaaaaaa-5555-0000-0000-0000000000ff', 'aaaaaaaa-1111-0000-0000-000000000001',
        'PS 2 часа', '{ps_zone}', 120, 3000);

-- Онлайн ------------------------------------------------------------------------
set local role service_role;
insert into ids select 'online', (r ->> 'id')::uuid
from public.create_public_booking('aaaaaaaa-3333-0000-0000-000000000001', pg_temp.t('12:00'), 180,
  '+77090000101', 'Гость', null, null, null, 2, 5, 'aaaaaaaa-5555-0000-0000-000000000001') r;
reset role;
select is((select package_id from public.bookings where id = (select id from ids where name = 'online')),
  'aaaaaaaa-5555-0000-0000-000000000001'::uuid, 'онлайн-бронь хранит выбранный тариф');

set local role service_role;
select throws_ok(
  $$select public.create_public_booking('aaaaaaaa-3333-0000-0000-000000000002', pg_temp.t('12:00'), 60,
    '+77090000102', 'Гость', null, null, null, 2, 5, 'aaaaaaaa-5555-0000-0000-000000000001')$$,
  'P0002', 'package_not_found', 'длительность не совпадает с минутами тарифа — отказ');
select throws_ok(
  $$select public.create_public_booking('aaaaaaaa-3333-0000-0000-000000000002', pg_temp.t('12:00'), 120,
    '+77090000102', 'Гость', null, null, null, 2, 5, 'aaaaaaaa-5555-0000-0000-0000000000ff')$$,
  'P0002', 'package_not_found', 'тариф для PS-зон к бильярдному столу не подходит');

-- По звонку ---------------------------------------------------------------------
select pg_temp.login('22222222-2222-2222-2222-222222222222');
insert into ids select 'manual', public.create_manual_booking('aaaaaaaa-3333-0000-0000-000000000003',
  pg_temp.t('15:00'), pg_temp.t('18:00'), '+77090000103', 'Звонок', null, null, 'phone',
  'aaaaaaaa-5555-0000-0000-000000000001');
select is(
  (select package_name from public.get_day_bookings('aaaaaaaa-1111-0000-0000-000000000001',
     (now() at time zone 'Asia/Almaty')::date + 1)
   where id = (select id from ids where name = 'manual')),
  '3 часа за 5 000', 'лента дня показывает тариф брони');
select throws_ok(
  $$select public.create_manual_booking('aaaaaaaa-3333-0000-0000-000000000004',
    pg_temp.t('15:00'), pg_temp.t('17:00'), '+77090000104', null, null, null, 'phone',
    'aaaaaaaa-5555-0000-0000-000000000001')$$,
  'P0002', 'package_not_found', 'по звонку: время брони не совпадает с тарифом — отказ');

-- «Пришёл» берёт тариф из брони -----------------------------------------------------
reset role;
-- Бронь, которая уже началась, с тарифом (вставка напрямую, время не по сетке).
with b as (
  insert into public.bookings (venue_id, resource_id, customer_id, starts_at, ends_at, blocked_until, source, package_id)
  select 'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-3333-0000-0000-000000000005', customer_id,
    now() - interval '5 minutes', now() + interval '175 minutes', now() + interval '175 minutes',
    'online', 'aaaaaaaa-5555-0000-0000-000000000001'
  from public.bookings where id = (select id from ids where name = 'online')
  returning id
)
insert into ids select 'arrive', id from b;
select pg_temp.login('22222222-2222-2222-2222-222222222222');
select lives_ok(
  format($$select public.arrive_booking(%L)$$, (select id from ids where name = 'arrive')),
  '«Пришёл» без явного тарифа');
select is(
  (select package_id from public.sessions where booking_id = (select id from ids where name = 'arrive')),
  'aaaaaaaa-5555-0000-0000-000000000001'::uuid, 'сеанс стартует с тарифом из брони');

select * from finish();
rollback;
