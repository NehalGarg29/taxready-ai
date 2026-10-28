import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PrintReport } from "@/components/PrintReport";
import { runAudit } from "@/lib/audit";
import { formatCents } from "@/lib/money";
import { buildReviewReport } from "@/lib/report";
import { jamieRivera, jordanLee } from "@/data/samples";

function completed(input: unknown) {
  const r = runAudit(input);
  if (r.status !== "completed") throw new Error("expected completed");
  return r;
}

/** Strips tags so assertions read like the printed page. */
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("print / PDF report", () => {
  const result = completed(jordanLee);
  const reviewedId = result.findings[0].id;
  const report = buildReviewReport(result, { [reviewedId]: { reviewedAt: "2026-02-01T10:00:00.000Z" } });
  const html = renderToStaticMarkup(<PrintReport report={report} />);
  const page = text(html);

  it("lists every finding from the export, in the same order, regardless of on-screen filters", () => {
    const ids = [...html.matchAll(/data-finding-id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(report.findings.map((f) => f.id));
  });

  it("shows the same amounts and evidence as the JSON export", () => {
    for (const f of report.findings) {
      if (f.differenceCents !== undefined) expect(page).toContain(formatCents(f.differenceCents));
      if (f.expected?.amountCents !== undefined) expect(page).toContain(formatCents(f.expected.amountCents));
      for (const s of f.sources) if (s.kind === "document") expect(page).toContain(s.documentId);
      expect(page).toContain(f.followUp.question);
    }
    for (const e of report.exclusions) expect(page).toContain(e.documentId);
  });

  it("prints review status in words and the meaning of 'reviewed'", () => {
    const statuses = [...page.matchAll(/Status: (Reviewed|Open)/g)].map((m) => m[1]);
    expect(statuses).toEqual(report.findings.map((f) => (f.reviewStatus === "reviewed" ? "Reviewed" : "Open")));
    expect(page).toContain(`Reviewed: ${report.summary.reviewed} · Still open: ${report.summary.needingReview}`);
    expect(page).toContain("does not mean the issue is resolved");
    expect(page).toContain(report.disclaimer);
  });

  it("is hidden on screen and shown only when printing", () => {
    expect(html).toMatch(/class="print-report hidden [^"]*print:block/);
  });

  it("handles a clean intake with no findings", () => {
    const clean = renderToStaticMarkup(<PrintReport report={buildReviewReport(completed(jamieRivera), {})} />);
    expect(text(clean)).toContain("Findings (0)");
    expect(text(clean)).toContain("No discrepancies found");
  });
});
