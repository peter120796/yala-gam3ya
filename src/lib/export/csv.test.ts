import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csv", () => {
  it("neutralises formula injection", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+20100")).toBe("'+20100");
    expect(csvCell("@cmd")).toBe("'@cmd");
  });
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("x\ny")).toBe('"x\ny"');
  });
  it("adds a BOM for Arabic in Excel", () => {
    expect(toCsv(["الاسم"], [["أحمد"]]).startsWith("﻿")).toBe(true);
  });
});
