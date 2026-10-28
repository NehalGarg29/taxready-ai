import { DISCLAIMER } from "@/lib/report";
import { AUDIT_RULES } from "@/lib/rules";
import { Card } from "./ui";

export function Methodology() {
  return (
    <section id="methodology" className="scroll-mt-6 space-y-4">
      <h2 className="text-lg font-semibold text-ink">About / Methodology</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5 text-sm leading-relaxed text-ink-soft">
          <h3 className="font-semibold text-ink">Pipeline</h3>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5">
            <li>
              <span className="font-medium text-ink">Validate input.</span> Malformed JSON, invalid amounts, duplicate document IDs, impossible tax years and
              missing identifiers block the audit. Nothing is guessed or coerced.
            </li>
            <li>
              <span className="font-medium text-ink">Decide which documents count.</span> Documents for another tax year or of an unsupported type are excluded
              from all totals, and each exclusion is reported with the comparisons it affects.
            </li>
            <li>
              <span className="font-medium text-ink">Run deterministic rules.</span> All amounts are integer cents; documents of the same type are summed before
              comparison. Unanswered questions become review findings rather than blocking.
            </li>
            <li>
              <span className="font-medium text-ink">Generate follow-up questions</span> from fixed templates. Optionally, Claude may reword them. Pattern checks
              discard rewrites that add or change amounts, numbers, date words or document references, or that use a fixed list of risky terms. These checks
              cannot confirm meaning, so the template is always kept and a preparer must approve any AI wording before it is sent.
            </li>
            <li>
              <span className="font-medium text-ink">Human review.</span> A preparer marks findings reviewed and exports the report.
            </li>
          </ol>
          <p className="mt-3">
            Financial comparisons are deterministic so every number is reproducible and traceable to a source field or document. AI is limited to wording,
            where a mistake is visible and harmless, and never to arithmetic or evidence.
          </p>
        </Card>
        <Card className="p-5 text-sm text-ink-soft">
          <h3 className="font-semibold text-ink">Checks performed</h3>
          <ul className="mt-2 space-y-2">
            {AUDIT_RULES.map((r) => (
              <li key={r.id}>
                <span className="font-medium text-ink">{r.name}</span>
                <span className="block text-xs leading-relaxed">{r.description}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card className="border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900">
        <span className="font-semibold">Limitations.</span> {DISCLAIMER} Supported forms are limited to W-2 (Box 1), 1099-INT (Box 1) and 1099-NEC (Box 1); amounts
        are taken from structured input, not extracted from PDFs. A missing form is flagged as a possible gap — forms are not issued in every situation.
      </Card>
    </section>
  );
}
