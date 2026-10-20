import type { Database } from "@/lib/supabase/types";
import type { VenueType } from "@/lib/validation/venue";

// Какие виды ресурсов доступны каждому типу заведения и какими они встают
// на карту по умолчанию. Справочник в коде, а не в базе: см. docs/DATABASE.md.

export type ResourceKind = Database["public"]["Enums"]["resource_kind"];
export type HallObjectKind = Database["public"]["Enums"]["hall_object_kind"];

export type ResourceDefaults = {
  w: number;
  h: number;
  shape: "rect" | "circle";
  capacity: number | null;
};

export const RESOURCE_DEFAULTS: Record<ResourceKind, ResourceDefaults> = {
  pool_table: { w: 180, h: 100, shape: "rect", capacity: null },
  russian_table: { w: 220, h: 120, shape: "rect", capacity: null },
  ps_zone: { w: 200, h: 160, shape: "rect", capacity: 4 },
  pc_seat: { w: 80, h: 80, shape: "rect", capacity: 1 },
  karaoke_room: { w: 260, h: 200, shape: "rect", capacity: 8 },
  sauna_room: { w: 260, h: 200, shape: "rect", capacity: 6 },
  court: { w: 400, h: 240, shape: "rect", capacity: 10 },
  other: { w: 120, h: 120, shape: "rect", capacity: null },
};

export const RESOURCE_KINDS_BY_VENUE_TYPE: Record<VenueType, ResourceKind[]> = {
  billiards: ["pool_table", "russian_table", "other"],
  ps_club: ["ps_zone", "other"],
  pc_club: ["pc_seat", "other"],
  ps_pc_club: ["ps_zone", "pc_seat", "other"],
  karaoke: ["karaoke_room", "other"],
  sauna: ["sauna_room", "other"],
  sports_court: ["court", "other"],
};

export const HALL_OBJECT_DEFAULTS: Record<
  HallObjectKind,
  { w: number; h: number }
> = {
  bar: { w: 300, h: 80 },
  entrance: { w: 120, h: 60 },
  wall: { w: 300, h: 20 },
  label: { w: 160, h: 40 },
  zone: { w: 300, h: 200 },
};

export function resourceKindsFor(type: VenueType): ResourceKind[] {
  return RESOURCE_KINDS_BY_VENUE_TYPE[type];
}
