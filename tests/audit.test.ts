import { describe, expect, it } from "vitest";
import { runAudit } from "@/lib/audit";
import { AUDIT_RULES } from "@/lib/rules";
import {
  SAMPLE_CASES,
  alexMorgan,
  caseyNguyenIncomplete,
  jamieRivera,
  jordanLee,
  samPatelInvalid,
} from "@/data/samples";

function completed(input: unknown) {
  const r = runAudit(input);
  if (r.status !== "completed") throw new Error(`expected completed, got ${JSON.stringify(r)}`);
  return r;
}

describe("sample cases (end-to-end through runAudit)", () => {
  it("Case 1 Alex Morgan: $7,000 wage discrepancy + possible missing 1099-INT", () => {
    const r = completed(alexMorgan);
    expect(r.findings.map((f) => [f.id, f.severity])).toEqual([
      ["income-reconciliation:wages", "high"],
      ["missing-document:interest", "medium"],
    ]);
    const wage = r.findings[0];
    expect(wage.differenceCents).toBe(700_000);
    expect(wage.followUp.question).toContain("$85,000.00");
    expect(wage.followUp.question).toContain("$92,000.00");
    expect(wage.sources).toContainEqual(expect.objectContaining({ documentId: "DOC-AM-W2-01", sourceFile: "alex_morgan_w2_northwind_2025.pdf" }));
    expect(r.findings.every((f) => f.followUp.source === "template" && f.followUp.question.length > 0)).toBe(true);
  });

  it("Case 2 Jamie Rivera: valid intake with no issues", () => {
    const r = completed(jamieRivera);
    expect(r.findings).toEqual([]);
    expect(r.exclusions).toEqual([]);
    expect(r.checks).toHaveLength(AUDIT_RULES.length);
    expect(r.usedDocumentCount).toBe(2);
  });

  it("Case 3 Sam Patel: blocked with specific errors and no fabricated values", () => {
    const r = runAudit(samPatelInvalid);
    expect(r.status).toBe("invalid");
    if (r.status !== "invalid") return;
    expect(r.errors.map((e) => e.path).sort()).toEqual(
      ["client.taxYear", "documents[1].amount", "documents[1].documentId", "questionnaire.reportedWages"].sort(),
    );
  });

  it("Case 4 Jordan Lee: aggregation, explicit exclusions, contractor discrepancy", () => {
    const r = completed(jordanLee);
    expect(r.findings.map((f) => f.id)).toEqual([
      "tax-year-mismatch:DOC-JL-NEC-02",
      "income-reconciliation:contractor",
      "unsupported-document-type:DOC-JL-DIV-01",
    ]);
    expect(r.exclusions.map((e) => [e.documentId, e.reason])).toEqual([
      ["DOC-JL-NEC-02", "tax_year_mismatch"],
      ["DOC-JL-DIV-01", "unsupported_document_type"],
    ]);
    expect(r.documentCount).toBe(5);
    expect(r.usedDocumentCount).toBe(3);
    const contractor = r.findings[1];
    expect(contractor.differenceCents).toBe(-220_000);
    expect(contractor.expected?.amountCents).toBe(980_000);
  });

  it("Case 5 Casey Nguyen: incomplete intake still audits", () => {
    const r = completed(caseyNguyenIncomplete);
    expect(r.client.filingStatus).toBe("not provided");
    expect(r.findings.map((f) => f.id)).toEqual([
      "missing-document:wages",
      "intake-completeness:interest",
      "intake-completeness:contractor",
      "intake-completeness:filing-status",
    ]);
  });

  it("every sample produces the outcome its label promises (valid vs invalid)", () => {
    const statuses = Object.fromEntries(SAMPLE_CASES.map((s) => [s.id, runAudit(s.json).status]));
    expect(statuses).toEqual({
      "alex-morgan": "completed",
      "jamie-rivera": "completed",
      "sam-patel-invalid": "invalid",
      "jordan-lee": "completed",
      "casey-nguyen-incomplete": "completed",
      "malformed-json": "invalid",
    });
  });
});

describe("determinism and immutability", () => {
  it("produces identical findings for identical input", () => {
    const fixed = new Date("2026-01-01T00:00:00Z");
    expect(runAudit(jordanLee, fixed)).toEqual(runAudit(jordanLee, fixed));
  });

  it("freezes findings so later layers cannot mutate amounts or sources", () => {
    const r = completed(alexMorgan);
    const f = r.findings[0];
    expect(Object.isFrozen(f)).toBe(true);
    expect(Object.isFrozen(f.sources[0])).toBe(true);
    expect(() => {
      (f as { differenceCents?: number }).differenceCents = 1;
    }).toThrow();
  });
});

describe("samples/ folder", () => {
  it("contains an up-to-date JSON file for every built-in sample (for upload testing)", async () => {
    const fs = await import("node:fs");
    for (const s of SAMPLE_CASES) {
      expect(fs.readFileSync(`samples/${s.id}.json`, "utf8").trim(), s.id).toBe(s.json.trim());
    }
  });
});
