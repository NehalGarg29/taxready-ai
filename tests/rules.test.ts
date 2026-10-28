import { describe, expect, it } from "vitest";
import {
  incomeReconciliationRule,
  intakeCompletenessRule,
  missingDocumentRule,
  questionnaireConsistencyRule,
  taxYearMismatchRule,
  undisclosedIncomeRule,
  unsupportedDocumentTypeRule,
} from "@/lib/rules";
import { discrepancySeverity } from "@/lib/rules/incomeRules";
import { basePackage, ctxFor } from "./helpers";

describe("missingDocumentRule", () => {
  it("flags reported wages with no W-2 as a possible gap, not a requirement", () => {
    const pkg = basePackage();
    pkg.documents = [];
    const [f, ...rest] = missingDocumentRule.run(ctxFor(pkg));
    expect(rest).toHaveLength(0);
    expect(f.id).toBe("missing-document:wages");
    expect(f.severity).toBe("high");
    expect(f.description).toMatch(/possible intake gap/);
    expect(f.description).toMatch(/does not mean a form is definitely missing/);
    expect(f.sources).toContainEqual(expect.objectContaining({ field: "questionnaire.reportedWages", amountCents: 5_000_000 }));
  });

  it("flags reported interest without a 1099-INT and contractor income without a 1099-NEC", () => {
    const pkg = basePackage();
    pkg.questionnaire.reportedInterestIncome = "450.00";
    pkg.questionnaire.indicators.receivedInterestIncome = true;
    pkg.questionnaire.reportedContractorIncome = "3000.00";
    pkg.questionnaire.indicators.performedContractWork = true;
    pkg.client.reportedIncomeSources = ["wages", "interest", "contractor"];
    const ids = missingDocumentRule.run(ctxFor(pkg)).map((f) => f.id);
    expect(ids).toEqual(["missing-document:interest", "missing-document:contractor"]);
  });

  it("does not count a wrong-year document as the supporting form, and says so", () => {
    const pkg = basePackage();
    pkg.documents[0].taxYear = 2024;
    const [f] = missingDocumentRule.run(ctxFor(pkg));
    expect(f.id).toBe("missing-document:wages");
    expect(f.description).toMatch(/Excluded from this comparison and NOT counted: D-1/);
    expect(f.sources).toContainEqual(expect.objectContaining({ documentId: "D-1", label: expect.stringMatching(/excluded, not counted/) }));
  });

  it("is silent when nothing is claimed", () => {
    const pkg = basePackage();
    pkg.questionnaire.reportedWages = "0.00";
    pkg.questionnaire.indicators.hadW2Employment = false;
    pkg.client.reportedIncomeSources = [];
    pkg.documents = [];
    expect(missingDocumentRule.run(ctxFor(pkg))).toEqual([]);
  });
});

describe("incomeReconciliationRule", () => {
  it("reports an exact wage discrepancy with evidence", () => {
    const pkg = basePackage();
    pkg.questionnaire.reportedWages = "85000.00";
    pkg.documents[0].amount = "92000.00";
    const [f] = incomeReconciliationRule.run(ctxFor(pkg));
    expect(f.differenceCents).toBe(700_000);
    expect(f.expected).toEqual({ label: "W-2 total (1 document)", amountCents: 9_200_000 });
    expect(f.actual).toEqual({ label: "Reported in questionnaire", amountCents: 8_500_000 });
    expect(f.severity).toBe("high");
    expect(f.description).toMatch(/not a confirmed error/);
    expect(f.sources.map((s) => (s.kind === "document" ? s.documentId : s.kind))).toEqual(["questionnaire", "D-1"]);
  });

  it("aggregates multiple W-2s before comparing", () => {
    const pkg = basePackage();
    pkg.questionnaire.reportedWages = "79500.50";
    pkg.documents = [
      { documentId: "W-A", documentType: "W-2", taxYear: 2025, amount: "48000.00" },
      { documentId: "W-B", documentType: "W-2", taxYear: 2025, amount: "31500.50" },
    ];
    expect(incomeReconciliationRule.run(ctxFor(pkg))).toEqual([]);
  });

  it("reports the aggregated total and every contributing document when multiple W-2s disagree", () => {
    const pkg = basePackage();
    pkg.questionnaire.reportedWages = "79500.00";
    pkg.documents = [
      { documentId: "W-A", documentType: "W-2", taxYear: 2025, amount: "48000.00" },
      { documentId: "W-B", documentType: "W-2", taxYear: 2025, amount: "31500.50" },
    ];
    const [f] = incomeReconciliationRule.run(ctxFor(pkg));
    expect(f.differenceCents).toBe(50);
    expect(f.severity).toBe("low");
    expect(f.expected?.amountCents).toBe(7_950_050);
    expect(f.sources.filter((s) => s.kind === "document")).toHaveLength(2);
  });

  it("compares interest and contractor income against 1099 totals", () => {
    const pkg = basePackage();
    pkg.client.reportedIncomeSources = ["wages", "interest", "contractor"];
    pkg.questionnaire.reportedInterestIncome = "450.00";
    pkg.questionnaire.indicators.receivedInterestIncome = true;
    pkg.questionnaire.reportedContractorIncome = "12000.00";
    pkg.questionnaire.indicators.performedContractWork = true;
    pkg.documents.push(
      { documentId: "I-1", documentType: "1099-INT", taxYear: 2025, amount: "400.00" },
      { documentId: "N-1", documentType: "1099-NEC", taxYear: 2025, amount: "12000.00" },
    );
    const findings = incomeReconciliationRule.run(ctxFor(pkg));
    expect(findings.map((f) => [f.id, f.differenceCents, f.severity])).toEqual([["income-reconciliation:interest", -5_000, "low"]]);
  });

  it("excludes wrong-year documents from totals and reports the exclusion", () => {
    const pkg = basePackage();
    pkg.documents.push({ documentId: "OLD", documentType: "W-2", taxYear: 2024, amount: "1000.00" });
    // 50,000 reported vs 50,000 usable -> no discrepancy, even though a 2024 W-2 exists.
    expect(incomeReconciliationRule.run(ctxFor(pkg))).toEqual([]);

    pkg.questionnaire.reportedWages = "51000.00";
    const [f] = incomeReconciliationRule.run(ctxFor(pkg));
    expect(f.expected?.amountCents).toBe(5_000_000);
    expect(f.description).toMatch(/NOT counted: OLD \(\$1,000\.00, tax year 2024\)/);
  });

  it("does not compare when the questionnaire amount is unanswered", () => {
    const pkg = basePackage();
    pkg.questionnaire.reportedWages = undefined;
    expect(incomeReconciliationRule.run(ctxFor(pkg))).toEqual([]);
  });

  it("assigns severity by absolute difference", () => {
    expect(discrepancySeverity(100_000)).toBe("high");
    expect(discrepancySeverity(-100_000)).toBe("high");
    expect(discrepancySeverity(10_000)).toBe("medium");
    expect(discrepancySeverity(9_999)).toBe("low");
  });
});

describe("taxYearMismatchRule", () => {
  it("reports the exclusion, its reason and the affected comparison", () => {
    const pkg = basePackage();
    pkg.documents.push({ documentId: "N-OLD", documentType: "1099-NEC", taxYear: 2024, amount: "2200.00" });
    const ctx = ctxFor(pkg);
    expect(ctx.exclusions).toEqual([
      expect.objectContaining({
        documentId: "N-OLD",
        reason: "tax_year_mismatch",
        affectedComparisons: ["Contractor income: questionnaire vs. 1099-NEC Box 1 total"],
      }),
    ]);
    const [f] = taxYearMismatchRule.run(ctx);
    expect(f.severity).toBe("high");
    expect(f.expected?.text).toBe("2025");
    expect(f.actual?.text).toBe("2024");
    expect(f.description).toMatch(/Affected comparison: Contractor income/);
  });
});

describe("unsupportedDocumentTypeRule", () => {
  it("detects unsupported types and never uses them as evidence", () => {
    const pkg = basePackage();
    pkg.documents.push({ documentId: "DIV-1", documentType: "1099-DIV", taxYear: 2025, amount: "340.12" });
    const ctx = ctxFor(pkg);
    const [f] = unsupportedDocumentTypeRule.run(ctx);
    expect(f.id).toBe("unsupported-document-type:DIV-1");
    expect(ctx.exclusions[0]).toMatchObject({ reason: "unsupported_document_type", affectedComparisons: [] });
    for (const cat of Object.values(ctx.categories)) {
      expect(cat.eligibleDocuments.map((d) => d.documentId)).not.toContain("DIV-1");
    }
  });
});

describe("undisclosedIncomeRule", () => {
  it("flags a document for income the questionnaire never mentions", () => {
    const pkg = basePackage();
    pkg.documents.push({ documentId: "N-1", documentType: "1099-NEC", taxYear: 2025, amount: "5000.00" });
    const [f] = undisclosedIncomeRule.run(ctxFor(pkg));
    expect(f.id).toBe("undisclosed-income:contractor");
    expect(f.expected?.amountCents).toBe(500_000);
    expect(f.severity).toBe("high");
  });
});

describe("questionnaireConsistencyRule", () => {
  it("flags contradictory answers within the intake", () => {
    const pkg = basePackage();
    pkg.questionnaire.indicators.hadW2Employment = false; // but wages reported and listed
    const [f] = questionnaireConsistencyRule.run(ctxFor(pkg));
    expect(f.id).toBe("questionnaire-consistency:wages");
    expect(f.sources).toHaveLength(3);
  });

  it("ignores unanswered signals instead of treating them as 'no'", () => {
    const pkg = basePackage();
    pkg.questionnaire.indicators.hadW2Employment = undefined;
    expect(questionnaireConsistencyRule.run(ctxFor(pkg))).toEqual([]);
  });
});

describe("intakeCompletenessRule", () => {
  it("reports unanswered items and a missing filing status as review findings", () => {
    const pkg = basePackage();
    delete (pkg.client as Record<string, unknown>).filingStatus;
    pkg.questionnaire.reportedInterestIncome = undefined;
    const ids = intakeCompletenessRule.run(ctxFor(pkg)).map((f) => [f.id, f.severity]);
    expect(ids).toEqual([
      ["intake-completeness:interest", "low"],
      ["intake-completeness:filing-status", "low"],
    ]);
  });

  it("raises severity when the gap blocks a comparison that documents allow", () => {
    const pkg = basePackage();
    pkg.questionnaire.reportedWages = undefined;
    const [f] = intakeCompletenessRule.run(ctxFor(pkg));
    expect(f).toMatchObject({ id: "intake-completeness:wages", severity: "medium" });
  });
});
