-- Владелец платформы (этап 9.2): подключает заведения и видит их список с
-- готовностью настройки. Участником организаций он не становится, поэтому
-- выручка, оплаты, сеансы, отчёты и гости ему не видны — RLS их не отдаёт.

create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Список читают только функции ниже; назначают владельца платформы SQL-ом
-- (docs/ARCHITECTURE.md, раздел «Владелец платформы»).
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

create function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins where user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

-- Регистрация закрыта: организации и заведения создаёт только владелец
-- платформы через platform_create_venue.
drop policy organizations_insert on public.organizations;
drop policy venues_insert on public.venues;

-- Новое заведение для владельца p_owner_id. Если у него уже есть
-- организация, заведение идёт в неё, иначе создаётся новая (название —
-- p_org_name или название заведения).
create function public.platform_create_venue(
  p_owner_id uuid,
  p_org_name text,
  p_venue jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select id into v_org
  from public.organizations
  where owner_id = p_owner_id
  order by created_at
  limit 1;

  if v_org is null then
    insert into public.organizations (name, owner_id)
    values (
      coalesce(nullif(trim(p_org_name), ''), p_venue ->> 'name'),
      p_owner_id
    )
    returning id into v_org;
  end if;

  insert into public.venues (
    org_id, type, name, slug, city, address, phone, description, working_hours
  )
  values (
    v_org,
    (p_venue ->> 'type')::public.venue_type,
    p_venue ->> 'name',
    p_venue ->> 'slug',
    p_venue ->> 'city',
    p_venue ->> 'address',
    p_venue ->> 'phone',
    p_venue ->> 'description',
    coalesce(p_venue -> 'working_hours', '[]'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.platform_create_venue(uuid, text, jsonb) from public, anon;
grant execute on function public.platform_create_venue(uuid, text, jsonb) to authenticated;

-- Список заведений для владельца платформы: профиль, владелец и готовность
-- настройки. Денег, сеансов, броней и гостей здесь нет.
create function public.platform_venues()
returns table (
  id uuid,
  name text,
  type public.venue_type,
  slug text,
  city text,
  org_name text,
  owner_email text,
  is_published boolean,
  created_at timestamptz,
  has_hours boolean,
  resources int,
  tariffs int,
  photos int,
  staff int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    v.id, v.name, v.type, v.slug, v.city, o.name, u.email::text,
    v.is_published, v.created_at,
    jsonb_array_length(v.working_hours) > 0,
    (select count(*)::int from public.resources r
      where r.venue_id = v.id and r.is_active),
    (select count(*)::int from public.tariffs t
      where t.venue_id = v.id and t.is_active),
    (select count(*)::int from public.venue_photos p where p.venue_id = v.id),
    (select count(*)::int from public.members m
      where m.org_id = v.org_id and m.role = 'admin')
  from public.venues v
  join public.organizations o on o.id = v.org_id
  left join auth.users u on u.id = o.owner_id
  order by v.created_at desc;
end;
$$;

revoke execute on function public.platform_venues() from public, anon;
grant execute on function public.platform_venues() to authenticated;
