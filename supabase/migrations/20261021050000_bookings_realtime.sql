-- Этап 5.2: лента броней обновляется во всех открытых окнах.
-- Realtime отдаёт изменения только участникам: RLS bookings_select.

alter publication supabase_realtime add table public.bookings;
