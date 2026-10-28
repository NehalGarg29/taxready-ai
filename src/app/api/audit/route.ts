import { NextResponse } from "next/server";
import { z } from "zod";
import { applyAiFollowUps } from "@/lib/ai";
import { runAudit } from "@/lib/audit";

export const runtime = "nodejs";

const MAX_INPUT_BYTES = 256 * 1024;

const requestSchema = z.object({
  /** Raw intake package text exactly as pasted/uploaded, so malformed JSON can be reported precisely. */
  input: z.string().max(MAX_INPUT_BYTES, "Intake package is larger than 256 KB"),
  useAi: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON: { input: string, useAi?: boolean }" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  }

  try {
    // Deterministic audit. Invalid packages return 200 with status "invalid" — that is a valid audit outcome.
    const result = runAudit(parsed.data.input);

    // Optional wording layer: only for completed audits, only when requested. Never touches amounts or evidence.
    if (result.status === "completed" && parsed.data.useAi) {
      return NextResponse.json(await applyAiFollowUps(result));
    }
    return NextResponse.json(result);
  } catch (e) {
    // Defense in depth: an unexpected internal error must never look like a successful audit.
    console.error("Audit failed unexpectedly", e);
    return NextResponse.json({ error: "The audit failed due to an internal error. No results were produced." }, { status: 500 });
  }
}
