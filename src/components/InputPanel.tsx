"use client";

import { useRef, useState } from "react";
import { SAMPLE_CASES } from "@/data/samples";
import { Card } from "./ui";

type Props = {
  sampleId: string;
  text: string;
  running: boolean;
  aiAvailable: boolean;
  useAi: boolean;
  onSelectSample: (id: string) => void;
  onTextChange: (text: string, sourceLabel: string) => void;
  onToggleAi: (v: boolean) => void;
  onRun: () => void;
  sourceLabel: string;
};

const MAX_UPLOAD_BYTES = 256 * 1024;

export function InputPanel(p: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const sample = SAMPLE_CASES.find((s) => s.id === p.sampleId);

  async function handleFile(file: File | undefined) {
    setUploadError(null);
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError("File is larger than 256 KB.");
      return;
    }
    const text = await file.text();
    p.onTextChange(text, `Uploaded file: ${file.name}`);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <Card className="p-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-4">
          <div>
            <label htmlFor="sample" className="block text-sm font-medium text-ink">
              Synthetic client case
            </label>
            <select
              id="sample"
              value={p.sampleId}
              onChange={(e) => p.onSelectSample(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              {p.sampleId === "" && <option value="">Custom input</option>}
              {SAMPLE_CASES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            {sample ? (
              <div className="mt-3 space-y-1.5 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-ink-soft">
                <p>{sample.summary}</p>
                <p>
                  <span className="font-medium text-ink">Expected:</span> {sample.expectedOutcome}
                </p>
              </div>
            ) : null}
          </div>

          <div>
            <span className="block text-sm font-medium text-ink">Or upload a JSON intake package</span>
            <label
              className="mt-1.5 flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-ink-soft hover:border-brand-500 hover:bg-brand-50"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void handleFile(e.dataTransfer.files[0]);
              }}
            >
              <input ref={fileRef} type="file" accept=".json,application/json" className="sr-only" onChange={(e) => void handleFile(e.target.files?.[0])} />
              Choose a .json file or drop it here
            </label>
            {uploadError && <p className="mt-1.5 text-xs text-red-700">{uploadError}</p>}
          </div>

          <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 p-3">
            <input
              id="use-ai"
              type="checkbox"
              checked={p.useAi && p.aiAvailable}
              disabled={!p.aiAvailable}
              onChange={(e) => p.onToggleAi(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 disabled:opacity-40"
            />
            <label htmlFor="use-ai" className="text-xs leading-relaxed text-ink-soft">
              <span className="font-medium text-ink">Reword follow-up questions with Claude</span>
              <br />
              {p.aiAvailable
                ? "Optional. Only the question wording changes; amounts and evidence come from the deterministic audit."
                : "Unavailable: no ANTHROPIC_API_KEY on the server. Template questions will be used."}
            </label>
          </div>

          <button
            type="button"
            onClick={p.onRun}
            disabled={p.running || p.text.trim() === ""}
            className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {p.running ? "Running audit…" : "Run Intake Audit"}
          </button>
        </div>

        <div className="flex min-w-0 flex-col">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="package" className="text-sm font-medium text-ink">
              Intake package (JSON)
            </label>
            <span className="truncate text-xs text-ink-muted">{p.sourceLabel}</span>
          </div>
          <textarea
            id="package"
            value={p.text}
            onChange={(e) => p.onTextChange(e.target.value, "Edited input")}
            spellCheck={false}
            className="mt-1.5 min-h-[320px] flex-1 resize-y rounded-lg border border-slate-300 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <p className="mt-1.5 text-xs text-ink-muted">Editable — change any value and re-run to see the audit respond.</p>
        </div>
      </div>
    </Card>
  );
}
