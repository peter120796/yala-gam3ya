import { describe, expect, it } from "vitest";
import { generateDueDates, generateSchedule, ScheduleValidationError, sequentialTurns } from "./schedule";
import { validateAll } from "./validate";
import type { Gam3yaConfig, ShareHolding } from "./types";

const base: Gam3yaConfig = {
  totalShares: 12,
  contributionPerShare: 100_000, // EGP 1,000
  frequency: "monthly",
  startDate: "2026-01-01",
  dueDay: 5,
  payoutOffsetDays: 0,
  graceDays: 3,
};

/** Share n held wholly by member m{n}. */
const onePerMember = (n: number): ShareHolding[] =>
  Array.from({ length: n }, (_, i) => ({ shareNumber: i + 1, memberId: `m${String(i + 1).padStart(2, "0")}`, portionBp: 10_000 }));

describe("spec example: 12 shares × EGP 1,000 × 12 months", () => {
  const s = generateSchedule(base, onePerMember(12), sequentialTurns(12));

  it("pays out EGP 12,000 every cycle", () => {
    expect(s.cycles).toHaveLength(12);
    expect(s.cycles.every((c) => c.payoutAmount === 1_200_000)).toBe(true);
    expect(s.totals.payoutPerCycle).toBe(1_200_000);
  });

  it("each share contributes EGP 12,000 over the full cycle", () => {
    expect(s.totals.contributionPerShareTotal).toBe(1_200_000);
    const m1 = s.obligations.filter((o) => o.memberId === "m01");
    expect(m1).toHaveLength(12);
    expect(m1.reduce((a, o) => a + o.amount, 0)).toBe(1_200_000);
  });

  it("money in equals money out", () => {
    const totalIn = s.obligations.reduce((a, o) => a + o.amount, 0);
    const totalOut = s.payouts.reduce((a, p) => a + p.recipients.reduce((b, r) => b + r.amount, 0), 0);
    expect(totalIn).toBe(totalOut);
    expect(s.totals.grandTotal).toBe(14_400_000);
  });

  it("due on the 5th of each month, ending in December", () => {
    expect(s.cycles[0]!.dueDate).toBe("2026-01-05");
    expect(s.cycles[11]!.dueDate).toBe("2026-12-05");
    expect(s.totals.endDate).toBe("2026-12-05");
  });
});

describe("scenario 1: one member with one share", () => {
  it("has 12 obligations of EGP 1,000 and one payout of EGP 12,000", () => {
    const s = generateSchedule(base, onePerMember(12), sequentialTurns(12));
    const mine = s.obligations.filter((o) => o.memberId === "m03");
    expect(mine.map((o) => o.amount)).toEqual(Array(12).fill(100_000));
    const payouts = s.payouts.filter((p) => p.recipients.some((r) => r.memberId === "m03"));
    expect(payouts).toHaveLength(1);
    expect(payouts[0]!.cycleNumber).toBe(3);
    expect(payouts[0]!.recipients[0]!.amount).toBe(1_200_000);
  });
});

describe("scenario 2: one member with multiple shares", () => {
  it("pays EGP 2,000/month and gets two payout turns", () => {
    const holdings = onePerMember(12).map((h) => (h.shareNumber === 7 ? { ...h, memberId: "m01" } : h));
    const turns = sequentialTurns(12);
    const s = generateSchedule(base, holdings, turns);
    const m1 = s.obligations.filter((o) => o.memberId === "m01");
    expect(m1).toHaveLength(12);
    expect(m1.every((o) => o.amount === 200_000)).toBe(true);
    expect(m1[0]!.shares.map((x) => x.shareNumber)).toEqual([1, 7]);
    const turnsOfM1 = s.payouts.filter((p) => p.recipients.some((r) => r.memberId === "m01"));
    expect(turnsOfM1.map((p) => p.cycleNumber)).toEqual([1, 7]);
    expect(turnsOfM1.every((p) => p.recipients[0]!.amount === 1_200_000)).toBe(true);
  });
});

describe("split shares (نص حصة)", () => {
  const holdings: ShareHolding[] = [
    ...onePerMember(12).filter((h) => h.shareNumber !== 4),
    { shareNumber: 4, memberId: "ahmed", portionBp: 5_000 },
    { shareNumber: 4, memberId: "sara", portionBp: 5_000 },
  ];

  it("each half-holder pays half and receives half of the payout", () => {
    const s = generateSchedule(base, holdings, sequentialTurns(12));
    const ahmed = s.obligations.filter((o) => o.memberId === "ahmed");
    expect(ahmed.every((o) => o.amount === 50_000)).toBe(true);
    const payout = s.payouts.find((p) => p.shareNumber === 4)!;
    expect(payout.recipients).toEqual([
      { memberId: "ahmed", portionBp: 5_000, amount: 600_000 },
      { memberId: "sara", portionBp: 5_000, amount: 600_000 },
    ]);
  });

  it("member can hold a whole share plus a half share", () => {
    const h = holdings.map((x) => (x.memberId === "sara" ? { ...x, memberId: "m01" } : x));
    const s = generateSchedule(base, h, sequentialTurns(12));
    expect(s.obligations.find((o) => o.memberId === "m01")!.amount).toBe(150_000);
  });

  it("rejects portions that do not add up to a whole share", () => {
    const bad = holdings.filter((h) => h.memberId !== "sara");
    expect(validateAll(base, bad, sequentialTurns(12))).toContainEqual({
      code: "SHARE_PORTIONS_NOT_FULL",
      shareNumber: 4,
      totalBp: 5_000,
    });
  });

  it("rejects splits that are not an exact number of piasters", () => {
    const odd = { ...base, contributionPerShare: 100_001 };
    const codes = validateAll(odd, holdings, sequentialTurns(12)).map((i) => i.code);
    expect(codes).toContain("SPLIT_NOT_EXACT");
  });

  it("rejects portions other than whole/half and more than two holders", () => {
    const thirds: ShareHolding[] = [
      ...onePerMember(12).filter((h) => h.shareNumber !== 4),
      { shareNumber: 4, memberId: "a", portionBp: 3_334 },
      { shareNumber: 4, memberId: "b", portionBp: 3_333 },
      { shareNumber: 4, memberId: "c", portionBp: 3_333 },
    ];
    const codes = validateAll(base, thirds, sequentialTurns(12)).map((i) => i.code);
    expect(codes).toContain("PORTION_NOT_ALLOWED");
    expect(codes).toContain("SHARE_TOO_MANY_HOLDERS");
  });

  it("rejects the same member holding both halves of one share", () => {
    const dup: ShareHolding[] = [
      ...onePerMember(12).filter((h) => h.shareNumber !== 4),
      { shareNumber: 4, memberId: "ahmed", portionBp: 5_000 },
      { shareNumber: 4, memberId: "ahmed", portionBp: 5_000 },
    ];
    expect(validateAll(base, dup, sequentialTurns(12)).map((i) => i.code)).toContain("DUPLICATE_HOLDER");
  });
});

describe("payout order validation", () => {
  it("rejects duplicate cycles, duplicate shares and missing turns", () => {
    const turns = sequentialTurns(12).map((t) => (t.shareNumber === 2 ? { ...t, cycleNumber: 1 } : t));
    const codes = validateAll(base, onePerMember(12), turns).map((i) => i.code);
    expect(codes).toContain("TURN_DUPLICATE_CYCLE");
    expect(codes).toContain("CYCLE_WITHOUT_RECIPIENT");

    const missing = sequentialTurns(12).slice(0, 11);
    const codes2 = validateAll(base, onePerMember(12), missing).map((i) => i.code);
    expect(codes2).toContain("TURN_MISSING_FOR_SHARE");

    const dupShare = [...sequentialTurns(11), { shareNumber: 1, cycleNumber: 12 }];
    expect(validateAll(base, onePerMember(12), dupShare).map((i) => i.code)).toContain("TURN_DUPLICATE_SHARE");
  });

  it("rejects unassigned shares and out-of-range shares", () => {
    const holdings = [...onePerMember(11), { shareNumber: 13, memberId: "x", portionBp: 10_000 }];
    const codes = validateAll(base, holdings, sequentialTurns(12)).map((i) => i.code);
    expect(codes).toContain("SHARE_UNASSIGNED");
    expect(codes).toContain("SHARE_OUT_OF_RANGE");
  });

  it("supports a custom (non-sequential) payout order", () => {
    const turns = sequentialTurns(12).map((t) => ({ ...t, cycleNumber: 13 - t.shareNumber }));
    const s = generateSchedule(base, onePerMember(12), turns);
    expect(s.cycles[0]!.recipientShare).toBe(12);
    expect(s.cycles[11]!.recipientShare).toBe(1);
  });

  it("throws a typed error listing issues", () => {
    try {
      generateSchedule(base, [], sequentialTurns(12));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ScheduleValidationError);
      expect((e as ScheduleValidationError).issues.length).toBeGreaterThan(0);
    }
  });
});

describe("config validation", () => {
  it("rejects bad values", () => {
    const codes = (c: Partial<Gam3yaConfig>) => validateAll({ ...base, ...c }, onePerMember(12), sequentialTurns(12)).map((i) => i.code);
    expect(codes({ totalShares: 1 })).toContain("INVALID_TOTAL_SHARES");
    expect(codes({ contributionPerShare: 0 })).toContain("INVALID_CONTRIBUTION");
    expect(codes({ contributionPerShare: 10.5 })).toContain("INVALID_CONTRIBUTION");
    expect(codes({ dueDay: 32 })).toContain("INVALID_DUE_DAY");
    expect(codes({ dueDay: null })).toContain("INVALID_DUE_DAY");
    expect(codes({ startDate: "2026-02-30" })).toContain("INVALID_START_DATE");
    expect(codes({ payoutOffsetDays: 40 })).toContain("INVALID_PAYOUT_OFFSET");
    expect(codes({ graceDays: -1 })).toContain("INVALID_GRACE_DAYS");
    expect(codes({ frequency: "weekly" })).toContain("DUE_DAY_NOT_ALLOWED_FOR_FREQUENCY");
  });
});

describe("scenario 8 & 9: month-end and leap years", () => {
  it("due day 31 clamps per month and recovers after February", () => {
    const dates = generateDueDates({ frequency: "monthly", startDate: "2026-01-01", dueDay: 31, totalShares: 5 });
    expect(dates).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
  });

  it("leap year February 29", () => {
    const dates = generateDueDates({ frequency: "monthly", startDate: "2027-12-15", dueDay: 30, totalShares: 4 });
    expect(dates).toEqual(["2027-12-30", "2028-01-30", "2028-02-29", "2028-03-30"]);
  });

  it("first cycle moves to next month when start date is after the due day", () => {
    const dates = generateDueDates({ frequency: "monthly", startDate: "2026-01-20", dueDay: 5, totalShares: 2 });
    expect(dates).toEqual(["2026-02-05", "2026-03-05"]);
  });

  it("start date equal to due day uses that day", () => {
    const dates = generateDueDates({ frequency: "monthly", startDate: "2026-03-10", dueDay: 10, totalShares: 1 });
    expect(dates).toEqual(["2026-03-10"]);
  });

  it("crosses year boundaries", () => {
    const dates = generateDueDates({ frequency: "monthly", startDate: "2026-11-01", dueDay: 1, totalShares: 3 });
    expect(dates).toEqual(["2026-11-01", "2026-12-01", "2027-01-01"]);
  });

  it("weekly and biweekly frequencies", () => {
    expect(generateDueDates({ frequency: "weekly", startDate: "2028-02-22", dueDay: null, totalShares: 3 })).toEqual([
      "2028-02-22",
      "2028-02-29",
      "2028-03-07",
    ]);
    expect(generateDueDates({ frequency: "biweekly", startDate: "2026-12-25", dueDay: null, totalShares: 2 })).toEqual([
      "2026-12-25",
      "2027-01-08",
    ]);
  });

  it("payout offset shifts payout dates, not due dates", () => {
    const s = generateSchedule({ ...base, payoutOffsetDays: 3, dueDay: 31 }, onePerMember(12), sequentialTurns(12));
    expect(s.cycles[1]!.dueDate).toBe("2026-02-28");
    expect(s.cycles[1]!.payoutDate).toBe("2026-03-03");
  });
});

describe("determinism", () => {
  it("same inputs in any order produce identical schedules", () => {
    const h = onePerMember(12);
    const a = generateSchedule(base, h, sequentialTurns(12));
    const b = generateSchedule(base, [...h].reverse(), [...sequentialTurns(12)].reverse());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
