-- Этап 4.4: товары в счёте и закрытие сеанса с оплатой одной транзакцией.

create function public.add_session_item(
  p_session_id uuid,
  p_name text,
  p_price int,
  p_qty int default 1
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions := public.lock_session(p_session_id);
  v_id uuid;
begin
  if v_session.status not in ('active', 'paused') then
    raise exception 'session_not_open' using errcode = 'P0001';
  end if;
  if nullif(trim(p_name), '') is null or p_price is null or p_price < 0
     or p_qty is null or p_qty <= 0 then
    raise exception 'item_invalid' using errcode = 'P0001';
  end if;
  insert into public.session_items (venue_id, session_id, name, price, qty)
  values (v_session.venue_id, p_session_id, trim(p_name), p_price, p_qty)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.remove_session_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
  v_session public.sessions;
begin
  select session_id into v_session_id from public.session_items where id = p_item_id;
  if v_session_id is null then
    raise exception 'item_not_found' using errcode = 'P0002';
  end if;
  v_session := public.lock_session(v_session_id);
  if v_session.status not in ('active', 'paused') then
    raise exception 'session_not_open' using errcode = 'P0001';
  end if;
  delete from public.session_items where id = p_item_id;
end;
$$;

-- Закрыть сеанс и записать оплаты. p_payments: [{method, amount}].
-- Сумма оплат должна совпасть с итогом; нужна открытая смена, если платить
-- есть что. Ошибка в любой части — сеанс остаётся открытым.
create function public.checkout_session(
  p_session_id uuid,
  p_discount_amount int,
  p_payments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_closed jsonb;
  v_total int;
  v_paid int;
  v_payment jsonb;
begin
  v_closed := public.close_session(p_session_id, coalesce(p_discount_amount, 0));
  v_total := (v_closed ->> 'total_amount')::int;

  select coalesce(sum((p ->> 'amount')::int), 0) into v_paid
  from jsonb_array_elements(coalesce(p_payments, '[]')) p;
  if v_paid <> v_total then
    raise exception 'payments_mismatch'
      using errcode = 'P0001', detail = format('total=%s paid=%s', v_total, v_paid);
  end if;

  for v_payment in select p from jsonb_array_elements(coalesce(p_payments, '[]')) p loop
    continue when (v_payment ->> 'amount')::int = 0;
    perform public.add_payment(
      p_session_id,
      (v_payment ->> 'amount')::int,
      (v_payment ->> 'method')::public.payment_method
    );
  end loop;

  return v_closed;
end;
$$;

revoke execute on function
  public.add_session_item(uuid, text, int, int),
  public.remove_session_item(uuid),
  public.checkout_session(uuid, int, jsonb)
from public, anon;
grant execute on function
  public.add_session_item(uuid, text, int, int),
  public.remove_session_item(uuid),
  public.checkout_session(uuid, int, jsonb)
to authenticated;
