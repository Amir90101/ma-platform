import { z } from "zod";
import { HALL_OBJECT_DEFAULTS, RESOURCE_DEFAULTS } from "@/lib/venue-types";

const RESOURCE_KINDS = Object.keys(RESOURCE_DEFAULTS) as [
  keyof typeof RESOURCE_DEFAULTS,
  ...(keyof typeof RESOURCE_DEFAULTS)[],
];
const OBJECT_KINDS = Object.keys(HALL_OBJECT_DEFAULTS) as [
  keyof typeof HALL_OBJECT_DEFAULTS,
  ...(keyof typeof HALL_OBJECT_DEFAULTS)[],
];

const coord = z.number().int().min(0).max(5000);
const size = z.number().int().min(10).max(5000);
const rotation = z.number().int().min(0).max(359);

// То, что редактор отправляет в save_hall_layout. id нет у новых фигур.
export const layoutResourceSchema = z.object({
  id: z.guid().optional(),
  kind: z.enum(RESOURCE_KINDS),
  name: z.string().trim().min(1).max(50),
  capacity: z.number().int().min(1).max(1000).nullable(),
  x: coord,
  y: coord,
  w: size,
  h: size,
  rotation,
  shape: z.enum(["rect", "circle"]),
  bookable_online: z.boolean(),
  is_active: z.boolean(),
});

export const layoutObjectSchema = z.object({
  id: z.guid().optional(),
  kind: z.enum(OBJECT_KINDS),
  label: z.string().trim().max(50).nullable(),
  x: coord,
  y: coord,
  w: size,
  h: size,
  rotation,
});

export const layoutSchema = z.object({
  resources: z.array(layoutResourceSchema).max(500),
  objects: z.array(layoutObjectSchema).max(500),
});

export type LayoutResource = z.infer<typeof layoutResourceSchema>;
export type LayoutObject = z.infer<typeof layoutObjectSchema>;
export type Layout = z.infer<typeof layoutSchema>;
