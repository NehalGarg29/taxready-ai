import { followUpTemplates, templateFollowUp } from "../followups";
import type { Finding } from "../types";
import { documentRef, type AuditRule } from "./context";

/**
 * Reports every document that was excluded from evidence because its tax year
 * does not match the intake's tax year. Exclusion itself is decided in computeExclusions().
 */
export const taxYearMismatchRule: AuditRule = {
  id: "tax-year-mismatch",
  name: "Document tax-year check",
  description: "Flags supporting documents whose tax year differs from the intake's tax year and excludes them from totals.",
  run(ctx) {
    return ctx.exclusions
      .filter((e) => e.reason === "tax_year_mismatch")
      .map((e): Finding => {
        const doc = ctx.pkg.documents.find((d) => d.documentId === e.documentId)!;
        return {
          id: `tax-year-mismatch:${e.documentId}`,
          ruleId: "tax-year-mismatch",
          issueType: "tax_year_mismatch",
          severity: "high",
          title: `${e.documentType} ${e.documentId} is for tax year ${e.taxYear}, not ${ctx.taxYear}`,
          description: `${e.explanation} Affected comparison: ${e.affectedComparisons.join("; ")}. This may be a prior-year form sent by mistake, or the ${ctx.taxYear} form may still be outstanding.`,
          expected: { label: "Intake tax year", text: String(ctx.taxYear) },
          actual: { label: "Document tax year", text: String(e.taxYear) },
          sources: [
            documentRef(doc, " — excluded, not counted"),
            { kind: "client", field: "client.taxYear", label: "Intake tax year", value: String(ctx.taxYear) },
          ],
          followUp: templateFollowUp(followUpTemplates.taxYearMismatch({
              formType: e.documentType,
              documentId: e.documentId,
              documentYear: e.taxYear,
              taxYear: ctx.taxYear,
            })),
          reviewStatus: "open",
        };
      });
  },
};

/** Reports documents whose type the auditor does not support. They are never used as evidence. */
export const unsupportedDocumentTypeRule: AuditRule = {
  id: "unsupported-document-type",
  name: "Supported document type check",
  description: "Flags documents with a type other than W-2, 1099-INT or 1099-NEC and excludes them from all comparisons.",
  run(ctx) {
    return ctx.exclusions
      .filter((e) => e.reason === "unsupported_document_type")
      .map((e): Finding => {
        const doc = ctx.pkg.documents.find((d) => d.documentId === e.documentId)!;
        return {
          id: `unsupported-document-type:${e.documentId}`,
          ruleId: "unsupported-document-type",
          issueType: "unsupported_document_type",
          severity: "medium",
          title: `Unsupported document type "${e.documentType}" (${e.documentId})`,
          description: `${e.explanation} It may contain income this prototype cannot evaluate, so a preparer should review it manually.`,
          sources: [documentRef(doc, " — excluded, not evaluated")],
          followUp: templateFollowUp(followUpTemplates.unsupportedType({ documentType: e.documentType, documentId: e.documentId })),
          reviewStatus: "open",
        };
      });
  },
};
