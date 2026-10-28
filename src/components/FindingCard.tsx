import { formatCents } from "@/lib/money";
import { ISSUE_TYPE_LABELS, type ComparedValue, type Finding, type SourceReference } from "@/lib/types";
import { SEVERITY_STYLES, SeverityBadge } from "./ui";

function valueText(v: ComparedValue) {
  return v.amountCents !== undefined ? formatCents(v.amountCents) : (v.text ?? "—");
}

function SourceRow({ s }: { s: SourceReference }) {
  if (s.kind === "document") {
    return (
      <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5">
        <span className="min-w-0">
          <span className="font-medium text-ink">{s.documentId}</span>
          <span className="text-ink-muted"> · {s.documentType} · TY {s.taxYear}</span>
          <span className="block text-ink-muted">
            {s.label}
            {s.sourceFile ? ` — ${s.sourceFile}` : " — no source file given"}
          </span>
        </span>
        <span className="font-mono text-ink">{formatCents(s.amountCents)}</span>
      </li>
    );
  }
  const value = s.kind === "questionnaire" && s.amountCents !== undefined ? formatCents(s.amountCents) : s.value;
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5">
      <span className="min-w-0">
        <span className="text-ink">{s.label}</span>
        <span className="block font-mono text-[11px] text-ink-muted">{s.field}</span>
      </span>
      <span className="font-mono text-ink">{value}</span>
    </li>
  );
}

type Props = { finding: Finding; reviewedAt?: string; onToggleReviewed: () => void };

export function FindingCard({ finding: f, reviewedAt, onToggleReviewed }: Props) {
  const reviewed = Boolean(reviewedAt);
  return (
    <article className={`relative overflow-hidden rounded-xl border bg-white shadow-sm ${reviewed ? "border-slate-200 opacity-70" : "border-slate-200"}`}>
      <div className={`absolute inset-y-0 left-0 w-1 ${SEVERITY_STYLES[f.severity].bar}`} aria-hidden />
      <div className="p-4 pl-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={f.severity} />
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-ink-soft">{ISSUE_TYPE_LABELS[f.issueType]}</span>
              <span className="font-mono text-[11px] text-ink-muted">{f.id}</span>
            </div>
            <h3 className="text-sm font-semibold text-ink">{f.title}</h3>
          </div>
          <button
            type="button"
            onClick={onToggleReviewed}
            aria-pressed={reviewed}
            className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium ring-1 ring-inset ${
              reviewed ? "bg-emerald-50 text-emerald-800 ring-emerald-200 hover:bg-emerald-100" : "bg-white text-ink ring-slate-300 hover:bg-slate-50"
            }`}
          >
            {reviewed ? "✓ Reviewed" : "Mark as reviewed"}
          </button>
        </div>

        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{f.description}</p>

        {(f.expected || f.actual) && (
          <dl className="mt-3 grid gap-2 sm:grid-cols-3">
            {f.expected && (
              <div className="rounded-lg bg-slate-50 p-2.5">
                <dt className="text-[11px] uppercase tracking-wide text-ink-muted">{f.expected.label}</dt>
                <dd className="font-mono text-sm text-ink">{valueText(f.expected)}</dd>
              </div>
            )}
            {f.actual && (
              <div className="rounded-lg bg-slate-50 p-2.5">
                <dt className="text-[11px] uppercase tracking-wide text-ink-muted">{f.actual.label}</dt>
                <dd className="font-mono text-sm text-ink">{valueText(f.actual)}</dd>
              </div>
            )}
            {f.differenceCents !== undefined && (
              <div className="rounded-lg bg-slate-50 p-2.5">
                <dt className="text-[11px] uppercase tracking-wide text-ink-muted">Difference (documents − reported)</dt>
                <dd className="font-mono text-sm font-semibold text-ink">{formatCents(f.differenceCents)}</dd>
              </div>
            )}
          </dl>
        )}

        <div className="mt-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Source evidence</div>
          <ul className="mt-1 divide-y divide-slate-100 text-xs">
            {f.sources.map((s, i) => (
              <SourceRow key={i} s={s} />
            ))}
          </ul>
        </div>

        <div className="mt-3 rounded-lg border border-brand-100 bg-brand-50 p-3">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-brand-700">
            Suggested client follow-up
            <span className={`rounded px-1.5 py-0.5 normal-case tracking-normal ${f.followUp.source === "ai" ? "bg-violet-100 text-violet-800" : "bg-white text-ink-soft"}`}>
              {f.followUp.source === "ai" ? "AI-reworded (Claude)" : "Template"}
            </span>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-ink">{f.followUp.question}</p>
          {f.followUp.source === "ai" && (
            <div className="mt-2 border-t border-brand-100 pt-2 text-xs leading-relaxed text-ink-soft">
              <p>
                <span className="font-medium text-ink">Template wording:</span> {f.followUp.templateQuestion}
              </p>
              <p className="mt-1 text-amber-800">
                Automated checks confirm no amounts, dates or document references were added or changed, but cannot confirm the meaning is
                accurate. Compare with the template and approve before sending.
              </p>
            </div>
          )}
        </div>

        {reviewedAt && <p className="mt-2 text-[11px] text-ink-muted">Reviewed {new Date(reviewedAt).toLocaleString()}</p>}
      </div>
    </article>
  );
}
