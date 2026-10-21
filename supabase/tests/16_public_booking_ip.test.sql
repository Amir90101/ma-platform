-- Этап 6.4: лимит онлайн-броней на IP — в пределах заведения.
--
-- Демо Бильярд (опубликован, столы aaaaaaaa-3333…) и Демо PS-клуб
-- (публикуем в тесте, зоны bbbbbbbb-3333…01–02, 12:00–04:00).
begin;
select plan(3);

create function pg_temp.at(p_time text) returns timestamptz
language sql as $$
  select (((now() at time zone 'Asia/Almaty')::date + 1) + p_time::time) at time zone 'Asia/Almaty'
$$;

update public.venues set is_published = true where id = 'bbbbbbbb-1111-0000-0000-000000000001';

set local role service_role;
select lives_ok(
  $$select public.create_public_booking('aaaaaaaa-3333-0000-0000-000000000001', pg_temp.at('12:00'), 60,
    '+77070000001', 'Первый', null, null, '10.9.9.9', 5, 1)$$,
  'первая бронь с IP в бильярдной');
select throws_ok(
  $$select public.create_public_booking('aaaaaaaa-3333-0000-0000-000000000002', pg_temp.at('12:00'), 60,
    '+77070000002', 'Второй', null, null, '10.9.9.9', 5, 1)$$,
  'P0001', 'limit_ip', 'вторая с того же IP в том же заведении — лимит');
select lives_ok(
  $$select public.create_public_booking('bbbbbbbb-3333-0000-0000-000000000001', pg_temp.at('13:00'), 60,
    '+77070000003', 'Третий', null, null, '10.9.9.9', 5, 1)$$,
  'с того же IP в другом заведении — свой лимит');

select * from finish();
rollback;
