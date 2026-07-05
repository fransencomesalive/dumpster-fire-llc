import Link from "next/link";
import LegalPage from "../LegalPage";

const sections = [
  {
    heading: "Support",
    body: [
      "For help with your account, subscription, product questions, or feature issues, contact us at fransencomesalive@gmail.com. We aim to respond as quickly as possible and will help with account access, billing questions, and product troubleshooting.",
    ],
  },
  {
    heading: "Legal and privacy requests",
    body: [
      "For privacy requests, legal notices, or other compliance-related messages, please email fransencomesalive@gmail.com and include the words Legal Request or Privacy Request in the subject line.",
    ],
  },
  {
    heading: "Feedback",
    body: [
      "If you have a product idea, bug report, or feedback about the experience, we would love to hear it. You can reach out directly by email or through the site feedback experience if available in your account.",
    ],
  },
];

export default function ContactPage() {
  return (
    <LegalPage
      title="Contact & Support"
      intro="Use this page to reach the team for support, billing, privacy, or legal questions."
      sections={sections}
      relatedLinks={[
        { href: "/legal/terms", label: "Terms of Service" },
        { href: "/legal/privacy", label: "Privacy Policy" },
        { href: "/legal/billing", label: "Subscription & Billing" },
      ]}
    >
      <p>
        Prefer to start from the homepage? <Link href="/">Return to the main landing page</Link>.
      </p>
    </LegalPage>
  );
}
