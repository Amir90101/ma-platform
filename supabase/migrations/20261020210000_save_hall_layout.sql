-- Этап 2.2: сохранение карты зала одним вызовом, в одной транзакции.
-- security invoker: работает RLS, плюс явная проверка владельца, чтобы
-- администратор получил ошибку, а не тихое «ничего не изменилось».
--
-- p_resources: [{id?, kind, name, capacity, x, y, w, h, rotation, shape,
--                bookable_online, is_active}]
-- p_objects:   [{id?, kind, label, x, y, w, h, rotation}]
-- Строка без id создаётся. Ресурс зала, которого нет в списке, удаляется,
-- а если на него ссылается история (сеансы, брони) — выключается.
-- Декор зала, которого нет в списке, удаляется.

create function public.save_hall_layout(
  p_hall_id uuid,
  p_resources jsonb,
  p_objects jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_venue_id uuid := public.hall_venue_id(p_hall_id);
  v_keep uuid[];
  v_id uuid;
begin
  if v_venue_id is null or not public.is_venue_owner(v_venue_id) then
    raise exception 'only the venue owner can change the hall map'
      using errcode = '42501';
  end if;

  -- Ресурсы -----------------------------------------------------------------
  select coalesce(array_agg((r ->> 'id')::uuid), '{}')
  into v_keep
  from jsonb_array_elements(p_resources) r
  where r ->> 'id' is not null;

  for v_id in
    select id from public.resources
    where hall_id = p_hall_id and id <> all (v_keep)
  loop
    begin
      delete from public.resources where id = v_id;
    exception when foreign_key_violation then
      update public.resources set is_active = false where id = v_id;
    end;
  end loop;

  update public.resources t set
    kind = (r ->> 'kind')::public.resource_kind,
    name = r ->> 'name',
    capacity = (r ->> 'capacity')::int,
    x = (r ->> 'x')::int,
    y = (r ->> 'y')::int,
    w = (r ->> 'w')::int,
    h = (r ->> 'h')::int,
    rotation = (r ->> 'rotation')::int,
    shape = r ->> 'shape',
    bookable_online = (r ->> 'bookable_online')::boolean,
    is_active = (r ->> 'is_active')::boolean
  from jsonb_array_elements(p_resources) r
  where r ->> 'id' is not null
    and t.id = (r ->> 'id')::uuid
    and t.hall_id = p_hall_id;

  insert into public.resources (
    venue_id, hall_id, kind, name, capacity, x, y, w, h, rotation, shape,
    bookable_online, is_active
  )
  select
    v_venue_id, p_hall_id, (r ->> 'kind')::public.resource_kind, r ->> 'name',
    (r ->> 'capacity')::int, (r ->> 'x')::int, (r ->> 'y')::int,
    (r ->> 'w')::int, (r ->> 'h')::int, (r ->> 'rotation')::int, r ->> 'shape',
    (r ->> 'bookable_online')::boolean, (r ->> 'is_active')::boolean
  from jsonb_array_elements(p_resources) r
  where r ->> 'id' is null;

  -- Декор -------------------------------------------------------------------
  select coalesce(array_agg((o ->> 'id')::uuid), '{}')
  into v_keep
  from jsonb_array_elements(p_objects) o
  where o ->> 'id' is not null;

  delete from public.hall_objects
  where hall_id = p_hall_id and id <> all (v_keep);

  update public.hall_objects t set
    kind = (o ->> 'kind')::public.hall_object_kind,
    label = o ->> 'label',
    x = (o ->> 'x')::int,
    y = (o ->> 'y')::int,
    w = (o ->> 'w')::int,
    h = (o ->> 'h')::int,
    rotation = (o ->> 'rotation')::int
  from jsonb_array_elements(p_objects) o
  where o ->> 'id' is not null
    and t.id = (o ->> 'id')::uuid
    and t.hall_id = p_hall_id;

  insert into public.hall_objects (hall_id, kind, label, x, y, w, h, rotation)
  select
    p_hall_id, (o ->> 'kind')::public.hall_object_kind, o ->> 'label',
    (o ->> 'x')::int, (o ->> 'y')::int, (o ->> 'w')::int, (o ->> 'h')::int,
    (o ->> 'rotation')::int
  from jsonb_array_elements(p_objects) o
  where o ->> 'id' is null;
end;
$$;

revoke execute on function public.save_hall_layout(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_hall_layout(uuid, jsonb, jsonb) to authenticated;
