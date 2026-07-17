export type PublicProfileOnboardingSectionKey =
  | "identitySearch"
  | "roleTracks"
  | "resumes"
  | "workExamples"
  | "skills"
  | "voicePersonality";

export type PublicProfileOnboardingSection = {
  key: PublicProfileOnboardingSectionKey;
  label: string;
  description: string;
  path: string;
  required: boolean;
};

export const publicProfileOnboardingSections: PublicProfileOnboardingSection[] = [{
  key: "roleTracks",
  label: "Role Track & Résumé",
  description: "The lane you're pursuing and the résumé that backs it. Onboarding opens here.",
  path: "/api/public-profile/role-tracks",
  required: true,
}, {
  key: "identitySearch",
  label: "Identity and Search Basics",
  description: "Name, location, compensation, and search preferences.",
  path: "/api/public-profile/identity-search",
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
}];

export function publicProfileOnboardingSectionPath(key: PublicProfileOnboardingSectionKey) {
  return publicProfileOnboardingSections.find((section) => section.key === key)?.path;
}
