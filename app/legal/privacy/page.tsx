import LegalPage from "../LegalPage";

const sections = [
  {
    heading: "1. Information we collect",
    body: [
      "We collect information you provide when you create a profile, upload resumes or work examples, and interact with job-search features. We also collect usage data, account activity, and technical information needed to operate the service.",
    ],
    list: [
      "Profile information such as your name, role targets, and work examples.",
      "Account details such as email address and subscription status.",
      "Usage and diagnostics data such as pages visited, saved roles, and feature interactions.",
    ],
  },
  {
    heading: "2. How we use your information",
    body: [
      "We use your information to create and refine your profile, find relevant contacts and opportunities, generate drafts, maintain your account, and improve the product. We may also use aggregated or de-identified data for product analytics and quality improvements.",
    ],
  },
  {
    heading: "3. Sharing and disclosure",
    body: [
      "We do not sell your personal data. We may share information with service providers that help us operate the product, such as hosting, billing, and analytics vendors, and where required by law or to protect legal rights.",
    ],
  },
  {
    heading: "4. Your choices",
    body: [
      "You may request access to, correction of, or deletion of your personal information where applicable law allows. You can also stop using the service and close your account at any time.",
    ],
  },
  {
    heading: "5. Retention and security",
    body: [
      "We retain account and usage data for as long as needed to provide the service, comply with legal obligations, resolve disputes, and enforce agreements. We use reasonable administrative, technical, and physical safeguards to protect your information.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="This policy explains what information Dumpster Fire collects, why it is collected, and how it is used."
      sections={sections}
      footerNote="If you have privacy questions, contact us through the support page and we will respond as quickly as we can."
      relatedLinks={[
        { href: "/legal/terms", label: "Terms of Service" },
        { href: "/legal/billing", label: "Subscription & Billing" },
        { href: "/legal/contact", label: "Contact & Support" },
      ]}
    />
  );
}
