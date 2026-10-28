import type { AuditRule } from "./context";
import { intakeCompletenessRule } from "./completenessRules";
import { taxYearMismatchRule, unsupportedDocumentTypeRule } from "./exclusionRules";
import {
  incomeReconciliationRule,
  missingDocumentRule,
  questionnaireConsistencyRule,
  undisclosedIncomeRule,
} from "./incomeRules";

/** Every rule the auditor runs, in display order. Each is a pure function of the audit context. */
export const AUDIT_RULES: readonly AuditRule[] = [
  taxYearMismatchRule,
  unsupportedDocumentTypeRule,
  missingDocumentRule,
  incomeReconciliationRule,
  undisclosedIncomeRule,
  questionnaireConsistencyRule,
  intakeCompletenessRule,
];

export {
  intakeCompletenessRule,
  taxYearMismatchRule,
  unsupportedDocumentTypeRule,
  missingDocumentRule,
  incomeReconciliationRule,
  undisclosedIncomeRule,
  questionnaireConsistencyRule,
};
export { buildContext, computeExclusions } from "./context";
export type { AuditRule, AuditContext } from "./context";
