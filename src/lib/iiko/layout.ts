import type { ResourceKind } from "@/lib/venue-types";

// Новые столы из iiko — сеткой по 7 в ряд в зале шириной 1200.
const W = 140;
const H = 100;
const GAP = 30;
const PER_ROW = 7;

export function iikoTableLayout(
  tables: {
    id: string;
    name: string;
    number: number;
    seatingCapacity: number;
  }[],
  kind: ResourceKind,
) {
  return [...tables]
    .sort((a, b) => a.number - b.number)
    .map((t, i) => ({
      iiko_table_id: t.id,
      name: t.name || String(t.number),
      capacity: t.seatingCapacity || null,
      kind,
      x: 40 + (i % PER_ROW) * (W + GAP),
      y: 40 + Math.floor(i / PER_ROW) * (H + GAP),
      w: W,
      h: H,
    }));
}
