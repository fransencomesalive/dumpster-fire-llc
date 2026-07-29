"use client";

import { createBrowserClient } from "@supabase/ssr";
import { type SupabaseClient } from "@supabase/supabase-js";
import {
  clearPublicProfileAccessToken,
  writePublicProfileAccessToken,
} from "../public-profile/browser-session";

// Browser auth on @supabase/ssr (Randall, 2026-07-28). The session moved from
// localStorage into cookies so the SERVER can read it and render the real header
// on first paint; before this the bar always shipped signed-out and flipped.
//
// Two things deliberately did NOT change:
//  - Every export below keeps its old name and signature, so no caller moves.
//  - The access token is still mirrored into the legacy localStorage key, because
//    requestPublicProfileApi sends it as a bearer header and every API route
//    authenticates that way. Cookies are additive: they serve the render path.
//    That keeps this change off the API surface entirely.

let client: SupabaseClient | null | undefined;
let listenerAttached = false;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey || typeof window === "undefined") {
    client = null;
    return client;
  }
  // Cookies are handled for us; the docs warn against configuring them by hand.
  client = createBrowserClient(url, anonKey);
  if (!listenerAttached) {
    listenerAttached = true;
    client.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        writePublicProfileAccessToken(session.access_token);
      } else {
        clearPublicProfileAccessToken();
      }
    });
  }
  return client;
}

// One-time migration for anyone signed in before the switch.
//
// supabase-js stored the session in localStorage under `sb-<ref>-auth-token`.
// The cookie client cannot see it, so without this every existing account would
// silently appear signed out and have to sign in again. Read the legacy entry,
// hand its tokens to setSession (which writes the cookies), then drop the key.
async function adoptLegacyLocalStorageSession(supabase: SupabaseClient): Promise<boolean> {
  try {
    const legacyKey = Object.keys(window.localStorage).find(
      (key) => key.startsWith("sb-") && key.endsWith("-auth-token"),
    );
    if (!legacyKey) return false;

    const raw = window.localStorage.getItem(legacyKey);
    if (!raw) return false;

    // Older supabase-js wrote raw JSON; newer versions base64-prefix it.
    const json = raw.startsWith("base64-")
      ? atob(raw.slice("base64-".length))
      : raw;
    const parsed = JSON.parse(json) as {
      access_token?: string;
      refresh_token?: string;
    } | null;
    if (!parsed?.access_token || !parsed.refresh_token) return false;

    const { data, error } = await supabase.auth.setSession({
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
    });
    if (error || !data.session?.access_token) return false;

    window.localStorage.removeItem(legacyKey);
    writePublicProfileAccessToken(data.session.access_token);
    return true;
  } catch {
    // A failed migration just means one extra sign-in, never a broken page.
    return false;
  }
}

// Resolve the current session (refreshing if needed), mirror the token into
// the legacy storage key, and return it. Returns "" when signed out or when
// Supabase env is not configured.
export async function syncPublicProfileSession(): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return "";
  const { data } = await supabase.auth.getSession();
  let token = data.session?.access_token ?? "";
  if (!token && (await adoptLegacyLocalStorageSession(supabase))) {
    const { data: adopted } = await supabase.auth.getSession();
    token = adopted.session?.access_token ?? "";
  }
  if (token) {
    writePublicProfileAccessToken(token);
  }
  return token;
}

// Self-serve create-account. When Supabase email confirmation is on (it is once
// Resend SMTP is configured), signUp returns a user but NO session — the caller
// shows the "check your email" state. When confirmation is off (or later
// disabled), a session comes back immediately and we mirror the token. The
// confirmation link now lands on /auth/callback, which exchanges the code and
// sets the cookies before forwarding to `redirectPath` (the plan step).
export async function signUpWithPasswordSession(
  email: string,
  password: string,
  redirectPath = "/plan",
): Promise<{ needsConfirmation: boolean; token: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    throw new Error("Sign up is not configured. Add the public Supabase settings.");
  }
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: authCallbackUrl(redirectPath) },
  });
  if (error) {
    throw new Error(error.message || "Sign up failed.");
  }
  const token = data.session?.access_token ?? "";
  if (token) {
    writePublicProfileAccessToken(token);
  }
  return { needsConfirmation: !token, token };
}

export async function signInWithPasswordSession(email: string, password: string): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    throw new Error("Sign in is not configured. Add the public Supabase settings.");
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session?.access_token) {
    throw new Error(error?.message || "Sign in failed.");
  }
  writePublicProfileAccessToken(data.session.access_token);
  return data.session.access_token;
}

export function isGoogleSignInEnabled() {
  // The Google provider is enabled in Supabase Auth (verified 2026-07-02), so the
  // button defaults ON. Set NEXT_PUBLIC_SUPABASE_AUTH_GOOGLE_ENABLED=0 to hide it.
  const flag = process.env.NEXT_PUBLIC_SUPABASE_AUTH_GOOGLE_ENABLED;
  return flag !== "0" && flag !== "false";
}

// PKCE returns a ?code= to be exchanged server-side, where the old implicit flow
// put tokens in the URL hash for the browser to pick up. Both OAuth and the email
// confirmation link therefore go through /auth/callback now, which carries the
// original destination as ?next=.
function authCallbackUrl(nextPath: string) {
  const callback = new URL("/auth/callback", window.location.origin);
  callback.searchParams.set("next", nextPath);
  return callback.toString();
}

export async function signInWithGoogle(redirectPath = "/onboarding"): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    throw new Error("Sign in is not configured. Add the public Supabase settings.");
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: authCallbackUrl(redirectPath) },
  });
  if (error) {
    throw new Error(error.message || "Google sign in failed.");
  }
}

export async function signOutSupabaseSession(): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    await supabase.auth.signOut().catch(() => undefined);
  }
  clearPublicProfileAccessToken();
}
