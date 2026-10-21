-- Этап 6.2: публичная страница живёт по адресу /{slug}. Адреса, которые
-- уже заняты страницами приложения, заведению не достаются: иначе его
-- страница была бы недоступна. Совпадает с RESERVED_SLUGS в коде.

alter table public.venues drop constraint venues_slug_not_reserved;
alter table public.venues add constraint venues_slug_not_reserved check (
  slug not in (
    'app', 'api', 'b', 'login', 'register', 'admin', 'settings',
    'about', 'help', 'terms', 'privacy',
    'auth', 'health', 'forgot-password', 'reset-password'
  )
);
