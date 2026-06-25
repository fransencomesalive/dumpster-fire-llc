import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getJobSearchAuthState } from "../../auth";
import { compileSearchProfile } from "../../profile-compiler";
import { compileAndSaveSearchProfile } from "../../store";
import type { ResumeRoleTrackSignal } from "../../matching";
import type { ProfileCompilerInput, ProfileCompilerPreferences } from "../../profile-compiler";

const maxResumeCharacters = 24000;
const maxProfileCharacters = 8000;

async function requireOnboardingAuth() {
  const authState = getJobSearchAuthState(await cookies());
  if (!authState.authenticated) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  return null;
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanList(value: unknown, limit = 24) {
  if (!Array.isArray(value)) return [];

  return Array.from(new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.replace(/\s+/g, " ").trim())
      .filter(Boolean)
  )).slice(0, limit);
}

function cleanNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.round(parsed);
}

function cleanRoleTracks(value: unknown): ResumeRoleTrackSignal[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item): ResumeRoleTrackSignal[] => {
    if (!item || typeof item !== "object") return [];
    const input = item as Record<string, unknown>;
    const id = typeof input.id === "string" ? input.id.replace(/\s+/g, "-").trim().slice(0, 80) : "";
    const label = typeof input.label === "string" ? input.label.replace(/\s+/g, " ").trim().slice(0, 120) : "";
    const titlePatterns = cleanList(input.titlePatterns, 24);
    const responsibilityPatterns = cleanList(input.responsibilityPatterns, 40);
    const contextPatterns = cleanList(input.contextPatterns, 24);
    const proofPatterns = cleanList(input.proofPatterns, 32);
    const weakPatterns = cleanList(input.weakPatterns, 32);

    if (!id || !label || titlePatterns.length === 0 || responsibilityPatterns.length === 0) return [];

    return [{
      id,
      label,
      titlePatterns,
      responsibilityPatterns,
      contextPatterns,
      proofPatterns,
      weakPatterns,
    }];
  }).slice(0, 4);
}

function cleanPreferences(value: unknown): ProfileCompilerPreferences {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};

  return {
    desiredTitles: cleanList(input.desiredTitles),
    avoidedTitles: cleanList(input.avoidedTitles),
    desiredIndustries: cleanList(input.desiredIndustries),
    avoidedKeywords: cleanList(input.avoidedKeywords),
    roleTracks: cleanRoleTracks(input.roleTracks),
    compensationFloor: cleanNumber(input.compensationFloor),
    freelanceRateFloor: cleanNumber(input.freelanceRateFloor),
    remoteOnly: typeof input.remoteOnly === "boolean" ? input.remoteOnly : undefined,
    doNotApplyCompanies: cleanList(input.doNotApplyCompanies),
    approvedLoginEmail: typeof input.approvedLoginEmail === "string" ? input.approvedLoginEmail.trim() : undefined,
  };
}

export async function POST(request: Request) {
  const authError = await requireOnboardingAuth();
  if (authError) return authError;

  const body = await request.json().catch(() => null) as (Partial<ProfileCompilerInput> & { action?: unknown }) | null;
  const resumeText = cleanText(body?.resumeText, maxResumeCharacters);
  const profileText = cleanText(body?.profileText, maxProfileCharacters);

  if (!resumeText && !profileText) {
    return NextResponse.json({
      error: "Paste a resume, a profile brief, or both before compiling.",
      detail: "The compiler needs at least one text source so it can extract target titles, strengths, constraints, and missing-input prompts.",
    }, { status: 400 });
  }

  const input = {
    resumeText,
    profileText,
    preferences: cleanPreferences(body?.preferences),
  };

  if (body?.action === "preview") {
    return NextResponse.json({
      compiledProfile: compileSearchProfile(input),
      writesEnabled: false,
    });
  }

  if (body?.action && body.action !== "apply") {
    return NextResponse.json({
      error: "Unsupported onboarding profile action.",
      detail: "Use action \"preview\" to review the compiled profile, or action \"apply\" to save it.",
    }, { status: 400 });
  }

  const result = await compileAndSaveSearchProfile(input);

  return NextResponse.json({
    compiledProfile: result.compiledProfile,
    dashboardState: result.dashboardState,
    persistence: result.persistence,
    writesEnabled: true,
  });
}
