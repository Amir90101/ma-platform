-- Интеграция с iiko (этап 9.5): заведение со своей кассой iiko берёт у нас
-- только онлайн-бронь. Обмен в обе стороны: занятость столов читаем из iiko
-- (restaurant_sections_workload), наши брони отправляем туда (reserve/create,
-- reserve/cancel). Ключ apiLogin заведения лежит в Vault.

-- Режим «только онлайн-бронь»: без карты сеансов, кассы, смен и отчётов.
alter table public.venues add column booking_only boolean not null default false;

-- Стол iiko, к которому привязано место.
alter table public.resources add column iiko_table_id uuid;
create unique index resources_iiko_table_idx
  on public.resources (venue_id, iiko_table_id) where iiko_table_id is not null;

-- Бронь в iiko: id резерва совпадает с id нашей брони.
alter table public.bookings
  add column iiko_status text check (iiko_status in ('pending', 'sent', 'error', 'cancelled')),
  add column iiko_error text;

-- Настройки интеграции ----------------------------------------------------------

create table public.venue_integrations (
  venue_id uuid primary key references public.venues (id) on delete cascade,
  provider text not null default 'iiko' check (provider = 'iiko'),
  api_login_secret_id uuid,
  organization_id uuid,
  terminal_group_id uuid,
  section_ids uuid[] not null default '{}',
  enabled boolean not null default false,
  synced_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.venue_integrations enable row level security;
revoke all on public.venue_integrations from anon;
revoke insert, update, delete on public.venue_integrations from authenticated;

-- Владелец видит настройки (без ключа: в таблице только id секрета Vault).
create policy venue_integrations_select on public.venue_integrations
  for select to authenticated
  using ((select public.is_venue_owner(venue_id)));

-- Ключ apiLogin: пишет владелец, читает только сервер.
create function public.set_iiko_api_login(p_venue_id uuid, p_api_login text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret uuid;
  v_name text := 'iiko_api_login:' || p_venue_id;
begin
  if not public.is_venue_owner(p_venue_id) then
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

revoke execute on function public.set_iiko_api_login(uuid, text) from public, anon;
grant execute on function public.set_iiko_api_login(uuid, text) to authenticated;

create function public.iiko_api_login(p_venue_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.decrypted_secret
  from public.venue_integrations i
  join vault.decrypted_secrets s on s.id = i.api_login_secret_id
  where i.venue_id = p_venue_id;
$$;

revoke execute on function public.iiko_api_login(uuid) from public, anon, authenticated;
grant execute on function public.iiko_api_login(uuid) to service_role;

-- Организация, группа терминалов и залы iiko; включение обмена.
create function public.save_iiko_settings(
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
  if not public.is_venue_owner(p_venue_id) then
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

revoke execute on function public.save_iiko_settings(uuid, uuid, uuid, uuid[], boolean) from public, anon;
grant execute on function public.save_iiko_settings(uuid, uuid, uuid, uuid[], boolean) to authenticated;

-- Столы iiko → места заведения. Новые столы встают на карту сеткой в зал
-- «iiko», у существующих меняются только название и вместимость (расстановку
-- владелец правит в редакторе). Стол, которого больше нет в iiko, выключается.
-- p_tables: [{iiko_table_id, name, capacity, kind, x, y, w, h}].
create function public.sync_iiko_tables(p_venue_id uuid, p_tables jsonb)
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
  if not public.is_venue_owner(p_venue_id) then
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

revoke execute on function public.sync_iiko_tables(uuid, jsonb) from public, anon;
grant execute on function public.sync_iiko_tables(uuid, jsonb) to authenticated;

-- Очередь отправки броней в iiko -----------------------------------------------

create table public.integration_outbox (
  id bigint generated always as identity primary key,
  venue_id uuid not null references public.venues (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  action text not null check (action in ('create', 'cancel')),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  attempts int not null default 0,
  done_at timestamptz,
  last_error text
);

create index integration_outbox_pending_idx
  on public.integration_outbox (id) where done_at is null;

alter table public.integration_outbox enable row level security;
revoke all on public.integration_outbox from anon, authenticated;

create function public.bookings_to_iiko()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.venue_integrations
    where venue_id = new.venue_id and enabled
  ) then
    return null;
  end if;
  if tg_op = 'INSERT' and new.status = 'confirmed' then
    insert into public.integration_outbox (venue_id, booking_id, action)
    values (new.venue_id, new.id, 'create');
    update public.bookings set iiko_status = 'pending' where id = new.id;
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status
        and new.status in ('cancelled', 'no_show') then
    insert into public.integration_outbox (venue_id, booking_id, action)
    values (new.venue_id, new.id, 'cancel');
  end if;
  return null;
end;
$$;

revoke execute on function public.bookings_to_iiko() from public, anon, authenticated;

create trigger bookings_to_iiko
after insert or update of status on public.bookings
for each row execute function public.bookings_to_iiko();

-- Порция очереди для сервера, как telegram_claim_outbox.
create function public.iiko_claim_outbox(p_limit int)
returns setof public.integration_outbox
language sql
security definer
set search_path = ''
as $$
  update public.integration_outbox o
  set claimed_at = now(), attempts = o.attempts + 1
  where o.id in (
    select id from public.integration_outbox
    where done_at is null
      and attempts < 10
      and (claimed_at is null or claimed_at < now() - interval '2 minutes')
    order by id
    limit p_limit
    for update skip locked
  )
  returning o.*;
$$;

revoke execute on function public.iiko_claim_outbox(int) from public, anon, authenticated;
grant execute on function public.iiko_claim_outbox(int) to service_role;
grant select, update on public.integration_outbox to service_role;
grant select, update on public.venue_integrations to service_role;
