import { formatCents, type Cents } from "../money";
import { followUpTemplates, templateFollowUp } from "../followups";
import type { Finding, Severity, SourceReference } from "../types";
import { ALL_CATEGORIES, CATEGORY_CONFIG, documentRef, questionnaireAmountRef, type AuditRule, type CategorySnapshot } from "./context";

/** Discrepancy severity by absolute difference in cents. */
export function discrepancySeverity(diffCents: Cents): Severity {
  const abs = Math.abs(diffCents);
  if (abs >= 100_000) return "high"; // >= $1,000
  if (abs >= 10_000) return "medium"; // >= $100
  return "low";
}

function excludedNote(snap: CategorySnapshot): string {
  if (snap.excludedDocuments.length === 0) return "";
  const list = snap.excludedDocuments
    .map((d) => `${d.documentId} (${formatCents(d.amount)}, tax year ${d.taxYear})`)
    .join(", ");
  return ` Excluded from this comparison and NOT counted: ${list}.`;
}

function excludedRefs(snap: CategorySnapshot): SourceReference[] {
  return snap.excludedDocuments.map((d) => documentRef(d, " — excluded, not counted"));
}

/**
 * A. Missing supporting documents.
 * Fires when the client indicates income in a category but no usable document of the matching
 * form type was received. Treated as a POSSIBLE gap: not all income of this kind arrives on that form.
 */
export const missingDocumentRule: AuditRule = {
  id: "missing-document",
  name: "Supporting document presence",
  description: "Flags income the client reported without a matching W-2, 1099-INT or 1099-NEC for the intake year.",
  run(ctx) {
    const findings: Finding[] = [];
    for (const category of ALL_CATEGORIES) {
      const cfg = CATEGORY_CONFIG[category];
      const snap = ctx.categories[category];
      if (!snap.claimed || snap.eligibleDocuments.length > 0) continue;

      const sources: SourceReference[] = [];
      if (snap.reportedCents !== undefined) sources.push(questionnaireAmountRef(category, snap.reportedCents));
      if (snap.indicator !== undefined)
        sources.push({ kind: "questionnaire", field: `questionnaire.indicators.${cfg.indicatorField}`, label: `Questionnaire: ${cfg.indicatorLabel}`, value: String(snap.indicator) });
      if (snap.listedAsSource)
        sources.push({ kind: "client", field: "client.reportedIncomeSources", label: "Client: reported income sources", value: category });
      sources.push(...excludedRefs(snap));

      findings.push({
        id: `missing-document:${category}`,
        ruleId: "missing-document",
        issueType: "missing_supporting_document",
        severity: category === "wages" ? "high" : "medium",
        category,
        title: `No ${cfg.documentType} for reported ${cfg.label}`,
        description:
          `The client indicates ${cfg.label}${snap.reportedCents ? ` of ${formatCents(snap.reportedCents)}` : ""} for ${ctx.taxYear}, but no ${cfg.documentType} for ${ctx.taxYear} was received. ` +
          `This is a possible intake gap to confirm — a ${cfg.documentType} is not issued in every situation, so this does not mean a form is definitely missing.` +
          excludedNote(snap),
        expected: { label: `${cfg.documentType} for ${ctx.taxYear}`, text: "At least one, if issued" },
        actual: { label: `${cfg.documentType} received`, text: "None usable" },
        sources,
        followUp: templateFollowUp(followUpTemplates.missingDocument({
            incomeLabel: cfg.label,
            formType: cfg.documentType,
            reportedCents: snap.reportedCents ?? 0,
            taxYear: ctx.taxYear,
          })),
        reviewStatus: "open",
      });
    }
    return findings;
  },
};

/**
 * B. Income reconciliation.
 * Compares the questionnaire amount against the SUM of usable documents of the matching type.
 * Any non-zero difference (in exact cents) is a discrepancy requiring review — not a confirmed error.
 */
export const incomeReconciliationRule: AuditRule = {
  id: "income-reconciliation",
  name: "Income reconciliation",
  description: "Compares questionnaire amounts with aggregated W-2 / 1099-INT / 1099-NEC totals in integer cents.",
  run(ctx) {
    const findings: Finding[] = [];
    for (const category of ALL_CATEGORIES) {
      const cfg = CATEGORY_CONFIG[category];
      const snap = ctx.categories[category];
      if (!snap.claimed || snap.eligibleDocuments.length === 0 || snap.reportedCents === undefined) continue;

      const diff = snap.documentedCents - snap.reportedCents;
      if (diff === 0) continue;

      const n = snap.eligibleDocuments.length;
      const docPhrase = n === 1 ? `the ${cfg.documentType}` : `${n} ${cfg.documentType} forms combined`;
      findings.push({
        id: `income-reconciliation:${category}`,
        ruleId: "income-reconciliation",
        issueType: "income_discrepancy",
        severity: discrepancySeverity(diff),
        category,
        title: `Reported vs. documented ${cfg.label} differ by ${formatCents(Math.abs(diff))}`,
        description:
          `Questionnaire reports ${formatCents(snap.reportedCents)} in ${cfg.label}; ${docPhrase} show${n === 1 ? "s" : ""} ${formatCents(snap.documentedCents)} ` +
          `(${diff > 0 ? "documents are higher" : "documents are lower"} by ${formatCents(Math.abs(diff))}). ` +
          `This is a discrepancy requiring review, not a confirmed error — questionnaire figures are often estimates, and amounts may legitimately differ.` +
          excludedNote(snap),
        expected: { label: `${cfg.documentType} total (${n} document${n === 1 ? "" : "s"})`, amountCents: snap.documentedCents },
        actual: { label: "Reported in questionnaire", amountCents: snap.reportedCents },
        differenceCents: diff,
        sources: [
          questionnaireAmountRef(category, snap.reportedCents),
          ...snap.eligibleDocuments.map((d) => documentRef(d)),
          ...excludedRefs(snap),
        ],
        followUp: templateFollowUp(followUpTemplates.incomeDiscrepancy({
            incomeLabel: cfg.label,
            formType: cfg.documentType,
            reportedCents: snap.reportedCents,
            documentedCents: snap.documentedCents,
            documentCount: n,
            taxYear: ctx.taxYear,
          })),
        reviewStatus: "open",
      });
    }
    return findings;
  },
};

/** Flags usable documents for income the questionnaire does not mention at all. */
export const undisclosedIncomeRule: AuditRule = {
  id: "undisclosed-income",
  name: "Documents reflected in questionnaire",
  description: "Flags W-2 / 1099 documents for income the client did not indicate anywhere in the intake.",
  run(ctx) {
    const findings: Finding[] = [];
    for (const category of ALL_CATEGORIES) {
      const cfg = CATEGORY_CONFIG[category];
      const snap = ctx.categories[category];
      if (snap.claimed || snap.eligibleDocuments.length === 0) continue;

      findings.push({
        id: `undisclosed-income:${category}`,
        ruleId: "undisclosed-income",
        issueType: "undisclosed_income_source",
        severity: discrepancySeverity(snap.documentedCents) === "low" ? "medium" : "high",
        category,
        title: `${cfg.documentType} received but ${cfg.label} not reported`,
        description: `${snap.eligibleDocuments.length} ${cfg.documentType} document(s) totaling ${formatCents(snap.documentedCents)} were received, but the questionnaire does not indicate any ${cfg.label}.`,
        expected: { label: `${cfg.documentType} total`, amountCents: snap.documentedCents },
        actual: { label: "Reported in questionnaire", ...(snap.reportedCents === undefined ? { text: "Not answered" } : { amountCents: snap.reportedCents }) },
        sources: [questionnaireAmountRef(category, snap.reportedCents), ...snap.eligibleDocuments.map((d) => documentRef(d))],
        followUp: templateFollowUp(followUpTemplates.undisclosedSource({
            incomeLabel: cfg.label,
            formType: cfg.documentType,
            documentedCents: snap.documentedCents,
            taxYear: ctx.taxYear,
          })),
        reviewStatus: "open",
      });
    }
    return findings;
  },
};

/** Flags contradictions between the amount, the yes/no indicator, and the client's listed income sources. */
export const questionnaireConsistencyRule: AuditRule = {
  id: "questionnaire-consistency",
  name: "Questionnaire internal consistency",
  description: "Flags categories where answered intake signals (amount, yes/no indicator, listed sources) contradict each other.",
  run(ctx) {
    const findings: Finding[] = [];
    const sourcesProvided = ctx.pkg.client.reportedIncomeSources !== undefined;
    for (const category of ALL_CATEGORIES) {
      const cfg = CATEGORY_CONFIG[category];
      const snap = ctx.categories[category];
      const signals: { says: boolean; ref: SourceReference }[] = [];
      if (snap.reportedCents !== undefined)
        signals.push({ says: snap.reportedCents > 0, ref: questionnaireAmountRef(category, snap.reportedCents) });
      if (snap.indicator !== undefined)
        signals.push({
          says: snap.indicator,
          ref: { kind: "questionnaire", field: `questionnaire.indicators.${cfg.indicatorField}`, label: `Questionnaire: ${cfg.indicatorLabel}`, value: String(snap.indicator) },
        });
      if (sourcesProvided)
        signals.push({
          says: snap.listedAsSource,
          ref: { kind: "client", field: "client.reportedIncomeSources", label: `Client: lists "${category}" as an income source`, value: String(snap.listedAsSource) },
        });

      const hasYes = signals.some((s) => s.says);
      const hasNo = signals.some((s) => !s.says);
      if (!(hasYes && hasNo)) continue;

      findings.push({
        id: `questionnaire-consistency:${category}`,
        ruleId: "questionnaire-consistency",
        issueType: "questionnaire_inconsistency",
        severity: "medium",
        category,
        title: `Conflicting answers about ${cfg.label}`,
        description: `Intake answers disagree on whether the client had ${cfg.label}: ${signals
          .map((s) => `${s.ref.label} = ${s.ref.kind === "questionnaire" && s.ref.amountCents !== undefined ? formatCents(s.ref.amountCents) : (s.ref as { value?: string }).value}`)
          .join("; ")}.`,
        sources: signals.map((s) => s.ref),
        followUp: templateFollowUp(followUpTemplates.questionnaireInconsistency({ incomeLabel: cfg.label })),
        reviewStatus: "open",
      });
    }
    return findings;
  },
};
