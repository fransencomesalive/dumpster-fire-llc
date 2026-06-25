import { createHmac, timingSafeEqual } from "node:crypto";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";

const COOKIE_NAME = "job_search_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type SessionPayload = {
  scope: "scans";
  expiresAt: number;
};

export type AuthState = {
  enabled: boolean;
  authenticated: boolean;
};

function getAccessCode() {
  return process.env.DUMPSTER_FIRE_ACCESS_CODE || process.env.JOB_SEARCH_ACCESS_CODE || "";
}

function getSessionSecret() {
  return process.env.DUMPSTER_FIRE_SESSION_SECRET || process.env.JOB_SEARCH_SESSION_SECRET || "";
}

function hasRequiredProductionSecrets() {
  return process.env.NODE_ENV !== "production" || Boolean(getAccessCode() && getSessionSecret());
}

export function isJobSearchAuthEnabled() {
  return true;
}

function getSecret() {
  if (process.env.NODE_ENV !== "production") {
    return getSessionSecret() || "dev-only-dumpster-fire-secret";
  }
  return getSessionSecret();
}

function signPayload(payload: string) {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

function constantTimeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function createJobSearchSession() {
  const payload: SessionPayload = {
    scope: "scans",
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyJobSearchSession(value?: string): AuthState {
  const enabled = isJobSearchAuthEnabled();
  if (!hasRequiredProductionSecrets()) return { enabled, authenticated: false };
  if (!enabled) return { enabled, authenticated: true };
  if (!value) return { enabled, authenticated: false };

  const [encodedPayload, signature] = value.split(".");
  if (!encodedPayload || !signature || !constantTimeEqual(signature, signPayload(encodedPayload))) {
    return { enabled, authenticated: false };
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as SessionPayload;

    if (payload.expiresAt < Date.now() || payload.scope !== "scans") {
      return { enabled, authenticated: false };
    }

    return { enabled, authenticated: true };
  } catch {
    return { enabled, authenticated: false };
  }
}

export function getJobSearchAuthState(cookieStore: ReadonlyRequestCookies): AuthState {
  return verifyJobSearchSession(cookieStore.get(COOKIE_NAME)?.value);
}

export function validateJobSearchLogin(code: string) {
  const approvedCode = getAccessCode();
  if (!hasRequiredProductionSecrets()) return false;
  if (!approvedCode) return false;
  return constantTimeEqual(code, approvedCode);
}

export const jobSearchSessionCookie = {
  name: COOKIE_NAME,
  maxAge: SESSION_TTL_MS / 1000,
};
