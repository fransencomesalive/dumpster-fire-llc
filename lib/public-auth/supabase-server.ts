import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server-side view of the Supabase session (Randall, 2026-07-28).
//
// The session used to live only in localStorage, so the server could never know
// who the user was and every page shipped a signed-out header that the browser
// then corrected. It lives in cookies now, which is what lets the layout render
// the real header in the first paint.
//
// Reads only. Cookie WRITES (token refresh) happen in proxy.ts — Next does not
// allow setting cookies from a Server Component render, and @supabase/ssr warns
// that omitting setAll without a proxy causes random logouts. setAll here is a
// deliberate no-op for that reason.

export type ServerAuthUser = { userId: string; email: string } | null;

function createClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      // Refresh writes are proxy.ts's job; see the note above.
      setAll: () => {},
    },
  });
}

// getClaims(), never getSession(): a cookie is an insecure storage medium, so the
// user object on a session must not be trusted server-side. getClaims verifies
// the JWT signature against the project's published keys on every call.
export async function getServerAuthUser(): Promise<ServerAuthUser> {
  const supabase = createClient(await cookies());
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (error || !claims || typeof claims.sub !== "string" || !claims.sub) return null;
    return {
      userId: claims.sub,
      email: typeof claims.email === "string" ? claims.email : "",
    };
  } catch {
    // A signed-out visitor is the common case here, not an error worth surfacing.
    return null;
  }
}
