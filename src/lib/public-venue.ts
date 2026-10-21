import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import type { ResourceKind } from "@/lib/venue-types";
import type { VenueType, WorkingDay } from "@/lib/validation/venue";
import type { HallObjectKind } from "@/lib/venue-types";
import { createPublicClient } from "@/lib/supabase/public";

// Ответ get_public_venue: только безопасные поля, без данных гостей.
export type PublicVenue = {
  id: string;
  type: VenueType;
  name: string;
  slug: string;
  city: string;
  address: string | null;
  phone: string | null;
  description: string | null;
  timezone: string;
  working_hours: WorkingDay[];
  online_booking_enabled: boolean;
  slot_step_min: number;
  min_duration_min: number;
  min_lead_min: number;
  max_days_ahead: number;
  no_show_after_min: number;
  photos: string[];
  halls: {
    id: string;
    name: string;
    width: number;
    height: number;
    resources: {
      id: string;
      kind: ResourceKind;
      name: string;
      capacity: number | null;
      x: number;
      y: number;
      w: number;
      h: number;
      rotation: number;
      shape: "rect" | "circle";
      bookable_online: boolean;
    }[];
    objects: {
      id: string;
      kind: HallObjectKind;
      label: string | null;
      x: number;
      y: number;
      w: number;
      h: number;
      rotation: number;
    }[];
  }[];
  tariffs: {
    name: string;
    resource_kinds: ResourceKind[];
    price_per_hour: number;
    weekdays: number[];
    time_from: string;
    time_to: string;
  }[];
  packages: {
    id: string;
    name: string;
    resource_kinds: ResourceKind[];
    minutes: number;
    price: number;
  }[];
};

// Один запрос на рендер: generateMetadata и страница делят результат.
export const getPublicVenue = cache(
  async (slug: string): Promise<PublicVenue | null> => {
    await connection();
    const { data } = await createPublicClient().rpc("get_public_venue", {
      p_slug: slug,
    });
    return (data as PublicVenue | null) ?? null;
  },
);

// Фото лежат в публичном бакете venue-photos.
export function publicPhotoUrl(path: string) {
  return createPublicClient().storage.from("venue-photos").getPublicUrl(path)
    .data.publicUrl;
}
