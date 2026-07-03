"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  clearPublicProfileAccessToken,
  writePublicProfileAccessToken,
} from "../public-profile/browser-session";

// Browser auth built on supabase-js: refresh-token rotation, background token
// refresh, and OAuth (Google) callback handling. The active access token is
// mirrored into the legacy localStorage key so every existing caller of
// readPublicProfileAccessToken keeps working with a fresh token.

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
  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
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

// Resolve the current session (refreshing if needed), mirror the token into
// the legacy storage key, and return it. Returns "" when signed out or when
// Supabase env is not configured.
export async function syncPublicProfileSession(): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return "";
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? "";
  if (token) {
    writePublicProfileAccessToken(token);
  }
  return token;
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

export async function signInWithGoogle(redirectPath = "/onboarding"): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    throw new Error("Sign in is not configured. Add the public Supabase settings.");
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}${redirectPath}` },
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
