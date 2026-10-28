import { sumCents, type Cents } from "../money";
import {
  SUPPORTED_DOCUMENT_TYPES,
  type IncomeCategory,
  type IntakeDocument,
  type IntakePackage,
  type SupportedDocumentType,
} from "../schemas";
import type { DocumentExclusion, Finding, SourceReference } from "../types";

/** Static mapping between an income category, its questionnaire fields, and its supporting form. */
export const CATEGORY_CONFIG: Record<
  IncomeCategory,
  {
    label: string;
    documentType: SupportedDocumentType;
    documentAmountLabel: string;
    amountField: "reportedWages" | "reportedInterestIncome" | "reportedContractorIncome";
    indicatorField: "hadW2Employment" | "receivedInterestIncome" | "performedContractWork";
    indicatorLabel: string;
    comparisonName: string;
  }
> = {
  wages: {
    label: "wages",
    documentType: "W-2",
    documentAmountLabel: "W-2 Box 1 wages",
    amountField: "reportedWages",
    indicatorField: "hadW2Employment",
    indicatorLabel: "Had W-2 employment",
    comparisonName: "Wages: questionnaire vs. W-2 Box 1 total",
  },
  interest: {
    label: "interest income",
    documentType: "1099-INT",
    documentAmountLabel: "1099-INT Box 1 interest income",
    amountField: "reportedInterestIncome",
    indicatorField: "receivedInterestIncome",
    indicatorLabel: "Received interest income",
    comparisonName: "Interest: questionnaire vs. 1099-INT Box 1 total",
  },
  contractor: {
    label: "contractor income",
    documentType: "1099-NEC",
    documentAmountLabel: "1099-NEC Box 1 nonemployee compensation",
    amountField: "reportedContractorIncome",
    indicatorField: "performedContractWork",
    indicatorLabel: "Performed contract work",
    comparisonName: "Contractor income: questionnaire vs. 1099-NEC Box 1 total",
  },
};

export const ALL_CATEGORIES = Object.keys(CATEGORY_CONFIG) as IncomeCategory[];

export type CategorySnapshot = {
  category: IncomeCategory;
  /** undefined = the questionnaire did not answer this amount. */
  reportedCents?: Cents;
  /** undefined = the indicator question was not answered. */
  indicator?: boolean;
  listedAsSource: boolean;
  /** True if any questionnaire/client signal says this income exists. */
  claimed: boolean;
  /** Supported documents of the right type AND the client's tax year. The ONLY documents used in totals. */
  eligibleDocuments: IntakeDocument[];
  /** Documents of this form type that were excluded (e.g. wrong tax year). Never used as evidence. */
  excludedDocuments: IntakeDocument[];
  documentedCents: Cents;
};

export type AuditContext = {
  pkg: IntakePackage;
  taxYear: number;
  categories: Record<IncomeCategory, CategorySnapshot>;
  exclusions: DocumentExclusion[];
  /** False when the package had no "documents" key at all (vs. an explicit empty array). */
  documentsProvided: boolean;
};

export function isSupportedType(type: string): type is SupportedDocumentType {
  return (SUPPORTED_DOCUMENT_TYPES as readonly string[]).includes(type);
}

export function categoryForType(type: SupportedDocumentType): IncomeCategory {
  const entry = ALL_CATEGORIES.find((c) => CATEGORY_CONFIG[c].documentType === type);
  if (!entry) throw new Error(`No category for ${type}`);
  return entry;
}

/** Decides, deterministically, whether each document may be used as evidence. */
export function computeExclusions(pkg: IntakePackage): DocumentExclusion[] {
  const taxYear = pkg.client.taxYear;
  const exclusions: DocumentExclusion[] = [];

  for (const doc of pkg.documents) {
    if (!isSupportedType(doc.documentType)) {
      exclusions.push({
        documentId: doc.documentId,
        documentType: doc.documentType,
        taxYear: doc.taxYear,
        sourceFile: doc.sourceFile,
        reason: "unsupported_document_type",
        explanation: `"${doc.documentType}" is not a supported document type (supported: ${SUPPORTED_DOCUMENT_TYPES.join(
          ", ",
        )}). Its amount was not used in any income comparison.`,
        // An unsupported form cannot be mapped to a category, so it affects no specific comparison —
        // but it may represent income the auditor cannot see.
        affectedComparisons: [],
      });
      continue;
    }
    if (doc.taxYear !== taxYear) {
      const category = categoryForType(doc.documentType);
      exclusions.push({
        documentId: doc.documentId,
        documentType: doc.documentType,
        taxYear: doc.taxYear,
        sourceFile: doc.sourceFile,
        reason: "tax_year_mismatch",
        explanation: `Document is for tax year ${doc.taxYear}, but the intake is for ${taxYear}. Its amount was excluded from the ${taxYear} totals.`,
        affectedComparisons: [CATEGORY_CONFIG[category].comparisonName],
      });
    }
  }
  return exclusions;
}

export function buildContext(pkg: IntakePackage, options: { documentsProvided?: boolean } = {}): AuditContext {
  const taxYear = pkg.client.taxYear;
  const exclusions = computeExclusions(pkg);
  const excludedIds = new Set(exclusions.map((e) => e.documentId));
  const sources = pkg.client.reportedIncomeSources ?? [];
  const categories = {} as Record<IncomeCategory, CategorySnapshot>;

  for (const category of ALL_CATEGORIES) {
    const cfg = CATEGORY_CONFIG[category];
    const ofType = pkg.documents.filter((d) => d.documentType === cfg.documentType);
    const eligibleDocuments = ofType.filter((d) => !excludedIds.has(d.documentId));
    const excludedDocuments = ofType.filter((d) => excludedIds.has(d.documentId));
    const reportedCents = pkg.questionnaire[cfg.amountField];
    const indicator = pkg.questionnaire.indicators[cfg.indicatorField];
    const listedAsSource = sources.includes(category);

    categories[category] = {
      category,
      reportedCents,
      indicator,
      listedAsSource,
      claimed: (reportedCents ?? 0) > 0 || indicator === true || listedAsSource,
      eligibleDocuments,
      excludedDocuments,
      documentedCents: sumCents(eligibleDocuments.map((d) => d.amount)),
    };
  }

  return { pkg, taxYear, categories, exclusions, documentsProvided: options.documentsProvided ?? true };
}

export function questionnaireAmountRef(category: IncomeCategory, cents: Cents | undefined): SourceReference {
  const cfg = CATEGORY_CONFIG[category];
  return cents === undefined
    ? { kind: "questionnaire", field: `questionnaire.${cfg.amountField}`, label: `Questionnaire: reported ${cfg.label}`, value: "not answered" }
    : { kind: "questionnaire", field: `questionnaire.${cfg.amountField}`, label: `Questionnaire: reported ${cfg.label}`, amountCents: cents };
}

export function documentRef(doc: IntakeDocument, labelSuffix = ""): SourceReference {
  const label = isSupportedType(doc.documentType)
    ? CATEGORY_CONFIG[categoryForType(doc.documentType)].documentAmountLabel
    : `${doc.documentType} amount`;
  return {
    kind: "document",
    documentId: doc.documentId,
    documentType: doc.documentType,
    sourceFile: doc.sourceFile,
    taxYear: doc.taxYear,
    label: label + labelSuffix,
    amountCents: doc.amount,
  };
}

export type AuditRule = {
  id: string;
  name: string;
  description: string;
  run: (ctx: AuditContext) => Finding[];
};
