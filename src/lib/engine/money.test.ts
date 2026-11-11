import { describe, expect, it } from "vitest";
import {
  add,
  formatMoney,
  fromPounds,
  isExactPortion,
  MoneyError,
  multiply,
  normalizeDigits,
  parseMoneyInput,
  portionOf,
  sum,
  toDecimalString,
} from "./money";

describe("money", () => {
  it("adds integer piasters exactly (no float drift)", () => {
    // 0.10 + 0.20 EGP in piasters
    expect(add(10, 20)).toBe(30);
    expect(sum(Array.from({ length: 1000 }, () => 1))).toBe(1000);
  });

  it("rejects non-integer amounts", () => {
    expect(() => add(0.1, 0.2)).toThrow(MoneyError);
    expect(() => multiply(100, 1.5)).toThrow(MoneyError);
  });

  it("rejects overflow beyond safe integers", () => {
    expect(() => add(Number.MAX_SAFE_INTEGER, 1)).toThrow(MoneyError);
  });

  it("splits halves exactly and refuses inexact splits", () => {
    expect(portionOf(100_000, 5_000)).toBe(50_000);
    expect(portionOf(100_000, 10_000)).toBe(100_000);
    expect(isExactPortion(101, 5_000)).toBe(false);
    expect(() => portionOf(101, 5_000)).toThrow(MoneyError);
    expect(() => portionOf(100, 0)).toThrow(MoneyError);
  });

  it("parses user input including Arabic digits", () => {
    expect(parseMoneyInput("1,000")).toBe(100_000);
    expect(parseMoneyInput("1000.5")).toBe(100_050);
    expect(parseMoneyInput("١٠٠٠٫٢٥")).toBe(100_025);
    expect(parseMoneyInput("۲۵۰۰")).toBe(250_000);
    expect(parseMoneyInput("12.345")).toBeNull();
    expect(parseMoneyInput("-5")).toBeNull();
    expect(parseMoneyInput("abc")).toBeNull();
    expect(normalizeDigits("١٢ ٣")).toBe("123");
  });

  it("formats exact decimal strings", () => {
    expect(toDecimalString(123_456)).toBe("1234.56");
    expect(toDecimalString(5)).toBe("0.05");
    expect(toDecimalString(-150)).toBe("-1.50");
    expect(fromPounds(1000)).toBe(100_000);
  });

  it("formats currency per locale without changing the amount", () => {
    const en = formatMoney(850_000, "en");
    const ar = formatMoney(850_000, "ar");
    expect(en).toContain("8,500");
    expect(en).not.toContain(".00");
    // Arabic uses Arabic-Indic digits; normalising gives back the same number.
    expect(normalizeDigits(ar).replace(/\D/g, "")).toBe("8500");
    expect(formatMoney(100_050, "en")).toContain("1,000.50");
  });
});
