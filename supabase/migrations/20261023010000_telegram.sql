-- Telegram-бот (этап 9.4): владелец подключает чаты заведения, бот присылает
-- новые брони, отмены, неявки и закрытие смены.
--
-- События пишут триггеры в очередь notification_outbox. Раз в минуту pg_cron
-- через pg_net зовёт /api/telegram/dispatch: сервер Next.js забирает очередь,
-- форматирует сообщения (next-intl) и отправляет их в Telegram. Там же он
-- читает /start с кодом подключения (getUpdates), поэтому публичный webhook
-- не нужен.

create extension if not exists pg_net;

-- Чаты заведения ----------------------------------------------------------------

create table public.telegram_chats (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  chat_id bigint not null,
  title text,
  created_at timestamptz not null default now(),
  unique (venue_id, chat_id)
);

create index telegram_chats_venue_idx on public.telegram_chats (venue_id);

alter table public.telegram_chats enable row level security;
revoke all on public.telegram_chats from anon;

-- Видит и отключает владелец. Подключает только сервер по коду из /start.
create policy telegram_chats_select on public.telegram_chats
  for select to authenticated
  using ((select public.is_venue_owner(venue_id)));

create policy telegram_chats_delete on public.telegram_chats
  for delete to authenticated
  using ((select public.is_venue_owner(venue_id)));

-- Одноразовые коды подключения: живут 30 минут.
create table public.telegram_link_codes (
  code text primary key,
  venue_id uuid not null references public.venues (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null
);

alter table public.telegram_link_codes enable row level security;
revoke all on public.telegram_link_codes from anon, authenticated;

create function public.create_telegram_link_code(p_venue_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if not public.is_venue_owner(p_venue_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.telegram_link_codes where expires_at < now();
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into public.telegram_link_codes (code, venue_id, created_by, expires_at)
  values (v_code, p_venue_id, (select auth.uid()), now() + interval '30 minutes');
  return v_code;
end;
$$;

revoke execute on function public.create_telegram_link_code(uuid) from public, anon;
grant execute on function public.create_telegram_link_code(uuid) to authenticated;

-- Подключение чата по коду: зовёт только сервер. Возвращает название
-- заведения или null, если код неверный или просрочен.
create function public.telegram_link_chat(p_code text, p_chat_id bigint, p_title text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venue_id uuid;
  v_name text;
begin
  delete from public.telegram_link_codes
  where code = upper(trim(p_code)) and expires_at > now()
  returning venue_id into v_venue_id;
  if v_venue_id is null then
    return null;
  end if;
  insert into public.telegram_chats (venue_id, chat_id, title)
  values (v_venue_id, p_chat_id, nullif(trim(p_title), ''))
  on conflict (venue_id, chat_id) do update set title = excluded.title;
  select name into v_name from public.venues where id = v_venue_id;
  return v_name;
end;
$$;

revoke execute on function public.telegram_link_chat(text, bigint, text) from public, anon, authenticated;
grant execute on function public.telegram_link_chat(text, bigint, text) to service_role;

-- Состояние бота: с какого update_id читать getUpdates.
create table public.telegram_state (
  id int primary key default 1 check (id = 1),
  update_offset bigint not null default 0
);
insert into public.telegram_state (id) values (1);

alter table public.telegram_state enable row level security;
revoke all on public.telegram_state from anon, authenticated;

-- Очередь уведомлений ---------------------------------------------------------

-- payload собирает триггер: всё, что нужно для текста, — сервер только
-- форматирует. Имя и телефон гостя видят сотрудники заведения и так.
create table public.notification_outbox (
  id bigint generated always as identity primary key,
  venue_id uuid not null references public.venues (id) on delete cascade,
  kind text not null check (kind in (
    'booking_created', 'booking_cancelled', 'booking_no_show', 'shift_closed'
  )),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  attempts int not null default 0,
  sent_at timestamptz
);

create index notification_outbox_pending_idx
  on public.notification_outbox (id) where sent_at is null;

alter table public.notification_outbox enable row level security;
revoke all on public.notification_outbox from anon, authenticated;

-- Только для заведений с подключёнными чатами: без чатов очередь не растёт.
create function public.enqueue_notification(p_venue_id uuid, p_kind text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.telegram_chats where venue_id = p_venue_id) then
    insert into public.notification_outbox (venue_id, kind, payload)
    values (p_venue_id, p_kind, p_payload);
  end if;
end;
$$;

revoke execute on function public.enqueue_notification(uuid, text, jsonb) from public, anon, authenticated;

create function public.booking_notification_payload(p_booking public.bookings)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'booking_id', p_booking.id,
    'venue', v.name,
    'timezone', v.timezone,
    'resource', r.name,
    'starts_at', p_booking.starts_at,
    'ends_at', p_booking.ends_at,
    'source', p_booking.source,
    'guests', p_booking.guests,
    'comment', p_booking.comment,
    'customer_name', c.name,
    'customer_phone', c.phone,
    'package', p.name,
    'cancel_reason', p_booking.cancel_reason,
    'cancelled_by_guest', p_booking.cancelled_by_guest
  )
  from public.venues v
  join public.resources r on r.id = p_booking.resource_id
  left join public.customers c on c.id = p_booking.customer_id
  left join public.packages p on p.id = p_booking.package_id
  where v.id = p_booking.venue_id;
$$;

revoke execute on function public.booking_notification_payload(public.bookings) from public, anon, authenticated;

create function public.bookings_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status = 'confirmed' then
    perform public.enqueue_notification(new.venue_id, 'booking_created',
      public.booking_notification_payload(new));
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'cancelled' then
      perform public.enqueue_notification(new.venue_id, 'booking_cancelled',
        public.booking_notification_payload(new));
    elsif new.status = 'no_show' then
      perform public.enqueue_notification(new.venue_id, 'booking_no_show',
        public.booking_notification_payload(new));
    end if;
  end if;
  return null;
end;
$$;

revoke execute on function public.bookings_notify() from public, anon, authenticated;

create trigger bookings_notify
after insert or update of status on public.bookings
for each row execute function public.bookings_notify();

create function public.shifts_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.closed_at is null and new.closed_at is not null then
    perform public.enqueue_notification(new.venue_id, 'shift_closed',
      jsonb_build_object(
        'shift_id', new.id,
        'venue', (select name from public.venues where id = new.venue_id),
        'timezone', (select timezone from public.venues where id = new.venue_id),
        'opened_at', new.opened_at,
        'closed_at', new.closed_at,
        'closed_by', (select coalesce(u.raw_user_meta_data ->> 'full_name', u.email)
                      from auth.users u where u.id = new.closed_by),
        'expected_cash', new.expected_cash,
        'closing_cash', new.closing_cash
      ));
  end if;
  return null;
end;
$$;

revoke execute on function public.shifts_notify() from public, anon, authenticated;

create trigger shifts_notify
after update of closed_at on public.shifts
for each row execute function public.shifts_notify();

-- Забрать порцию очереди: строки, которые никто не отправляет прямо сейчас.
-- Пять неудачных попыток — строка больше не берётся.
create function public.telegram_claim_outbox(p_limit int)
returns setof public.notification_outbox
language sql
security definer
set search_path = ''
as $$
  update public.notification_outbox o
  set claimed_at = now(), attempts = o.attempts + 1
  where o.id in (
    select id from public.notification_outbox
    where sent_at is null
      and attempts < 5
      and (claimed_at is null or claimed_at < now() - interval '2 minutes')
    order by id
    limit p_limit
    for update skip locked
  )
  returning o.*;
$$;

revoke execute on function public.telegram_claim_outbox(int) from public, anon, authenticated;
grant execute on function public.telegram_claim_outbox(int) to service_role;
grant select, update on public.notification_outbox, public.telegram_state to service_role;
grant select on public.telegram_chats to service_role;

-- Раз в минуту будим сервер. Адрес и секрет лежат в Vault (секреты
-- telegram_dispatch_url и telegram_dispatch_secret); без них ничего не делаем.
create function public.telegram_dispatch_ping()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'telegram_dispatch_url';
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'telegram_dispatch_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    body := '{}'::jsonb
  );
end;
$$;

revoke execute on function public.telegram_dispatch_ping() from public, anon, authenticated;

select cron.schedule('telegram_dispatch', '* * * * *', 'select public.telegram_dispatch_ping()');
