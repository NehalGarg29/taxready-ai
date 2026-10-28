import type { Cents } from "./money";
import type { IncomeCategory } from "./schemas";

export type Severity = "high" | "medium" | "low";

export type IssueType =
  | "missing_supporting_document"
  | "income_discrepancy"
  | "undisclosed_income_source"
  | "questionnaire_inconsistency"
  | "tax_year_mismatch"
  | "unsupported_document_type"
  | "incomplete_intake";

export const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  missing_supporting_document: "Possible missing document",
  income_discrepancy: "Income discrepancy",
  undisclosed_income_source: "Document not reflected in questionnaire",
  questionnaire_inconsistency: "Contradictory questionnaire answers",
  tax_year_mismatch: "Tax-year mismatch",
  unsupported_document_type: "Unsupported document type",
  incomplete_intake: "Incomplete intake answer",
};

/** Points back to exactly where a piece of evidence came from. */
export type SourceReference =
  | {
      kind: "questionnaire";
      field: string; // e.g. "questionnaire.reportedWages"
      label: string;
      amountCents?: Cents;
      value?: string; // non-monetary values, e.g. "true"
    }
  | {
      kind: "document";
      documentId: string;
      documentType: string;
      sourceFile?: string;
      taxYear: number;
      label: string; // e.g. "W-2 Box 1 wages"
      amountCents: Cents;
    }
  | {
      kind: "client";
      field: string;
      label: string;
      value: string;
    };

export type ComparedValue = {
  label: string;
  amountCents?: Cents;
  text?: string;
};

export type FollowUp = {
  /** The wording currently shown to the preparer. */
  question: string;
  /** "template" = deterministic wording. "ai" = reworded by the model and passed automated checks (still needs human approval). */
  source: "template" | "ai";
  /** The deterministic template wording. Always present and never changed by the AI layer. */
  templateQuestion: string;
};

export type ReviewStatus = "open" | "reviewed";

export type Finding = {
  id: string;
  ruleId: string;
  issueType: IssueType;
  severity: Severity;
  category?: IncomeCategory;
  title: string;
  description: string;
  /** Value supported by documents (or what we expected to see). */
  expected?: ComparedValue;
  /** Value reported by the client in the questionnaire (or what was actually found). */
  actual?: ComparedValue;
  differenceCents?: Cents;
  sources: SourceReference[];
  followUp: FollowUp;
  reviewStatus: ReviewStatus;
};

export type ValidationIssue = {
  path: string;
  message: string;
};

export type RuleSummary = {
  ruleId: string;
  name: string;
  findingCount: number;
};

export type AiStatus = {
  requested: boolean;
  used: boolean;
  /** Number of follow-up questions whose wording came from the model (after guards). */
  rewrittenCount: number;
  model?: string;
  /** Plain-language reason when the AI layer did not run or partially fell back. */
  note: string;
};

/** A document that was received but NOT used as evidence in any comparison. */
export type DocumentExclusion = {
  documentId: string;
  documentType: string;
  taxYear: number;
  sourceFile?: string;
  reason: "tax_year_mismatch" | "unsupported_document_type";
  explanation: string;
  /** Human-readable names of the comparisons this document was left out of. */
  affectedComparisons: string[];
};

export type AuditResult =
  | {
      status: "invalid";
      errors: ValidationIssue[];
      auditedAt: string;
    }
  | {
      status: "completed";
      auditedAt: string;
      client: {
        clientId: string;
        name: string;
        taxYear: number;
        filingStatus: string;
      };
      documentCount: number;
      /** Documents actually used as evidence after exclusions. */
      usedDocumentCount: number;
      exclusions: DocumentExclusion[];
      checks: RuleSummary[];
      findings: Finding[];
      ai: AiStatus;
    };
