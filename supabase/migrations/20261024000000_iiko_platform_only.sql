-- Интеграцией с iiko и режимом «только онлайн-бронь» управляет только
-- владелец платформы (этап 9.5, правка заказчика): он настраивает их при
-- подключении заведения и меняет потом в /admin. Владелец заведения видит
-- состояние, но не меняет его.

-- Ключ, настройки и столы — только владелец платформы ---------------------------

create or replace function public.set_iiko_api_login(p_venue_id uuid, p_api_login text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret uuid;
  v_name text := 'iiko_api_login:' || p_venue_id;
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(trim(p_api_login), '') = '' then
    raise exception 'api_login_required' using errcode = 'P0001';
  end if;
  select api_login_secret_id into v_secret
  from public.venue_integrations where venue_id = p_venue_id;
  if v_secret is null then
    v_secret := vault.create_secret(trim(p_api_login), v_name);
  else
    perform vault.update_secret(v_secret, trim(p_api_login), v_name);
  end if;
  insert into public.venue_integrations (venue_id, api_login_secret_id)
  values (p_venue_id, v_secret)
  on conflict (venue_id) do update set
    api_login_secret_id = excluded.api_login_secret_id,
    last_error = null,
    updated_at = now();
end;
$$;

create or replace function public.save_iiko_settings(
  p_venue_id uuid,
  p_organization_id uuid,
  p_terminal_group_id uuid,
  p_section_ids uuid[],
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_enabled and (p_organization_id is null or p_terminal_group_id is null
                    or coalesce(array_length(p_section_ids, 1), 0) = 0) then
    raise exception 'iiko_settings_incomplete' using errcode = 'P0001';
  end if;
  update public.venue_integrations set
    organization_id = p_organization_id,
    terminal_group_id = p_terminal_group_id,
    section_ids = coalesce(p_section_ids, '{}'),
    enabled = p_enabled,
    updated_at = now()
  where venue_id = p_venue_id;
  if not found then
    raise exception 'api_login_required' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.sync_iiko_tables(p_venue_id uuid, p_tables jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hall uuid;
  v_count int := 0;
  t jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select hall_id into v_hall from public.resources
  where venue_id = p_venue_id and iiko_table_id is not null
  limit 1;
  if v_hall is null then
    insert into public.halls (venue_id, name, width, height, sort)
    values (p_venue_id, 'iiko', 1200, 800,
      coalesce((select max(sort) + 1 from public.halls where venue_id = p_venue_id), 0))
    returning id into v_hall;
  end if;

  for t in select * from jsonb_array_elements(p_tables) loop
    insert into public.resources (venue_id, hall_id, kind, name, capacity, x, y, w, h, iiko_table_id)
    values (p_venue_id, v_hall, (t ->> 'kind')::public.resource_kind, t ->> 'name',
      nullif(t ->> 'capacity', '')::int,
      (t ->> 'x')::int, (t ->> 'y')::int, (t ->> 'w')::int, (t ->> 'h')::int,
      (t ->> 'iiko_table_id')::uuid)
    on conflict (venue_id, iiko_table_id) where iiko_table_id is not null
    do update set name = excluded.name, capacity = excluded.capacity, is_active = true;
    v_count := v_count + 1;
  end loop;

  -- Много столов — зал выше: новые встают сеткой вниз.
  update public.halls set height = greatest(height, (
    select max(y + h) + 40 from public.resources where hall_id = v_hall
  ))
  where id = v_hall;

  update public.resources set is_active = false
  where venue_id = p_venue_id
    and iiko_table_id is not null
    and iiko_table_id not in (
      select (e.value ->> 'iiko_table_id')::uuid from jsonb_array_elements(p_tables) e
    );

  update public.venue_integrations set synced_at = now(), last_error = null
  where venue_id = p_venue_id;
  return v_count;
end;
$$;

-- Режим «только онлайн-бронь» меняет владелец платформы ------------------------

create function public.set_venue_booking_only(p_venue_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.venues set booking_only = p_on where id = p_venue_id;
end;
$$;

revoke execute on function public.set_venue_booking_only(uuid, boolean) from public, anon;
grant execute on function public.set_venue_booking_only(uuid, boolean) to authenticated;

-- Владелец правит профиль заведения своей строкой venues, но не режим.
create function public.venues_guard_booking_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.booking_only is distinct from old.booking_only
     and (select auth.uid()) is not null
     and not public.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.venues_guard_booking_only() from public, anon, authenticated;

create trigger venues_guard_booking_only
before update of booking_only on public.venues
for each row execute function public.venues_guard_booking_only();

-- Заведение сразу с iiko: одной транзакцией создаёт заведение, включает
-- режим «только онлайн-бронь», сохраняет ключ и залы и загружает столы.
create function public.platform_create_venue_iiko(
  p_owner_id uuid,
  p_org_name text,
  p_venue jsonb,
  p_api_login text,
  p_organization_id uuid,
  p_terminal_group_id uuid,
  p_section_ids uuid[],
  p_tables jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  v_id := public.platform_create_venue(p_owner_id, p_org_name, p_venue);
  update public.venues set booking_only = true where id = v_id;
  perform public.set_iiko_api_login(v_id, p_api_login);
  perform public.save_iiko_settings(v_id, p_organization_id, p_terminal_group_id,
    p_section_ids, true);
  perform public.sync_iiko_tables(v_id, p_tables);
  return v_id;
end;
$$;

revoke execute on function public.platform_create_venue_iiko(uuid, text, jsonb, text, uuid, uuid, uuid[], jsonb) from public, anon;
grant execute on function public.platform_create_venue_iiko(uuid, text, jsonb, text, uuid, uuid, uuid[], jsonb) to authenticated;

-- Состояние интеграции видит и владелец платформы.
create policy venue_integrations_select_platform on public.venue_integrations
  for select to authenticated
  using ((select public.is_platform_admin()));

-- Список платформы: режим заведения и iiko -----------------------------------

drop function public.platform_venues();

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
  staff int,
  booking_only boolean,
  iiko_enabled boolean
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
      where m.org_id = v.org_id and m.role = 'admin'),
    v.booking_only,
    coalesce((select i.enabled from public.venue_integrations i where i.venue_id = v.id), false)
  from public.venues v
  join public.organizations o on o.id = v.org_id
  left join auth.users u on u.id = o.owner_id
  order by v.created_at desc;
end;
$$;

revoke execute on function public.platform_venues() from public, anon;
grant execute on function public.platform_venues() to authenticated;
