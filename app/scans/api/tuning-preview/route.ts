import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getJobSearchAuthState } from "../../auth";
import { getMatchTuningPreviewImpact } from "../../store";

async function requireTuningPreviewAuth() {
  const authState = getJobSearchAuthState(await cookies());
  if (!authState.authenticated) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  return null;
}

function cleanDraftIds(value: unknown) {
  if (!Array.isArray(value)) return undefined;

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.replace(/[^a-z0-9-_]/gi, "").slice(0, 140))
    .filter(Boolean)
    .slice(0, 40);
}

export async function GET() {
  const authError = await requireTuningPreviewAuth();
  if (authError) return authError;

  const impact = await getMatchTuningPreviewImpact([]);

  return NextResponse.json({
    ...impact,
    writesEnabled: false,
  });
}

export async function POST(request: Request) {
  const authError = await requireTuningPreviewAuth();
  if (authError) return authError;

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const selectedDraftIds = cleanDraftIds(body?.selectedDraftIds);
  const impact = await getMatchTuningPreviewImpact(selectedDraftIds ?? []);

  return NextResponse.json({
    ...impact,
    writesEnabled: false,
  });
}
