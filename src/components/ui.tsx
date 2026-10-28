import type { Severity } from "@/lib/types";

export const SEVERITY_STYLES: Record<Severity, { label: string; badge: string; bar: string; dot: string }> = {
  high: { label: "High", badge: "bg-red-50 text-red-700 ring-red-200", bar: "bg-red-500", dot: "bg-red-500" },
  medium: { label: "Medium", badge: "bg-amber-50 text-amber-800 ring-amber-200", bar: "bg-amber-400", dot: "bg-amber-400" },
  low: { label: "Low", badge: "bg-slate-100 text-slate-700 ring-slate-200", bar: "bg-slate-400", dot: "bg-slate-400" },
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEVERITY_STYLES[severity];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${s.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <h2 className="text-base font-semibold text-ink">{children}</h2>
      {aside}
    </div>
  );
}
