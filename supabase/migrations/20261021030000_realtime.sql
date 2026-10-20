-- Этап 4.6: статусы столов и смена во всех открытых окнах.
-- Realtime отдаёт изменения только тем, кому их разрешает RLS (участникам).

alter publication supabase_realtime
  add table public.session_segments, public.sessions, public.shifts;
