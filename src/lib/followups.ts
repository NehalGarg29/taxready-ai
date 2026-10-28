import { formatCents, type Cents } from "./money";
import type { FollowUp } from "./types";

/** Every finding starts with deterministic template wording; templateQuestion is never changed afterwards. */
export function templateFollowUp(question: string): FollowUp {
  return { question, source: "template", templateQuestion: question };
}

/**
 * Deterministic follow-up question templates.
 * These are always generated. The optional AI layer may only reword them.
 * Wording deliberately avoids asserting that anything is an error or legally required.
 */
export const followUpTemplates = {
  missingDocument: (p: { incomeLabel: string; formType: string; reportedCents: Cents; taxYear: number }) =>
    p.reportedCents > 0
      ? `You reported ${formatCents(p.reportedCents)} in ${p.incomeLabel} for ${p.taxYear}, but we did not receive a ${p.formType}. Could you send any ${p.formType} forms you received, or let us know if this income was not reported on one?`
      : `Your questionnaire indicates ${p.incomeLabel} for ${p.taxYear}, but we did not receive a ${p.formType}. Could you confirm whether you received one and send it if so?`,

  incomeDiscrepancy: (p: {
    incomeLabel: string;
    formType: string;
    reportedCents: Cents;
    documentedCents: Cents;
    documentCount: number;
    taxYear: number;
  }) =>
    `Your questionnaire lists ${formatCents(p.reportedCents)} in ${p.incomeLabel} for ${p.taxYear}, while the ${
      p.documentCount === 1 ? `${p.formType} we received shows` : `${p.documentCount} ${p.formType} forms we received total`
    } ${formatCents(p.documentedCents)}. Could you help us understand the difference — for example, another payer not yet sent to us, a corrected form, or an estimate on the questionnaire?`,

  undisclosedSource: (p: { incomeLabel: string; formType: string; documentedCents: Cents; taxYear: number }) =>
    `We received ${p.formType} documentation showing ${formatCents(p.documentedCents)} in ${p.incomeLabel} for ${p.taxYear}, but your questionnaire did not mention this income. Could you confirm whether this income belongs on your return?`,

  questionnaireInconsistency: (p: { incomeLabel: string }) =>
    `Some of your questionnaire answers about ${p.incomeLabel} appear to conflict with each other. Could you confirm whether you had ${p.incomeLabel} this year, and if so, the approximate amount?`,

  taxYearMismatch: (p: { formType: string; documentId: string; documentYear: number; taxYear: number }) =>
    `The ${p.formType} you provided (reference ${p.documentId}) is marked for tax year ${p.documentYear}, but we are preparing your ${p.taxYear} return. Could you send the ${p.taxYear} version of this form, or confirm it was included by mistake?`,

  unansweredItem: (p: { incomeLabel: string }) =>
    `A few questions about ${p.incomeLabel} were left blank on your questionnaire. Could you let us know whether you had any ${p.incomeLabel} this year, and if so, the approximate amount?`,

  filingStatus: () =>
    `Your questionnaire does not include a filing status. Could you confirm which filing status you expect to use this year?`,

  noDocuments: () =>
    `We have not received any income documents yet. Could you send the tax forms you have received so far, such as W-2 or 1099 forms?`,

  unsupportedType: (p: { documentType: string; documentId: string }) =>
    `We received a document labeled "${p.documentType}" (reference ${p.documentId}). Could you tell us what this document is so your preparer can decide how it should be handled?`,
};
