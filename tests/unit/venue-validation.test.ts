import { describe, expect, it } from "vitest";
import {
  slugify,
  slugSchema,
  venueFieldErrors,
  venueFromForm,
  venueSchema,
} from "@/lib/validation/venue";

describe("slugify", () => {
  it.each([
    ["Бильярд Пирамида", "bilyard-piramida"],
    ["Қазақ Ойын Клубы", "kazak-oyyn-kluby"],
    ["PS Club #1", "ps-club-1"],
    ["  —Щука & Ёжик—  ", "schuka-ezhik"],
    ["!!!", ""],
  ])("%s → %s", (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it("обрезает до 40 символов без дефиса в конце", () => {
    const slug = slugify("очень длинное название заведения для проверки длины");
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("slugSchema", () => {
  it.each([
    ["admin", "slugReserved"],
    ["ab", "slugTooShort"],
    ["demo_club", "slugFormat"],
    ["-club", "slugFormat"],
  ])("%s отклоняется: %s", (slug, error) => {
    const r = slugSchema.safeParse(slug);
    expect(r.error?.issues[0]?.message).toBe(error);
  });

  it("приводит к нижнему регистру", () => {
    expect(slugSchema.parse(" Demo-Club ")).toBe("demo-club");
  });
});

// Все дни 10:00–22:00, поля из fields поверх.
function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const d of [1, 2, 3, 4, 5, 6, 7]) {
    fd.set(`hours.${d}.open`, "10:00");
    fd.set(`hours.${d}.close`, "22:00");
  }
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const base = {
  type: "billiards",
  name: "Пирамида",
  slug: "piramida",
  city: "Алматы",
  address: "",
  phone: "",
  description: "",
};

describe("venueFromForm + venueSchema", () => {
  it("выходные дни не попадают в часы работы, пустые поля → null", () => {
    const fd = form({
      ...base,
      "hours.1.open": "10:00",
      "hours.1.close": "02:00",
      "hours.2.closed": "on",
    });
    const r = venueSchema.parse(venueFromForm(fd));
    expect(r.workingHours.map((d) => d.weekday)).toEqual([1, 3, 4, 5, 6, 7]);
    expect(r.workingHours[0]).toEqual({
      weekday: 1,
      open: "10:00",
      close: "02:00",
    });
    expect(r.address).toBeNull();
    expect(r.phone).toBeNull();
  });

  it("ошибки дней приходят с ключом hours.{день}", () => {
    const fd = form({
      ...base,
      type: "casino",
      phone: "abc",
      "hours.3.close": "10:00",
      "hours.5.open": "25:00",
    });
    const input = venueFromForm(fd);
    const r = venueSchema.safeParse(input);
    expect(venueFieldErrors(r.error!, input)).toEqual({
      type: "typeRequired",
      phone: "phoneFormat",
      "hours.3": "timeSame",
      "hours.5": "timeFormat",
    });
  });
});
