import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// Владелец платформы: подключает заведения, но в организациях не состоит.
// Права проверяет база (is_platform_admin), здесь — только для интерфейса.
export const isPlatformAdmin = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_platform_admin");
  return data === true;
});
