import type { AuditResult } from "@/lib/types";
import { Card } from "./ui";

type Props = { result: AuditResult | null; needingReview: number };

export function SummaryCards({ result, needingReview }: Props) {
  const completed = result?.status === "completed" ? result : null;

  const status =
    result === null
      ? { text: "Not run", tone: "text-ink-muted", sub: "Select a case and run the audit" }
      : result.status === "invalid"
        ? { text: "Invalid input", tone: "text-red-700", sub: `${result.errors.length} blocking input error${result.errors.length === 1 ? "" : "s"}; audit not run` }
        : { text: "Valid input", tone: "text-emerald-700", sub: "Input accepted; audit completed (not a filing check)" };

  const cards = [
    { label: "Checks completed", value: completed ? String(completed.checks.length) : "—", sub: completed ? "Deterministic rules run" : "No audit results" },
    {
      label: "Issues identified",
      value: completed ? String(completed.findings.length) : "—",
      sub: completed ? `${completed.findings.filter((f) => f.severity === "high").length} high severity` : "No audit results",
    },
    {
      label: "Items needing review",
      value: completed ? String(needingReview) : "—",
      sub: completed ? `${completed.findings.length - needingReview} marked reviewed` : "No audit results",
    },
    { label: "Validation status", value: status.text, sub: status.sub, tone: status.tone },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label} className="p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">{c.label}</div>
          <div className={`mt-1 text-2xl font-semibold ${c.tone ?? "text-ink"}`}>{c.value}</div>
          <div className="mt-0.5 text-xs text-ink-muted">{c.sub}</div>
        </Card>
      ))}
    </div>
  );
}
