import { intakePackageSchema, type IntakePackage } from "@/lib/schemas";
import { buildContext } from "@/lib/rules";

type RawDoc = { documentId: string; documentType: string; taxYear: number; amount: string | number; sourceFile?: string };

/** A minimal, fully consistent raw package: wages only, matching W-2. */
export function basePackage() {
  return {
    client: {
      clientId: "CL-T1",
      name: "Test Client",
      taxYear: 2025,
      filingStatus: "single",
      reportedIncomeSources: ["wages"] as string[],
    },
    questionnaire: {
      reportedWages: "50000.00" as unknown,
      reportedInterestIncome: "0.00" as unknown,
      reportedContractorIncome: "0.00" as unknown,
      indicators: { hadW2Employment: true, receivedInterestIncome: false, performedContractWork: false } as Record<string, unknown>,
    } as Record<string, unknown> & { indicators: Record<string, unknown> },
    documents: [{ documentId: "D-1", documentType: "W-2", taxYear: 2025, amount: "50000.00", sourceFile: "w2.pdf" }] as RawDoc[],
  };
}

export function parse(raw: unknown): IntakePackage {
  const r = intakePackageSchema.safeParse(raw);
  if (!r.success) throw new Error(`Test package failed schema: ${JSON.stringify(r.error.issues)}`);
  return r.data;
}

export function ctxFor(raw: unknown) {
  return buildContext(parse(raw));
}
