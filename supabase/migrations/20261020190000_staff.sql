-- Этап 1.4: список сотрудников с email и поиск пользователя для приглашения.
-- auth.users закрыта для authenticated, поэтому обе функции security definer.

-- Сотрудники организации для страницы «Сотрудники». Только владельцу:
-- остальным пустой результат.
create function public.get_org_staff(p_org_id uuid)
returns table (
  user_id uuid,
  email text,
  full_name text,
  role public.member_role,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, u.email::text, u.raw_user_meta_data ->> 'full_name', m.role, m.created_at
  from public.members m
  join auth.users u on u.id = m.user_id
  where m.org_id = p_org_id
    and public.is_org_owner(p_org_id)
  order by m.role, m.created_at;
$$;

revoke execute on function public.get_org_staff(uuid) from public, anon;
grant execute on function public.get_org_staff(uuid) to authenticated;

-- id пользователя по email, если он уже зарегистрирован. Вызывает только
-- сервер с ключом service_role, когда приглашают существующего пользователя.
create function public.user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
$$;

revoke execute on function public.user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.user_id_by_email(text) to service_role;
