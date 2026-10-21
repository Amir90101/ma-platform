-- Этапы 4.6 и 5.2: таблицы рабочего экрана и брони публикуются для Realtime.
begin;
select plan(1);

select is(
  (select array_agg(tablename::text order by tablename::text)
   from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public'),
  array['bookings', 'session_segments', 'sessions', 'shifts']::text[],
  'bookings, session_segments, sessions и shifts в публикации supabase_realtime'
);

select * from finish();
rollback;
