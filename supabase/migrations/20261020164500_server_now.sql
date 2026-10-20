-- Время сервера: поправка таймера сеанса в браузере и проверка доступности базы.
create function public.server_now()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select now();
$$;

grant execute on function public.server_now() to anon, authenticated;
