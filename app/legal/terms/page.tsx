import LegalPage from "../LegalPage";

const sections = [
  {
    heading: "1. Acceptance of terms",
    body: [
      "By creating an account, using Dumpster Fire, or subscribing to a paid plan, you agree to these Terms of Service. If you do not agree, you should not use the service.",
    ],
  },
  {
    heading: "2. What the service does",
    body: [
      "Dumpster Fire helps people research roles, review target companies, identify likely contacts, and draft outreach messages based on their profile, work examples, and job-search inputs.",
      "The service is a decision-support tool. It does not guarantee interviews, offers, or employment outcomes.",
    ],
  },
  {
    heading: "3. Your responsibilities",
    body: [
      "You are responsible for the accuracy of the information you provide, the messages you send, and your compliance with applicable law. You may not use the service to harass, impersonate, spam, or misrepresent yourself.",
    ],
    list: [
      "Do not upload or transmit unlawful, abusive, or deceptive content.",
      "Do not scrape or redistribute our data in a way that violates third-party terms.",
      "Do not attempt to reverse engineer or bypass the service.",
    ],
  },
  {
    heading: "4. Accounts and subscriptions",
    body: [
      "Access to certain features requires an account and may require a paid subscription. You are responsible for keeping your login credentials secure.",
      "We may suspend or terminate access for violations of these terms or for conduct that threatens the service, other users, or our operations.",
    ],
  },
  {
    heading: "5. Intellectual property",
    body: [
      "You retain ownership of your profile content, work examples, and other materials you provide. By using the service, you grant us a license to process, store, and use that content to operate and improve the product.",
      "Dumpster Fire, its name, logo, and product materials remain our property unless otherwise stated.",
    ],
  },
  {
    heading: "6. Limitation of liability",
    body: [
      "To the maximum extent allowed by law, Dumpster Fire is provided as-is and we are not liable for indirect, incidental, or consequential damages. Our total liability is limited to the fees you paid for the service during the preceding twelve months, unless prohibited by law.",
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="These terms govern your use of Dumpster Fire and any paid plan you subscribe to."
      sections={sections}
      footerNote="These terms may be updated from time to time. Material changes will be posted here with a clear revision date."
      relatedLinks={[
        { href: "/legal/privacy", label: "Privacy Policy" },
        { href: "/legal/billing", label: "Subscription & Billing" },
        { href: "/legal/contact", label: "Contact & Support" },
      ]}
    />
  );
}
