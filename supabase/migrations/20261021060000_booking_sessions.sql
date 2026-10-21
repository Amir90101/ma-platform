-- Этап 5.3: бронь и сеанс.
--
-- «Пришёл»: бронь confirmed становится сеансом на своём ресурсе с
-- ожидаемым окончанием из брони, бронь — arrived. Когда сеанс закрывают
-- или аннулируют, бронь становится completed.

create function public.arrive_booking(p_booking_id uuid, p_package_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_resource public.resources;
  v_session public.sessions;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null or not public.is_venue_member(v_booking.venue_id) then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  if v_booking.status <> 'confirmed' then
    raise exception 'booking_not_confirmed' using errcode = 'P0001';
  end if;
  if v_booking.ends_at <= now() then
    raise exception 'booking_ended' using errcode = 'P0001';
  end if;
  select * into v_resource from public.resources where id = v_booking.resource_id;
  if not v_resource.is_active then
    raise exception 'resource_inactive' using errcode = 'P0001';
  end if;
  if p_package_id is not null and not exists (
    select 1 from public.packages
    where id = p_package_id and venue_id = v_booking.venue_id and is_active
      and v_resource.kind = any (resource_kinds)
  ) then
    raise exception 'package_not_found' using errcode = 'P0002';
  end if;

  insert into public.sessions (
    venue_id, booking_id, customer_id, package_id, expected_end_at, started_by
  ) values (
    v_booking.venue_id, v_booking.id, v_booking.customer_id, p_package_id,
    v_booking.ends_at, (select auth.uid())
  ) returning * into v_session;

  -- Стол занят другим сеансом — resource_busy, транзакция откатится целиком.
  perform public.open_segment(v_session, v_booking.resource_id, 'play', now());
  update public.bookings set status = 'arrived' where id = v_booking.id;
  return v_session.id;
end;
$$;

revoke execute on function public.arrive_booking(uuid, uuid) from public, anon;
grant execute on function public.arrive_booking(uuid, uuid) to authenticated;

-- Сеанс по брони закрыт или аннулирован — визит окончен.
create function public.complete_session_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.bookings set status = 'completed'
  where id = new.booking_id and status = 'arrived';
  return new;
end;
$$;

create trigger sessions_complete_booking
after update of status on public.sessions
for each row
when (new.booking_id is not null and new.status in ('closed', 'voided')
      and old.status in ('active', 'paused'))
execute function public.complete_session_booking();

revoke execute on function public.complete_session_booking() from public, anon, authenticated;
