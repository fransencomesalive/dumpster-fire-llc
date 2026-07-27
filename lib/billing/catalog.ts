export type RetailPlanCode = "basic" | "premium";

export const RETAIL_PLAN_CODES = ["basic", "premium"] as const;

export const STRIPE_ACCOUNT_ID = "acct_1TxaWWJtJtSFf8Kw";
export const STRIPE_PROJECT_ID = "dumpster_fire_llc";
export const STRIPE_BILLING_CONTRACT_VERSION = "2026-07-24";

export const STRIPE_RESOURCE_METADATA = {
  project: STRIPE_PROJECT_ID,
  integration: "subscription_billing",
  contract_version: STRIPE_BILLING_CONTRACT_VERSION,
  environment: "test",
} as const;

export const STRIPE_PRICE_LOOKUP_KEYS: Record<RetailPlanCode, string> = {
  basic: "dumpster_fire_smoldering_monthly_v1",
  premium: "dumpster_fire_roaring_monthly_v1",
};

export const RETAIL_PLAN_CONTRACT = {
  basic: {
    amountCents: 2200,
    publicName: "Smoldering",
  },
  premium: {
    amountCents: 3200,
    publicName: "Roaring",
  },
} as const;

export function isRetailPlanCode(value: unknown): value is RetailPlanCode {
  return typeof value === "string"
    && RETAIL_PLAN_CODES.includes(value as RetailPlanCode);
}

export function planCodeForPrice(
  priceId: string,
  prices: Record<RetailPlanCode, string>,
): RetailPlanCode | undefined {
  return RETAIL_PLAN_CODES.find((planCode) => prices[planCode] === priceId);
}
