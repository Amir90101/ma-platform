import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/types";

// Данные для e2e пишем напрямую ключом service_role: у каждого теста своё
// заведение, тесты не делят столы демо-бильярдной и не мешают друг другу.
process.loadEnvFile(".env.local");

export const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export type WorkVenue = {
  venueId: string;
  tables: { id: string; name: string }[];
};

// Заведение владельца с залом из столов и круглосуточным тарифом 1 200 ₸/ч.
export async function seedWorkVenue(
  ownerEmail: string,
  tableCount = 4,
): Promise<WorkVenue> {
  const { data: ownerId } = await admin.rpc("user_id_by_email", {
    p_email: ownerEmail,
  });
  if (!ownerId) throw new Error(`Нет пользователя ${ownerEmail}`);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const org = await admin
    .from("organizations")
    .insert({ name: "ТОО e2e", owner_id: ownerId })
    .select("id")
    .single();
  const venue = await admin
    .from("venues")
    .insert({
      org_id: org.data!.id,
      type: "billiards",
      name: "Клуб e2e",
      slug: `e2e-${suffix}`,
      city: "Алматы",
    })
    .select("id")
    .single();
  const venueId = venue.data!.id;
  const hall = await admin
    .from("halls")
    .insert({ venue_id: venueId, name: "Зал" })
    .select("id")
    .single();
  const tables = await admin
    .from("resources")
    .insert(
      Array.from({ length: tableCount }, (_, i) => ({
        venue_id: venueId,
        hall_id: hall.data!.id,
        kind: "pool_table" as const,
        name: `Стол ${i + 1}`,
        x: 40 + i * 220,
        y: 80,
        w: 180,
        h: 100,
      })),
    )
    .select("id, name")
    .order("name");
  await admin.from("tariffs").insert({
    venue_id: venueId,
    name: "Сутки",
    resource_kinds: ["pool_table"],
    price_per_hour: 1200,
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    time_from: "00:00",
    time_to: "00:00",
  });
  return { venueId, tables: tables.data! };
}

// Сдвигает начало открытого сеанса на столе в прошлое: «сеанс шёл N минут».
export async function backdateOpenSession(resourceId: string, minutes: number) {
  const { data: seg } = await admin
    .from("session_segments")
    .select("id, session_id")
    .eq("resource_id", resourceId)
    .is("ended_at", null)
    .single();
  const at = new Date(Date.now() - minutes * 60_000).toISOString();
  await admin
    .from("session_segments")
    .update({ started_at: at })
    .eq("id", seg!.id);
  await admin
    .from("sessions")
    .update({ started_at: at })
    .eq("id", seg!.session_id);
}

// Администратор заведения с паролем: пользователь Auth и строка members.
export async function addAdmin(venueId: string) {
  const email = `admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.local`;
  const password = "admin-password-1";
  const { data: user } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  const { data: venue } = await admin
    .from("venues")
    .select("org_id")
    .eq("id", venueId)
    .single();
  await admin
    .from("members")
    .insert({ org_id: venue!.org_id, user_id: user.user!.id, role: "admin" });
  return { email, password };
}

// Клиент Supabase от имени пользователя: RPC с его auth.uid().
export async function signedInClient(email: string, password: string) {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  await client.auth.signInWithPassword({ email, password });
  return client;
}

// Ждущая бронь гостя через startsInMin минут от сейчас.
export async function seedBooking(
  venueId: string,
  resourceId: string,
  b: { startsInMin: number; minutes: number; phone: string; name: string },
) {
  const { data: customer } = await admin
    .from("customers")
    .upsert(
      { venue_id: venueId, phone: b.phone, name: b.name },
      { onConflict: "venue_id,phone" },
    )
    .select("id")
    .single();
  const startsAt = new Date(Date.now() + b.startsInMin * 60_000);
  const endsAt = new Date(startsAt.getTime() + b.minutes * 60_000);
  const { data: booking } = await admin
    .from("bookings")
    .insert({
      venue_id: venueId,
      resource_id: resourceId,
      customer_id: customer!.id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      blocked_until: endsAt.toISOString(),
      source: "phone",
    })
    .select("id")
    .single();
  return { id: booking!.id, startsAt };
}
