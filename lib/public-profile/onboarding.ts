export type PublicProfileOnboardingSectionKey =
  | "identitySearch"
  | "fitSignals"
  | "roleTracks"
  | "resumes"
  | "workExamples"
  | "skills"
  | "voicePersonality"
  | "outreachRules"
  | "leadershipProfile";

export type PublicProfileOnboardingSection = {
  key: PublicProfileOnboardingSectionKey;
  label: string;
  description: string;
  path: string;
  required: boolean;
};

export const publicProfileOnboardingSections: PublicProfileOnboardingSection[] = [{
  key: "identitySearch",
  label: "Identity and Search Basics",
  description: "Name, location, compensation, and search preferences.",
  path: "/api/public-profile/identity-search",
  required: true,
}, {
  key: "fitSignals",
  label: "Fit Signals",
  description: "What makes a role a strong fit and what makes it a weak one.",
  path: "/api/public-profile/fit-signals",
  required: false,
}, {
  key: "roleTracks",
  label: "Role Tracks",
  description: "The specific roles you can credibly pursue.",
  path: "/api/public-profile/role-tracks",
  required: true,
}, {
  key: "resumes",
  label: "Resume Uploads",
  description: "Parsed resumes and attachment to Role Tracks.",
  path: "/api/public-profile/resumes",
  required: true,
}, {
  key: "workExamples",
  label: "Work Examples",
  description: "Text-only examples with a punchy one-hitter and optional link, used as context for outreach.",
  path: "/api/public-profile/work-examples",
  required: true,
}, {
  key: "skills",
  label: "Skills",
  description: "Capabilities with evidence and links to work examples.",
  path: "/api/public-profile/skills",
  required: true,
}, {
  key: "voicePersonality",
  label: "Voice and Personality",
  description: "What you are the person for, an opinion you will defend, writing samples, and tone tags.",
  path: "/api/public-profile/voice-personality",
  required: true,
}, {
  key: "outreachRules",
  label: "Outreach Rules",
  description: "Contact approach, follow-up rules, and Role Track-specific rules.",
  path: "/api/public-profile/outreach-rules",
  required: true,
}, {
  key: "leadershipProfile",
  label: "Leadership Profile",
  description: "Optional leadership positioning hidden behind a toggle.",
  path: "/api/public-profile/leadership-profile",
  required: false,
}];

export function publicProfileOnboardingSectionPath(key: PublicProfileOnboardingSectionKey) {
  return publicProfileOnboardingSections.find((section) => section.key === key)?.path;
}
