import { describe, expect, it } from "vitest";
import {
  currentCycleNumber,
  cyclesElapsed,
  deriveContributionStatus,
  derivePayoutStatus,
  evaluateLifecycle,
} from "./status";
import {
  nextPayout,
  planningNet,
  projection,
  remainingInstallments,
  summarizeMonth,
  upcomingContributions,
  type MemberObligation,
  type MemberPayout,
} from "./summary";
import { generateSchedule, sequentialTurns } from "./schedule";
import { simulateJoin, SimulationError } from "./simulator";
import type { Gam3yaConfig, ShareHolding } from "./types";

describe("contribution status (scenario 10: delayed contribution)", () => {
  it("upcoming → due → overdue by dates", () => {
    expect(deriveContributionStatus("2026-03-05", null, "2026-03-04", 3)).toBe("upcoming");
    expect(deriveContributionStatus("2026-03-05", null, "2026-03-05", 3)).toBe("due");
    expect(deriveContributionStatus("2026-03-05", null, "2026-03-08", 3)).toBe("due");
    expect(deriveContributionStatus("2026-03-05", null, "2026-03-09", 3)).toBe("overdue");
  });
  it("recorded statuses win over dates", () => {
    expect(deriveContributionStatus("2026-03-05", "recorded_paid", "2026-05-01", 3)).toBe("recorded_paid");
    expect(deriveContributionStatus("2026-03-05", "waived", "2026-05-01", 3)).toBe("waived");
    expect(deriveContributionStatus("2026-03-05", "reported_paid", "2026-05-01", 3)).toBe("reported_paid");
  });
});

describe("payout status (scenario 11: delayed payout)", () => {
  it("scheduled → due → delayed without changing the scheduled date", () => {
    expect(derivePayoutStatus("2026-03-05", null, "2026-03-01", 2)).toBe("scheduled");
    expect(derivePayoutStatus("2026-03-05", null, "2026-03-07", 2)).toBe("due");
    expect(derivePayoutStatus("2026-03-05", null, "2026-03-08", 2)).toBe("delayed");
    expect(derivePayoutStatus("2026-03-05", "delayed", "2026-03-01", 2)).toBe("delayed");
    expect(derivePayoutStatus("2026-03-05", "reported_completed", "2026-03-20", 2)).toBe("reported_completed");
    expect(derivePayoutStatus("2026-03-05", "confirmed_completed", "2026-03-20", 2)).toBe("confirmed_completed");
  });
});

describe("lifecycle (scenario 12: completion and archiving)", () => {
  const base = { current: "active" as const, endDate: "2026-12-05" };
  it("completes only when every record is settled", () => {
    expect(
      evaluateLifecycle({ ...base, today: "2026-12-10", contributionRecords: ["recorded_paid", "waived"], payoutRecords: ["confirmed_completed"] }),
    ).toBe("completed");
  });
  it("needs closure when the end date passed with open items — never auto-archived", () => {
    expect(
      evaluateLifecycle({ ...base, today: "2026-12-10", contributionRecords: ["recorded_paid", null], payoutRecords: ["confirmed_completed"] }),
    ).toBe("needs_closure");
    expect(
      evaluateLifecycle({ ...base, today: "2026-12-10", contributionRecords: ["recorded_paid"], payoutRecords: ["reported_completed"] }),
    ).toBe("needs_closure");
  });
  it("stays active before the end date and leaves terminal states alone", () => {
    expect(evaluateLifecycle({ ...base, today: "2026-06-01", contributionRecords: [null], payoutRecords: [null] })).toBe("active");
    expect(evaluateLifecycle({ ...base, current: "draft", today: "2027-01-01", contributionRecords: [], payoutRecords: [] })).toBe("draft");
  });
  it("tracks elapsed and current cycle", () => {
    const due = ["2026-01-05", "2026-02-05", "2026-03-05"];
    expect(cyclesElapsed(due, "2026-02-10")).toBe(2);
    expect(currentCycleNumber(due, "2025-12-01")).toBe(1);
    expect(currentCycleNumber(due, "2027-01-01")).toBe(3);
  });
});

// Scenarios 3–7: one member across multiple Gam3yas.
const cfg = (over: Partial<Gam3yaConfig>): Gam3yaConfig => ({
  totalShares: 4,
  contributionPerShare: 100_000,
  frequency: "monthly",
  startDate: "2026-01-01",
  dueDay: 1,
  payoutOffsetDays: 0,
  graceDays: 3,
  ...over,
});
const holdingsWithMe = (n: number, myShares: number[], halfShare?: number): ShareHolding[] => {
  const out: ShareHolding[] = [];
  for (let s = 1; s <= n; s++) {
    if (s === halfShare) {
      out.push({ shareNumber: s, memberId: "me", portionBp: 5_000 }, { shareNumber: s, memberId: "other-half", portionBp: 5_000 });
    } else out.push({ shareNumber: s, memberId: myShares.includes(s) ? "me" : `o${s}`, portionBp: 10_000 });
  }
  return out;
};

function mine(gam3yaId: string, c: Gam3yaConfig, h: ShareHolding[]) {
  const s = generateSchedule(c, h, sequentialTurns(c.totalShares));
  const obligations: MemberObligation[] = s.obligations
    .filter((o) => o.memberId === "me")
    .map((o) => ({ gam3yaId, cycleNumber: o.cycleNumber, dueDate: o.dueDate, amount: o.amount, record: null, graceDays: c.graceDays }));
  const payouts: MemberPayout[] = s.payouts.flatMap((p) =>
    p.recipients
      .filter((r) => r.memberId === "me")
      .map((r) => ({ gam3yaId, cycleNumber: p.cycleNumber, payoutDate: p.payoutDate, amount: r.amount, record: null, graceDays: c.graceDays })),
  );
  return { obligations, payouts };
}

describe("member across multiple Gam3yas (scenarios 3–7)", () => {
  // A: 4 × 1,000 from Jan, I hold share 2. B: 6 × 2,500 from Mar, I hold shares 1 & 5. C: 4 × 500 from Jan, I hold half of share 3.
  const a = mine("A", cfg({}), holdingsWithMe(4, [2]));
  const b = mine("B", cfg({ totalShares: 6, contributionPerShare: 250_000, startDate: "2026-03-01" }), holdingsWithMe(6, [1, 5]));
  const c = mine("C", cfg({ contributionPerShare: 50_000 }), holdingsWithMe(4, [], 3));
  const obligations = [...a.obligations, ...b.obligations, ...c.obligations];
  const payouts = [...a.payouts, ...b.payouts, ...c.payouts];

  it("monthly contribution totals combine all Gam3yas", () => {
    expect(summarizeMonth("2026-01", obligations, payouts, "2026-01-01").scheduledContributions).toBe(100_000 + 25_000);
    expect(summarizeMonth("2026-03", obligations, payouts, "2026-03-01").scheduledContributions).toBe(100_000 + 500_000 + 25_000);
    expect(summarizeMonth("2026-05", obligations, payouts, "2026-05-01").scheduledContributions).toBe(500_000);
  });

  it("payout amounts per month differ across Gam3yas", () => {
    expect(summarizeMonth("2026-02", obligations, payouts, "2026-02-01").expectedPayouts).toBe(400_000); // A share 2
    expect(summarizeMonth("2026-03", obligations, payouts, "2026-03-01").expectedPayouts).toBe(1_500_000 + 100_000); // B share 1 + C half of 200k
    expect(summarizeMonth("2026-07", obligations, payouts, "2026-07-01").expectedPayouts).toBe(1_500_000); // B share 5
  });

  it("does not net contributions against payouts (planning estimate is separate)", () => {
    const m = summarizeMonth("2026-03", obligations, payouts, "2026-03-01");
    expect(m.scheduledContributions).toBe(625_000);
    expect(m.expectedPayouts).toBe(1_600_000);
    expect(planningNet(m)).toBe(975_000);
  });

  it("remaining installments respect recorded statuses", () => {
    const recorded = obligations.map((o) => (o.gam3yaId === "A" && o.cycleNumber <= 2 ? { ...o, record: "recorded_paid" as const } : o));
    const withWaive = recorded.map((o) => (o.gam3yaId === "C" && o.cycleNumber === 1 ? { ...o, record: "waived" as const } : o));
    const reported = withWaive.map((o) => (o.gam3yaId === "B" && o.cycleNumber === 1 ? { ...o, record: "reported_paid" as const } : o));
    const r = remainingInstallments(reported);
    expect(r.count).toBe(obligations.length - 3);
    // reported_paid is not settled — still counted.
    expect(r.amount).toBe(obligations.reduce((x, o) => x + o.amount, 0) - 200_000 - 25_000);
  });

  it("month summary splits paid / outstanding / overdue", () => {
    const recorded = obligations.map((o) => (o.gam3yaId === "A" && o.cycleNumber === 3 ? { ...o, record: "recorded_paid" as const } : o));
    const m = summarizeMonth("2026-03", recorded, payouts, "2026-03-20");
    expect(m.recordedPaidContributions).toBe(100_000);
    expect(m.outstandingContributions).toBe(525_000);
    expect(m.overdueContributions).toBe(525_000);
  });

  it("finds the next payout and upcoming deadlines", () => {
    expect(nextPayout(payouts, "2026-02-02")).toMatchObject({ gam3yaId: "B", payoutDate: "2026-03-01" });
    const confirmed = payouts.map((p) => (p.gam3yaId === "B" && p.cycleNumber === 1 ? { ...p, record: "confirmed_completed" as const } : p));
    expect(nextPayout(confirmed, "2026-02-02")).toMatchObject({ gam3yaId: "C", payoutDate: "2026-03-01" });
    expect(nextPayout(payouts, "2030-01-01")).toBeNull();
    const up = upcomingContributions(obligations, "2026-01-02", 3);
    expect(up).toHaveLength(3);
    expect(up[0]!.status).toBe("due");
  });

  it("12-month projection", () => {
    const p = projection("2026-01", 12, obligations, payouts);
    expect(p).toHaveLength(12);
    expect(p[0]).toEqual({ month: "2026-01", contributions: 125_000, payouts: 0 });
    expect(p[11]).toEqual({ month: "2026-12", contributions: 0, payouts: 0 });
  });
});

describe("what-if simulator", () => {
  const existing = { obligations: [{ dueDate: "2026-01-05", amount: 100_000 }], payouts: [] };
  it("projects a new commitment without touching inputs", () => {
    const r = simulateJoin(existing, { contributionPerShare: 200_000, holdingBp: 10_000, durationCycles: 10, startDate: "2026-01-01", dueDay: 10, turnCycles: [3] }, "2026-01", 12);
    expect(r.newMonthlyCommitment).toBe(200_000);
    expect(r.after[0]!.contributions).toBe(300_000);
    expect(r.before[0]!.contributions).toBe(100_000);
    expect(r.payoutMonths).toEqual([{ month: "2026-03", amount: 2_000_000 }]);
    expect(r.highestCommitment).toEqual({ month: "2026-01", amount: 300_000 });
    expect(existing.obligations).toHaveLength(1);
  });
  it("handles half shares and multiple shares", () => {
    const half = simulateJoin(existing, { contributionPerShare: 200_000, holdingBp: 5_000, durationCycles: 10, startDate: "2026-01-01", dueDay: 10, turnCycles: [2] }, "2026-01");
    expect(half.newMonthlyCommitment).toBe(100_000);
    expect(half.payoutMonths[0]!.amount).toBe(1_000_000);
    const two = simulateJoin(existing, { contributionPerShare: 200_000, holdingBp: 20_000, durationCycles: 10, startDate: "2026-01-01", dueDay: 10, turnCycles: [1, 2] }, "2026-01");
    expect(two.newMonthlyCommitment).toBe(400_000);
    expect(two.payoutMonths).toHaveLength(2);
  });
  it("rejects invalid input", () => {
    const run = (over: object) => () =>
      simulateJoin(existing, { contributionPerShare: 100_000, holdingBp: 10_000, durationCycles: 10, startDate: "2026-01-01", dueDay: 1, turnCycles: [], ...over }, "2026-01");
    expect(run({ contributionPerShare: 0 })).toThrow(SimulationError);
    expect(run({ durationCycles: 1 })).toThrow(SimulationError);
    expect(run({ holdingBp: 15_000 })).toThrow(SimulationError);
    expect(run({ turnCycles: [11] })).toThrow(SimulationError);
    expect(run({ turnCycles: [1, 2] })).toThrow(SimulationError);
  });
});
