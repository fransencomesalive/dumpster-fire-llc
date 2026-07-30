import LegalPage from "../LegalPage";

const sections = [
  {
    heading: "1. What we collect",
    body: [
      "Only what you type in, plus the records the product needs to work. There is no tracking here. We do not log the pages you visit, we do not watch how you move around the site, and we do not record your screen.",
    ],
    list: [
      "Profile information you enter: your name, role targets, resumes, work examples, and the way you like to write.",
      "Account details: your email address and which plan you are on.",
      "Product records: the jobs you saved, the scans you ran, and how many Apply Wizard uses you have left. We keep these because the product cannot function without them.",
    ],
  },
  {
    heading: "2. How we use it",
    body: [
      "To build your profile, find jobs and contacts worth your time, draft your outreach, and keep your account running. That is the whole list. We do not run analytics tools, advertising pixels, or session recording of any kind.",
    ],
  },
  {
    heading: "3. We do not sell your data",
    body: [
      "Nobody pays us for your information. Your name is never attached to anything we hand to anyone for money, and there is no data broker in the background. We are not in that business and we are not going to be.",
      "Three companies do a specific job for us and see only what that job needs. Supabase stores your profile and account. Anthropic generates your outreach drafts from the profile and job details you give us. Stripe handles payment if you subscribe, and sees your billing details rather than your profile.",
      "That is the entire list. We also disclose information where the law requires it, or to protect legal rights.",
    ],
  },
  {
    heading: "4. Finding contacts",
    body: [
      "When we look for people connected to a job, we search public professional sources using details from the posting: the company, the role, the team. Your profile is not part of that search and is never sent to the search provider.",
    ],
  },
  {
    heading: "5. Cookies and local storage",
    body: [
      "Signed out, this site stores nothing on your device at all. No cookies, nothing in local storage, and no requests to anyone else.",
      "Once you sign in we store a session cookie to keep you signed in, and we save your in-progress profile drafts in your browser so you do not lose work. Both exist only to do the thing you asked for, which is why there is no cookie banner to click through. None of it is used to track you, here or anywhere else.",
    ],
  },
  {
    heading: "6. Your choices",
    body: [
      "You may request access to, correction of, or deletion of your personal information where applicable law allows. You can also stop using the service and close your account at any time.",
    ],
  },
  {
    heading: "7. Retention and security",
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
