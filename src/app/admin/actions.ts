"use server";

import { redirect } from "next/navigation";
import { iikoTablesFor } from "@/lib/iiko/tables";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { emailSchema } from "@/lib/validation/auth";
import {
  organizationNameSchema,
  venueFieldErrors,
  venueFromForm,
  venueSchema,
} from "@/lib/validation/venue";
import { saveErrorState, type VenueFormState, venueRow } from "@/lib/venue-row";

// Владелец платформы подключает заведение: владелец заведения получает
// приглашение на email (или, если он уже есть в системе, просто видит новое
// заведение после входа).
export async function createVenueForOwner(
  _prev: VenueFormState,
  formData: FormData,
): Promise<VenueFormState> {
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("is_platform_admin");
  if (!allowed) return { error: "forbidden" };

  const input = venueFromForm(formData);
  const parsed = venueSchema.safeParse(input);
  const email = emailSchema.safeParse(formData.get("ownerEmail") ?? "");
  const orgNameRaw = String(formData.get("orgName") ?? "").trim();
  const orgName = orgNameRaw
    ? organizationNameSchema.safeParse(orgNameRaw)
    : null;

  const fieldErrors = parsed.success
    ? {}
    : venueFieldErrors(parsed.error, input);
  if (!email.success) fieldErrors.ownerEmail = "ownerEmailInvalid";
  if (orgName && !orgName.success) {
    fieldErrors.orgName = orgName.error.issues[0].message;
  }
  // Касса iiko: всё для обмена выбрано в форме (этап 9.5).
  const iiko =
    formData.get("cashSystem") === "iiko"
      ? {
          apiLogin: String(formData.get("iikoApiLogin") ?? "").trim(),
          organizationId: String(formData.get("iikoOrganizationId") ?? ""),
          terminalGroupId: String(formData.get("iikoTerminalGroupId") ?? ""),
          sectionIds: formData.getAll("iikoSectionIds").map(String),
        }
      : null;
  if (
    iiko &&
    (!iiko.apiLogin ||
      !iiko.organizationId ||
      !iiko.terminalGroupId ||
      iiko.sectionIds.length === 0)
  ) {
    fieldErrors.iiko = "iikoRequired";
  }
  if (!parsed.success || !email.success || Object.keys(fieldErrors).length) {
    return { fieldErrors };
  }

  // Столы iiko — до создания заведения: ключ или залы не подошли — заведение
  // не создаём.
  let iikoTables = null;
  if (iiko) {
    try {
      iikoTables = await iikoTablesFor(
        iiko.apiLogin,
        iiko.terminalGroupId,
        iiko.sectionIds,
        parsed.data.type,
      );
    } catch {
      return { fieldErrors: { iiko: "iikoRequired" } };
    }
  }

  // Ключ service_role — только после проверки, что зовёт владелец платформы.
  const admin = createAdminClient();
  let ownerId: string | null = null;
  const { data: existing } = await admin.rpc("user_id_by_email", {
    p_email: email.data,
  });
  if (existing) {
    ownerId = existing;
  } else {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(
      email.data,
    );
    if (error) return { error: "inviteFailed" };
    ownerId = data.user.id;
  }

  // Организацию и заведение создаёт база: функция ещё раз проверяет права.
  // С iiko — одной транзакцией вместе с ключом, залами и столами.
  const { error } =
    iiko && iikoTables
      ? await supabase.rpc("platform_create_venue_iiko", {
          p_owner_id: ownerId,
          p_org_name: orgName?.data ?? "",
          p_venue: venueRow(parsed.data),
          p_api_login: iiko.apiLogin,
          p_organization_id: iiko.organizationId,
          p_terminal_group_id: iiko.terminalGroupId,
          p_section_ids: iiko.sectionIds,
          p_tables: iikoTables,
        })
      : await supabase.rpc("platform_create_venue", {
          p_owner_id: ownerId,
          p_org_name: orgName?.data ?? "",
          p_venue: venueRow(parsed.data),
        });
  if (error) return saveErrorState(error);

  redirect(`/admin?created=${encodeURIComponent(parsed.data.slug)}`);
}
