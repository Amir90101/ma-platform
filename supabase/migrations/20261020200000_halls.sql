-- Этап 2.1: залы, ресурсы (то, что сдаётся на время) и декор на карте.

create type public.resource_kind as enum (
  'pool_table', 'russian_table', 'ps_zone', 'pc_seat',
  'karaoke_room', 'sauna_room', 'court', 'other'
);

create type public.hall_object_kind as enum ('bar', 'entrance', 'wall', 'label', 'zone');

-- halls ---------------------------------------------------------------------

create table public.halls (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  width int not null default 1200 check (width between 200 and 5000),
  height int not null default 800 check (height between 200 and 5000),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  -- Для составного внешнего ключа из resources: ресурс в зале своего заведения.
  unique (id, venue_id)
);

create index halls_venue_id_idx on public.halls (venue_id, sort);

-- resources -----------------------------------------------------------------

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  hall_id uuid not null,
  kind public.resource_kind not null,
  name text not null check (length(trim(name)) > 0),
  capacity int check (capacity > 0),
  x int not null,
  y int not null,
  w int not null check (w > 0),
  h int not null check (h > 0),
  rotation int not null default 0 check (rotation between 0 and 359),
  shape text not null default 'rect' check (shape in ('rect', 'circle')),
  bookable_online boolean not null default true,
  -- Ресурс с историей не удаляют, а выключают: на него ссылаются сеансы и брони.
  -- Их внешние ключи (этапы 4–5) будут on delete restrict.
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  -- restrict: зал с ресурсами удалить нельзя, сначала перенести или выключить.
  foreign key (hall_id, venue_id) references public.halls (id, venue_id) on delete restrict
);

create index resources_venue_id_idx on public.resources (venue_id);
create index resources_hall_id_idx on public.resources (hall_id);

-- hall_objects --------------------------------------------------------------

create table public.hall_objects (
  id uuid primary key default gen_random_uuid(),
  hall_id uuid not null references public.halls (id) on delete cascade,
  kind public.hall_object_kind not null,
  label text,
  x int not null,
  y int not null,
  w int not null check (w > 0),
  h int not null check (h > 0),
  rotation int not null default 0 check (rotation between 0 and 359),
  created_at timestamptz not null default now()
);

create index hall_objects_hall_id_idx on public.hall_objects (hall_id);

-- id заведения зала: для политик hall_objects, где venue_id нет.
create function public.hall_venue_id(p_hall_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select venue_id from public.halls where id = p_hall_id;
$$;

revoke execute on function public.hall_venue_id(uuid) from public, anon;
grant execute on function public.hall_venue_id(uuid) to authenticated;

-- RLS: читают участники заведения, меняет карту только владелец -------------

alter table public.halls enable row level security;
alter table public.resources enable row level security;
alter table public.hall_objects enable row level security;

revoke all on public.halls, public.resources, public.hall_objects from anon;

create policy halls_select on public.halls
  for select to authenticated
  using ((select public.is_venue_member(venue_id)));
create policy halls_insert on public.halls
  for insert to authenticated
  with check ((select public.is_venue_owner(venue_id)));
create policy halls_update on public.halls
  for update to authenticated
  using ((select public.is_venue_owner(venue_id)))
  with check ((select public.is_venue_owner(venue_id)));
create policy halls_delete on public.halls
  for delete to authenticated
  using ((select public.is_venue_owner(venue_id)));

create policy resources_select on public.resources
  for select to authenticated
  using ((select public.is_venue_member(venue_id)));
create policy resources_insert on public.resources
  for insert to authenticated
  with check ((select public.is_venue_owner(venue_id)));
create policy resources_update on public.resources
  for update to authenticated
  using ((select public.is_venue_owner(venue_id)))
  with check ((select public.is_venue_owner(venue_id)));
create policy resources_delete on public.resources
  for delete to authenticated
  using ((select public.is_venue_owner(venue_id)));

create policy hall_objects_select on public.hall_objects
  for select to authenticated
  using ((select public.is_venue_member(public.hall_venue_id(hall_id))));
create policy hall_objects_insert on public.hall_objects
  for insert to authenticated
  with check ((select public.is_venue_owner(public.hall_venue_id(hall_id))));
create policy hall_objects_update on public.hall_objects
  for update to authenticated
  using ((select public.is_venue_owner(public.hall_venue_id(hall_id))))
  with check ((select public.is_venue_owner(public.hall_venue_id(hall_id))));
create policy hall_objects_delete on public.hall_objects
  for delete to authenticated
  using ((select public.is_venue_owner(public.hall_venue_id(hall_id))));
