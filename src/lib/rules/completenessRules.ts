import { followUpTemplates, templateFollowUp } from "../followups";
import type { Finding, SourceReference } from "../types";
import { ALL_CATEGORIES, CATEGORY_CONFIG, type AuditRule } from "./context";

/**
 * Surfaces unanswered intake items as review findings instead of blocking the audit.
 * Severity is medium when the gap prevents a comparison that documents make possible, otherwise low.
 */
export const intakeCompletenessRule: AuditRule = {
  id: "intake-completeness",
  name: "Intake completeness",
  description: "Flags unanswered questionnaire items, a missing filing status, or a missing documents collection.",
  run(ctx) {
    const findings: Finding[] = [];

    for (const category of ALL_CATEGORIES) {
      const cfg = CATEGORY_CONFIG[category];
      const snap = ctx.categories[category];
      const missing: string[] = [];
      if (snap.reportedCents === undefined) missing.push(`questionnaire.${cfg.amountField}`);
      if (snap.indicator === undefined) missing.push(`questionnaire.indicators.${cfg.indicatorField}`);
      if (missing.length === 0) continue;

      const blocksComparison = snap.reportedCents === undefined && snap.eligibleDocuments.length > 0;
      const sources: SourceReference[] = missing.map((field) => ({
        kind: "questionnaire",
        field,
        label: field.endsWith(cfg.amountField) ? `Questionnaire: reported ${cfg.label}` : `Questionnaire: ${cfg.indicatorLabel}`,
        value: "not answered",
      }));

      findings.push({
        id: `intake-completeness:${category}`,
        ruleId: "intake-completeness",
        issueType: "incomplete_intake",
        severity: blocksComparison ? "medium" : "low",
        category,
        title: `Unanswered ${cfg.label} question${missing.length > 1 ? "s" : ""}`,
        description: blocksComparison
          ? `The questionnaire does not state an amount for ${cfg.label}, so the ${cfg.documentType} documents received could not be compared against it. Unanswered: ${missing.join(", ")}.`
          : `The questionnaire leaves ${missing.join(", ")} unanswered. No comparison was blocked, but the answer should be confirmed.`,
        sources,
        followUp: templateFollowUp(followUpTemplates.unansweredItem({ incomeLabel: cfg.label })),
        reviewStatus: "open",
      });
    }

    if (ctx.pkg.client.filingStatus === undefined) {
      findings.push({
        id: "intake-completeness:filing-status",
        ruleId: "intake-completeness",
        issueType: "incomplete_intake",
        severity: "low",
        title: "Filing status not provided",
        description: "The intake does not include a filing status. It does not affect these income checks but is needed for preparation.",
        sources: [{ kind: "client", field: "client.filingStatus", label: "Filing status", value: "not answered" }],
        followUp: templateFollowUp(followUpTemplates.filingStatus()),
        reviewStatus: "open",
      });
    }

    if (!ctx.documentsProvided) {
      findings.push({
        id: "intake-completeness:documents",
        ruleId: "intake-completeness",
        issueType: "incomplete_intake",
        severity: "low",
        title: "No documents collection in the package",
        description: 'The package has no "documents" list. The audit treated this as "no documents received yet" rather than rejecting the package.',
        sources: [{ kind: "client", field: "documents", label: "Documents collection", value: "absent" }],
        followUp: templateFollowUp(followUpTemplates.noDocuments()),
        reviewStatus: "open",
      });
    }

    return findings;
  },
};
