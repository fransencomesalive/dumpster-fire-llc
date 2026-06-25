import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getJobSearchAuthState } from "../../auth";
import { updateSearchProfile, type SearchProfileUpdate } from "../../store";

async function requireProfileAuth() {
  const authState = getJobSearchAuthState(await cookies());
  if (!authState.authenticated) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  return null;
}

function cleanList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
  ));
}

function cleanNumber(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.round(parsed);
}

export async function PATCH(request: Request) {
  const authError = await requireProfileAuth();
  if (authError) return authError;

  const body = await request.json().catch(() => null) as Partial<SearchProfileUpdate> | null;

  if (!body) {
    return NextResponse.json({
      error: "Could not read the profile update.",
      detail: "Send targetTitles, compensationFloor, freelanceRateFloor, remoteOnly, and doNotApplyCompanies as JSON.",
    }, { status: 400 });
  }

  if (!Array.isArray(body.targetTitles) || body.targetTitles.length === 0) {
    return NextResponse.json({
      error: "Add at least one target title before saving configuration.",
      detail: "The matcher needs target titles so it can reject wrong role families before ranking.",
    }, { status: 400 });
  }

  return NextResponse.json(await updateSearchProfile({
    targetTitles: cleanList(body.targetTitles),
    compensationFloor: cleanNumber(body.compensationFloor, 0),
    freelanceRateFloor: cleanNumber(body.freelanceRateFloor, 0),
    remoteOnly: Boolean(body.remoteOnly),
    doNotApplyCompanies: cleanList(body.doNotApplyCompanies),
  }));
}
