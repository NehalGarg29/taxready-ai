import { describe, expect, it } from "vitest";
import { formatCents, parseMoney, sumCents, trySumCents } from "@/lib/money";

describe("parseMoney (integer cents, no coercion)", () => {
  it.each([
    ["85000.00", 8_500_000],
    ["85000", 8_500_000],
    ["0.1", 10],
    ["182.37", 18_237],
    ["0", 0],
  ])("parses decimal string %s", (input, cents) => {
    expect(parseMoney(input)).toEqual({ ok: true, cents });
  });

  it("parses whole-dollar JSON integers", () => {
    expect(parseMoney(92000)).toEqual({ ok: true, cents: 9_200_000 });
  });

  it.each(["71,500.00", "$500", "12OO.00", "-5.00", "1.234", "1e5", " 100", "", "abc", "100."])(
    "rejects malformed string %j",
    (input) => {
      const r = parseMoney(input);
      expect(r.ok).toBe(false);
    },
  );

  it("rejects fractional JSON numbers instead of rounding them", () => {
    const r = parseMoney(450.1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/fractional/);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, true, null, {}, []])("rejects %j", (input) => {
    expect(parseMoney(input).ok).toBe(false);
  });

  it("avoids floating-point drift: 0.1 + 0.2 sums to exactly 30 cents", () => {
    const a = parseMoney("0.1");
    const b = parseMoney("0.2");
    if (!a.ok || !b.ok) throw new Error("parse failed");
    expect(sumCents([a.cents, b.cents])).toBe(30);
  });

  it("formats cents without floats", () => {
    expect(formatCents(9_200_000)).toBe("$92,000.00");
    expect(formatCents(7_950_050)).toBe("$79,500.50");
    expect(formatCents(5)).toBe("$0.05");
    expect(formatCents(-700_000)).toBe("-$7,000.00");
  });
});

describe("overflow handling (regression)", () => {
  it("accepts the largest supported single amount exactly", () => {
    expect(parseMoney("999999999999.99")).toEqual({ ok: true, cents: 99_999_999_999_999 });
    expect(parseMoney(999_999_999_999)).toEqual({ ok: true, cents: 99_999_999_999_900 });
  });

  it("rejects amounts above the maximum with a clear message, not a format error", () => {
    const r = parseMoney("1000000000000.00");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/exceeds the maximum supported amount/);
    expect(parseMoney(1_000_000_000_000).ok).toBe(false);
  });

  it("trySumCents reports an unrepresentable total instead of throwing", () => {
    const max = 99_999_999_999_999;
    expect(trySumCents(Array(90).fill(max))).toEqual({ ok: true, cents: 90 * max });
    expect(trySumCents(Array(91).fill(max))).toEqual({ ok: false });
    expect(trySumCents([])).toEqual({ ok: true, cents: 0 });
  });
});
