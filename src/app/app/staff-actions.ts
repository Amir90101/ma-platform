"use server";

import { refresh } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { staffEmail, staffLogin } from "@/lib/staff-login";
import {
  type FieldErrors,
  fieldErrors,
  staffPasswordSchema,
  staffSchema,
} from "@/lib/validation/auth";
import { getVenueAccess } from "@/lib/venue-access";

// Ошибки — ключи из messages (раздел Staff.errors и Auth.errors для полей).
export type StaffFormState = {
  error?: string;
  fieldErrors?: FieldErrors;
  created?: { login: string };
  done?: boolean;
};

// Сотрудник с логином и паролем от владельца, без email (этап 9.3).
export async function createStaff(
  venueId: string,
  _prev: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  const parsed = staffSchema.safeParse({
    fullName: formData.get("fullName"),
    login: formData.get("login"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  // Ключ service_role используем только после проверки, что зовёт владелец.
  const access = await getVenueAccess(venueId);
  if (!access?.isOwner) return { error: "forbidden" };
  const { supabase, venue } = access;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: staffEmail(parsed.data.login),
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.fullName },
  });
  if (error?.code === "email_exists") {
    return { fieldErrors: { login: "loginTaken" } };
  }
  if (error) return { error: "unknown" };

  // Строку участника пишет обычный клиент: RLS пускает только владельца
  // и только с ролью admin.
  const { error: insertError } = await supabase
    .from("members")
    .insert({ org_id: venue.org_id, user_id: data.user.id, role: "admin" });
  if (insertError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: "unknown" };
  }

  refresh();
  return { created: { login: parsed.data.login } };
}

// Новый пароль сотруднику: только тем, кто входит по логину и состоит
// администратором в организации этого владельца.
export async function setStaffPassword(
  venueId: string,
  userId: string,
  _prev: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  const parsed = staffPasswordSchema.safeParse({
    password: formData.get("password"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const access = await getVenueAccess(venueId);
  if (!access?.isOwner) return { error: "forbidden" };
  const { data: staff } = await access.supabase.rpc("get_org_staff", {
    p_org_id: access.venue.org_id,
  });
  const member = staff?.find((m) => m.user_id === userId && m.role === "admin");
  if (!member || !staffLogin(member.email)) return { error: "forbidden" };

  const { error } = await createAdminClient().auth.admin.updateUserById(
    userId,
    { password: parsed.data.password },
  );
  if (error) return { error: "unknown" };
  return { done: true };
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
