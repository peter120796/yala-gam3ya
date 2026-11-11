/**
 * Money helpers.
 *
 * All amounts are integer **piasters** (1 EGP = 100 piasters) held in JS
 * numbers that are always safe integers (|n| < 2^53). Every arithmetic helper
 * asserts that invariant, so a non-integer or overflowing amount throws instead
 * of silently drifting. No floating-point division is ever used for totals.
 */

export type Piasters = number;

export const PIASTERS_PER_POUND = 100;
/** Basis points: 10_000 bp = one whole share. */
export const FULL_SHARE_BP = 10_000;
export const HALF_SHARE_BP = 5_000;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

export function assertPiasters(value: number, label = "amount"): Piasters {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} must be a safe integer number of piasters, got ${value}`);
  }
  return value;
}

export function add(...values: Piasters[]): Piasters {
  let total = 0;
  for (const v of values) {
    assertPiasters(v);
    total += v;
    assertPiasters(total, "sum");
  }
  return total;
}

export function sum(values: readonly Piasters[]): Piasters {
  return add(...values);
}

export function multiply(amount: Piasters, factor: number): Piasters {
  assertPiasters(amount);
  if (!Number.isSafeInteger(factor)) throw new MoneyError(`factor must be an integer, got ${factor}`);
  return assertPiasters(amount * factor, "product");
}

/**
 * Exact share of an amount for a holder owning `bp` basis points of a share.
 * Throws if the result is not a whole number of piasters — callers validate
 * this up front (see validateConfig) so it never happens at runtime.
 */
export function portionOf(amount: Piasters, bp: number): Piasters {
  assertPiasters(amount);
  if (!Number.isSafeInteger(bp) || bp <= 0 || bp > FULL_SHARE_BP) {
    throw new MoneyError(`portion must be 1..${FULL_SHARE_BP} bp, got ${bp}`);
  }
  const numerator = amount * bp;
  assertPiasters(numerator, "portion numerator");
  if (numerator % FULL_SHARE_BP !== 0) {
    throw new MoneyError(`${amount} piasters cannot be split exactly at ${bp} bp`);
  }
  return numerator / FULL_SHARE_BP;
}

export function isExactPortion(amount: Piasters, bp: number): boolean {
  return Number.isSafeInteger(amount * bp) && (amount * bp) % FULL_SHARE_BP === 0;
}

export function fromPounds(pounds: number): Piasters {
  if (!Number.isSafeInteger(pounds)) throw new MoneyError("fromPounds expects whole pounds");
  return multiply(pounds, PIASTERS_PER_POUND);
}

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EASTERN_ARABIC_INDIC = "۰۱۲۳۴۵۶۷۸۹";

/** Normalises Arabic-Indic digits and separators to ASCII. */
export function normalizeDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(EASTERN_ARABIC_INDIC.indexOf(d)))
    .replace(/٫/g, ".") // Arabic decimal separator
    .replace(/[٬,\s]/g, ""); // Arabic thousands separator, commas, spaces
}

/**
 * Parses user input like "1,000", "1000.5", "١٠٠٠٫٥٠" into piasters using
 * string arithmetic only. Returns null for anything that is not a valid,
 * non-negative amount with at most 2 decimals.
 */
export function parseMoneyInput(raw: string): Piasters | null {
  const s = normalizeDigits(raw.trim());
  const m = /^(\d{1,13})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const whole = Number(m[1]);
  const frac = Number((m[2] ?? "").padEnd(2, "0"));
  const value = whole * PIASTERS_PER_POUND + frac;
  return Number.isSafeInteger(value) ? value : null;
}

/** Exact decimal string, e.g. 123456 → "1234.56". */
export function toDecimalString(amount: Piasters): string {
  assertPiasters(amount);
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const whole = Math.trunc(abs / PIASTERS_PER_POUND); // integer division of a safe integer is exact
  const frac = abs % PIASTERS_PER_POUND;
  return `${negative ? "-" : ""}${whole}.${String(frac).padStart(2, "0")}`;
}

/**
 * Locale-aware currency formatting. Intl.NumberFormat accepts exact decimal
 * strings, so no float conversion happens. Whole-pound amounts drop decimals.
 */
export function formatMoney(
  amount: Piasters,
  locale: string,
  opts: { currency?: string; hideDecimalsWhenWhole?: boolean } = {},
): string {
  const { currency = "EGP", hideDecimalsWhenWhole = true } = opts;
  const whole = amount % PIASTERS_PER_POUND === 0;
  const fractionDigits = whole && hideDecimalsWhenWhole ? 0 : 2;
  const nf = new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-EG", {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  // `format` accepts a decimal string (Intl.NumberFormat v3) — exact, no float.
  return nf.format(toDecimalString(amount) as unknown as number);
}
