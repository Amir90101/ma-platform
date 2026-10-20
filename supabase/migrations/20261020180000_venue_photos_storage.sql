-- Этап 1.3: бакет для фото заведений.
-- Читают все (фото показывает публичная страница), пишет владелец заведения.
-- Путь объекта: {venue_id}/{uuid}.{jpg|png|webp}.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'venue-photos', 'venue-photos', true, 5 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp']
);

-- id заведения из первой папки пути или null, если там не uuid.
create function public.venue_photo_venue_id(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid
  end;
$$;

revoke execute on function public.venue_photo_venue_id(text) from public, anon;
grant execute on function public.venue_photo_venue_id(text) to authenticated;

create policy venue_photos_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'venue-photos'
    and coalesce(public.is_venue_owner(public.venue_photo_venue_id(name)), false)
  );

create policy venue_photos_objects_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'venue-photos'
    and coalesce(public.is_venue_owner(public.venue_photo_venue_id(name)), false)
  )
  with check (
    bucket_id = 'venue-photos'
    and coalesce(public.is_venue_owner(public.venue_photo_venue_id(name)), false)
  );

create policy venue_photos_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'venue-photos'
    and coalesce(public.is_venue_owner(public.venue_photo_venue_id(name)), false)
  );

-- Удаление через Storage API требует ещё и select.
create policy venue_photos_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'venue-photos'
    and coalesce(public.is_venue_member(public.venue_photo_venue_id(name)), false)
  );
