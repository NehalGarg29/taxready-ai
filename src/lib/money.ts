/**
 * Money handling for TaxReady AI.
 *
 * All monetary values are stored and compared as integer cents.
 * Floating-point arithmetic is never used on amounts.
 *
 * Accepted input forms (anything else is rejected, never coerced):
 *   - Decimal string with at most two fractional digits: "85000", "85000.5", "85000.00"
 *   - JSON integer number, interpreted as whole dollars: 85000
 *
 * Rejected: negative values, commas, currency symbols, exponents, whitespace padding,
 * non-integer JSON numbers (e.g. 450.1 — binary floats cannot be trusted to hold cents),
 * and values above MAX_DOLLARS.
 */

export type Cents = number;

/** Upper bound keeps every value well inside Number.MAX_SAFE_INTEGER when expressed in cents. */
export const MAX_DOLLARS = 999_999_999_999; // 12 digits

const DECIMAL_PATTERN = /^(\d{1,12})(?:\.(\d{1,2}))?$/;
const TOO_LARGE_PATTERN = /^\d{13,}(?:\.\d{1,2})?$/;

/** Largest total (in cents) that integer arithmetic can represent exactly. */
export const MAX_TOTAL_CENTS = Number.MAX_SAFE_INTEGER;

export type MoneyParseResult =
  | { ok: true; cents: Cents }
  | { ok: false; error: string };

export function parseMoney(value: unknown): MoneyParseResult {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { ok: false, error: "must be a finite amount" };
    if (!Number.isInteger(value)) {
      return {
        ok: false,
        error: `numeric amount ${value} has a fractional part; send amounts with cents as a decimal string such as "${value}"`,
      };
    }
    if (value < 0) return { ok: false, error: "must not be negative" };
    if (value > MAX_DOLLARS) return { ok: false, error: "exceeds the maximum supported amount" };
    return { ok: true, cents: value * 100 };
  }

  if (typeof value === "string") {
    if (TOO_LARGE_PATTERN.test(value)) {
      return { ok: false, error: `"${value}" exceeds the maximum supported amount of $999,999,999,999.99` };
    }
    const match = DECIMAL_PATTERN.exec(value);
    if (!match) {
      return {
        ok: false,
        error: `"${value}" is not a valid amount; use digits with up to two decimals, e.g. "85000.00" (no commas, symbols, or signs)`,
      };
    }
    const dollars = Number.parseInt(match[1], 10);
    const fraction = match[2] ?? "";
    const centsPart = fraction.length === 0 ? 0 : Number.parseInt(fraction.padEnd(2, "0"), 10);
    return { ok: true, cents: dollars * 100 + centsPart };
  }

  return { ok: false, error: "must be a decimal string (e.g. \"85000.00\") or a whole-dollar integer" };
}

/**
 * Sums cents, reporting (not throwing) when the total cannot be represented exactly.
 * Each partial sum is checked, so precision is never silently lost along the way.
 */
export function trySumCents(values: readonly Cents[]): { ok: true; cents: Cents } | { ok: false } {
  let total = 0;
  for (const v of values) {
    total += v;
    if (!Number.isSafeInteger(total) || total > MAX_TOTAL_CENTS) return { ok: false };
  }
  return { ok: true, cents: total };
}

/**
 * Internal helper for totals that have already been checked with trySumCents.
 * Throws only if that invariant is broken (a programming error, not bad input).
 */
export function sumCents(values: readonly Cents[]): Cents {
  const r = trySumCents(values);
  if (!r.ok) throw new Error("Invariant violated: monetary total exceeded safe integer range");
  return r.cents;
}

/** Formats integer cents as "$92,000.00" without converting through floating point. */
export function formatCents(cents: Cents): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.trunc(abs / 100);
  const rem = abs % 100;
  const dollarsStr = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}$${dollarsStr}.${rem.toString().padStart(2, "0")}`;
}
