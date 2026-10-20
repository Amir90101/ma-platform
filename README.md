# Booking CRM для заведений

CRM и онлайн-бронирование для бильярдных, PS- и компьютерных клубов, караоке, бань и саун, футбольных полей и падел-кортов в Казахстане. Владелец ведёт карту зала, тарифы, сеансы, кассу и выручку. Гости бронируют по ссылке заведения без звонка, оплата на месте.

Рабочее название. Финальное название и домен пока не выбраны.

## Документы

| Файл | Что внутри |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Правила для ИИ-агента (Claude Code, Codex, Cursor) |
| [docs/PRD.md](docs/PRD.md) | Требования к продукту, рамки первой версии |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Стек, структура папок, серверная логика, хранение данных |
| [docs/DATABASE.md](docs/DATABASE.md) | Таблицы, ограничения, RLS, RPC-функции |
| [docs/USER_FLOWS.md](docs/USER_FLOWS.md) | Сценарии владельца, администратора и гостя |
| [docs/TASKS.md](docs/TASKS.md) | Этапы разработки |
| [docs/TESTING.md](docs/TESTING.md) | Тест-кейсы по этапам |

## Что нужно установить

- Node.js 24 (версия в `.nvmrc`: `nvm install`)
- Docker Desktop (для локального Supabase)
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
- Claude Code v2.1.277 или новее: эта версия читает `AGENTS.md` без отдельного `CLAUDE.md`

## Запуск

Команды заработают после этапа 0 из `docs/TASKS.md`.

```bash
git clone <repo-url>
cd ma-platform
npm install

cp .env.example .env.local
supabase start            # печатает URL и ключи локальной базы
# вставьте URL и ключи из вывода supabase start в .env.local

supabase db reset         # миграции и демо-данные
npm run dev               # http://localhost:3000
```

Демо-заведение: `http://localhost:3000/demo-billiards`. Вход в админку: `owner@demo.local` или `admin@demo.local`, пароль `demo12345`.

## Команды

| Команда | Что делает |
| --- | --- |
| `npm run dev` | Приложение на localhost:3000 |
| `npm run lint` | ESLint |
| `npm run typecheck` | Проверка типов TypeScript |
| `npm run format` | Prettier |
| `npm run test` | Юнит-тесты (Vitest) |
| `npm run e2e` | E2E-тесты (Playwright) |
| `supabase start` / `supabase stop` | Локальная база |
| `supabase db reset` | Пересоздать базу из миграций и seed |
| `supabase migration new <name>` | Новая миграция |
| `supabase test db` | Тесты базы (pgTAP) |
| `supabase gen types typescript --local > src/lib/supabase/types.ts` | Типы TypeScript из схемы |

## Как работаем с Claude Code

1. Новая ветка на этап: `git checkout -b stage-N-название`.
2. Запустите Claude Code в режиме планирования и дайте промпт: «Прочитай docs/TASKS.md, этап N, и документы, которые к нему относятся. Составь план реализации и задай вопросы. Код не пиши, пока я не одобрю план».
3. Проверьте план, поправьте, одобрите.
4. Прочитайте дифф сами, особенно миграции и политики RLS.
5. Тесты и линтер зелёные — pull request и мерж в `main`.

Первый промпт для этапа 0: «Создай проект по docs/TASKS.md, этап 0, с учётом docs/ARCHITECTURE.md. Сначала покажи план».
