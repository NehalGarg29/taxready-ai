import { z } from "zod";
import type { AuditResult, Finding } from "./types";

/**
 * Optional AI wording layer (server-side only).
 *
 * Pipeline position:  deterministic audit -> findings (frozen) -> [this module] -> human review
 *
 * Guarantees:
 *  - Only `followUp.question` may change. Amounts, sources, severity, and every other field are copied unchanged.
 *  - The model receives only the finding ID, issue type and the template question (no client name, client ID,
 *    file names, or raw intake data).
 *  - Model output is schema-validated, then each rewrite is checked against its template. A rewrite that adds,
 *    drops or changes a dollar amount, adds any other number (dates, years, percentages), introduces a document
 *    reference or form name, or introduces a risky claim, is discarded and the template is kept.
 *  - If the key is missing or the call fails, templates are used and the status says so plainly.
 *
 * LIMITATION: these are pattern-based checks. They catch changed/added amounts, numbers, date words,
 * document references and a fixed list of risky claims, but they cannot verify that a rewrite means
 * the same thing as the template (e.g. a softened or shifted request). A human must approve every
 * AI-worded question before it is sent; the template is always kept for comparison.
 */

export const DEFAULT_MODEL = "claude-sonnet-5-5";
const API_URL = "https://api.anthropic.com/v1/messages";

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

type Completed = Extract<AuditResult, { status: "completed" }>;

export type AiOptions = {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const modelOutputSchema = z.object({
  questions: z
    .array(
      z.object({
        findingId: z.string(),
        question: z.string().min(1).max(800),
      }),
    )
    .max(100),
});

const SYSTEM_PROMPT = `You rewrite follow-up questions that a tax preparer will send to a client.
Rules:
- Rewrite each question to be clear, polite, concise and professional, written to the client ("you").
- Keep every dollar amount, year and document reference EXACTLY as written. Do not add any new numbers, dates, years, amounts, form names or document IDs.
- Do not state or imply that anything is an error, a legal requirement, a penalty, or that the client owes or will receive money.
- Each output must be a single question ending with "?".
- Reply with ONLY a JSON object: {"questions":[{"findingId":"...","question":"..."}]} containing one entry per input item.`;

/** Minimal data sent to the model: no client identity, no file names, no raw intake. */
export function buildModelPayload(findings: readonly Finding[]) {
  return findings.map((f) => ({ findingId: f.id, issueType: f.issueType, templateQuestion: f.followUp.templateQuestion }));
}

// ---------- Output guards ----------

const AMOUNT_RE = /\$\s?\d[\d,]*(?:\.\d+)?/g;
const REFERENCE_RE = /\b[A-Z0-9]+(?:-[A-Z0-9]+)+\b/g; // W-2, 1099-NEC, DOC-AM-W2-01
const NUMBER_RE = /\d+(?:[.,]\d+)*/g;
/**
 * Claims the template never makes. Matched on word boundaries so ordinary words such as
 * "however" or "first" are not mistaken for "owe" or "IRS".
 */
const RISKY_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "penalty", re: /\bpenalt(?:y|ies)\b/i },
  { label: "IRS", re: /\bIRS\b/i },
  { label: "illegal", re: /\billegal(?:ly)?\b/i },
  { label: "fraud", re: /\bfraud\w*/i },
  { label: "error", re: /\berrors?\b/i },
  { label: "mistake", re: /\bmistak(?:e|es|en)\b/i },
  { label: "incorrect", re: /\bincorrect(?:ly)?\b/i },
  { label: "wrong", re: /\bwrong\b/i },
  { label: "owe", re: /\bow(?:e|es|ed|ing)\b/i },
  { label: "refund", re: /\brefunds?\b/i },
  { label: "legal", re: /\blegal(?:ly)?\b/i },
  { label: "required by law", re: /\brequired by law\b/i },
  { label: "must file/report", re: /\bmust (?:file|report)\b/i },
  { label: "guarantee", re: /\bguarantee\w*/i },
  { label: "audit", re: /\baudit\w*/i },
  { label: "confirmed", re: /\b(?:confirmed|verified|definitely|certainly)\b/i },
  { label: "resolved / ready to file", re: /\b(?:resolved|ready to file)\b/i },
];

/** Spelled-out quantities and calendar words: a way to introduce amounts or dates without digits. */
const WORD_NUMBER_RE =
  /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|percent|half|double|twice|january|february|march|april|june|july|august|september|october|november|december|monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|deadline|weeks?|days?|months?)\b/gi;

function amountsIn(text: string): string[] {
  return (text.match(AMOUNT_RE) ?? []).map((a) => a.replace(/[$,\s]/g, "")).sort();
}
function referencesIn(text: string): Set<string> {
  return new Set(text.match(REFERENCE_RE) ?? []);
}
function bareNumbersIn(text: string): Set<string> {
  const withoutAmountsAndRefs = text.replace(AMOUNT_RE, " ").replace(REFERENCE_RE, " ");
  return new Set(withoutAmountsAndRefs.match(NUMBER_RE) ?? []);
}

/** Returns null if the rewrite is acceptable, otherwise a short reason. */
export function checkRewrite(template: string, rewrite: string): string | null {
  const q = rewrite.trim();
  if (q.length < 15) return "too short";
  if (!q.endsWith("?")) return "not phrased as a question";

  const tAmounts = amountsIn(template);
  const rAmounts = amountsIn(q);
  if (tAmounts.join("|") !== rAmounts.join("|")) return "dollar amounts added, removed or changed";

  const tRefs = referencesIn(template);
  for (const ref of referencesIn(q)) if (!tRefs.has(ref)) return `unsupported document reference "${ref}"`;
  for (const ref of tRefs) if (!q.includes(ref)) return `dropped document reference "${ref}"`;

  const tNums = bareNumbersIn(template);
  for (const n of bareNumbersIn(q)) if (!tNums.has(n)) return `unsupported number or date "${n}"`;

  const tWords = new Set((template.match(WORD_NUMBER_RE) ?? []).map((w) => w.toLowerCase()));
  for (const w of q.match(WORD_NUMBER_RE) ?? []) {
    if (!tWords.has(w.toLowerCase())) return `unsupported quantity or date word "${w}"`;
  }

  for (const { label, re } of RISKY_PATTERNS) {
    if (re.test(q) && !re.test(template)) return `unsupported claim ("${label}")`;
  }
  return null;
}

function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(candidate);
}

function withStatus(result: Completed, ai: Completed["ai"], findings: Finding[] = result.findings): Completed {
  return { ...result, findings, ai };
}

/**
 * Returns a NEW result whose follow-up wording may come from Claude.
 * Never throws; the input result is never mutated.
 */
export async function applyAiFollowUps(result: Completed, options: AiOptions = {}): Promise<Completed> {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY?.trim();
  // `||` (not `??`) so an empty ANTHROPIC_MODEL= line falls back to the default instead of sending "".
  const model = options.model || process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  const doFetch = options.fetchImpl ?? fetch;

  if (!apiKey) {
    return withStatus(result, {
      requested: true,
      used: false,
      rewrittenCount: 0,
      note: "AI rewording was requested but no ANTHROPIC_API_KEY is configured. All questions use deterministic templates.",
    });
  }
  if (result.findings.length === 0) {
    return withStatus(result, { requested: true, used: false, rewrittenCount: 0, model, note: "No findings, so no follow-up questions to reword." });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
  let parsed: z.infer<typeof modelOutputSchema>;
  try {
    const res = await doFetch(API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: JSON.stringify({ items: buildModelPayload(result.findings) }) }],
      }),
    });
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = body.content?.find((c) => c.type === "text")?.text ?? "";
    const check = modelOutputSchema.safeParse(extractJson(text));
    if (!check.success) throw new Error("model output did not match the expected JSON shape");
    parsed = check.data;
  } catch (e) {
    const reason = e instanceof Error ? (e.name === "AbortError" ? "request timed out" : e.message) : "unknown error";
    return withStatus(result, {
      requested: true,
      used: false,
      rewrittenCount: 0,
      model,
      note: `AI rewording failed (${reason}). All questions use deterministic templates.`,
    });
  } finally {
    clearTimeout(timer);
  }

  const byId = new Map(parsed.questions.map((q) => [q.findingId, q.question]));
  const rejections: string[] = [];
  let rewritten = 0;

  const findings = result.findings.map((f): Finding => {
    const proposal = byId.get(f.id);
    if (proposal === undefined) return f;
    const problem = checkRewrite(f.followUp.templateQuestion, proposal);
    if (problem) {
      rejections.push(`${f.id}: ${problem}`);
      return f;
    }
    rewritten += 1;
    // Copy: only the follow-up wording and its label change. The deterministic template is kept alongside.
    return { ...f, followUp: { question: proposal.trim(), source: "ai", templateQuestion: f.followUp.templateQuestion } };
  });

  const total = result.findings.length;
  const note =
    rewritten === 0
      ? `Claude (${model}) responded, but no rewrite passed the output checks. All questions use deterministic templates.${rejections.length ? ` Rejected: ${rejections.join("; ")}.` : ""}`
      : `Claude (${model}) reworded ${rewritten} of ${total} follow-up questions. Amounts and evidence are unchanged. Automated checks cannot confirm meaning — compare each with its template and approve before sending.${
          total - rewritten > 0 ? ` ${total - rewritten} kept template wording${rejections.length ? ` (rejected: ${rejections.join("; ")})` : ""}.` : ""
        }`;

  return withStatus(result, { requested: true, used: rewritten > 0, rewrittenCount: rewritten, model, note }, findings);
}
