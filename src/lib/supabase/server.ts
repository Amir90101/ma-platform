import "server-only";
import { createServerClient } from "@supabase/ssr";
import { connection } from "next/server";
import { cookies } from "next/headers";
import type { Database } from "./types";

// Клиент для серверных компонентов, Server Actions и Route Handlers.
// Запросы идут с JWT пользователя из cookie, поэтому работает RLS.
export async function createClient() {
  // Данные пользователя рендерим только по запросу: supabase-js сверяет срок
  // токена через Date.now(), а это нельзя делать в оболочке и предзагрузке.
  await connection();
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Серверный компонент не может писать cookie. Сессию обновляет proxy.
          }
        },
      },
    },
  );
}
