-- Этап 4.6: таблицы рабочего экрана публикуются для Realtime.
begin;
select plan(1);

select is(
  (select array_agg(tablename::text order by tablename::text)
   from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public'),
  array['session_segments', 'sessions', 'shifts']::text[],
  'session_segments, sessions и shifts в публикации supabase_realtime'
);

select * from finish();
rollback;
