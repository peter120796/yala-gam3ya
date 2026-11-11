/**
 * Civil-date helpers. Schedules are expressed as calendar dates ("YYYY-MM-DD")
 * in the Gam3ya's timezone (default Africa/Cairo) — never as instants — so DST
 * and UTC offsets can never shift a due date to the wrong day.
 */

export type CivilDate = string; // YYYY-MM-DD

export const DEFAULT_TIMEZONE = "Africa/Cairo";

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface Ymd {
  y: number;
  m: number; // 1..12
  d: number; // 1..31
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]!;
}

export function parseDate(date: CivilDate): Ymd {
  const match = RE.exec(date);
  if (!match) throw new RangeError(`Invalid civil date "${date}"`);
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) {
    throw new RangeError(`Invalid civil date "${date}"`);
  }
  return { y, m, d };
}

export function isValidDate(date: string): boolean {
  try {
    parseDate(date);
    return true;
  } catch {
    return false;
  }
}

export function formatYmd({ y, m, d }: Ymd): CivilDate {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Days since 1970-01-01 for a civil date (proleptic Gregorian). */
export function toDayNumber(date: CivilDate): number {
  const { y, m, d } = parseDate(date);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function fromDayNumber(n: number): CivilDate {
  const dt = new Date(n * 86_400_000);
  return formatYmd({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() });
}

export function addDays(date: CivilDate, days: number): CivilDate {
  return fromDayNumber(toDayNumber(date) + days);
}

export function diffDays(later: CivilDate, earlier: CivilDate): number {
  return toDayNumber(later) - toDayNumber(earlier);
}

export function compareDates(a: CivilDate, b: CivilDate): number {
  return a < b ? -1 : a > b ? 1 : 0; // ISO strings sort lexicographically
}

/** Month offset from a (y, m), returning a clamped day-of-month date. */
export function monthWithDay(y: number, m: number, monthOffset: number, day: number): CivilDate {
  const index = y * 12 + (m - 1) + monthOffset;
  const ny = Math.floor(index / 12);
  const nm = (index % 12) + 1;
  return formatYmd({ y: ny, m: nm, d: Math.min(day, daysInMonth(ny, nm)) });
}

/** "YYYY-MM" key for grouping. */
export function monthKey(date: CivilDate): string {
  return date.slice(0, 7);
}

export function addMonthsToKey(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number) as [number, number];
  return monthWithDay(y, m, n, 1).slice(0, 7);
}

export function monthRange(key: string): { start: CivilDate; end: CivilDate } {
  const [y, m] = key.split("-").map(Number) as [number, number];
  return { start: formatYmd({ y, m, d: 1 }), end: formatYmd({ y, m, d: daysInMonth(y, m) }) };
}

/** Today's civil date in the given IANA timezone. */
export function todayIn(timeZone: string = DEFAULT_TIMEZONE, now: Date = new Date()): CivilDate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
