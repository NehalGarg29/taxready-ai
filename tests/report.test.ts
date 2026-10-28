import { describe, expect, it } from "vitest";
import { runAudit } from "@/lib/audit";
import { buildReviewReport, REVIEW_STATUS_DEFINITION } from "@/lib/report";
import { alexMorgan, jordanLee } from "@/data/samples";

function completed(input: unknown) {
  const r = runAudit(input, new Date("2026-02-01T00:00:00Z"));
  if (r.status !== "completed") throw new Error("expected completed");
  return r;
}

describe("review report export", () => {
  it("records review status per finding and summary counts", () => {
    const r = completed(alexMorgan);
    const report = buildReviewReport(r, { "income-reconciliation:wages": { reviewedAt: "2026-02-01T10:00:00.000Z" } }, new Date("2026-02-02T00:00:00Z"));
    expect(report.summary).toMatchObject({ checksCompleted: 7, issuesIdentified: 2, reviewed: 1, needingReview: 1 });
    expect(report.findings.map((f) => [f.id, f.reviewStatus, f.reviewedAt])).toEqual([
      ["income-reconciliation:wages", "reviewed", "2026-02-01T10:00:00.000Z"],
      ["missing-document:interest", "open", null],
    ]);
    expect(report.findings[0].differenceCents).toBe(700_000);
    expect(report.amountUnits).toMatch(/cents/);
    expect(report.disclaimer).toMatch(/not confirmed errors/);
  });

  it("states that 'reviewed' is not 'resolved' or 'ready to file', and has no resolution state", () => {
    const r = completed(jordanLee);
    const all = Object.fromEntries(r.findings.map((f) => [f.id, { reviewedAt: "2026-02-01T10:00:00.000Z" }]));
    const report = buildReviewReport(r, all);
    expect(report.reviewStatusDefinition).toBe(REVIEW_STATUS_DEFINITION);
    expect(REVIEW_STATUS_DEFINITION).toMatch(/does not mean the issue is resolved/);
    expect(REVIEW_STATUS_DEFINITION).toMatch(/ready to file/);
    expect(new Set(report.findings.map((f) => f.reviewStatus))).toEqual(new Set(["reviewed"]));
    // Even with every finding reviewed, nothing in the export claims resolution or filing readiness.
    const json = JSON.stringify({ ...report, reviewStatusDefinition: undefined });
    expect(json).not.toMatch(/"resolved"|readyToFile|"ready"/i);
    expect(report.summary.needingReview).toBe(0);
    expect(report.summary.issuesIdentified).toBe(3);
  });

  it("ignores review entries for finding IDs that are not in the result", () => {
    const r = completed(alexMorgan);
    const report = buildReviewReport(r, { "not-a-finding": { reviewedAt: "2026-02-01T10:00:00.000Z" } });
    expect(report.findings.every((f) => f.reviewStatus === "open")).toBe(true);
    expect(report.summary.reviewed).toBe(0);
  });

  it("exports both the shown follow-up wording and the deterministic template", () => {
    const report = buildReviewReport(completed(alexMorgan), {});
    for (const f of report.findings) {
      expect(f.followUp.templateQuestion).toBe(f.followUp.question);
      expect(f.followUp.source).toBe("template");
    }
  });
});
