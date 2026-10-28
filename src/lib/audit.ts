import type { ZodIssue } from "zod";
import { intakePackageSchema } from "./schemas";
import { formatCents, trySumCents } from "./money";
import { AUDIT_RULES, buildContext, computeExclusions } from "./rules";
import { ALL_CATEGORIES, CATEGORY_CONFIG } from "./rules/context";
import type { IntakePackage } from "./schemas";
import type { AuditResult, Finding, Severity, ValidationIssue } from "./types";

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

function formatPath(path: (string | number)[]): string {
  if (path.length === 0) return "(root)";
  return path.reduce<string>((acc, part) => (typeof part === "number" ? `${acc}[${part}]` : acc ? `${acc}.${part}` : part), "");
}

function toValidationIssues(issues: ZodIssue[]): ValidationIssue[] {
  return issues.map((i) => {
    // Zod reports a missing required object as "Required" with an invalid_type code.
    const message = i.code === "invalid_type" && i.received === "undefined" ? "Required" : i.message;
    return { path: formatPath(i.path), message };
  });
}

/** Parses raw text. Never throws. */
export function parseIntakeJson(text: string): { ok: true; value: unknown } | { ok: false; error: ValidationIssue } {
  if (text.trim() === "") return { ok: false, error: { path: "(root)", message: "Input is empty" } };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: { path: "(root)", message: `Malformed JSON: ${(e as Error).message}` } };
  }
}

/**
 * Runs the deterministic intake audit.
 * Accepts raw JSON text or an already-parsed value. Never throws for bad input:
 * structurally invalid input returns status "invalid" with specific errors and NO findings.
 */
export function runAudit(input: string | unknown, now: Date = new Date()): AuditResult {
  const auditedAt = now.toISOString();

  let raw: unknown = input;
  if (typeof input === "string") {
    const parsed = parseIntakeJson(input);
    if (!parsed.ok) return { status: "invalid", errors: [parsed.error], auditedAt };
    raw = parsed.value;
  }

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { status: "invalid", errors: [{ path: "(root)", message: "Intake package must be a JSON object" }], auditedAt };
  }

  const result = intakePackageSchema.safeParse(raw);
  if (!result.success) {
    // Zod skips cross-field refinements when any field fails, so duplicate IDs are also
    // checked on the raw input to report every blocking problem in one pass.
    const errors = toValidationIssues(result.error.issues);
    for (const dup of findDuplicateDocumentIds(raw)) {
      if (!errors.some((e) => e.path === dup.path && e.message === dup.message)) errors.push(dup);
    }
    return { status: "invalid", errors, auditedAt };
  }

  const pkg = result.data;

  // Every individual amount is valid, but the sum of many documents could still exceed what integer
  // arithmetic represents exactly. Report that as a blocking input error instead of throwing.
  const overflowErrors = findTotalOverflows(pkg);
  if (overflowErrors.length > 0) return { status: "invalid", errors: overflowErrors, auditedAt };

  const documentsProvided = Array.isArray((raw as Record<string, unknown>).documents);
  const ctx = buildContext(pkg, { documentsProvided });

  const checks = [];
  const findings: Finding[] = [];
  for (const rule of AUDIT_RULES) {
    const ruleFindings = rule.run(ctx);
    checks.push({ ruleId: rule.id, name: rule.name, findingCount: ruleFindings.length });
    findings.push(...ruleFindings);
  }

  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return {
    status: "completed",
    auditedAt,
    client: {
      clientId: pkg.client.clientId,
      name: pkg.client.name,
      taxYear: pkg.client.taxYear,
      filingStatus: pkg.client.filingStatus ?? "not provided",
    },
    documentCount: pkg.documents.length,
    usedDocumentCount: pkg.documents.length - ctx.exclusions.length,
    exclusions: ctx.exclusions,
    checks,
    findings: deepFreeze(findings),
    ai: {
      requested: false,
      used: false,
      rewrittenCount: 0,
      note: "Follow-up questions use deterministic templates.",
    },
  };
}

/** Checks that each per-category document total (the only sums the rules compute) is exactly representable. */
export function findTotalOverflows(pkg: IntakePackage): ValidationIssue[] {
  const excluded = new Set(computeExclusions(pkg).map((e) => e.documentId));
  const issues: ValidationIssue[] = [];
  for (const category of ALL_CATEGORIES) {
    const type = CATEGORY_CONFIG[category].documentType;
    const docs = pkg.documents.filter((d) => d.documentType === type && !excluded.has(d.documentId));
    if (!trySumCents(docs.map((d) => d.amount)).ok) {
      issues.push({
        path: "documents",
        message: `the combined ${type} amounts across ${docs.length} documents exceed the largest total this tool can compare exactly (${formatCents(
          Number.MAX_SAFE_INTEGER,
        )}); split or correct the package`,
      });
    }
  }
  return issues;
}

/** Raw-input duplicate check (mirrors the schema's superRefine message exactly). */
export function findDuplicateDocumentIds(raw: unknown): ValidationIssue[] {
  const docs = (raw as { documents?: unknown }).documents;
  if (!Array.isArray(docs)) return [];
  const firstIndex = new Map<string, number>();
  const issues: ValidationIssue[] = [];
  docs.forEach((doc, index) => {
    const id = doc && typeof doc === "object" ? (doc as { documentId?: unknown }).documentId : undefined;
    if (typeof id !== "string" || id.trim() === "") return;
    const key = id.trim();
    const prior = firstIndex.get(key);
    if (prior !== undefined) {
      issues.push({
        path: `documents[${index}].documentId`,
        message: `duplicate document ID "${key}" (also used by documents[${prior}]); documents cannot be traced unambiguously`,
      });
    } else firstIndex.set(key, index);
  });
  return issues;
}

/** Findings are immutable once produced; any later layer (e.g. AI wording) must create copies. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const v of Object.values(value as object)) deepFreeze(v);
  }
  return value;
}
