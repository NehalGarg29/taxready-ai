# TaxReady AI — Intelligent Tax Document Intake Auditor

A working prototype for the MiraFlores AI — AI Engineer (Tax) case study.

> TaxReady AI is an **intake-quality** tool. It does **not** prepare, calculate or file tax returns. Its findings are discrepancies for a professional to review, not confirmed errors or legal conclusions. All data in this project is synthetic.

---

## 1. Project overview and problem

Tax preparers receive intake questionnaires and supporting documents that don't agree. A client might:
- report $85,000 in wages while their W-2 shows $92,000;
- mention interest income but send no 1099-INT;
- send last year's form.

Finding these by hand takes review time and causes repeated rounds of client follow-up.

TaxReady AI checks a structured intake package automatically:
1. It compares the client's **questionnaire** answers with their **supporting documents** (W-2, 1099-INT, 1099-NEC).
2. It flags missing, inconsistent and contradictory information, linking each finding to the exact field or document it came from.
3. It drafts a follow-up question for the client.

The preparer stays in control throughout: they review each finding and export or print the result.

## 2. Core features and technology stack

### Features

| Area | What works |
|---|---|
| Input | Choose one of six built-in synthetic cases, upload a `.json` file, or edit the JSON directly in the browser |
| Validation | Zod schemas plus a strict money parser. Input that can't be safely interpreted is **blocked**, with errors that name the field path |
| Audit | Seven independent, deterministic rules, all using integer-cent arithmetic |
| Evidence | Each finding links to the questionnaire fields and documents it came from: document ID, form, tax year, source file and amount |
| Exclusions | Wrong-year and unsupported documents are never used as evidence. Each exclusion is reported with its reason and the comparisons it affected |
| Follow-ups | A deterministic question template for every finding |
| Optional AI | Claude can reword follow-up questions on the server. The template is always kept, and a preparer must approve AI wording before sending it (see §9) |
| Review | Mark or unmark findings as reviewed, filter by issue type, hide reviewed findings |
| Export | Download a JSON review report, or use **Print / Save as PDF** for a readable report built from the same data |
| UI | Responsive dashboard: summary cards, findings grouped by severity, methodology and limitations |

### Technology stack

- **Next.js 15** (App Router), **React 19**, **TypeScript** (strict mode)
- **Tailwind CSS 3**
- **Zod 3** for input validation and for validating the AI model's output
- **Vitest 3** for tests
- No database, no authentication and no Anthropic SDK. The optional AI call uses plain `fetch` on the server.

## 3. Architecture and workflow

```
Browser (Dashboard)                      Server (Next.js route handlers)
───────────────────                      ────────────────────────────────
sample / upload / edit ── raw text ──▶  POST /api/audit
                                           1. runAudit(text)              src/lib/audit.ts
                                              ├─ JSON.parse               → "invalid" + errors
                                              ├─ Zod schema + money parse → "invalid" + errors
                                              ├─ total-size check         → "invalid" + errors
                                              ├─ computeExclusions        (wrong year / unsupported type)
                                              ├─ 7 rules, pure functions  src/lib/rules/*
                                              └─ findings deep-frozen
                                           2. if useAi && completed:
                                              applyAiFollowUps()          src/lib/ai.ts (optional)
                                              └─ copies findings; only follow-up wording can change
                 ◀── AuditResult JSON ──
review state (browser) ─▶ buildReviewReport() ─▶ JSON download       src/lib/report.ts
                                            └──▶ print / PDF view     src/components/PrintReport.tsx
                                         GET /api/ai-status → { available: boolean }   (never exposes the key)
```

### Code layout

```
src/
  app/                 page, layout, API routes (audit, ai-status)
  components/          Dashboard, InputPanel, SummaryCards, Results, FindingCard,
                       PrintReport, Methodology, Sidebar, ui
  lib/
    money.ts           decimal string → integer cents; overflow-safe sums; formatting
    schemas.ts         Zod schemas: what blocks vs. what is optional
    types.ts           Finding, SourceReference, DocumentExclusion, AuditResult
    rules/             shared context (exclusions, per-category totals) + one function per rule
    followups.ts       deterministic question templates
    audit.ts           orchestration
    ai.ts              optional Claude rewording + output checks
    report.ts          export builder, review-status definition, disclaimer
  data/samples.ts      synthetic cases (also saved as /samples/*.json)
tests/                 Vitest suites
```

### Audit rules

| Rule | Issue type | Severity |
|---|---|---|
| Document tax-year check | `tax_year_mismatch` | High. The document is excluded from totals |
| Supported document type check | `unsupported_document_type` | Medium. The document is excluded |
| Supporting document presence | `missing_supporting_document` | High for W-2, medium for 1099s. Always worded as a *possible* gap |
| Income reconciliation | `income_discrepancy` | By difference: ≥ $1,000 high, ≥ $100 medium, otherwise low |
| Documents reflected in questionnaire | `undisclosed_income_source` | High (medium under $100) |
| Questionnaire internal consistency | `questionnaire_inconsistency` | Medium |
| Intake completeness | `incomplete_intake` | Low (medium when the gap prevents a comparison) |

Each income category has up to three intake signals: the reported amount, a yes/no indicator, and whether the category appears in `client.reportedIncomeSources`. A category counts as **claimed** if any answered signal says yes. Unanswered signals are treated as *unknown*, never as "no" or $0.

### What blocks the audit vs. what becomes a finding

**Blocks the audit.** The status is `invalid` and no findings, totals or questions are produced:
- malformed or empty JSON, or a root value that isn't an object;
- an invalid amount anywhere, such as `"71,500.00"`, `"12OO.00"`, `-5`, or `450.1` sent as a number;
- an amount above $999,999,999,999.99, or a per-form total too large to compute exactly in integer cents;
- duplicate document IDs;
- a missing client ID, name or tax year;
- a document missing its ID, type, tax year or amount;
- a tax year that isn't an integer, is before 2000, or is in the future.

**Becomes a review finding.** The audit still completes:
- unanswered questionnaire amounts or indicators (`null` or absent);
- missing filing status;
- a missing questionnaire object, a missing `documents` key, or `documents: []`;
- a document for another tax year (excluded and reported);
- an unsupported document type (excluded and reported).

### Input format

```jsonc
{
  "client": {
    "clientId": "CL-1001",            // required
    "name": "Alex Morgan",            // required
    "taxYear": 2025,                  // required integer
    "filingStatus": "single",         // optional
    "reportedIncomeSources": ["wages", "interest"]  // optional: wages | interest | contractor
  },
  "questionnaire": {                  // optional; each field optional
    "reportedWages": "85000.00",      // decimal string (≤ 2 decimal places) or whole-dollar integer
    "reportedInterestIncome": "450.00",
    "reportedContractorIncome": "0.00",
    "indicators": { "hadW2Employment": true, "receivedInterestIncome": true, "performedContractWork": false }
  },
  "documents": [                      // optional; [] allowed
    { "documentId": "DOC-AM-W2-01", "documentType": "W-2", "taxYear": 2025,
      "amount": "92000.00", "sourceFile": "alex_morgan_w2.pdf", "payerName": "optional" }
  ]
}
```

`amount` is Box 1 on each supported form: W-2 wages, 1099-INT interest income, 1099-NEC nonemployee compensation.

## 4. Prerequisites and installation

- **Node.js 18.18 or later** (20 or 22 recommended) and npm
- No API keys or paid services are needed

From the project folder:

```bash
npm install
```

## 5. Running the application

```bash
npm run dev
```

Open **http://localhost:3000**. If port 3000 is in use, Next.js picks another port and prints the URL.

For a production build:

```bash
npm run build
npm start
```

## 6. Tests and type-checking

```bash
npm test            # runs the Vitest suite once
npm run typecheck   # tsc --noEmit
npm run build       # production build
```

The test files are:
- `money`: parsing, formatting and overflow regressions
- `validation`: what blocks the audit and what doesn't
- `rules`: each rule on its own
- `audit`: end to end over every sample, plus determinism and immutability
- `ai`: fallback, output checks and immutability, using a mocked API
- `report`: review-status export
- `print`: the printable report matches the JSON export

## 7. Sample datasets and expected outputs

All six cases are in the case picker and in `samples/*.json` for upload testing. The outputs below are asserted by `tests/audit.test.ts`.

| Case | Input | Expected output |
|---|---|---|
| 1 — Alex Morgan | Wages reported $85,000.00; W-2 Box 1 $92,000.00; interest reported $450.00; no 1099-INT | **High**: reported and documented wages differ by $7,000.00. **Medium**: no 1099-INT for reported interest (a possible gap to confirm) |
| 2 — Jamie Rivera | Wages and interest match the W-2 and 1099-INT to the cent | Completes with no findings; all 7 checks listed |
| 3 — Sam Patel | Tax year 2031, `"71,500.00"`, `"12OO.00"`, duplicate `DOC-SP-001` | **Blocked** with 4 errors: `client.taxYear`, `questionnaire.reportedWages`, `documents[1].amount`, `documents[1].documentId` |
| 4 — Jordan Lee | Two W-2s totaling $79,500.50 (matches); 1099-NEC of $9,800.00 for 2025 and $2,200.00 for **2024**; a 1099-DIV | W-2s reconcile. **High**: 2024 1099-NEC excluded, affecting the contractor comparison. **High**: contractor income differs by $2,200.00, noting the excluded form wasn't counted. **Medium**: 1099-DIV excluded as unsupported. 3 of 5 documents used |
| 5 — Casey Nguyen | No filing status; interest and contractor questions unanswered; `documents: []` | Completes. **High**: no W-2 for $58,000.00 of reported wages. **Low** ×3: unanswered interest, unanswered contractor, missing filing status |
| 6 — Malformed JSON | Truncated JSON with a trailing comma | **Blocked**: `Malformed JSON: …` with the line and column |

## 8. Demonstration: successful and invalid-input scenarios

**Successful audit (Case 1)**
1. Start the app. Case 1 is selected by default.
2. Click **Run Intake Audit**. The summary shows 7 checks, 2 issues and **Valid input**.
3. Open the high-severity finding. It shows the questionnaire field (`questionnaire.reportedWages`, $85,000.00), the W-2 (`DOC-AM-W2-01`, $92,000.00), the $7,000.00 difference, and a template follow-up question.
4. Click **Mark as reviewed**. "Items needing review" drops from 2 to 1.
5. Click **Export review report (JSON)**, or **Print / Save as PDF**.

**Aggregation and exclusions (Case 4):** the two W-2s are summed before comparison. The excluded-documents table explains why the 2024 1099-NEC and the 1099-DIV weren't counted.

**Incomplete but valid intake (Case 5):** missing answers and an empty document list produce review findings instead of blocking the audit.

**Invalid input (Case 3, Case 6)**
1. Choose Case 3 and run the audit. The status shows **Invalid input** with 4 errors, each naming its field. No findings, totals or questions are shown.
2. Choose Case 6. The malformed JSON is rejected with the parser's line and column.
3. Edit the JSON box directly to try other inputs, for example `"85,000"` as an amount, or a second document with the same ID. Re-run to see the specific error.

## 9. Optional Claude API configuration and fallback

The app works fully without an API key. To enable AI rewording of follow-up questions:

```bash
cp .env.example .env.local
# then edit .env.local and paste your key after ANTHROPIC_API_KEY=
```

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Enables the "Reword follow-up questions with Claude" option. Read only on the server |
| `ANTHROPIC_MODEL` | Optional model override (default `claude-sonnet-5-5`) |

Restart `npm run dev` after changing `.env.local`.

**How it works**
- **Off by default.** The checkbox is disabled unless the server has a key. `/api/ai-status` reports only whether a key exists, never the key itself.
- **What is sent:** for each finding, only `findingId`, `issueType` and the template question. No client name, client ID, file names or raw intake data are sent.
- **What can change:** only `followUp.question` and its `source` label. `followUp.templateQuestion` always keeps the deterministic wording. Findings are deep-frozen after the audit, and the AI layer builds copies. Tests confirm that amounts, sources, severity and descriptions are identical before and after, and that extra fields in the model's output are ignored.
- **Output checks** (`checkRewrite` in `src/lib/ai.ts`). A rewrite is rejected, and the template kept, if it:
  - adds, drops or changes a dollar amount;
  - adds any other number, a spelled-out quantity ("seven", "thousand") or a date word (month or weekday names, "deadline");
  - adds or drops a document reference or form name;
  - uses a listed risky term that isn't in the template, such as error, penalty, IRS, owe, refund, legal, audit, confirmed, resolved or "ready to file" (matched on whole words);
  - isn't phrased as a question, or doesn't match the expected JSON shape.
- **Limits:** these checks are pattern-based and **do not guarantee semantic accuracy**. A rewrite could still soften a request or leave out a nuance and pass. So the template is shown next to any AI wording, and **a preparer must approve every AI-worded question before sending it**. The app doesn't record that approval.
- **Labeling:** each question is marked **Template** or **AI-reworded (Claude)**. A status line says how many were reworded and why any were rejected.
- **Fallback:** if there's no key, an API error, a 20-second timeout or unusable output, every question uses its template and the status line says so. The app never claims the AI ran when it didn't.

## 10. Deterministic validation and source traceability

Every number a preparer acts on has to be reproducible and traceable. For that reason:
- **Money is integer cents.** Amounts are parsed from decimal strings straight into integer cents, with no floating-point math, no rounding and no coercion of malformed values. Sums are checked for overflow and rejected rather than approximated.
- **Rules are pure functions** of the validated input, so the same input always produces the same findings. Each rule is tested on its own.
- **Every finding carries its evidence:** questionnaire field paths with their values, and document references with ID, form, tax year, source file and amount. Excluded documents still appear in the evidence, clearly labeled as excluded ("excluded, not counted" or "excluded, not evaluated").
- **Language models never compute, compare or cite numbers.** The optional AI layer runs only after the findings are fixed, and only changes question wording.

## 11. Human review workflow

1. The preparer runs the audit and works through the findings, highest severity first.
2. For each finding, they check the evidence and decide whether to send the suggested follow-up. If the AI was used, they approve or edit its wording against the template first.
3. They click **Mark as reviewed**.
4. They export the JSON report or print or save a PDF. Both list every finding with its review status and review time. The printout always includes every finding, even if a filter is active on screen.

**"Reviewed" means only that a preparer has looked at the finding.** It does not mean the issue is resolved, that the client has responded, or that the return is ready to file. The tool has no "resolved" state. This definition appears in the UI and in every export.

Review state lives in the browser. It is cleared on reload, on input changes, and when the audit is re-run. Export the report to keep it.

## 12. Implemented, mocked and deferred functionality

| Status | Scope |
|---|---|
| **Implemented, covered by automated tests** | Money parsing and overflow handling; schema validation; all 7 rules; document exclusions; orchestration; template follow-ups; JSON report builder; print report content; AI output checks, immutability and fallback (against a mocked API) |
| **Implemented, checked in the browser** (scripted headless-browser runs during development, plus local testing by the author; not part of `npm test`) | Dashboard, sample picker, upload, editing, run, severity grouping, type filter, mark reviewed, JSON download, print layout, mobile layout |
| **Implemented, partly verified** | The live Claude API call. It was verified only as far as the real API returning 401 for a fake key, which correctly triggered the fallback. A successful live rewrite has **not** been verified |
| **Mocked / synthetic** | All client data. Document amounts arrive as structured JSON, not extracted from real forms |
| **Deferred** | PDF/OCR extraction; other forms (1099-DIV/B/MISC/K, 1098, etc.); saving review history; multi-user review; authentication; recording approval of AI wording |

## 13. Known limitations and future improvements

### Known limitations

- Only Box 1 of the W-2, 1099-INT and 1099-NEC is checked. Other boxes (such as withholding) and other forms are out of scope.
- Any difference of a cent or more is flagged. Severity thresholds are illustrative, not professional standards.
- A missing form is always worded as a *possible* gap, because the tool can't know whether a form was required.
- The AI output checks are pattern-based and don't guarantee semantic accuracy (see §9).
- Review state is not saved across sessions (see §11).
- Each amount is limited to $999,999,999,999.99, and per-form totals must fit exact integer arithmetic (about $90 trillion). Larger input is rejected, not rounded.
- The audit API accepts up to about 256 KB of input.
- `npm audit` (checked October 2026) reports advisories in Zod 3 (memory use on oversized collections) and in the PostCSS copy bundled with Next.js 15 (source-map handling at build time). Fixing them requires major upgrades (Zod 4, Next 16), which were out of scope for this prototype. The input size cap limits the Zod exposure, and PostCSS only processes the app's own stylesheet. Both should be upgraded before any production use.

### Future improvements

1. Extract document data from PDFs into this schema, with per-field confidence and a human confirmation step.
2. Add more forms and boxes, such as comparing W-2 Box 2 withholding with the questionnaire.
3. Save audits and reviews with an audit trail, including who approved AI wording.
4. Send follow-up questions through a client portal and track responses.
5. Let firms configure materiality and severity thresholds.
6. Evaluate live AI rewrites, including how often each issue type's rewrites are rejected.

## 14. How AI tools were used during development

- **Claude Code (Anthropic)** was my main development assistant. Working from my written brief, it:
  - generated most of the application code, the tests, the sample data and this README;
  - ran the test suite, type checks and production builds;
  - helped debug issues found along the way, including a crash when many large amounts were summed, a duplicate-ID check that schema validation skipped, and false positives in the AI wording checks;
  - ran scripted headless-browser checks of the UI.
- **ChatGPT** helped me plan and brainstorm, write and refine the prompts I gave to Claude Code, explain concepts and code, and give a second opinion on output.
- **My role:**
  - I selected the problem and wrote the project brief: scope, required checks, technology stack, priorities and acceptance criteria.
  - I set the key design constraints during development: block only input that can't be safely interpreted; report every excluded document and the comparisons it affects; let AI change only follow-up wording, with validation and template fallback; keep "reviewed" distinct from "resolved".
  - I chose the export formats, directed the fixes, reviewed the key parts of the AI-generated code (the audit engine, money handling and AI output checks), and tested the application locally.
- **Financial comparisons are deterministic.** No LLM computes, compares or validates any amount. The optional Claude API feature only rewrites follow-up wording and cannot change findings, amounts or evidence.
- **Testing:** the AI-generated code is covered by the automated test suite described in §6. I also exercised it through the UI.
- **Prior work:** none. Everything was built for this case study, and all data is synthetic.
