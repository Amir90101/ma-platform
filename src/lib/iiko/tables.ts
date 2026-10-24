import "server-only";
import type { VenueType } from "@/lib/validation/venue";
import { resourceKindsFor } from "@/lib/venue-types";
import { createIikoClient } from "./client";
import { iikoTableLayout } from "./layout";

// Столы выбранных залов iiko, разложенные сеткой для зала «iiko».
export async function iikoTablesFor(
  apiLogin: string,
  terminalGroupId: string,
  sectionIds: string[],
  venueType: VenueType,
) {
  const tables = (await createIikoClient(apiLogin).sections(terminalGroupId))
    .filter((s) => sectionIds.includes(s.id))
    .flatMap((s) => s.tables)
    .filter((t) => !t.isDeleted);
  return iikoTableLayout(tables, resourceKindsFor(venueType)[0]);
}
