import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createJobSearchSession, jobSearchSessionCookie, validateJobSearchLogin } from "../../auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { code?: unknown } | null;

  if (!body || typeof body.code !== "string") {
    return NextResponse.json({ error: "Expected access code." }, { status: 400 });
  }

  if (!validateJobSearchLogin(body.code)) {
    return NextResponse.json({ error: "Access code is not approved." }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(jobSearchSessionCookie.name, createJobSearchSession(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/scans",
    maxAge: jobSearchSessionCookie.maxAge,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(jobSearchSessionCookie.name);
  return NextResponse.json({ ok: true });
}
