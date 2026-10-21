-- Живые демо-данные для ручной проверки: неделя смен с сеансами и
-- оплатами, открытая смена с занятыми столами, брони на сегодня и завтра;
-- PS-клуб с тарифами на время.
-- Не входит в seed.sql: тесты рассчитывают на чистый seed.
--
-- Запуск после `supabase db reset`:
--   docker exec -i supabase_db_<проект> psql -U postgres < supabase/demo-data.sql
-- Вернуть чистое демо: `supabase db reset`.
begin;

create temp table demo as
select
  'aaaaaaaa-1111-0000-0000-000000000001'::uuid as venue,
  '22222222-2222-2222-2222-222222222222'::uuid as admin,
  (now() at time zone 'Asia/Almaty')::date as today;

create function pg_temp.at(p_day date, p_time time) returns timestamptz
language sql as $$ select (p_day + p_time) at time zone 'Asia/Almaty' $$;

create function pg_temp.table_id(p_n int) returns uuid
language sql as $$ select ('aaaaaaaa-3333-0000-0000-' || lpad(p_n::text, 12, '0'))::uuid $$;

-- Гости ------------------------------------------------------------------------
insert into public.customers (id, venue_id, phone, name) values
  ('dddddddd-dddd-0000-0000-000000000001', (select venue from demo), '+77011112233', 'Арман'),
  ('dddddddd-dddd-0000-0000-000000000002', (select venue from demo), '+77012223344', 'Айдана'),
  ('dddddddd-dddd-0000-0000-000000000003', (select venue from demo), '+77013334455', 'Даурен'),
  ('dddddddd-dddd-0000-0000-000000000004', (select venue from demo), '+77014445566', 'Самал'),
  ('dddddddd-dddd-0000-0000-000000000005', (select venue from demo), '+77015556677', 'Ержан');

-- Прошлая неделя: смена в день, сеансы на столах, оплаты разными способами.
do $$
declare
  v demo;
  d int;
  i int;
  v_shift uuid;
  v_session uuid;
  v_start timestamptz;
  v_minutes int;
  v_rate int;
  v_amount int;
  v_method public.payment_method;
begin
  select * into v from demo;
  for d in 1..7 loop
    insert into public.shifts (venue_id, opened_by, opened_at, opening_cash, closed_by, closed_at, closing_cash, expected_cash)
    values (v.venue, v.admin, pg_temp.at(v.today - d, '10:00'), 20000, v.admin,
            pg_temp.at(v.today - d + 1, '01:30'), 0, 0)
    returning id into v_shift;

    for i in 1..8 loop
      -- Не каждый стол каждый день: загрузка разная.
      continue when (i * 7 + d * 3) % 5 = 0;
      v_start := pg_temp.at(v.today - d, make_time(11 + ((i * 3 + d) % 10), (i * 10) % 60, 0));
      v_minutes := 60 + ((i * 37 + d * 23) % 150);
      v_rate := case when extract(hour from v_start at time zone 'Asia/Almaty') >= 18 then 2500 else 1500 end;
      v_amount := ceil(v_minutes * v_rate / 60.0)::int;
      v_method := (array['cash', 'kaspi', 'card']::public.payment_method[])[1 + (i + d) % 3];

      insert into public.sessions (venue_id, status, started_by, started_at, closed_by, closed_at,
        time_amount, items_amount, total_amount)
      values (v.venue, 'closed', v.admin, v_start, v.admin, v_start + make_interval(mins => v_minutes),
        v_amount, 0, v_amount)
      returning id into v_session;
      insert into public.session_segments (venue_id, session_id, resource_id, kind, started_at, ended_at)
      values (v.venue, v_session, pg_temp.table_id(i), 'play', v_start, v_start + make_interval(mins => v_minutes));
      insert into public.payments (venue_id, shift_id, session_id, amount, method, created_by, created_at)
      values (v.venue, v_shift, v_session, v_amount, v_method, v.admin, v_start + make_interval(mins => v_minutes));
    end loop;
  end loop;

  -- Закрытые смены: ожидаемые наличные по оплатам, в кассе ровно столько же.
  update public.shifts s set
    expected_cash = s.opening_cash + coalesce((select sum(p.amount) from public.payments p
      where p.shift_id = s.id and p.method = 'cash' and p.voided_at is null), 0)
  where s.venue_id = v.venue and s.closed_at is not null;
  update public.shifts set closing_cash = expected_cash
  where venue_id = v.venue and closed_at is not null;
end;
$$;

-- Сейчас: открытая смена, Стол 2 играет, Русский 1 на паузе, два сеанса уже оплачены.
do $$
declare
  v demo;
  v_shift uuid;
  v_session uuid;
begin
  select * into v from demo;
  insert into public.shifts (venue_id, opened_by, opened_at, opening_cash)
  values (v.venue, v.admin, now() - interval '5 hours', 20000)
  returning id into v_shift;

  insert into public.sessions (venue_id, customer_id, status, started_by, started_at, expected_end_at)
  values (v.venue, 'dddddddd-dddd-0000-0000-000000000001', 'active', v.admin,
          now() - interval '50 minutes', now() + interval '70 minutes')
  returning id into v_session;
  insert into public.session_segments (venue_id, session_id, resource_id, kind, started_at)
  values (v.venue, v_session, pg_temp.table_id(2), 'play', now() - interval '50 minutes');

  insert into public.sessions (venue_id, customer_id, status, started_by, started_at)
  values (v.venue, 'dddddddd-dddd-0000-0000-000000000005', 'paused', v.admin, now() - interval '2 hours')
  returning id into v_session;
  insert into public.session_segments (venue_id, session_id, resource_id, kind, started_at, ended_at) values
    (v.venue, v_session, pg_temp.table_id(7), 'play', now() - interval '2 hours', now() - interval '10 minutes');
  insert into public.session_segments (venue_id, session_id, resource_id, kind, started_at)
  values (v.venue, v_session, pg_temp.table_id(7), 'pause', now() - interval '10 minutes');

  -- Два оплаченных сеанса в текущей смене.
  insert into public.sessions (venue_id, status, started_by, started_at, closed_by, closed_at, time_amount, items_amount, total_amount)
  values (v.venue, 'closed', v.admin, now() - interval '4 hours', v.admin, now() - interval '3 hours', 1500, 1200, 2700)
  returning id into v_session;
  insert into public.session_segments (venue_id, session_id, resource_id, kind, started_at, ended_at)
  values (v.venue, v_session, pg_temp.table_id(3), 'play', now() - interval '4 hours', now() - interval '3 hours');
  insert into public.payments (venue_id, shift_id, session_id, amount, method, created_by, created_at) values
    (v.venue, v_shift, v_session, 1700, 'cash', v.admin, now() - interval '3 hours'),
    (v.venue, v_shift, v_session, 1000, 'kaspi', v.admin, now() - interval '3 hours');

  insert into public.sessions (venue_id, status, started_by, started_at, closed_by, closed_at, time_amount, items_amount, total_amount)
  values (v.venue, 'closed', v.admin, now() - interval '3 hours', v.admin, now() - interval '90 minutes', 2250, 0, 2250)
  returning id into v_session;
  insert into public.session_segments (venue_id, session_id, resource_id, kind, started_at, ended_at)
  values (v.venue, v_session, pg_temp.table_id(5), 'play', now() - interval '3 hours', now() - interval '90 minutes');
  insert into public.payments (venue_id, shift_id, session_id, amount, method, created_by, created_at)
  values (v.venue, v_shift, v_session, 2250, 'card', v.admin, now() - interval '90 minutes');
end;
$$;

-- Брони ------------------------------------------------------------------------
-- Даурен дважды не пришёл раньше — это видно у его новой брони.
insert into public.bookings (venue_id, resource_id, customer_id, starts_at, ends_at, blocked_until, source, status)
select (select venue from demo), pg_temp.table_id(6), 'dddddddd-dddd-0000-0000-000000000003',
  pg_temp.at((select today from demo) - n, '12:00'), pg_temp.at((select today from demo) - n, '14:00'),
  pg_temp.at((select today from demo) - n, '14:00'), 'online', 'no_show'
from unnest(array[3, 8]) n;

insert into public.bookings (venue_id, resource_id, customer_id, starts_at, ends_at, blocked_until, source, guests, comment) values
  -- Через 40 минут: при старте Стола 4 будет предупреждение.
  ((select venue from demo), pg_temp.table_id(4), 'dddddddd-dddd-0000-0000-000000000002',
   now() + interval '40 minutes', now() + interval '160 minutes', now() + interval '160 minutes',
   'phone', 4, 'День рождения'),
  ((select venue from demo), pg_temp.table_id(6), 'dddddddd-dddd-0000-0000-000000000003',
   now() + interval '3 hours', now() + interval '5 hours', now() + interval '5 hours',
   'online', 2, null),
  ((select venue from demo), pg_temp.table_id(1), 'dddddddd-dddd-0000-0000-000000000004',
   pg_temp.at((select today from demo) + 1, '19:00'), pg_temp.at((select today from demo) + 1, '21:00'),
   pg_temp.at((select today from demo) + 1, '21:00'), 'online', 3, null),
  ((select venue from demo), pg_temp.table_id(8), 'dddddddd-dddd-0000-0000-000000000005',
   pg_temp.at((select today from demo) + 1, '18:00'), pg_temp.at((select today from demo) + 1, '20:00'),
   pg_temp.at((select today from demo) + 1, '20:00'), 'phone', 6, 'Корпоратив');

-- PS-клуб (owner2@demo.local): цена за час, тарифы на время, публикация.
update public.venues set is_published = true where id = 'bbbbbbbb-1111-0000-0000-000000000001';
insert into public.tariffs (venue_id, name, resource_kinds, price_per_hour, weekdays, time_from, time_to)
values ('bbbbbbbb-1111-0000-0000-000000000001', 'Каждый день', '{ps_zone}', 1200,
        '{1,2,3,4,5,6,7}', '12:00', '04:00');
insert into public.packages (venue_id, name, resource_kinds, minutes, price) values
  ('bbbbbbbb-1111-0000-0000-000000000001', '1 час', '{ps_zone}', 60, 1200),
  ('bbbbbbbb-1111-0000-0000-000000000001', '3 часа', '{ps_zone}', 180, 3000),
  ('bbbbbbbb-1111-0000-0000-000000000001', '5 часов', '{ps_zone}', 300, 4500);

commit;
