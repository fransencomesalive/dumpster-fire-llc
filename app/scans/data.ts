import type { Company, Contact, ContactSuggestion, DashboardSettings, Job, ScanLog, UserSearchProfile } from "./types";

export const searchProfile: UserSearchProfile = {
  targetTitles: [
    "director of production",
    "head of production",
    "executive producer",
    "senior producer",
    "creative program manager",
    "design program manager",
    "creative operations",
    "studio operations",
    "ai enablement",
  ],
  positiveKeywords: [
    "production leadership",
    "creative operations",
    "studio operations",
    "cross-functional",
    "campaign",
    "brand",
    "content operations",
    "design system",
    "post production",
  ],
  negativeKeywords: [
    "aaa game",
    "scrum master",
    "agile delivery",
    "engineering manager",
    "junior producer",
    "social media manager",
    "performance marketing",
  ],
  targetIndustries: ["creative agency", "design agency", "internal creative studio", "tech", "fintech", "web3", "ai"],
  compensationFloor: 150000,
  freelanceRateFloor: 125,
  remoteOnly: true,
  doNotApplyCompanies: ["Left Field Labs"],
  approvedLoginEmail: "single approved email",
};

export const dashboardSettings: DashboardSettings = {
  scanEnabled: false,
  scanCadence: "manual",
  digestEnabled: false,
  digestCadence: "weekdays",
  digestTime: "08:30",
  maxRolesPerScan: 25,
};

// NO DEMO DATA. These arrays are intentionally empty. Production reads real data from
// Supabase; if Supabase is unreachable the dashboard surfaces a real error rather than
// masking it with fixtures. Never reintroduce sample companies, jobs, contacts, or logs here.
export const companies: Company[] = [];

export const jobs: Job[] = [];

export const contacts: Contact[] = [];

export const contactSuggestions: ContactSuggestion[] = [];

export const scanLogs: ScanLog[] = [];
