import { NextResponse } from "next/server";
import { isAiConfigured } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tells the UI whether the optional AI wording layer can run. Never exposes the key itself. */
export async function GET() {
  return NextResponse.json({ available: isAiConfigured() });
}
