"use client";

import { useMemo, useState } from "react";
import { buildReviewReport, REVIEW_STATUS_DEFINITION, type ReviewState } from "@/lib/report";
import { ISSUE_TYPE_LABELS, type AuditResult, type IssueType, type Severity } from "@/lib/types";
import { FindingCard } from "./FindingCard";
import { Card, SectionTitle, SEVERITY_STYLES } from "./ui";

type Completed = Extract<AuditResult, { status: "completed" }>;

export function ValidationErrors({ result }: { result: Extract<AuditResult, { status: "invalid" }> }) {
  return (
    <Card className="border-red-200 p-5">
      <SectionTitle>Audit blocked — input could not be safely interpreted</SectionTitle>
      <p className="text-sm text-ink-soft">
        No findings, totals or follow-up questions were produced. Fix the following and run the audit again:
      </p>
      <ul className="mt-3 divide-y divide-red-100 rounded-lg border border-red-200 bg-red-50 text-sm">
        {result.errors.map((e, i) => (
          <li key={i} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:gap-3">
            <code className="shrink-0 font-mono text-xs text-red-800 sm:w-56 sm:pt-0.5">{e.path}</code>
            <span className="text-red-900">{e.message}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Exclusions({ result }: { result: Completed }) {
  if (result.exclusions.length === 0) return null;
  return (
    <Card className="p-5">
      <SectionTitle>
        Documents excluded from evidence ({result.exclusions.length} of {result.documentCount})
      </SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-xs">
          <thead className="text-ink-muted">
            <tr className="border-b border-slate-200">
              <th className="py-2 pr-3 font-medium">Document</th>
              <th className="py-2 pr-3 font-medium">Reason</th>
              <th className="py-2 pr-3 font-medium">Comparisons affected</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 align-top">
            {result.exclusions.map((e) => (
              <tr key={e.documentId}>
                <td className="py-2 pr-3">
                  <div className="font-medium text-ink">{e.documentId}</div>
                  <div className="text-ink-muted">
                    {e.documentType} · TY {e.taxYear}
                    {e.sourceFile ? ` · ${e.sourceFile}` : ""}
                  </div>
                </td>
                <td className="py-2 pr-3 text-ink-soft">{e.explanation}</td>
                <td className="py-2 pr-3 text-ink-soft">
                  {e.affectedComparisons.length ? e.affectedComparisons.join("; ") : "None mappable — reviewed manually"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const SEVERITIES: Severity[] = ["high", "medium", "low"];

type FindingsProps = {
  result: Completed;
  review: ReviewState;
  onToggleReviewed: (id: string) => void;
  onPrint: () => void;
};

export function AuditResults({ result, review, onToggleReviewed, onPrint }: FindingsProps) {
  const [typeFilter, setTypeFilter] = useState<IssueType | "all">("all");
  const [hideReviewed, setHideReviewed] = useState(false);

  const typeCounts = useMemo(() => {
    const m = new Map<IssueType, number>();
    for (const f of result.findings) m.set(f.issueType, (m.get(f.issueType) ?? 0) + 1);
    return [...m.entries()];
  }, [result]);

  const visible = result.findings.filter(
    (f) => (typeFilter === "all" || f.issueType === typeFilter) && !(hideReviewed && review[f.id]),
  );

  function exportReport() {
    const report = buildReviewReport(result, review);
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `taxready-review-${result.client.clientId.replace(/[^A-Za-z0-9_-]/g, "_")}-${result.client.taxYear}.json`;
    // Attach before clicking and revoke later: Safari can cancel a download whose URL is revoked immediately.
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="text-sm">
          <span className="font-semibold text-ink">{result.client.name}</span>
          <span className="text-ink-muted">
            {" "}
            · {result.client.clientId} · Tax year {result.client.taxYear} · Filing status: {result.client.filingStatus.replaceAll("_", " ")} ·{" "}
            {result.usedDocumentCount} of {result.documentCount} documents used as evidence
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onPrint}
            className="rounded-lg bg-white px-3.5 py-2 text-xs font-semibold text-ink ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
          >
            Print / Save as PDF
          </button>
          <button
            type="button"
            onClick={exportReport}
            className="rounded-lg bg-ink px-3.5 py-2 text-xs font-semibold text-white hover:bg-ink-soft"
          >
            Export review report (JSON)
          </button>
        </div>
      </Card>

      <p className={`rounded-lg px-3 py-2 text-xs ${result.ai.used ? "bg-violet-50 text-violet-900" : "bg-slate-100 text-ink-soft"}`}>
        <span className="font-medium">Follow-up wording:</span> {result.ai.note}
      </p>

      <Exclusions result={result} />

      {result.findings.length === 0 ? (
        <Card className="border-emerald-200 p-6">
          <h2 className="text-base font-semibold text-emerald-800">No discrepancies found</h2>
          <p className="mt-1 text-sm text-ink-soft">
            All {result.checks.length} checks completed. Questionnaire amounts match the supporting documents to the cent, every document matched the
            intake tax year, and no intake answers were missing or contradictory. A preparer should still perform their normal review.
          </p>
          <ul className="mt-3 grid gap-1 text-xs text-ink-soft sm:grid-cols-2">
            {result.checks.map((c) => (
              <li key={c.ruleId}>✓ {c.name}</li>
            ))}
          </ul>
        </Card>
      ) : (
        <div>
          <SectionTitle
            aside={
              <label className="flex items-center gap-2 text-xs text-ink-soft">
                <input type="checkbox" checked={hideReviewed} onChange={(e) => setHideReviewed(e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300" />
                Hide reviewed
              </label>
            }
          >
            Findings
          </SectionTitle>
          <p className="-mt-1 mb-3 text-xs text-ink-muted">{REVIEW_STATUS_DEFINITION}</p>

          <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter by issue type">
            <FilterChip active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>
              All types ({result.findings.length})
            </FilterChip>
            {typeCounts.map(([type, n]) => (
              <FilterChip key={type} active={typeFilter === type} onClick={() => setTypeFilter(type)}>
                {ISSUE_TYPE_LABELS[type]} ({n})
              </FilterChip>
            ))}
          </div>

          <div className="space-y-6">
            {SEVERITIES.map((sev) => {
              const group = visible.filter((f) => f.severity === sev);
              if (group.length === 0) return null;
              return (
                <section key={sev} aria-label={`${SEVERITY_STYLES[sev].label} severity`}>
                  <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    <span className={`h-2 w-2 rounded-full ${SEVERITY_STYLES[sev].dot}`} aria-hidden />
                    {SEVERITY_STYLES[sev].label} severity · {group.length}
                  </h3>
                  <div className="space-y-3">
                    {group.map((f) => (
                      <FindingCard key={f.id} finding={f} reviewedAt={review[f.id]?.reviewedAt} onToggleReviewed={() => onToggleReviewed(f.id)} />
                    ))}
                  </div>
                </section>
              );
            })}
            {visible.length === 0 && <p className="text-sm text-ink-muted">No findings match the current filter.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
        active ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-ink-soft ring-slate-300 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

