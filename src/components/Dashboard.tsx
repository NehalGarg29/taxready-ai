"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { SAMPLE_CASES } from "@/data/samples";
import { buildReviewReport, type ReviewState } from "@/lib/report";
import type { AuditResult } from "@/lib/types";
import { InputPanel } from "./InputPanel";
import { Methodology } from "./Methodology";
import { PrintReport } from "./PrintReport";
import { AuditResults, ValidationErrors } from "./Results";
import { Sidebar } from "./Sidebar";
import { SummaryCards } from "./SummaryCards";
import { Card } from "./ui";

export function Dashboard() {
  const [sampleId, setSampleId] = useState(SAMPLE_CASES[0].id);
  const [text, setText] = useState(SAMPLE_CASES[0].json);
  const [sourceLabel, setSourceLabel] = useState("Sample case");
  const [result, setResult] = useState<AuditResult | null>(null);
  const [review, setReview] = useState<ReviewState>({});
  const [running, setRunning] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [useAi, setUseAi] = useState(false);
  const [printedAt, setPrintedAt] = useState<Date | null>(null);
  /** Incremented on every run or input change, so a slow response for an older input is ignored. */
  const requestSeq = useRef(0);

  useEffect(() => {
    fetch("/api/ai-status")
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((d: { available?: boolean }) => setAiAvailable(Boolean(d.available)))
      .catch(() => setAiAvailable(false));
  }, []);

  function resetResults() {
    requestSeq.current += 1; // invalidate any in-flight audit for the previous input
    setRunning(false);
    setResult(null);
    setReview({});
    setRequestError(null);
  }

  function selectSample(id: string) {
    const s = SAMPLE_CASES.find((c) => c.id === id);
    if (!s) return;
    setSampleId(id);
    setText(s.json);
    setSourceLabel("Sample case");
    resetResults();
  }

  function changeText(next: string, label: string) {
    setText(next);
    setSourceLabel(label);
    setSampleId("");
    resetResults();
  }

  async function run() {
    const seq = ++requestSeq.current;
    setRunning(true);
    setRequestError(null);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: text, useAi: useAi && aiAvailable }),
      });
      const data = await res.json();
      if (seq !== requestSeq.current) return; // input changed while waiting; this result is stale
      if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
      setResult(data as AuditResult);
      setReview({});
    } catch (e) {
      if (seq !== requestSeq.current) return;
      setResult(null);
      setRequestError((e as Error).message);
    } finally {
      if (seq === requestSeq.current) setRunning(false);
    }
  }

  function toggleReviewed(id: string) {
    setReview((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = { reviewedAt: new Date().toISOString() };
      return next;
    });
  }

  /** Stamps the print time, renders the print-only report, then opens the browser's print dialog. */
  function printReport() {
    flushSync(() => setPrintedAt(new Date()));
    window.print();
  }

  const needingReview = result?.status === "completed" ? result.findings.filter((f) => !review[f.id]).length : 0;

  return (
    <>
      <div className="min-h-screen print:hidden">
        <Sidebar />
        <main className="px-4 py-6 sm:px-6 lg:ml-60 lg:px-10 lg:py-8">
          <div className="mx-auto max-w-6xl space-y-6">
            <header id="audit" className="scroll-mt-6">
              <h1 className="text-2xl font-semibold tracking-tight text-ink">Tax Document Intake Auditor</h1>
              <p className="mt-1 max-w-3xl text-sm text-ink-soft">
                Checks a client&apos;s intake questionnaire against their W-2 and 1099 documents, flags missing and inconsistent information with source
                evidence, and drafts follow-up questions for preparer review.
              </p>
            </header>

            <InputPanel
              sampleId={sampleId}
              text={text}
              running={running}
              aiAvailable={aiAvailable}
              useAi={useAi}
              onSelectSample={selectSample}
              onTextChange={changeText}
              onToggleAi={setUseAi}
              onRun={run}
              sourceLabel={sourceLabel}
            />

            <SummaryCards result={result} needingReview={needingReview} />

            {requestError && (
              <Card className="border-red-200 p-4 text-sm text-red-800">
                The audit request failed: {requestError}. No results are shown.
              </Card>
            )}

            {result?.status === "invalid" && <ValidationErrors result={result} />}
            {result?.status === "completed" && <AuditResults result={result} review={review} onToggleReviewed={toggleReviewed} onPrint={printReport} />}
            {result === null && !requestError && (
              <Card className="p-6 text-center text-sm text-ink-muted">Run the audit to see findings, evidence and follow-up questions.</Card>
            )}

            <div className="pt-6">
              <Methodology />
            </div>
          </div>
        </main>
      </div>
      {result?.status === "completed" && <PrintReport report={buildReviewReport(result, review, printedAt ?? new Date())} />}
    </>
  );
}
