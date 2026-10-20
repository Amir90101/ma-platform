-- Этап 1.1: организации, участники, заведения, фото заведений и доступ к ним.

create type public.venue_type as enum (
  'billiards', 'ps_club', 'pc_club', 'ps_pc_club', 'karaoke', 'sauna', 'sports_court'
);

create type public.member_role as enum ('owner', 'admin');

-- organizations -------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  owner_id uuid not null references auth.users (id) on delete restrict,
  plan text not null default 'free',
  created_at timestamptz not null default now()
);

create index organizations_owner_id_idx on public.organizations (owner_id);

-- members -------------------------------------------------------------------

create table public.members (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index members_user_id_idx on public.members (user_id);

-- venues --------------------------------------------------------------------

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  type public.venue_type not null,
  name text not null check (length(trim(name)) > 0),
  slug text not null unique,
  city text not null,
  address text,
  phone text,
  description text,
  timezone text not null default 'Asia/Almaty',
  working_hours jsonb not null default '[]'::jsonb,
  is_published boolean not null default false,
  online_booking_enabled boolean not null default true,
  slot_step_min int not null default 30,
  min_duration_min int not null default 60,
  buffer_min int not null default 0,
  min_lead_min int not null default 30,
  max_days_ahead int not null default 14,
  no_show_after_min int not null default 15,
  rounding_min int not null default 1,
  created_at timestamptz not null default now(),

  -- Латиница в нижнем регистре, цифры, дефис между ними; 3–40 символов.
  constraint venues_slug_format check (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 40
  ),
  -- Совпадает со списком в docs/ARCHITECTURE.md: эти адреса заняты приложением.
  constraint venues_slug_not_reserved check (
    slug not in (
      'app', 'api', 'b', 'login', 'register', 'admin', 'settings',
      'about', 'help', 'terms', 'privacy'
    )
  ),
  constraint venues_working_hours_is_array check (jsonb_typeof(working_hours) = 'array'),
  constraint venues_slot_step_min check (slot_step_min in (15, 30, 60)),
  constraint venues_min_duration_min check (min_duration_min > 0),
  constraint venues_buffer_min check (buffer_min >= 0),
  constraint venues_min_lead_min check (min_lead_min >= 0),
  constraint venues_max_days_ahead check (max_days_ahead between 1 and 365),
  constraint venues_no_show_after_min check (no_show_after_min >= 0),
  constraint venues_rounding_min check (rounding_min between 1 and 60)
);

create index venues_org_id_idx on public.venues (org_id);

-- venue_photos --------------------------------------------------------------

create table public.venue_photos (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  storage_path text not null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create index venue_photos_venue_id_idx on public.venue_photos (venue_id, sort);

-- Функции доступа -----------------------------------------------------------
-- security definer: читают members в обход RLS, иначе политики members
-- вызывали бы сами себя.

create function public.is_org_member(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.org_id = p_org_id and m.user_id = (select auth.uid())
  );
$$;

create function public.is_org_owner(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.org_id = p_org_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  );
$$;

create function public.is_venue_member(p_venue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.venues v
    join public.members m on m.org_id = v.org_id
    where v.id = p_venue_id and m.user_id = (select auth.uid())
  );
$$;

create function public.is_venue_owner(p_venue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.venues v
    join public.members m on m.org_id = v.org_id
    where v.id = p_venue_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  );
$$;

revoke execute on function
  public.is_org_member(uuid), public.is_org_owner(uuid),
  public.is_venue_member(uuid), public.is_venue_owner(uuid)
from public, anon;

grant execute on function
  public.is_org_member(uuid), public.is_org_owner(uuid),
  public.is_venue_member(uuid), public.is_venue_owner(uuid)
to authenticated;

-- Владелец организации сразу становится её участником с ролью owner.
create function public.add_owner_as_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.members (org_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

revoke execute on function public.add_owner_as_member() from public, anon, authenticated;

create trigger organizations_add_owner_as_member
after insert on public.organizations
for each row execute function public.add_owner_as_member();

-- RLS -----------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.members enable row level security;
alter table public.venues enable row level security;
alter table public.venue_photos enable row level security;

-- anon не читает таблицы напрямую: публичная страница работает через RPC.
revoke all on public.organizations, public.members, public.venues, public.venue_photos from anon;

-- organizations: читают участники, создаёт кто угодно для себя, меняет владелец.
create policy organizations_select on public.organizations
  for select to authenticated
  using ((select public.is_org_member(id)) or owner_id = (select auth.uid()));

create policy organizations_insert on public.organizations
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy organizations_update on public.organizations
  for update to authenticated
  using ((select public.is_org_owner(id)))
  with check (owner_id = (select auth.uid()));

-- members: читают участники организации. Владелец управляет только
-- администраторами; строку владельца создаёт триггер.
create policy members_select on public.members
  for select to authenticated
  using ((select public.is_org_member(org_id)));

create policy members_insert on public.members
  for insert to authenticated
  with check ((select public.is_org_owner(org_id)) and role = 'admin');

create policy members_update on public.members
  for update to authenticated
  using ((select public.is_org_owner(org_id)) and role = 'admin')
  with check ((select public.is_org_owner(org_id)) and role = 'admin');

create policy members_delete on public.members
  for delete to authenticated
  using ((select public.is_org_owner(org_id)) and role = 'admin');

-- venues: читают участники, пишет владелец.
create policy venues_select on public.venues
  for select to authenticated
  using ((select public.is_org_member(org_id)));

create policy venues_insert on public.venues
  for insert to authenticated
  with check ((select public.is_org_owner(org_id)));

create policy venues_update on public.venues
  for update to authenticated
  using ((select public.is_org_owner(org_id)))
  with check ((select public.is_org_owner(org_id)));

create policy venues_delete on public.venues
  for delete to authenticated
  using ((select public.is_org_owner(org_id)));

-- venue_photos: читают участники, пишет владелец.
create policy venue_photos_select on public.venue_photos
  for select to authenticated
  using ((select public.is_venue_member(venue_id)));

create policy venue_photos_insert on public.venue_photos
  for insert to authenticated
  with check ((select public.is_venue_owner(venue_id)));

create policy venue_photos_update on public.venue_photos
  for update to authenticated
  using ((select public.is_venue_owner(venue_id)))
  with check ((select public.is_venue_owner(venue_id)));

create policy venue_photos_delete on public.venue_photos
  for delete to authenticated
  using ((select public.is_venue_owner(venue_id)));
