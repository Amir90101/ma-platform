import { describe, expect, it } from "vitest";
import ru from "../../messages/ru.json";
import {
  HALL_OBJECT_DEFAULTS,
  RESOURCE_DEFAULTS,
  resourceKindsFor,
} from "@/lib/venue-types";
import { VENUE_TYPES } from "@/lib/validation/venue";

describe("справочник видов ресурсов", () => {
  it("бильярду — столы пул и русские, PS-клубу — PS-зоны", () => {
    expect(resourceKindsFor("billiards")).toEqual([
      "pool_table",
      "russian_table",
      "other",
    ]);
    expect(resourceKindsFor("ps_club")).toEqual(["ps_zone", "other"]);
  });

  it("у каждого типа заведения есть хотя бы один свой вид, кроме other", () => {
    for (const type of VENUE_TYPES) {
      expect(resourceKindsFor(type).filter((k) => k !== "other")).not.toEqual(
        [],
      );
    }
  });

  it("у каждого вида ресурса и декора есть название в ru.json", () => {
    for (const kind of Object.keys(RESOURCE_DEFAULTS)) {
      expect(ru.Hall.resourceKinds).toHaveProperty(kind);
    }
    for (const kind of Object.keys(HALL_OBJECT_DEFAULTS)) {
      expect(ru.Hall.objectKinds).toHaveProperty(kind);
    }
  });
});
