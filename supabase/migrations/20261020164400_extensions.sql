-- Расширения, нужные схеме:
-- btree_gist  — EXCLUDE-ограничение против двойных броней (этап 5)
-- pg_cron     — фоновая отметка неявок (этап 5)
-- pgcrypto    — случайные токены ссылок брони (этап 6)
create extension if not exists btree_gist with schema extensions;
create extension if not exists pg_cron;
create extension if not exists pgcrypto with schema extensions;
