# Модель данных

Всё в схеме `public`, все изменения через миграции. Время в `timestamptz` (UTC), деньги целым числом тенге (`integer`). Первичные ключи `uuid` с `default gen_random_uuid()`. У каждой таблицы есть `created_at timestamptz not null default now()`; ниже он не повторяется.

Расширения: `btree_gist` (ограничения против двойных броней), `pg_cron` (фоновые задачи), `pgcrypto` (токены).

## Перечисления

| Тип | Значения |
| --- | --- |
| `venue_type` | `billiards`, `ps_club`, `pc_club`, `ps_pc_club`, `karaoke`, `sauna`, `sports_court` |
| `resource_kind` | `pool_table`, `russian_table`, `ps_zone`, `pc_seat`, `karaoke_room`, `sauna_room`, `court`, `other` |
| `member_role` | `owner`, `admin` |
| `hall_object_kind` | `bar`, `entrance`, `wall`, `label`, `zone` |
| `booking_status` | `confirmed`, `arrived`, `completed`, `cancelled`, `no_show` |
| `booking_source` | `online`, `phone`, `manual` |
| `session_status` | `active`, `paused`, `closed`, `voided` |
| `segment_kind` | `play`, `pause` |
| `payment_method` | `cash`, `kaspi`, `card` |

`kaspi` в `payment_method` — гость заплатил на месте через Kaspi QR или перевод. Это только отметка способа оплаты, интеграции с Kaspi нет.

Какие `resource_kind` доступны для какого `venue_type`, задаёт справочник в коде (`src/lib/venue-types.ts`), а не база. Так проще добавлять новые типы.

## Таблицы

### organizations

Бизнес владельца. У одной организации может быть несколько заведений.

| Поле | Тип | Примечание |
| --- | --- | --- |
| id | uuid | |
| name | text not null | |
| owner_id | uuid not null | `auth.users.id` |
| plan | text not null default 'free' | Тарифный план подписки |

### members

Кто имеет доступ к организации. Владелец тоже есть в этой таблице с ролью `owner`.

| Поле | Тип | Примечание |
| --- | --- | --- |
| org_id | uuid not null | → organizations |
| user_id | uuid not null | → auth.users |
| role | member_role not null | |

Первичный ключ `(org_id, user_id)`.

### venues

| Поле | Тип | Примечание |
| --- | --- | --- |
| id | uuid | |
| org_id | uuid not null | → organizations |
| type | venue_type not null | |
| name | text not null | |
| slug | text not null unique | Латиница, цифры, дефис; 3–40 символов; не из списка зарезервированных |
| city | text not null | |
| address | text | |
| phone | text | |
| description | text | |
| timezone | text not null default 'Asia/Almaty' | |
| working_hours | jsonb not null | `[{"weekday":1,"open":"10:00","close":"02:00"}]`; `close` меньше `open` значит работа через полночь |
| is_published | boolean not null default false | Публичная страница доступна только при `true` |
| online_booking_enabled | boolean not null default true | Можно выключить онлайн-бронь, оставив страницу |
| slot_step_min | int not null default 30 | Шаг слота: 15, 30 или 60 |
| min_duration_min | int not null default 60 | |
| buffer_min | int not null default 0 | Пауза между бронями |
| min_lead_min | int not null default 30 | За сколько минут до начала можно бронировать онлайн |
| max_days_ahead | int not null default 14 | |
| no_show_after_min | int not null default 15 | Через сколько минут опоздания бронь становится неявкой |
| rounding_min | int not null default 1 | Округление времени сеанса вверх до N минут |

### venue_photos

| Поле | Тип | Примечание |
| --- | --- | --- |
| id | uuid | |
| venue_id | uuid not null | → venues |
| storage_path | text not null | Путь в бакете `venue-photos`: `{venue_id}/{uuid}.{jpg,png,webp}` |
| sort | int not null default 0 | |

### halls

| Поле | Тип | Примечание |
| --- | --- | --- |
| id | uuid | |
| venue_id | uuid not null | → venues |
| name | text not null | «Основной зал», «VIP», «2 этаж» |
| width | int not null | Размер холста в условных единицах |
| height | int not null | |
| sort | int not null default 0 | |

### resources

То, что сдаётся на время: стол, место, кабинка, зал, корт.

| Поле | Тип | Примечание |
| --- | --- | --- |
| id | uuid | |
| venue_id | uuid not null | → venues; дублируется для RLS и Realtime-фильтров |
| hall_id | uuid not null | → halls; составной ключ `(hall_id, venue_id)`, поэтому зал только своего заведения. Зал с ресурсами не удаляется |
| kind | resource_kind not null | |
| name | text not null | «Стол 3», «PS-5», «VIP-кабинка» |
| capacity | int | Для караоке, саун, PS-зон |
| x, y, w, h | int not null | Положение и размер на карте |
| rotation | int not null default 0 | Градусы |
| shape | text not null default 'rect' | `rect`, `circle` |
| bookable_online | boolean not null default true | |
| is_active | boolean not null default true | Удалённые ресурсы не стираем, а выключаем: на них ссылаются старые сеансы |

### hall_objects

Декор на карте, его нельзя забронировать.

| Поле | Тип | Примечание |
| --- | --- | --- |
| id | uuid | |
| hall_id | uuid not null | → halls |
| kind | hall_object_kind not null | |
| label | text | |
| x, y, w, h, rotation | int not null | |

### tariffs

| Поле | Тип | Примечание |
| --- | --- | --- |
| id | uuid | |
| venue_id | uuid not null | → venues |
| name | text not null | «Будни день», «Вечер», «Выходные» |
| resource_kinds | resource_kind[] not null | К каким видам ресурсов применяется |
| price_per_hour | int not null | Тенге |
| weekdays | int[] not null | 1 = понедельник … 7 = воскресенье, по ISO |
| time_from | time not null | |
| time_to | time not null | `time_to <= time_from` значит через полночь; день недели — день начала интервала |
| priority | int not null default 0 | Если подходят несколько тарифов, берётся с большим приоритетом |
| is_active | boolean not null default true | |

### packages

| Поле | Тип | Примечание |
| --- | --- | --- |
| id | uuid | |
| venue_id | uuid not null | → venues |
| name | text not null | «3 часа по цене 2» |
| resource_kinds | resource_kind[] not null | |
| minutes | int not null | |
| price | int not null | |
| is_active | boolean not null default true | |

### customers

| Поле | Тип | Примечание |
| --- | --- | --- |
| id | uuid | |
| venue_id | uuid not null | → venues |
| phone | text not null | Формат `+7XXXXXXXXXX` |
| name | text | |
| notes | text | Заметки администратора |
| consent_at | timestamptz | Когда гость дал согласие на обработку данных |

Уникальность `(venue_id, phone)`. Гость одного заведения не виден другому.

### bookings

| Поле | Тип | Примечание |
| --- | --- | --- |
| id | uuid | |
| venue_id | uuid not null | → venues |
| resource_id | uuid not null | → resources |
| customer_id | uuid not null | → customers |
| starts_at | timestamptz not null | |
| ends_at | timestamptz not null | `ends_at > starts_at` |
| blocked_until | timestamptz not null | `ends_at` плюс буфер заведения на момент создания |
| status | booking_status not null default 'confirmed' | |
| source | booking_source not null | |
| guests | int | |
| comment | text | |
| manage_token | text not null unique | Случайный токен для ссылки `/b/{token}` |
| created_by | uuid | Пользователь админки; `null` для онлайн-брони |
| cancelled_at | timestamptz | |
| cancelled_by_guest | boolean not null default false | |
| cancel_reason | text | |

### sessions

Визит гостей за столом от старта до закрытия.

| Поле | Тип | Примечание |
| --- | --- | --- |
| id | uuid | |
| venue_id | uuid not null | → venues |
| booking_id | uuid unique | → bookings; `null` для гостей без брони |
| customer_id | uuid | → customers |
| package_id | uuid | → packages |
| status | session_status not null | |
| expected_end_at | timestamptz | Ожидаемое окончание; блокирует онлайн-бронь до этого времени |
| started_by | uuid not null | |
| started_at | timestamptz not null default now() | |
| closed_by | uuid | |
| closed_at | timestamptz | |
| time_amount | int | Сумма за время, считается при закрытии |
| items_amount | int | Сумма товаров |
| discount_amount | int not null default 0 | |
| total_amount | int | `time_amount + items_amount - discount_amount` |
| tariff_snapshot | jsonb | Строки чека по тарифам, пакет и минуты на момент закрытия |
| void_reason | text | Причина аннулирования |

### session_segments

Отрезки сеанса. Пауза и перенос на другой стол — новые отрезки.

| Поле | Тип | Примечание |
| --- | --- | --- |
| id | uuid | |
| venue_id | uuid not null | → venues |
| session_id | uuid not null | → sessions |
| resource_id | uuid not null | → resources |
| kind | segment_kind not null | |
| started_at | timestamptz not null | |
| ended_at | timestamptz | `null`, пока отрезок открыт |

### session_items

| Поле | Тип | Примечание |
| --- | --- | --- |
| id | uuid | |
| venue_id | uuid not null | → venues; для RLS |
| session_id | uuid not null | → sessions |
| name | text not null | |
| price | int not null | |
| qty | int not null default 1 | |

### shifts

| Поле | Тип | Примечание |
| --- | --- | --- |
| id | uuid | |
| venue_id | uuid not null | → venues |
| opened_by | uuid not null | |
| opened_at | timestamptz not null | |
| opening_cash | int not null | |
| closed_by | uuid | |
| closed_at | timestamptz | |
| closing_cash | int | Сколько насчитал администратор |
| expected_cash | int | Сколько должно быть по системе |

### payments

Учёт оплат на месте. Платформа деньги не принимает, только записывает.

| Поле | Тип | Примечание |
| --- | --- | --- |
| id | uuid | |
| venue_id | uuid not null | → venues |
| shift_id | uuid not null | → shifts |
| session_id | uuid not null | → sessions |
| amount | int not null | Больше нуля |
| method | payment_method not null | |
| created_by | uuid not null | |
| voided_at | timestamptz | Отменённую оплату не удаляем, а помечаем |
| voided_by | uuid | |
| void_reason | text | |

### audit_log

Пишется только триггерами. Ни у кого нет прав на `update` и `delete`.

| Поле | Тип | Примечание |
| --- | --- | --- |
| id | bigint generated always as identity | |
| venue_id | uuid not null | |
| user_id | uuid | `auth.uid()` в момент действия |
| action | text not null | `session.voided`, `session.time_edited`, `session.discount`, `payment.voided`, `booking.cancelled` |
| entity | text not null | Имя таблицы |
| entity_id | uuid not null | |
| before | jsonb | |
| after | jsonb | |

## Ограничения, которые нельзя оставлять на код

```sql
-- Две активные брони на один ресурс не пересекаются, с учётом буфера
alter table bookings add constraint bookings_no_overlap
  exclude using gist (
    resource_id with =,
    tstzrange(starts_at, blocked_until, '[)') with &&
  ) where (status in ('confirmed', 'arrived'));

-- На одном ресурсе одновременно открыт не больше одного отрезка
create unique index session_segments_one_open
  on session_segments (resource_id) where ended_at is null;

-- У сеанса не больше одного открытого отрезка
create unique index session_segments_one_open_per_session
  on session_segments (session_id) where ended_at is null;
```

Плюс `check`: `ends_at > starts_at`, `amount > 0`, `price_per_hour >= 0`, `slot_step_min in (15, 30, 60)`.

## Права доступа (RLS)

Вспомогательные функции (`security definer`, `stable`):

- `is_venue_member(venue_id uuid) returns boolean` — пользователь состоит в организации заведения.
- `is_venue_owner(venue_id uuid) returns boolean` — пользователь владелец этой организации.
- `is_org_member(org_id uuid)` и `is_org_owner(org_id uuid)` — то же для организации. Нужны политикам `organizations`, `members` и `venues`, где заведения ещё нет.
- `hall_venue_id(hall_id uuid) returns uuid` — заведение зала, для политик `hall_objects`, где нет `venue_id`.

Владелец попадает в `members` с ролью `owner` автоматически: триггер `organizations_add_owner_as_member` после создания организации. Через политики владелец добавляет, меняет и удаляет только администраторов, свою строку `owner` он изменить не может.

| Таблица | Чтение | Запись |
| --- | --- | --- |
| organizations | Участники | Владелец |
| members | Участники | Владелец |
| venues, venue_photos, halls, resources, hall_objects, tariffs, packages | Участники | Владелец |
| customers, bookings, sessions, session_segments, session_items, payments, shifts | Участники | Только через RPC |
| audit_log | Владелец | Никто, только триггеры |

RPC для таблиц «только через RPC» объявлены `security definer`: прямых прав на запись у `authenticated` нет, поэтому каждая функция сама проверяет `is_venue_member` (аннулирование — `is_venue_owner`). Ошибки бизнес-правил приходят текстом: `resource_busy`, `session_not_active`, `shift_already_open`, `no_tariff` и т. п.

Роль `anon` не читает ни одну таблицу напрямую: права на таблицы у неё отозваны (`revoke all`), запрос получает ошибку `42501`, а не пустой ответ. Публичная страница работает только через `get_public_venue` и `get_availability`.

## RPC-функции

| Функция | Кто вызывает | Что делает |
| --- | --- | --- |
| `server_now()` | Все | Время сервера для поправки таймера |
| `get_org_staff(org_id)` | Владелец | Сотрудники организации с email и именем из `auth.users`; остальным пустой результат |
| `user_id_by_email(email)` | Только сервер (`service_role`) | id уже зарегистрированного пользователя, когда его приглашают администратором |
| `save_hall_layout(hall_id, resources, objects)` | Владелец | Сохраняет карту зала целиком в одной транзакции: создаёт, меняет и удаляет ресурсы и декор. Ресурс с историей не удаляется, а выключается |
| `get_public_venue(slug)` | anon | Профиль, фото, карта, цены опубликованного заведения. Без данных гостей |
| `get_availability(venue_id, date, duration_min)` | anon | Свободные окна по каждому ресурсу на дату |
| `create_public_booking(...)` | Только сервер (Route Handler) | Находит или создаёт гостя, создаёт бронь `confirmed`, возвращает `manage_token` |
| `get_booking_by_token(token)` | anon | Данные одной брони для страницы `/b/{token}` |
| `cancel_booking_by_token(token)` | anon | Отмена гостем; только до `starts_at` |
| `get_day_bookings(venue_id, date)` | Администратор | Брони на день с числом прошлых неявок каждого гостя |
| `create_manual_booking(...)` | Администратор | Бронь по звонку |
| `set_booking_status(booking_id, status, reason)` | Администратор | Отмена, неявка |
| `start_session(resource_id, expected_end_at?, package_id?, customer_phone?, customer_name?)` | Администратор | Сеанс и первый отрезок `play`; гостя находит или создаёт по телефону. Запуск по брони (бронь → `arrived`) добавит этап 5 |
| `pause_session(session_id)` / `resume_session(session_id)` | Администратор | Закрывает текущий отрезок, открывает новый |
| `transfer_session(session_id, resource_id)` | Администратор | Перенос на другой ресурс |
| `calc_session_amount(session_id, at?)` | Администратор | Сумма на момент `at` (по умолчанию сейчас), без записи |
| `calc_play_amount(venue_id, segments, package_id?, at?)` | Участники | Ядро расчёта: сумма и строки чека по переданным отрезкам. Готово с этапа 3.1; `calc_session_amount` передаёт ей отрезки сеанса |
| `find_tariff(venue_id, resource_kind, local_time)` | Участники | Тариф, который действует в этот местный момент, с учётом ночных интервалов и `priority` |
| `tariff_week_grid(venue_id, resource_kind)` | Участники | Тариф на каждые полчаса недели через `find_tariff`, для сетки на экране тарифов |
| `close_session(session_id, discount_amount?)` | Администратор | Закрывает отрезки, считает и записывает суммы, снимок тарифов; бронь → `completed` |
| `void_session(session_id, reason)` | Владелец | Аннулирует сеанс, пишет в журнал |
| `add_payment(session_id, amount, method)` / `void_payment(payment_id, reason)` | Администратор | Оплата и её отмена; нужна открытая смена |
| `open_shift(venue_id, opening_cash)` / `close_shift(shift_id, closing_cash)` | Администратор | Смена; при закрытии считает `expected_cash` |

### Как считает `calc_session_amount`

1. Берёт отрезки `play` сеанса. Открытый отрезок считается до момента `at`.
2. Каждый отрезок переводит в местное время заведения и режет по границам тарифов.
3. Для каждого куска выбирает активный тариф по виду ресурса, дню недели и времени. Если подходят несколько, берёт с большим `priority`.
4. Если ни один тариф не подходит, функция выдаёт ошибку `no_tariff` с ресурсом и временем. Сеанс не закрывается бесплатно молча.
5. Если у сеанса есть пакет, первые `packages.minutes` минут игры стоят `packages.price`, остаток считается по тарифам.
6. Длительность каждого отрезка округляется вверх до `venues.rounding_min`. Добавленные минуты считаются по тарифу последнего куска отрезка.
7. Сумма каждого куска: `price_per_hour * минуты / 60`, итог округляется до целого тенге по правилам математики.

Ошибка `no_tariff` поднимается только для оплачиваемых минут: минуты, покрытые пакетом, тариф не требуют. Пакет покрывает первые минуты игры на ресурсах своих видов; его цена входит в сумму, даже если минут сыграно меньше. В строках чека суммы округлены по отдельности, поэтому их сумма может отличаться от итога на 1 ₸.

`expected_cash` при закрытии смены = `opening_cash` + неотменённые оплаты наличными за смену.

## Фоновые задачи (pg_cron)

| Задача | Расписание | Что делает |
| --- | --- | --- |
| `mark_no_shows` | Каждую минуту | `confirmed`, у которых `starts_at + no_show_after_min` прошло, а сеанса нет → `no_show` |

## Storage

Бакет `venue-photos`, публичное чтение. Загрузка и удаление только владельцу заведения, как и строки `venue_photos`; участники видят объекты своего заведения (Storage API требует `select` для удаления). Путь `{venue_id}/{uuid}.{jpg,png,webp}`, id заведения из первой папки достаёт `venue_photo_venue_id(name)`. Размер файла до 5 МБ, типы `image/jpeg`, `image/png`, `image/webp`. Браузер загружает файл прямо в Storage, затем пишет строку в `venue_photos`.

## Seed

`supabase/seed.sql` создаёт демо-бильярдную «Демо Бильярд» со slug `demo-billiards`: один зал, 6 столов пул и 2 русских, тарифы «Будни день», «Вечер», «Выходные», владельца `owner@demo.local` и администратора `admin@demo.local` с паролем `demo12345`. Второе заведение «Демо PS-клуб» (`demo-ps-club`, не опубликовано) с владельцем `owner2@demo.local` нужно тестам RLS. id в seed фиксированные, на них ссылаются тесты. Зал «Основной зал» с 6 столами пул, 2 русскими, баром и входом добавлен на этапе 2.1; у PS-клуба зал «Комнаты» с двумя PS-зонами для тестов RLS. Тарифы «Будни день», «Вечер», «Выходные» из `docs/TESTING.md` и пакет «3 часа за 5 000» добавлены на этапе 3.1.
