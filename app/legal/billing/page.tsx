import LegalPage from "../LegalPage";

const sections = [
  {
    heading: "1. Subscription plans",
    body: [
      "Dumpster Fire offers paid subscription tiers that provide access to additional features and higher usage limits. Pricing and available features may change over time and will be described on the pricing page and in your account.",
    ],
  },
  {
    heading: "2. Billing and renewals",
    body: [
      "Subscriptions are billed in advance according to the plan you select. Your subscription will renew automatically unless you cancel before the renewal date.",
    ],
  },
  {
    heading: "3. Cancellation and refund policy",
    body: [
      "You may cancel your subscription at any time from your account settings. Access continues through the end of the paid period. Refunds are generally not issued for partial months or for services already rendered, except where required by law or where we explicitly state otherwise.",
    ],
  },
  {
    heading: "4. Changes to pricing",
    body: [
      "We may change pricing or plan offerings from time to time. We will provide notice before any significant change that materially affects your current plan.",
    ],
  },
];

export default function BillingPage() {
  return (
    <LegalPage
      title="Subscription & Billing"
      intro="These terms cover the paid plans and billing mechanics for Dumpster Fire."
      sections={sections}
      footerNote="If you believe you were billed in error, contact support and we will review the charge."
      relatedLinks={[
        { href: "/legal/terms", label: "Terms of Service" },
        { href: "/legal/privacy", label: "Privacy Policy" },
        { href: "/legal/contact", label: "Contact & Support" },
      ]}
    />
  );
}
