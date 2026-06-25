export type PublicProfileOnboardingSectionKey =
  | "identitySearch"
  | "roleTracks"
  | "resumes"
  | "workHistory"
  | "proofLibrary"
  | "skills"
  | "whyPeopleHireMe"
  | "operatingStyle"
  | "decisionStyle"
  | "communicationStyle"
  | "writingSamples"
  | "aiMisreadings"
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
  description: "Name, work authorization, location, compensation, and search preferences.",
  path: "/api/public-profile/identity-search",
  required: true,
}, {
  key: "roleTracks",
  label: "Role Tracks",
  description: "The specific modes the candidate can credibly pursue.",
  path: "/api/public-profile/role-tracks",
  required: true,
}, {
  key: "resumes",
  label: "Resume Uploads",
  description: "Parsed resumes and attachment to Role Tracks.",
  path: "/api/public-profile/resumes",
  required: true,
}, {
  key: "workHistory",
  label: "Work History",
  description: "Parsed experience, accomplishments, responsibilities, skills, and metrics.",
  path: "/api/public-profile/work-history",
  required: true,
}, {
  key: "proofLibrary",
  label: "Proof Library",
  description: "Projects and concrete proof objects used for matching and outreach.",
  path: "/api/public-profile/proof-library",
  required: true,
}, {
  key: "skills",
  label: "Skills Inventory",
  description: "Capabilities with evidence and links to proof/work history.",
  path: "/api/public-profile/skills",
  required: true,
}, {
  key: "whyPeopleHireMe",
  label: "Why People Hire Me",
  description: "Problems, messes, useful contexts, and boundaries.",
  path: "/api/public-profile/why-people-hire-me",
  required: true,
}, {
  key: "operatingStyle",
  label: "Operating Style",
  description: "How the candidate approaches ambiguity, teams, values, and tradeoffs.",
  path: "/api/public-profile/operating-style",
  required: true,
}, {
  key: "decisionStyle",
  label: "Decision Style",
  description: "Role evaluation rules, company signals, red flags, and green flags.",
  path: "/api/public-profile/decision-style",
  required: true,
}, {
  key: "communicationStyle",
  label: "Communication Style",
  description: "Tone, voice, phrases, and message preferences.",
  path: "/api/public-profile/communication-style",
  required: true,
}, {
  key: "writingSamples",
  label: "Writing Samples",
  description: "Liked and hated examples that prevent generic outreach.",
  path: "/api/public-profile/writing-samples",
  required: true,
}, {
  key: "aiMisreadings",
  label: "What AI Gets Wrong",
  description: "Wrong assumptions, bad framings, and language that misrepresents the candidate.",
  path: "/api/public-profile/ai-misreadings",
  required: true,
}, {
  key: "outreachRules",
  label: "Outreach Rules",
  description: "Contact approach, follow-up rules, proof routing, and Role Track-specific rules.",
  path: "/api/public-profile/outreach-rules",
  required: true,
}, {
  key: "leadershipProfile",
  label: "Leadership Profile",
  description: "Optional leadership/executive positioning hidden behind a toggle.",
  path: "/api/public-profile/leadership-profile",
  required: false,
}];

export function publicProfileOnboardingSectionPath(key: PublicProfileOnboardingSectionKey) {
  return publicProfileOnboardingSections.find((section) => section.key === key)?.path;
}
