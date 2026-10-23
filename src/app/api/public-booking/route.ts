import { isIP } from "node:net";
import { after } from "next/server";
import { dispatchIiko, freeInIikoNow } from "@/lib/iiko/venue";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTurnstile } from "@/lib/turnstile";
import {
  bookingCode,
  publicBookingSchema,
  type PublicBookingResponse,
} from "@/lib/validation/public-booking";

// Ошибки create_public_booking, которые гость может понять.
const KNOWN_ERRORS = new Set([
  "slot_unavailable",
  "limit_phone",
  "limit_ip",
  "resource_not_found",
  "duration_invalid",
  "phone_invalid",
  "name_required",
  "package_not_found",
]);

function reply(body: PublicBookingResponse, status: number) {
  return Response.json(body, { status });
}

// IP гостя из заголовков платформы. На Vercel x-forwarded-for выставляет
// сама платформа; за другим прокси настройте его так же (docs/ARCHITECTURE.md).
function clientIp(request: Request): string | null {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    null;
  return ip && isIP(ip) ? ip : null;
}

function limit(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

// Онлайн-бронь гостя: Turnstile, затем create_public_booking ключом
// service_role. Сама функция проверяет окно, лимиты и пересечения.
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return reply({ ok: false, error: "unknown" }, 400);
  }
  const parsed = publicBookingSchema.safeParse(json);
  if (!parsed.success) {
    return reply({ ok: false, error: parsed.error.issues[0].message }, 400);
  }
  const input = parsed.data;
  const ip = clientIp(request);

  if (!(await verifyTurnstile(input.turnstileToken, ip))) {
    return reply({ ok: false, error: "captcha_failed" }, 400);
  }

  // Заведение с iiko: стол могли занять бронью прямо в кассе (этап 9.5).
  const db = createAdminClient();
  const { data: resource } = await db
    .from("resources")
    .select("venue_id")
    .eq("id", input.resourceId)
    .maybeSingle();
  if (
    resource &&
    !(await freeInIikoNow(
      resource.venue_id,
      input.resourceId,
      new Date(input.startsAt),
      input.durationMin,
    ))
  ) {
    return reply({ ok: false, error: "slot_unavailable" }, 409);
  }

  const { data, error } = await db.rpc("create_public_booking", {
    p_resource_id: input.resourceId,
    p_starts_at: input.startsAt,
    p_duration_min: input.durationMin,
    p_phone: input.phone,
    p_name: input.name,
    p_guests: input.guests ?? undefined,
    p_comment: input.comment || undefined,
    p_ip: ip ?? undefined,
    p_max_active_per_phone: limit("PUBLIC_BOOKING_MAX_ACTIVE_PER_PHONE", 2),
    p_max_active_per_ip: limit("PUBLIC_BOOKING_MAX_ACTIVE_PER_IP", 5),
    p_package_id: input.packageId ?? undefined,
  });
  if (error) {
    const known = KNOWN_ERRORS.has(error.message);
    const status = error.message.startsWith("limit_")
      ? 429
      : error.message === "slot_unavailable"
        ? 409
        : known
          ? 400
          : 500;
    return reply(
      { ok: false, error: known ? error.message : "unknown" },
      status,
    );
  }
  // Бронь уходит в iiko сразу после ответа гостю; не вышло — повторит cron.
  after(() => dispatchIiko(createAdminClient()));
  const booking = data as {
    id: string;
    manage_token: string;
    starts_at: string;
    ends_at: string;
  };
  return reply(
    {
      ok: true,
      token: booking.manage_token,
      code: bookingCode(booking.id),
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
    },
    201,
  );
}
