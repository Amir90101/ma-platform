-- Проверка первой миграции: расширения и server_now.
begin;
select plan(5);

select has_extension('btree_gist', 'расширение btree_gist установлено');
select has_extension('pg_cron', 'расширение pg_cron установлено');
select has_extension('pgcrypto', 'расширение pgcrypto установлено');
select has_function('public', 'server_now', 'функция server_now есть');

set local role anon;
select ok(public.server_now() is not null, 'anon может вызвать server_now');

select * from finish();
rollback;
