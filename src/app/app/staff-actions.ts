"use server";

import { refresh } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailSchema } from "@/lib/validation/auth";
import { getVenueAccess } from "@/lib/venue-access";

// Ошибки — ключи из messages (раздел Staff.errors).
export type InviteFormState = {
  error?: string;
  // Приглашён новый пользователь (письмо ушло) или добавлен существующий.
  invited?: { email: string; existing: boolean };
};

export async function inviteAdmin(
  venueId: string,
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const parsed = emailSchema.safeParse(formData.get("email") ?? "");
  if (!parsed.success) return { error: "emailInvalid" };
  const email = parsed.data;

  // Ключ service_role используем только после проверки, что зовёт владелец.
  const access = await getVenueAccess(venueId);
  if (!access?.isOwner) return { error: "forbidden" };
  const { supabase, venue } = access;

  const admin = createAdminClient();
  let userId: string | null = null;
  let existing = false;
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
  if (error?.code === "email_exists") {
    existing = true;
    const { data: id } = await admin.rpc("user_id_by_email", {
      p_email: email,
    });
    userId = id;
  } else if (!error) {
    userId = data.user.id;
  }
  if (!userId) return { error: "unknown" };

  // Строку участника пишет обычный клиент: RLS пускает только владельца
  // и только с ролью admin.
  const { error: insertError } = await supabase
    .from("members")
    .insert({ org_id: venue.org_id, user_id: userId, role: "admin" });
  if (insertError?.code === "23505") return { error: "alreadyMember" };
  if (insertError) return { error: "unknown" };

  refresh();
  return { invited: { email, existing } };
}

export async function removeAdmin(venueId: string, userId: string) {
  const access = await getVenueAccess(venueId);
  if (!access?.isOwner) return;
  await access.supabase
    .from("members")
    .delete()
    .eq("org_id", access.venue.org_id)
    .eq("user_id", userId)
    .eq("role", "admin");
  refresh();
}
