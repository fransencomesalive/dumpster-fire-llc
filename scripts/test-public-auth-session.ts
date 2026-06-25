import assert from "node:assert/strict";
import { getPublicAuthSession } from "../lib/public-auth/session";

const configuredEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_AUTH_EMAIL_ENABLED: "true",
} as unknown as NodeJS.ProcessEnv;

async function main() {
  const missingConfig = await getPublicAuthSession(new Request("https://app.example/api"), {
    env: {} as NodeJS.ProcessEnv,
  });
  assert.equal(missingConfig.status, "config_error");

  const missingToken = await getPublicAuthSession(new Request("https://app.example/api"), {
    env: configuredEnv,
  });
  assert.deepEqual(missingToken, {
    status: "unauthenticated",
    reason: "Missing bearer token.",
  });

  const invalidToken = await getPublicAuthSession(new Request("https://app.example/api", {
    headers: {
      Authorization: "Bearer bad-token",
    },
  }), {
    env: configuredEnv,
    fetcher: async () => new Response("Unauthorized", { status: 401 }),
  });
  assert.deepEqual(invalidToken, {
    status: "unauthenticated",
    reason: "Invalid bearer token.",
  });

  let authUrl = "";
  let authHeader = "";
  const authenticated = await getPublicAuthSession(new Request("https://app.example/api", {
    headers: {
      Authorization: "Bearer good-token",
    },
  }), {
    env: configuredEnv,
    fetcher: async (url, init) => {
      authUrl = String(url);
      authHeader = new Headers(init?.headers).get("authorization") ?? "";
      return Response.json({
        id: "user-1",
        email: "avery@example.com",
      });
    },
  });
  assert.deepEqual(authenticated, {
    status: "authenticated",
    userId: "user-1",
    email: "avery@example.com",
  });
  assert.equal(authUrl, "https://supabase.example/auth/v1/user");
  assert.equal(authHeader, "Bearer good-token");

  console.log("public auth session: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
