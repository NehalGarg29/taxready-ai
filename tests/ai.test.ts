import { describe, expect, it, vi } from "vitest";
import { applyAiFollowUps, buildModelPayload, checkRewrite, DEFAULT_MODEL } from "@/lib/ai";
import { runAudit } from "@/lib/audit";
import { alexMorgan, jamieRivera, jordanLee } from "@/data/samples";

function completed(input: unknown) {
  const r = runAudit(input);
  if (r.status !== "completed") throw new Error("expected completed");
  return r;
}

/** Fake Anthropic Messages API returning the given text as the model reply. */
function fakeApi(replyText: string, status = 200) {
  return vi.fn(async (_url: unknown, _init?: unknown) =>
    new Response(JSON.stringify({ content: [{ type: "text", text: replyText }] }), { status }),
  ) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

function stripFollowUps(r: ReturnType<typeof completed>) {
  return r.findings.map(({ followUp: _f, ...rest }) => rest);
}

describe("AI fallback behavior", () => {
  it("uses templates and says so when no API key is configured (no network call)", async () => {
    const base = completed(alexMorgan);
    const fetchImpl = fakeApi("{}");
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const out = await applyAiFollowUps(base, { fetchImpl });
    process.env.ANTHROPIC_API_KEY = prev;
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(out.ai).toMatchObject({ requested: true, used: false, rewrittenCount: 0 });
    expect(out.ai.note).toMatch(/no ANTHROPIC_API_KEY/);
    expect(out.findings.every((f) => f.followUp.source === "template")).toBe(true);
  });

  it("falls back to templates when the API errors", async () => {
    const out = await applyAiFollowUps(completed(alexMorgan), { apiKey: "test", fetchImpl: fakeApi("", 500) });
    expect(out.ai.used).toBe(false);
    expect(out.ai.note).toMatch(/failed \(API responded 500\)/);
    expect(out.findings.every((f) => f.followUp.source === "template")).toBe(true);
  });

  it("falls back when the network call throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const out = await applyAiFollowUps(completed(alexMorgan), { apiKey: "test", fetchImpl });
    expect(out.ai.used).toBe(false);
    expect(out.ai.note).toMatch(/network down/);
  });

  it("falls back when the model returns output that is not the expected JSON", async () => {
    const out = await applyAiFollowUps(completed(alexMorgan), { apiKey: "test", fetchImpl: fakeApi("Sure! Here are your questions.") });
    expect(out.ai.used).toBe(false);
    expect(out.findings.every((f) => f.followUp.source === "template")).toBe(true);
  });

  it("does not call the model when there are no findings", async () => {
    const fetchImpl = fakeApi("{}");
    const out = await applyAiFollowUps(completed(jamieRivera), { apiKey: "test", fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(out.ai.used).toBe(false);
  });
});

describe("AI rewrites: accepted only when they preserve the facts", () => {
  const base = completed(alexMorgan);
  const [wage, interest] = base.findings;

  it("applies a faithful rewrite, labels it AI, and leaves every other field identical", async () => {
    const reply = JSON.stringify({
      questions: [
        {
          findingId: wage.id,
          question:
            "Your questionnaire shows $85,000.00 in wages for 2025, but the W-2 we received shows $92,000.00 — could you help us understand what accounts for the difference?",
        },
      ],
    });
    const out = await applyAiFollowUps(base, { apiKey: "test", fetchImpl: fakeApi(reply) });
    expect(out.ai).toMatchObject({ used: true, rewrittenCount: 1 });
    expect(out.findings[0].followUp.source).toBe("ai");
    expect(out.findings[1].followUp).toEqual(interest.followUp); // untouched
    expect(stripFollowUps(out)).toEqual(stripFollowUps(base)); // amounts, sources, severity unchanged
    expect(base.findings[0].followUp.source).toBe("template"); // original not mutated
  });

  it.each([
    ["a changed amount", "Your questionnaire shows $85,000.00 in wages for 2025, but the W-2 shows $93,000.00. Can you explain?", /dollar amounts/],
    ["a dropped amount", "Your wages for 2025 differ from the W-2 of $92,000.00. Can you explain?", /dollar amounts/],
    ["a new date", "You reported $85,000.00 in wages for 2025 but the W-2 shows $92,000.00. Can you reply by April 15?", /unsupported number or date "15"/],
    ["a new document reference", "You reported $85,000.00 in wages for 2025 but W-2 DOC-XYZ-9 shows $92,000.00. Can you explain?", /unsupported document reference "DOC-XYZ-9"/],
    ["a new form name", "You reported $85,000.00 in wages for 2025 but the W-2 shows $92,000.00. Did you also get a 1099-MISC?", /unsupported document reference "1099-MISC"/],
    ["an unsupported claim", "You reported $85,000.00 in wages for 2025 but the W-2 shows $92,000.00, so your questionnaire has an error. Can you fix it?", /unsupported claim/],
    ["a statement instead of a question", "You reported $85,000.00 in wages for 2025 but the W-2 shows $92,000.00.", /not phrased as a question/],
  ])("rejects a rewrite with %s", (_label, rewrite, reason) => {
    expect(checkRewrite(wage.followUp.question, rewrite)).toMatch(reason);
  });

  it("keeps the template for a rejected rewrite and reports why", async () => {
    const reply = JSON.stringify({
      questions: [{ findingId: wage.id, question: "Your W-2 shows $92,000.00 but you said $80,000.00 for 2025. Why?" }],
    });
    const out = await applyAiFollowUps(base, { apiKey: "test", fetchImpl: fakeApi(reply) });
    expect(out.ai.used).toBe(false);
    expect(out.findings[0].followUp).toEqual(wage.followUp);
    expect(out.ai.note).toMatch(/no rewrite passed the output checks/);
    expect(out.ai.note).toContain(wage.id);
  });

  it("ignores rewrites for finding IDs it did not send", async () => {
    const reply = JSON.stringify({ questions: [{ findingId: "made-up:id", question: "Anything else to share with us this year?" }] });
    const out = await applyAiFollowUps(base, { apiKey: "test", fetchImpl: fakeApi(reply) });
    expect(out.findings.map((f) => f.followUp)).toEqual(base.findings.map((f) => f.followUp));
  });
});

describe("data minimization", () => {
  it("sends only finding ID, issue type and template question — no client identity or file names", async () => {
    const base = completed(jordanLee);
    const fetchImpl = fakeApi(JSON.stringify({ questions: [] }));
    await applyAiFollowUps(base, { apiKey: "test", fetchImpl });
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    const sent = String(init.body);
    expect(sent).not.toContain("Jordan Lee");
    expect(sent).not.toContain("CL-1004");
    expect(sent).not.toContain(".pdf");
    expect(Object.keys(buildModelPayload(base.findings)[0]).sort()).toEqual(["findingId", "issueType", "templateQuestion"]);
  });
});

describe("guard self-consistency", () => {
  it("accepts every template question unchanged, across all sample cases", async () => {
    const { SAMPLE_CASES } = await import("@/data/samples");
    let checked = 0;
    for (const s of SAMPLE_CASES) {
      const r = runAudit(s.json);
      if (r.status !== "completed") continue;
      for (const f of r.findings) {
        expect(checkRewrite(f.followUp.question, f.followUp.question), f.id).toBeNull();
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(5);
  });
});

describe("AI guard regressions", () => {
  const template =
    "Your questionnaire lists $85,000.00 in wages for 2025, while the W-2 we received shows $92,000.00. Could you help us understand the difference?";

  it.each([
    ["'however' (contains 'owe')", "However, the W-2 we received shows $92,000.00 while you listed $85,000.00 in wages for 2025. Could you explain the difference?"],
    ["'first' (contains 'irs')", "First, your questionnaire lists $85,000.00 in wages for 2025, but the W-2 shows $92,000.00. Could you explain?"],
    ["'may' as a verb", "You may have listed $85,000.00 in wages for 2025, while the W-2 shows $92,000.00. Could you explain the difference?"],
  ])("does not falsely reject ordinary words: %s", (_label, rewrite) => {
    expect(checkRewrite(template, rewrite)).toBeNull();
  });

  it.each([
    ["a month (implied deadline)", "Your questionnaire lists $85,000.00 in wages for 2025 and the W-2 shows $92,000.00. Please reply by April — could you explain?", /"April"/],
    ["a spelled-out amount", "Your questionnaire lists $85,000.00 in wages for 2025 and the W-2 shows $92,000.00, roughly seven thousand more. Could you explain?", /"seven"/],
    ["'resolved'", "Your questionnaire lists $85,000.00 in wages for 2025 and the W-2 shows $92,000.00. Once you explain, this is resolved — could you explain?", /resolved/],
  ])("rejects a rewrite that introduces %s", (_label, rewrite, reason) => {
    expect(checkRewrite(template, rewrite)).toMatch(reason);
  });
});

describe("AI layer cannot alter findings", () => {
  it("keeps the deterministic template alongside the AI wording", async () => {
    const base = completed(alexMorgan);
    const wage = base.findings[0];
    const reworded = "Your questionnaire shows $85,000.00 in wages for 2025, but the W-2 we received shows $92,000.00. Could you tell us what explains the difference?";
    const out = await applyAiFollowUps(base, {
      apiKey: "test",
      fetchImpl: fakeApi(JSON.stringify({ questions: [{ findingId: wage.id, question: reworded }] })),
    });
    expect(out.findings[0].followUp).toEqual({ question: reworded, source: "ai", templateQuestion: wage.followUp.templateQuestion });
    expect(out.findings[0].followUp.templateQuestion).toBe(wage.followUp.question);
  });

  it("ignores extra fields in model output (cannot inject amounts, severity or sources)", async () => {
    const base = completed(alexMorgan);
    const wage = base.findings[0];
    const reply = JSON.stringify({
      questions: [
        {
          findingId: wage.id,
          question: wage.followUp.question,
          differenceCents: 1,
          severity: "low",
          sources: [],
          expected: { label: "x", amountCents: 0 },
        },
      ],
      findings: [],
    });
    const out = await applyAiFollowUps(base, { apiKey: "test", fetchImpl: fakeApi(reply) });
    expect(stripFollowUps(out)).toEqual(stripFollowUps(base));
    expect(out.findings).toHaveLength(base.findings.length);
  });

  it("every template finding records its own wording as templateQuestion", () => {
    for (const f of completed(jordanLee).findings) {
      expect(f.followUp.source).toBe("template");
      expect(f.followUp.templateQuestion).toBe(f.followUp.question);
    }
  });
});

describe("model configuration (regression)", () => {
  it("falls back to the default model when ANTHROPIC_MODEL is set but empty", async () => {
    const prev = process.env.ANTHROPIC_MODEL;
    process.env.ANTHROPIC_MODEL = "   ";
    try {
      const fetchImpl = fakeApi(JSON.stringify({ questions: [] }));
      const out = await applyAiFollowUps(completed(alexMorgan), { apiKey: "test", fetchImpl });
      const sent = JSON.parse(String(((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit).body));
      expect(sent.model).toBe(DEFAULT_MODEL);
      expect(out.ai.model).toBe(DEFAULT_MODEL);
    } finally {
      if (prev === undefined) delete process.env.ANTHROPIC_MODEL;
      else process.env.ANTHROPIC_MODEL = prev;
    }
  });
});
