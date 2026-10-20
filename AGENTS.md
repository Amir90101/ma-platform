# Инструкции для ИИ-агента

CRM для владельцев развлекательных заведений в Казахстане: бильярд, PS- и компьютерные клубы, караоке, бани и сауны, футбольные поля и падел-корты. Владелец ведёт в ней карту зала, тарифы, сеансы с таймером, кассу, брони и выручку. Гости бронируют через публичную ссылку заведения. Онлайн-оплаты и депозитов в первой версии нет.

## Документы

Перед работой над этапом прочитай документы, которые к нему относятся. Не держи их в голове по памяти: открой файл.

- `docs/PRD.md` — что делаем и что не делаем в первой версии, типы заведений.
- `docs/ARCHITECTURE.md` — стек, структура папок, серверная логика, хранение данных.
- `docs/DATABASE.md` — таблицы, ограничения, RLS, RPC-функции.
- `docs/USER_FLOWS.md` — сценарии владельца, администратора и гостя, статусы брони.
- `docs/TASKS.md` — этапы разработки и критерии готовности.
- `docs/TESTING.md` — что и как тестируем на каждом этапе.

У каждой темы один файл. Если нужно описать то, что уже есть в другом документе, сошлись на него, а не копируй.

## Стек

- Next.js (App Router), TypeScript в режиме strict, Tailwind, shadcn/ui.
- react-konva для карты зала.
- Supabase: Postgres, Auth, RLS, Realtime, Storage, pg_cron.
- next-intl: русский сейчас, казахский позже.
- Vitest для юнит-тестов, Playwright для e2e, pgTAP для тестов базы.

## Команды

```bash
supabase start                    # локальная база
supabase db reset                 # пересоздать базу из миграций и seed
supabase migration new <name>     # новая миграция
supabase test db                  # тесты базы (pgTAP)
npm run dev                       # приложение на localhost:3000
npm run lint
npm run test                      # Vitest
npm run e2e                       # Playwright
```

## Правила

### База

- Схему меняем только новой миграцией в `supabase/migrations`. Ничего руками в панели Supabase. Старые миграции не редактируем.
- RLS включён на каждой таблице. Новая таблица идёт в одной миграции со своими политиками и тестом, что администратор другого заведения не видит её строки.
- Время храним в `timestamptz` (UTC). Показываем в часовом поясе заведения из `venues.timezone`.
- Деньги храним целым числом тенге (`integer`). Никаких `float` и `numeric` с дробями.
- Сумму сеанса считает только SQL-функция `calc_session_amount`. На клиенте цены не считаем, даже для предпросмотра.
- Двойные брони отсекает EXCLUDE-ограничение в базе. Проверка в коде — только для понятного сообщения пользователю, не вместо ограничения.
- После изменения схемы обнови `docs/DATABASE.md` и перегенерируй типы: `supabase gen types typescript --local > src/lib/supabase/types.ts`.

### Код

- Ключ `SUPABASE_SERVICE_ROLE_KEY` используется только в серверном коде Next.js. Никогда в клиентских компонентах и никогда с префиксом `NEXT_PUBLIC_`.
- Публичная страница заведения не получает данные гостей. Она читает только RPC `get_public_venue` и `get_availability`.
- Все строки интерфейса через next-intl (`messages/ru.json`). Без хардкода текста в компонентах.
- Секреты только в `.env.local`. Файл в `.gitignore`. Новая переменная — сразу добавь её в `.env.example` с пустым значением и комментарием.

### Порядок работы

- Один этап из `docs/TASKS.md` за раз, в своей ветке `stage-N-название`.
- Сначала план и вопросы, потом код. Не начинай писать код, пока план не одобрен.
- Перед коммитом проходят `npm run lint`, `npm run test` и `supabase test db`.
- После завершения этапа отметь его в `docs/TASKS.md` и допиши в конец этапа, что изменилось относительно плана.
- Не добавляй функции из раздела «Не входит в первую версию» в `docs/PRD.md`, даже если это кажется полезным. Это касается и депозитов, и онлайн-оплаты. Предложи их отдельно.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
