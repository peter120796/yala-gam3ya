import { describe, expect, it } from "vitest";
import ar from "@/messages/ar.json";
import en from "@/messages/en.json";

const keys = (o: object, prefix = ""): string[] =>
  Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

describe("translations", () => {
  it("Arabic and English dictionaries have exactly the same keys", () => {
    expect(keys(ar).sort()).toEqual(keys(en).sort());
  });
  it("every validation issue code has a message", async () => {
    const codes = ["INVALID_TOTAL_SHARES", "SHARE_UNASSIGNED", "SPLIT_NOT_EXACT", "TURN_DUPLICATE_CYCLE", "CYCLE_WITHOUT_RECIPIENT"];
    for (const c of codes) expect((ar.issues as Record<string, string>)[c]).toBeTruthy();
  });
});
