import { describe, expect, it } from "vitest";
import ru from "../../messages/ru.json";
import kk from "../../messages/kk.json";

function keys(obj: object, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "object" && v !== null
      ? keys(v, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

describe("messages", () => {
  it("ru.json содержит название продукта", () => {
    expect(ru.Common.productName).toBeTruthy();
  });

  it("kk.json не содержит ключей, которых нет в ru.json", () => {
    const ruKeys = new Set(keys(ru));
    expect(keys(kk).filter((k) => !ruKeys.has(k))).toEqual([]);
  });
});
