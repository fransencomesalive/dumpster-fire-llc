import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

// PKCE callback (Randall, 2026-07-28).
//
// @supabase/ssr uses PKCE, which returns a ?code= to exchange server-side. The
// old implicit flow put tokens in the URL hash and let the browser pick them up,
// so this route did not exist. Both Google sign-in and the email confirmation
// link now land here, which makes it the most failure-sensitive file in the
// cookie migration: if it breaks, people cannot get in at all.
//
// A Route Handler CAN write cookies (a Server Component cannot), so the exchange
// happens here and the session is on the response before the redirect.

export const dynamic = "force-dynamic";

// Only ever redirect somewhere inside this app. `next` arrives in a URL, so
// treating it as trusted would be an open redirect straight off a login link.
function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/onboarding";
  return value;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  // Supabase reports auth failures (expired link, denied consent) on the query
  // string. Send those to sign-in with a reason rather than a blank screen.
  const authError = searchParams.get("error_description") || searchParams.get("error");
  if (authError) {
    const destination = new URL("/signup", origin);
    destination.searchParams.set("authError", authError);
    return NextResponse.redirect(destination);
  }

  if (!code) {
    const destination = new URL("/signup", origin);
    destination.searchParams.set("authError", "That sign-in link was missing its code. Try again.");
    return NextResponse.redirect(destination);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    const destination = new URL("/signup", origin);
    destination.searchParams.set("authError", "Sign in is not configured on this deployment.");
    return NextResponse.redirect(destination);
  }

  const response = NextResponse.redirect(new URL(next, origin));
  const cookieStore = await cookies();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet, headers) => {
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        // A response that sets auth cookies must not be cached, or a CDN can
        // hand one user's session to the next visitor.
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const destination = new URL("/signup", origin);
    destination.searchParams.set(
      "authError",
      error.message || "That sign-in link could not be completed. Request a new one.",
    );
    return NextResponse.redirect(destination);
  }

  return response;
}
