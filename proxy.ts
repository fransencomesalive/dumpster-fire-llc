import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Session refresh (Randall, 2026-07-28).
//
// Next 16 renamed Middleware to Proxy; this file must be `proxy.ts` at the repo
// root, NOT `middleware.ts`
// (node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md).
//
// Server Components cannot write cookies, so this is the only place a refreshed
// token can be persisted. @supabase/ssr is explicit that skipping it causes
// random logouts and early session termination, so it is load-bearing, not
// optional. Keep it to the session touch: the docs warn Proxy is not a session
// management or authorization layer, and every real gate stays in the API routes.

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        // Required by the setAll contract: a response that sets auth cookies must
        // not be cached, or a CDN can serve one user's session to another.
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Touching the session is what triggers a refresh and the setAll write above.
  // getClaims verifies the JWT rather than trusting the cookie's user object.
  await supabase.auth.getClaims().catch(() => null);

  return response;
}

export const config = {
  // Skip static assets and image optimization — they never need a session touch,
  // and refreshing on them would burn refresh-token requests for nothing.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|gif|ico)$).*)"],
};
