import type { AuditResult } from "./types";

export type ReviewState = Record<string, { reviewedAt: string }>;

export const DISCLAIMER =
  "TaxReady AI is an intake-quality review aid. It does not prepare, calculate, or file tax returns, and its findings are discrepancies requiring professional review, not confirmed errors or legal determinations. All sample data is synthetic.";

/** What "reviewed" means, shown in the UI and embedded in every export. */
export const REVIEW_STATUS_DEFINITION =
  '"Reviewed" means a preparer has looked at the finding. It does not mean the issue is resolved, that the client has responded, or that the return is ready to file.';

/** Builds the exportable review report. Amounts are exported in integer cents to avoid float ambiguity. */
export function buildReviewReport(result: Extract<AuditResult, { status: "completed" }>, review: ReviewState, exportedAt = new Date()) {
  const findings = result.findings.map((f) => ({
    ...f,
    // Only two states exist: "open" (not yet looked at) and "reviewed" (looked at by a preparer).
    // There is deliberately no "resolved" state — resolution is outside this tool.
    reviewStatus: review[f.id] ? ("reviewed" as const) : ("open" as const),
    reviewedAt: review[f.id]?.reviewedAt ?? null,
  }));
  const reviewed = findings.filter((f) => f.reviewStatus === "reviewed").length;

  return {
    reportType: "taxready-ai/intake-audit-review",
    version: 1,
    exportedAt: exportedAt.toISOString(),
    auditedAt: result.auditedAt,
    amountUnits: "integer cents (USD)",
    reviewStatusDefinition: REVIEW_STATUS_DEFINITION,
    client: result.client,
    summary: {
      checksCompleted: result.checks.length,
      issuesIdentified: findings.length,
      reviewed,
      needingReview: findings.length - reviewed,
      bySeverity: {
        high: findings.filter((f) => f.severity === "high").length,
        medium: findings.filter((f) => f.severity === "medium").length,
        low: findings.filter((f) => f.severity === "low").length,
      },
      documentsReceived: result.documentCount,
      documentsUsedAsEvidence: result.usedDocumentCount,
    },
    checks: result.checks,
    exclusions: result.exclusions,
    findings,
    followUpWording: result.ai,
    disclaimer: DISCLAIMER,
  };
}
