-- Этап 6.2: адреса страниц приложения не достаются заведениям.
begin;
select plan(4);

select throws_ok(
  format($$insert into public.venues (org_id, type, name, slug, city)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'billiards', 'Клуб', %L, 'Алматы')$$, s),
  '23514', null, format('slug %s занят приложением', s))
from unnest(array['auth', 'health', 'forgot-password', 'reset-password']) s;

select * from finish();
rollback;
