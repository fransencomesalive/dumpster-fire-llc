export type PublicAuthProvider = "google" | "apple" | "email";

export type PublicAuthConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  siteUrl: string;
  enabledProviders: PublicAuthProvider[];
  missing: string[];
};

const providerEnv: Record<PublicAuthProvider, string> = {
  google: "SUPABASE_AUTH_GOOGLE_ENABLED",
  apple: "SUPABASE_AUTH_APPLE_ENABLED",
  email: "SUPABASE_AUTH_EMAIL_ENABLED",
};

function enabled(value: string | undefined) {
  return value === "1" || value === "true";
}

export function getPublicAuthConfig(env: NodeJS.ProcessEnv = process.env): PublicAuthConfig {
  const enabledProviders = (Object.keys(providerEnv) as PublicAuthProvider[])
    .filter((provider) => enabled(env[providerEnv[provider]]));
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "";
  const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const siteUrl = env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000";
  const missing = [
    supabaseUrl ? "" : "NEXT_PUBLIC_SUPABASE_URL",
    supabaseAnonKey ? "" : "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    enabledProviders.length > 0 ? "" : "at least one SUPABASE_AUTH_*_ENABLED flag",
  ].filter(Boolean);

  return {
    supabaseUrl,
    supabaseAnonKey,
    siteUrl,
    enabledProviders,
    missing,
  };
}

export function isPublicAuthConfigured(env: NodeJS.ProcessEnv = process.env) {
  return getPublicAuthConfig(env).missing.length === 0;
}
