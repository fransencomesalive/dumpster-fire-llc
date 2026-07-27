export function mapStripeSubscriptionStatus(
  status: string,
): "trialing" | "active" | "past_due" | "canceled" {
  if (status === "trialing") return "trialing";
  if (status === "active") return "active";
  if (status === "canceled" || status === "incomplete_expired") return "canceled";
  return "past_due";
}
