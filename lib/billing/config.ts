import type { RetailPlanCode } from "./catalog";
import { STRIPE_ACCOUNT_ID } from "./catalog";

export const STRIPE_API_VERSION = "2026-04-22.dahlia";
export const STRIPE_SDK_VERSION = "22.1.1";

export type StripeCheckoutTermsConsent = "required" | "omit";

export type BillingConfig = {
  accountId: string;
  appBaseUrl: string;
  secretKey: string;
  webhookSecret: string;
  prices: Record<RetailPlanCode, string>;
  portalConfigurationId?: string;
  taxEnabled: boolean;
  checkoutTermsConsent: StripeCheckoutTermsConsent;
};

export class BillingConfigurationError extends Error {
  constructor(
    message: string,
    readonly missing: string[] = [],
  ) {
    super(message);
    this.name = "BillingConfigurationError";
  }
}

export function isStripeCheckoutEnabled(env: NodeJS.ProcessEnv = process.env) {
  const value = env.STRIPE_CHECKOUT_ENABLED?.trim().toLowerCase();
  return value === "1" || value === "true";
}

function required(env: NodeJS.ProcessEnv, name: string, missing: string[]) {
  const value = env[name]?.trim();
  if (!value) missing.push(name);
  return value ?? "";
}

function parseBoolean(value: string | undefined, name: string) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === "false" || normalized === "0") return false;
  if (normalized === "true" || normalized === "1") return true;
  throw new BillingConfigurationError(`${name} must be true or false.`);
}

function parseCheckoutTermsConsent(
  value: string | undefined,
  secretKey: string,
): StripeCheckoutTermsConsent {
  const normalized = value?.trim().toLowerCase() || "required";
  if (normalized !== "required" && normalized !== "omit") {
    throw new BillingConfigurationError(
      "STRIPE_CHECKOUT_TERMS_CONSENT must be required or omit.",
    );
  }
  if (normalized === "omit" && !secretKey.startsWith("sk_test_")) {
    throw new BillingConfigurationError(
      "STRIPE_CHECKOUT_TERMS_CONSENT can be omitted only with a Stripe test-mode secret key.",
    );
  }
  return normalized;
}

function canonicalBaseUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BillingConfigurationError("APP_BASE_URL must be an absolute URL.");
  }
  const isLocalHttp = url.protocol === "http:"
    && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !isLocalHttp) {
    throw new BillingConfigurationError("APP_BASE_URL must use HTTPS outside localhost.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new BillingConfigurationError("APP_BASE_URL cannot contain credentials, a query, or a fragment.");
  }
  return url.origin;
}

export function getBillingConfig(env: NodeJS.ProcessEnv = process.env): BillingConfig {
  const missing: string[] = [];
  const accountId = required(env, "STRIPE_ACCOUNT_ID", missing);
  const secretKey = required(env, "STRIPE_SECRET_KEY", missing);
  const webhookSecret = required(env, "STRIPE_WEBHOOK_SECRET", missing);
  const basicPrice = required(env, "STRIPE_PRICE_BASIC_MONTHLY", missing);
  const premiumPrice = required(env, "STRIPE_PRICE_PREMIUM_MONTHLY", missing);
  const baseUrl = env.APP_BASE_URL?.trim() || env.NEXT_PUBLIC_SITE_URL?.trim() || "";
  if (!baseUrl) missing.push("APP_BASE_URL");

  if (missing.length > 0) {
    throw new BillingConfigurationError("Stripe billing is not configured.", [...new Set(missing)]);
  }
  const checkoutTermsConsent = parseCheckoutTermsConsent(
    env.STRIPE_CHECKOUT_TERMS_CONSENT,
    secretKey,
  );
  if (!secretKey.startsWith("sk_test_")) {
    throw new BillingConfigurationError("Phase 3 accepts only a Stripe test-mode secret key.");
  }
  if (accountId !== STRIPE_ACCOUNT_ID) {
    throw new BillingConfigurationError("STRIPE_ACCOUNT_ID does not match the Dumpster Fire Phase 3 sandbox.");
  }
  if (!webhookSecret.startsWith("whsec_")) {
    throw new BillingConfigurationError("STRIPE_WEBHOOK_SECRET must be a Stripe signing secret.");
  }
  if (!basicPrice.startsWith("price_") || !premiumPrice.startsWith("price_")) {
    throw new BillingConfigurationError("Stripe price allowlist values must be Price IDs.");
  }
  if (basicPrice === premiumPrice) {
    throw new BillingConfigurationError("Smoldering and Roaring must use different Stripe Price IDs.");
  }

  return {
    accountId,
    appBaseUrl: canonicalBaseUrl(baseUrl),
    secretKey,
    webhookSecret,
    prices: {
      basic: basicPrice,
      premium: premiumPrice,
    },
    portalConfigurationId: env.STRIPE_PORTAL_CONFIGURATION_ID?.trim() || undefined,
    taxEnabled: parseBoolean(env.STRIPE_TAX_ENABLED, "STRIPE_TAX_ENABLED"),
    checkoutTermsConsent,
  };
}
