import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonthsToKey,
  daysInMonth,
  diffDays,
  isLeapYear,
  isValidDate,
  monthRange,
  monthWithDay,
  todayIn,
} from "./dates";

describe("civil dates", () => {
  it("knows leap years", () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(2100)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2027, 2)).toBe(28);
  });

  it("validates dates strictly", () => {
    expect(isValidDate("2026-02-29")).toBe(false);
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("26-1-1")).toBe(false);
  });

  it("clamps month-end days", () => {
    expect(monthWithDay(2026, 1, 1, 31)).toBe("2026-02-28");
    expect(monthWithDay(2028, 1, 1, 31)).toBe("2028-02-29");
    expect(monthWithDay(2026, 1, 3, 31)).toBe("2026-04-30");
    expect(monthWithDay(2026, 11, 2, 15)).toBe("2027-01-15");
  });

  it("adds days across years and leap days", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(diffDays("2027-01-01", "2026-12-31")).toBe(1);
  });

  it("handles month keys", () => {
    expect(addMonthsToKey("2026-12", 1)).toBe("2027-01");
    expect(addMonthsToKey("2026-01", -1)).toBe("2025-12");
    expect(monthRange("2028-02")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
  });

  it("computes today in Cairo regardless of UTC offset", () => {
    // 2026-11-11 23:30 UTC is already 2026-11-12 in Cairo (UTC+2).
    expect(todayIn("Africa/Cairo", new Date("2026-11-11T23:30:00Z"))).toBe("2026-11-12");
    expect(todayIn("UTC", new Date("2026-11-11T23:30:00Z"))).toBe("2026-11-11");
  });
});
