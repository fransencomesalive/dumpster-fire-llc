import {
  createPublicProfileRepositoryRequest,
  getPublicProfileRepositoryConfig,
} from "../lib/public-profile/repository";
import { getBillingConfig } from "../lib/billing/config";
import { reconcileStripeSubscriptions } from "../lib/billing/reconciliation";
import { createStripeGateway } from "../lib/billing/stripe-client";

async function main() {
  const write = process.argv.includes("--write");
  const confirmation = process.argv.find((value) => value.startsWith("--confirm-write="))
    ?.slice("--confirm-write=".length);
  if (write && confirmation !== "REPAIR_STRIPE_SUBSCRIPTIONS") {
    throw new Error("Write mode requires --confirm-write=REPAIR_STRIPE_SUBSCRIPTIONS.");
  }
  const repositoryConfig = getPublicProfileRepositoryConfig();
  if (!repositoryConfig) throw new Error("Supabase service configuration is missing.");
  const billingConfig = getBillingConfig();
  const report = await reconcileStripeSubscriptions({
    repositoryRequest: createPublicProfileRepositoryRequest(repositoryConfig),
    stripe: createStripeGateway(billingConfig),
    write,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.errors > 0 || (!write && report.mismatched > 0)) process.exitCode = 1;
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : "Stripe reconciliation failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
