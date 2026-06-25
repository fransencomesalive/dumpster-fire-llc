import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getJobSearchAuthState } from "../../auth";
import { updateSettings, type SettingsUpdate } from "../../store";
import type { ScanCadence } from "../../types";

const scanCadences = new Set<ScanCadence>(["manual", "daily", "weekdays", "weekly"]);

async function requireSettingsAuth() {
  const authState = getJobSearchAuthState(await cookies());
  if (!authState.authenticated) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  return null;
}

function cleanTime(value: unknown) {
  if (typeof value !== "string") return "08:30";
  return /^\d{2}:\d{2}$/.test(value) ? value : "08:30";
}

function cleanPositiveInt(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(250, Math.round(parsed));
}

export async function PATCH(request: Request) {
  const authError = await requireSettingsAuth();
  if (authError) return authError;

  const body = await request.json().catch(() => null) as Partial<SettingsUpdate> | null;

  if (!body) {
    return NextResponse.json({ error: "Expected settings update." }, { status: 400 });
  }

  if (typeof body.scanCadence !== "string" || !scanCadences.has(body.scanCadence as ScanCadence)) {
    return NextResponse.json({ error: "Unsupported scan cadence." }, { status: 400 });
  }

  if (typeof body.digestCadence !== "string" || !scanCadences.has(body.digestCadence as ScanCadence)) {
    return NextResponse.json({ error: "Unsupported digest cadence." }, { status: 400 });
  }

  return NextResponse.json(await updateSettings({
    scanEnabled: Boolean(body.scanEnabled),
    scanCadence: body.scanCadence as ScanCadence,
    digestEnabled: Boolean(body.digestEnabled),
    digestCadence: body.digestCadence as ScanCadence,
    digestTime: cleanTime(body.digestTime),
    maxRolesPerScan: cleanPositiveInt(body.maxRolesPerScan, 25),
  }));
}
