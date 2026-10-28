import { describe, expect, it } from "vitest";
import { runAudit } from "@/lib/audit";
import { basePackage } from "./helpers";

function expectInvalid(input: unknown) {
  const r = runAudit(input);
  expect(r.status).toBe("invalid");
  if (r.status !== "invalid") throw new Error("expected invalid");
  // An invalid result never carries findings or totals.
  expect(r).not.toHaveProperty("findings");
  return r.errors;
}

describe("blocking validation (input cannot be safely interpreted)", () => {
  it("rejects malformed JSON text", () => {
    const errors = expectInvalid('{"client": {');
    expect(errors[0].message).toMatch(/Malformed JSON/);
  });

  it("rejects empty input and non-object JSON", () => {
    expect(expectInvalid("   ")[0].message).toMatch(/empty/);
    expect(expectInvalid("[1,2]")[0].message).toMatch(/JSON object/);
  });

  it("rejects invalid monetary values with the exact path", () => {
    const pkg = basePackage();
    pkg.questionnaire.reportedWages = "50,000.00";
    pkg.documents[0].amount = "5OOOO.00";
    const errors = expectInvalid(pkg);
    expect(errors.map((e) => e.path)).toEqual(
      expect.arrayContaining(["questionnaire.reportedWages", "documents[0].amount"]),
    );
  });

  it("rejects duplicate document IDs", () => {
    const pkg = basePackage();
    pkg.documents.push({ ...pkg.documents[0], amount: "1.00" });
    const errors = expectInvalid(pkg);
    expect(errors).toEqual([expect.objectContaining({ path: "documents[1].documentId", message: expect.stringMatching(/duplicate document ID "D-1"/) })]);
  });

  it("still reports duplicate IDs when other fields also fail", () => {
    const pkg = basePackage();
    pkg.client.taxYear = 2099;
    pkg.documents.push({ ...pkg.documents[0] });
    const paths = expectInvalid(pkg).map((e) => e.path);
    expect(paths).toContain("client.taxYear");
    expect(paths).toContain("documents[1].documentId");
  });

  it("rejects missing essential identifiers", () => {
    const pkg = basePackage() as Record<string, any>;
    delete pkg.client.clientId;
    delete pkg.documents[0].documentId;
    delete pkg.documents[0].amount;
    const paths = expectInvalid(pkg).map((e) => e.path);
    expect(paths).toEqual(expect.arrayContaining(["client.clientId", "documents[0].documentId", "documents[0].amount"]));
  });

  it("rejects a missing client object", () => {
    const pkg = basePackage() as Record<string, any>;
    delete pkg.client;
    expect(expectInvalid(pkg)).toEqual([{ path: "client", message: "Required" }]);
  });

  it.each([
    [2031, /future/],
    [1999, /2000 or later/],
    [2025.5, /whole year/],
    ["2025", /four-digit year/],
  ])("rejects invalid tax year %j", (year, pattern) => {
    const pkg = basePackage() as Record<string, any>;
    pkg.client.taxYear = year;
    const errors = expectInvalid(pkg);
    expect(errors[0].path).toBe("client.taxYear");
    expect(errors[0].message).toMatch(pattern);
  });
});

describe("non-blocking: incomplete information is audited, not rejected", () => {
  it("accepts a package with no questionnaire answers and no documents key", () => {
    const pkg = basePackage() as Record<string, any>;
    delete pkg.questionnaire;
    delete pkg.documents;
    delete pkg.client.filingStatus;
    const r = runAudit(pkg);
    expect(r.status).toBe("completed");
  });

  it("handles an empty documents collection gracefully", () => {
    const pkg = basePackage();
    pkg.documents = [];
    const r = runAudit(pkg);
    expect(r.status).toBe("completed");
    if (r.status !== "completed") return;
    expect(r.documentCount).toBe(0);
    expect(r.findings.map((f) => f.id)).toContain("missing-document:wages");
  });

  it("treats null questionnaire answers as unanswered, not zero", () => {
    const pkg = basePackage();
    pkg.questionnaire.reportedWages = null;
    const r = runAudit(pkg);
    if (r.status !== "completed") throw new Error("expected completed");
    const ids = r.findings.map((f) => f.id);
    expect(ids).toContain("intake-completeness:wages");
    expect(ids).not.toContain("income-reconciliation:wages");
  });
});

describe("monetary overflow (regression)", () => {
  const MAX = "999999999999.99";
  const docs = (n: number, taxYear = 2025) =>
    Array.from({ length: n }, (_, i) => ({ documentId: `W-${taxYear}-${i}`, documentType: "W-2", taxYear, amount: MAX }));

  it("returns a structured validation error, not an exception, when a document total overflows", () => {
    const pkg = { client: { clientId: "C-1", name: "Overflow Test", taxYear: 2025 }, documents: docs(91) };
    let result: ReturnType<typeof runAudit> | undefined;
    expect(() => {
      result = runAudit(pkg);
    }).not.toThrow();
    expect(result?.status).toBe("invalid");
    if (result?.status !== "invalid") return;
    expect(result.errors).toEqual([
      { path: "documents", message: expect.stringMatching(/combined W-2 amounts across 91 documents exceed the largest total/) },
    ]);
  });

  it("still audits a package whose total is large but exactly representable", () => {
    const pkg = { client: { clientId: "C-1", name: "Large Test", taxYear: 2025 }, documents: docs(90) };
    const r = runAudit(pkg);
    expect(r.status).toBe("completed");
  });

  it("does not count excluded (wrong-year) documents toward the overflow check", () => {
    const pkg = { client: { clientId: "C-1", name: "Mixed Years", taxYear: 2025 }, documents: [...docs(90), ...docs(5, 2024)] };
    expect(runAudit(pkg).status).toBe("completed");
  });

  it("returns a structured error for an oversized single amount", () => {
    const pkg = basePackage();
    pkg.questionnaire.reportedWages = "12345678901234.00";
    const errors = expectInvalid(pkg);
    expect(errors).toEqual([{ path: "questionnaire.reportedWages", message: expect.stringMatching(/exceeds the maximum supported amount/) }]);
  });
});
