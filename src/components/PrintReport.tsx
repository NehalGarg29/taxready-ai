import { formatCents } from "@/lib/money";
import type { buildReviewReport } from "@/lib/report";
import { ISSUE_TYPE_LABELS, type ComparedValue, type Severity, type SourceReference } from "@/lib/types";

type Report = ReturnType<typeof buildReviewReport>;

const SEVERITY_LABEL: Record<Severity, string> = { high: "High", medium: "Medium", low: "Low" };

function valueText(v: ComparedValue) {
  return v.amountCents !== undefined ? formatCents(v.amountCents) : (v.text ?? "—");
}

function sourceText(s: SourceReference) {
  if (s.kind === "document") {
    return {
      label: `${s.documentId} · ${s.documentType} · TY ${s.taxYear} — ${s.label}${s.sourceFile ? ` (${s.sourceFile})` : ""}`,
      value: formatCents(s.amountCents),
    };
  }
  const value = s.kind === "questionnaire" && s.amountCents !== undefined ? formatCents(s.amountCents) : (s.value ?? "");
  return { label: `${s.label} [${s.field}]`, value };
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString();
}

/**
 * Printable review report (browser "Print / Save as PDF").
 * Rendered from the same object as the JSON export, so amounts, evidence and review
 * status are identical in both formats. Always lists every finding, ignoring on-screen filters.
 * Hidden on screen; shown only when printing.
 */
export function PrintReport({ report }: { report: Report }) {
  const s = report.summary;
  return (
    <div className="print-report hidden text-[11px] leading-snug text-black print:block">
      <header className="border-b-2 border-black pb-2">
        <div className="text-[10px] uppercase tracking-wide">TaxReady AI · Intake audit review report</div>
        <h1 className="mt-0.5 text-lg font-bold">
          {report.client.name} — Tax year {report.client.taxYear}
        </h1>
        <div>
          Client ID {report.client.clientId} · Filing status: {report.client.filingStatus.replaceAll("_", " ")} · Audited {formatTime(report.auditedAt)} · Printed{" "}
          {formatTime(report.exportedAt)}
        </div>
      </header>

      <section className="mt-3">
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <td className="border border-black px-2 py-1">Checks completed: <b>{s.checksCompleted}</b></td>
              <td className="border border-black px-2 py-1">
                Issues identified: <b>{s.issuesIdentified}</b> (High {s.bySeverity.high} · Medium {s.bySeverity.medium} · Low {s.bySeverity.low})
              </td>
              <td className="border border-black px-2 py-1">
                Reviewed: <b>{s.reviewed}</b> · Still open: <b>{s.needingReview}</b>
              </td>
              <td className="border border-black px-2 py-1">
                Documents used as evidence: <b>{s.documentsUsedAsEvidence}</b> of {s.documentsReceived}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-1.5 italic">{report.reviewStatusDefinition}</p>
        <p className="mt-0.5">Follow-up wording: {report.followUpWording.note}</p>
      </section>

      {report.exclusions.length > 0 && (
        <section className="mt-4 break-inside-avoid">
          <h2 className="text-sm font-bold">Documents excluded from evidence</h2>
          <table className="mt-1 w-full border-collapse">
            <thead>
              <tr>
                <th className="border border-black px-2 py-1 text-left">Document</th>
                <th className="border border-black px-2 py-1 text-left">Reason</th>
                <th className="border border-black px-2 py-1 text-left">Comparisons affected</th>
              </tr>
            </thead>
            <tbody>
              {report.exclusions.map((e) => (
                <tr key={e.documentId}>
                  <td className="border border-black px-2 py-1 align-top">
                    {e.documentId} · {e.documentType} · TY {e.taxYear}
                    {e.sourceFile ? ` · ${e.sourceFile}` : ""}
                  </td>
                  <td className="border border-black px-2 py-1 align-top">{e.explanation}</td>
                  <td className="border border-black px-2 py-1 align-top">
                    {e.affectedComparisons.length ? e.affectedComparisons.join("; ") : "None mappable — reviewed manually"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="mt-4">
        <h2 className="text-sm font-bold">Findings ({report.findings.length})</h2>
        {report.findings.length === 0 && (
          <p className="mt-1">No discrepancies found. All checks completed; a preparer should still perform their normal review.</p>
        )}
        <ol className="mt-1 space-y-3">
          {report.findings.map((f, i) => (
            <li key={f.id} className="break-inside-avoid border border-black p-2" data-finding-id={f.id}>
              <div className="flex justify-between gap-3">
                <div className="font-bold">
                  {i + 1}. [{SEVERITY_LABEL[f.severity]}] {f.title}
                </div>
                <div className="shrink-0 whitespace-nowrap">
                  Status: <b>{f.reviewStatus === "reviewed" ? "Reviewed" : "Open"}</b>
                  {f.reviewedAt ? ` (${formatTime(f.reviewedAt)})` : ""}
                </div>
              </div>
              <div className="text-[10px]">
                {ISSUE_TYPE_LABELS[f.issueType]} · {f.id}
              </div>
              <p className="mt-1">{f.description}</p>

              {(f.expected || f.actual || f.differenceCents !== undefined) && (
                <p className="mt-1">
                  {f.expected && (
                    <span className="mr-4">
                      {f.expected.label}: <b>{valueText(f.expected)}</b>
                    </span>
                  )}
                  {f.actual && (
                    <span className="mr-4">
                      {f.actual.label}: <b>{valueText(f.actual)}</b>
                    </span>
                  )}
                  {f.differenceCents !== undefined && (
                    <span>
                      Difference (documents − reported): <b>{formatCents(f.differenceCents)}</b>
                    </span>
                  )}
                </p>
              )}

              <div className="mt-1 font-semibold">Source evidence</div>
              <table className="w-full border-collapse">
                <tbody>
                  {f.sources.map((src, j) => {
                    const t = sourceText(src);
                    return (
                      <tr key={j}>
                        <td className="border-t border-gray-400 py-0.5 pr-2">{t.label}</td>
                        <td className="whitespace-nowrap border-t border-gray-400 py-0.5 text-right font-mono">{t.value}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="mt-1.5 font-semibold">
                Suggested client follow-up ({f.followUp.source === "ai" ? "AI-reworded — needs preparer approval" : "template"})
              </div>
              <p>{f.followUp.question}</p>
              {f.followUp.source === "ai" && <p className="mt-0.5 text-[10px]">Template wording: {f.followUp.templateQuestion}</p>}
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-4 break-inside-avoid">
        <h2 className="text-sm font-bold">Checks performed</h2>
        <p>{report.checks.map((c) => `${c.name} (${c.findingCount})`).join(" · ")}</p>
      </section>

      <footer className="mt-4 border-t border-black pt-1.5 text-[10px]">{report.disclaimer}</footer>
    </div>
  );
}
