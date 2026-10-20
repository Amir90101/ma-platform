-- Этап 4.2: оплаты на месте и журнал действий.

create type public.payment_method as enum ('cash', 'kaspi', 'card');

-- payments ------------------------------------------------------------------
-- Платформа деньги не принимает, только записывает, как гость заплатил.
-- Отменённую оплату не удаляем, а помечаем.

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  shift_id uuid not null references public.shifts (id),
  session_id uuid not null references public.sessions (id),
  amount int not null check (amount > 0),
  method public.payment_method not null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users (id),
  void_reason text,
  check ((voided_at is null) = (voided_by is null))
);

create index payments_session_idx on public.payments (session_id);
create index payments_shift_idx on public.payments (shift_id);

alter table public.payments enable row level security;
revoke all on public.payments from anon;
revoke insert, update, delete on public.payments from authenticated;
create policy payments_select on public.payments
  for select to authenticated using ((select public.is_venue_member(venue_id)));

-- audit_log -----------------------------------------------------------------
-- Пишут только триггеры. Изменить или удалить запись нельзя никому.

create table public.audit_log (
  id bigint generated always as identity primary key,
  venue_id uuid not null references public.venues (id) on delete cascade,
  user_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_venue_idx on public.audit_log (venue_id, created_at desc);

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon;
revoke insert, update, delete, truncate on public.audit_log from authenticated, service_role;
create policy audit_log_select on public.audit_log
  for select to authenticated using ((select public.is_venue_owner(venue_id)));

create function public.audit_log_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only' using errcode = '42501';
end;
$$;

create trigger audit_log_no_update_delete
before update or delete on public.audit_log
for each row execute function public.audit_log_immutable();

create trigger audit_log_no_truncate
before truncate on public.audit_log
for each statement execute function public.audit_log_immutable();

create function public.write_audit(
  p_venue_id uuid, p_action text, p_entity text, p_entity_id uuid,
  p_before jsonb, p_after jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (venue_id, user_id, action, entity, entity_id, before, after)
  values (p_venue_id, (select auth.uid()), p_action, p_entity, p_entity_id, p_before, p_after);
$$;

revoke execute on function public.write_audit(uuid, text, text, uuid, jsonb, jsonb)
from public, anon, authenticated;

-- Триггеры журнала ----------------------------------------------------------

create function public.audit_sessions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'voided' and old.status <> 'voided' then
    perform public.write_audit(new.venue_id, 'session.voided', 'sessions', new.id,
      jsonb_build_object('status', old.status),
      jsonb_build_object('status', new.status, 'void_reason', new.void_reason));
  end if;
  if new.discount_amount <> old.discount_amount then
    perform public.write_audit(new.venue_id, 'session.discount', 'sessions', new.id,
      jsonb_build_object('discount_amount', old.discount_amount),
      jsonb_build_object('discount_amount', new.discount_amount,
                         'total_amount', new.total_amount));
  end if;
  return new;
end;
$$;

create trigger sessions_audit
after update on public.sessions
for each row execute function public.audit_sessions();

-- Правка времени уже закрытого отрезка.
create function public.audit_segments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.ended_at is not null
     and (new.started_at, new.ended_at) is distinct from (old.started_at, old.ended_at) then
    perform public.write_audit(new.venue_id, 'session.time_edited', 'session_segments', new.id,
      jsonb_build_object('started_at', old.started_at, 'ended_at', old.ended_at),
      jsonb_build_object('started_at', new.started_at, 'ended_at', new.ended_at));
  end if;
  return new;
end;
$$;

create trigger session_segments_audit
after update on public.session_segments
for each row execute function public.audit_segments();

create function public.audit_payments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.voided_at is not null and old.voided_at is null then
    perform public.write_audit(new.venue_id, 'payment.voided', 'payments', new.id,
      jsonb_build_object('amount', old.amount, 'method', old.method),
      jsonb_build_object('amount', new.amount, 'method', new.method,
                         'void_reason', new.void_reason));
  end if;
  return new;
end;
$$;

create trigger payments_audit
after update on public.payments
for each row execute function public.audit_payments();

revoke execute on function public.audit_sessions(), public.audit_segments(),
  public.audit_payments(), public.audit_log_immutable()
from public, anon, authenticated;

-- Оплата и отмена -----------------------------------------------------------

-- Оплата сеанса в открытую смену. Для закрытого сеанса нельзя заплатить
-- больше итога.
create function public.add_payment(
  p_session_id uuid,
  p_amount int,
  p_method public.payment_method
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions := public.lock_session(p_session_id);
  v_shift_id uuid;
  v_paid int;
  v_id uuid;
begin
  if v_session.status = 'voided' then
    raise exception 'session_voided' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount_invalid' using errcode = 'P0001';
  end if;
  select id into v_shift_id from public.shifts
  where venue_id = v_session.venue_id and closed_at is null;
  if v_shift_id is null then
    raise exception 'shift_not_open' using errcode = 'P0001';
  end if;
  if v_session.status = 'closed' then
    select coalesce(sum(amount), 0) into v_paid from public.payments
    where session_id = p_session_id and voided_at is null;
    if v_paid + p_amount > v_session.total_amount then
      raise exception 'overpayment' using errcode = 'P0001';
    end if;
  end if;

  insert into public.payments (venue_id, shift_id, session_id, amount, method, created_by)
  values (v_session.venue_id, v_shift_id, p_session_id, p_amount, p_method, (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;

create function public.void_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_payment.id is null or not public.is_venue_member(v_payment.venue_id) then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;
  if v_payment.voided_at is not null then
    raise exception 'payment_already_voided' using errcode = 'P0001';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  update public.payments set
    voided_at = now(),
    voided_by = (select auth.uid()),
    void_reason = trim(p_reason)
  where id = p_payment_id;
end;
$$;

-- Закрытие смены: ожидаемые наличные = на открытии + неотменённые наличные
-- оплаты этой смены.
create or replace function public.close_shift(p_shift_id uuid, p_closing_cash int)
returns public.shifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shift public.shifts;
begin
  select * into v_shift from public.shifts where id = p_shift_id for update;
  if v_shift.id is null or not public.is_venue_member(v_shift.venue_id) then
    raise exception 'shift_not_found' using errcode = 'P0002';
  end if;
  if v_shift.closed_at is not null then
    raise exception 'shift_already_closed' using errcode = 'P0001';
  end if;
  if p_closing_cash is null or p_closing_cash < 0 then
    raise exception 'cash_invalid' using errcode = 'P0001';
  end if;
  update public.shifts set
    closed_by = (select auth.uid()),
    closed_at = now(),
    closing_cash = p_closing_cash,
    expected_cash = v_shift.opening_cash + coalesce((
      select sum(amount) from public.payments
      where shift_id = p_shift_id and method = 'cash' and voided_at is null
    ), 0)
  where id = p_shift_id
  returning * into v_shift;
  return v_shift;
end;
$$;

revoke execute on function
  public.add_payment(uuid, int, public.payment_method),
  public.void_payment(uuid, text)
from public, anon;
grant execute on function
  public.add_payment(uuid, int, public.payment_method),
  public.void_payment(uuid, text)
to authenticated;
