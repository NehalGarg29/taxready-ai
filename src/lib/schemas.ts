import { z } from "zod";
import { parseMoney, type Cents } from "./money";

/**
 * Input schemas for an intake package.
 *
 * Design rule: the schema BLOCKS the audit only when the input cannot be safely interpreted:
 *   - malformed JSON (handled before this schema runs)
 *   - invalid monetary values (anywhere they appear)
 *   - duplicate document IDs
 *   - missing essential identifiers: client ID, client name, client tax year,
 *     and for each document its ID, type, tax year and amount
 *   - wrong data types / impossible tax years
 *
 * Incomplete tax information (unanswered questionnaire items, missing filing status,
 * no documents at all) does NOT block. It is surfaced later as review findings.
 */

export const SUPPORTED_DOCUMENT_TYPES = ["W-2", "1099-INT", "1099-NEC"] as const;
export type SupportedDocumentType = (typeof SUPPORTED_DOCUMENT_TYPES)[number];

export const INCOME_CATEGORIES = ["wages", "interest", "contractor"] as const;
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];

export const FILING_STATUSES = [
  "single",
  "married_filing_jointly",
  "married_filing_separately",
  "head_of_household",
  "qualifying_surviving_spouse",
] as const;

const MIN_TAX_YEAR = 2000;

/** Tax years cannot be later than the current calendar year. */
export const taxYearSchema = z
  .number({ required_error: "Required", invalid_type_error: "must be a four-digit year number, e.g. 2025" })
  .int("must be a whole year, e.g. 2025")
  .min(MIN_TAX_YEAR, `must be ${MIN_TAX_YEAR} or later`)
  .refine((y) => y <= new Date().getFullYear(), { message: "cannot be in the future" });

function moneyTransform(required: boolean) {
  return z.unknown().transform((value, ctx): Cents | undefined => {
    if (value === undefined || value === null) {
      if (required) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Required" });
        return z.NEVER;
      }
      return undefined; // unanswered — becomes a review finding, not a block
    }
    const parsed = parseMoney(value);
    if (!parsed.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: parsed.error });
      return z.NEVER;
    }
    return parsed.cents;
  });
}

/** Required money: must be present and valid. */
export const requiredMoneySchema = moneyTransform(true) as unknown as z.ZodType<Cents, z.ZodTypeDef, unknown>;
/** Optional money: may be absent/null, but if present must be valid (never coerced). */
export const optionalMoneySchema = moneyTransform(false);

const requiredText = (field: string) =>
  z
    .string({ required_error: "Required", invalid_type_error: `${field} must be text` })
    .trim()
    .min(1, `${field} must not be empty`);

const optionalBoolean = z
  .boolean({ invalid_type_error: "must be true or false" })
  .nullish()
  .transform((v) => v ?? undefined);

export const clientSchema = z.object({
  clientId: requiredText("clientId"),
  name: requiredText("name"),
  taxYear: taxYearSchema,
  filingStatus: z
    .enum(FILING_STATUSES, { errorMap: () => ({ message: `must be one of: ${FILING_STATUSES.join(", ")}` }) })
    .nullish()
    .transform((v) => v ?? undefined),
  reportedIncomeSources: z
    .array(z.enum(INCOME_CATEGORIES, { errorMap: () => ({ message: `must be one of: ${INCOME_CATEGORIES.join(", ")}` }) }))
    .nullish()
    .transform((v) => v ?? undefined),
});

export const questionnaireSchema = z.object({
  reportedWages: optionalMoneySchema,
  reportedInterestIncome: optionalMoneySchema,
  reportedContractorIncome: optionalMoneySchema,
  indicators: z
    .object({
      hadW2Employment: optionalBoolean,
      receivedInterestIncome: optionalBoolean,
      performedContractWork: optionalBoolean,
    })
    .nullish()
    .transform((v) => v ?? {}),
});

export const documentSchema = z.object({
  documentId: requiredText("documentId"),
  // Free text so unsupported types become explicit exclusions rather than schema errors.
  documentType: requiredText("documentType"),
  taxYear: taxYearSchema,
  amount: requiredMoneySchema,
  sourceFile: z.string().trim().min(1).nullish().transform((v) => v ?? undefined),
  payerName: z.string().nullish().transform((v) => v ?? undefined),
});

export const intakePackageSchema = z
  .object({
    client: clientSchema,
    questionnaire: questionnaireSchema
      .nullish()
      .transform((v): Questionnaire => v ?? { indicators: {} }),
    documents: z
      .array(documentSchema, { invalid_type_error: "must be an array of documents" })
      .nullish()
      .transform((v) => v ?? []),
  })
  .superRefine((pkg, ctx) => {
    const firstIndex = new Map<string, number>();
    pkg.documents.forEach((doc, index) => {
      const prior = firstIndex.get(doc.documentId);
      if (prior !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["documents", index, "documentId"],
          message: `duplicate document ID "${doc.documentId}" (also used by documents[${prior}]); documents cannot be traced unambiguously`,
        });
      } else {
        firstIndex.set(doc.documentId, index);
      }
    });
  });

export type IntakePackage = z.output<typeof intakePackageSchema>;
export type IntakeDocument = IntakePackage["documents"][number];
export type Questionnaire = {
  reportedWages?: Cents;
  reportedInterestIncome?: Cents;
  reportedContractorIncome?: Cents;
  indicators: {
    hadW2Employment?: boolean;
    receivedInterestIncome?: boolean;
    performedContractWork?: boolean;
  };
};
