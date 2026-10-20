import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type OpenSession = {
  id: string;
  status: "active" | "paused";
  startedAt: string;
  expectedEndAt: string | null;
  resourceId: string;
  guest: string | null;
  packageName: string | null;
  // Сумма из calc_session_amount; null и error — посчитать не удалось.
  amount: number | null;
  amountError: string | null;
};

// Открытые сеансы заведения с текущим столом и суммой на сейчас.
export async function loadOpenSessions(
  supabase: SupabaseClient<Database>,
  venueId: string,
): Promise<OpenSession[]> {
  const { data } = await supabase
    .from("sessions")
    .select(
      "id, status, started_at, expected_end_at, customers(name, phone), packages(name), session_segments(resource_id, ended_at)",
    )
    .eq("venue_id", venueId)
    .in("status", ["active", "paused"])
    .order("started_at");

  return Promise.all(
    (data ?? []).map(async (s) => {
      const { data: amount, error } = await supabase.rpc(
        "calc_session_amount",
        { p_session_id: s.id },
      );
      const open = s.session_segments.find((seg) => seg.ended_at === null);
      return {
        id: s.id,
        status: s.status as OpenSession["status"],
        startedAt: s.started_at,
        expectedEndAt: s.expected_end_at,
        resourceId: open?.resource_id ?? "",
        guest:
          [s.customers?.name, s.customers?.phone].filter(Boolean).join(", ") ||
          null,
        packageName: s.packages?.name ?? null,
        amount: error
          ? null
          : ((amount as { total_amount?: number } | null)?.total_amount ?? 0),
        amountError: error ? error.message : null,
      };
    }),
  );
}
