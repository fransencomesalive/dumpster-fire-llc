import type { NormalizedConnectorJob } from "./connectors";
import type { Company, FitBucket, Job, RecommendedAction, UserSearchProfile } from "./types";

export type MatchDecision = {
  included: boolean;
  score: number;
  bucket: FitBucket;
  matchQuality: "good" | "stretch" | "bad";
  recommendedAction: RecommendedAction;
  fitSummary: string;
  positives: string[];
  risks: string[];
  evidence: string[];
  roleFamily: string;
  confidence: "high" | "medium" | "low";
  rulesVersion: string;
};

export type TitleFamilyRule = {
  family: string;
  include: string[];
  exclude: string[];
};

export type ResumeRoleSignals = {
  sourceDocuments: string[];
  supportedQualificationPatterns: string[];
  weakOrUnsupportedQualificationPatterns: string[];
  roleTracks?: ResumeRoleTrackSignal[];
  wrongLanePatterns?: string[];
};

export type ResumeRoleTrackSignal = {
  id: string;
  label: string;
  titlePatterns: string[];
  responsibilityPatterns: string[];
  contextPatterns: string[];
  proofPatterns: string[];
  weakPatterns: string[];
};

export type MatchingRuleConfig = {
  rulesVersion: string;
  titleFamilyRules: TitleFamilyRule[];
  stretchTitlePatterns?: string[];
  resumeRoleSignals?: ResumeRoleSignals;
  requiredQualificationMismatchPatterns?: string[];
  hardExcludedTitlePatterns: string[];
  authoritySignals: string[];
  juniorSignals: string[];
};

type MatchInput = Pick<
  Job,
  | "title"
  | "companyName"
  | "department"
  | "location"
  | "remoteType"
  | "employmentType"
  | "salaryMin"
  | "salaryMax"
  | "salaryText"
  | "descriptionText"
  | "firstSeenAt"
  | "needsContactResearch"
>;

export const randallPrivateMatchingConfig: MatchingRuleConfig = {
  rulesVersion: "randall-private-2026-06-12-offshore-hubs",
  titleFamilyRules: [
    {
      family: "production-leadership",
      include: [
        "executive producer",
        "head of production",
        "director of production",
        "senior producer",
        "creative producer",
        "lead producer",
        "integrated producer",
        "creative production lead",
        "brand production lead",
        "marketing production lead",
        "campaign production lead",
        "production operations lead",
        "post producer",
        "production director",
        "vp of production",
        "vice president of production",
        "vice president, production",
      ],
      exclude: ["game producer", "technical producer", "line producer", "event producer", "social producer"],
    },
    {
      family: "creative-operations",
      include: [
        "creative operations",
        "studio operations",
        "brand operations",
        "content operations",
        "production operations",
        "creative program",
        "design program",
        "studio program",
        "creative studio",
      ],
      exclude: ["sales operations", "data center operations", "finance operations", "business operations"],
    },
    {
      family: "program-leadership",
      include: [
        "program director",
        "program lead",
        "principal program manager",
        "senior program manager",
        "delivery lead",
        "ai delivery lead",
        "delivery director",
        "director, delivery",
        "director of delivery",
        "director, program",
        "director program management",
        "creative program director",
        "creative program manager",
        "design program manager",
        "design program lead",
        "studio program manager",
        "product operations lead",
        "launch operations lead",
        "strategic operations lead",
        "ai enablement program lead",
      ],
      exclude: ["technical program manager", "engineering program manager", "scrum master", "agile program"],
    },
    {
      family: "ai-enablement",
      include: ["ai enablement", "creative ai", "ai operations", "ai production", "ai program", "ai delivery lead", "ai strategy delivery lead"],
      exclude: ["machine learning engineer", "software engineer", "data scientist", "research scientist", "counsel", "legal", "attorney", "lawyer"],
    },
  ],
  stretchTitlePatterns: [
    "product operations manager",
    "strategy operations lead",
    "strategy & operations lead",
    "strategic operations lead",
    "ai delivery lead",
    "ai strategy delivery lead",
    "creative operations manager",
    "production operations manager",
    "brand operations lead",
    "studio operations lead",
    "launch operations lead",
    "producer",
    "executive program manager",
    "executive operations manager",
    "content producer",
    "program manager",
  ],
  resumeRoleSignals: {
    sourceDocuments: [
      "Randall_Fransen-RESUME-0626-PM.pdf",
      "Randall_Fransen-RESUME-0626-EP.pdf",
    ],
    supportedQualificationPatterns: [
      "program leadership",
      "program director",
      "program manager",
      "operations leadership",
      "operational leadership",
      "creative operations",
      "studio operations",
      "production operations",
      "creative production",
      "digital production",
      "integrated production",
      "cross functional",
      "cross functional stakeholders",
      "stakeholder management",
      "workflow systems",
      "process design",
      "resource planning",
      "forecasting",
      "vendor management",
      "vendor coordination",
      "budgeting",
      "budget ownership",
      "creative asset delivery",
      "production intake",
      "production prioritization",
      "product launches",
      "launch operations",
      "marketing programs",
      "brand launches",
      "campaign delivery",
      "agency production",
      "client facing leadership",
      "product development",
      "gtm launch",
      "ai workflow systems",
      "ai workflow design",
      "ai integration consulting",
      "agentic workflows",
      "agentic ai",
      "llm orchestration",
      "mcp integrations",
      "remote collaboration",
      "distributed vendors",
      "distributed stakeholders",
    ],
    weakOrUnsupportedQualificationPatterns: [
      "customer-facing product education",
      "customer facing product education",
      "technical content",
      "enablement programs",
      "webinars",
      "demos",
      "guides",
      "adoption resources",
      "enterprise saas",
      "developer tools",
      "technical education",
      "enterprise customer adoption",
      "enablement strategies",
      "customer adoption",
      "customer enablement",
      "procurement operations",
      "front office brokerage",
      "brokerage operations",
      "issuing bank",
      "banking operations",
      "sales operations",
      "revenue operations",
      "talent operations",
      "people operations",
      "it operations",
      "security operations",
      "data operations",
      "regulatory operations",
    ],
    roleTracks: [
      {
        id: "executive_producer",
        label: "Executive Producer",
        titlePatterns: [
          "executive producer",
          "senior executive producer",
          "director of production",
          "head of production",
          "production director",
          "creative producer",
          "creative production lead",
          "brand production lead",
          "integrated producer",
          "senior producer",
          "production operations lead",
          "marketing production lead",
        ],
        responsibilityPatterns: [
          "creative production",
          "digital production",
          "integrated production",
          "campaign production",
          "campaign delivery",
          "brand launch",
          "product launch",
          "global launch",
          "production leadership",
          "production intake",
          "production prioritization",
          "production systems",
          "studio operations",
          "creative operations",
          "vendor management",
          "vendor coordination",
          "budget",
          "resource planning",
          "forecasting",
          "stakeholder management",
          "cross functional stakeholders",
          "client facing",
          "creative asset delivery",
          "creative quality",
          "delivery teams",
        ],
        contextPatterns: [
          "creative",
          "brand",
          "studio",
          "agency",
          "campaign",
          "marketing",
          "product",
          "launch",
          "internal creative studio",
          "technology company",
          "web3",
          "fintech",
          "ai",
        ],
        proofPatterns: [
          "coinbase",
          "base",
          "airbnb",
          "akqa",
          "instrument",
          "cp+b",
          "aleo",
          "yuga labs",
          "mozilla",
          "twitchcon",
          "microsoft",
          "copilot",
          "$14mm",
          "$4mm",
        ],
        weakPatterns: [
          "onsite event production",
          "event logistics",
          "fabrication",
          "staging",
          "permits",
          "line producer",
          "game producer",
          "social producer",
          "tv production",
          "broadcast production",
        ],
      },
      {
        id: "program_director",
        label: "Program Director",
        titlePatterns: [
          "program director",
          "principal program manager",
          "senior program manager",
          "creative program director",
          "creative program manager",
          "design program manager",
          "design operations lead",
          "creative operations director",
          "product operations lead",
          "product operations manager",
          "ai delivery lead",
          "ai strategy delivery lead",
          "ai enablement program lead",
          "ai enablement lead",
          "ai enablement",
          "strategic operations lead",
          "launch operations lead",
          "executive program manager",
          "executive operations manager",
          "director, program",
          "director program management",
        ],
        responsibilityPatterns: [
          "program leadership",
          "program architecture",
          "operating model",
          "operational model",
          "operational models",
          "delivery frameworks",
          "operational systems",
          "process design",
          "workflow design",
          "workflow systems",
          "governance",
          "roadmap",
          "cross functional",
          "stakeholder alignment",
          "stakeholder management",
          "resource planning",
          "launch operations",
          "product operations",
          "creative operations",
          "design operations",
          "studio operations",
          "marketing operations",
          "internal enablement",
          "internal tools",
          "ai enablement",
          "ai strategies",
          "ai workflow",
          "agentic workflows",
          "llm orchestration",
          "mcp integrations",
          "automation",
          "product development",
          "gtm",
          "business operations",
        ],
        contextPatterns: [
          "creative",
          "design",
          "studio",
          "brand",
          "product",
          "marketing",
          "launch",
          "operations",
          "ai",
          "agentic",
          "technology",
          "fintech",
          "web3",
          "internal creative studio",
        ],
        proofPatterns: [
          "mission squad",
          "ai platform",
          "cooperative agents",
          "private data",
          "mcp tools",
          "coinbase",
          "base",
          "akqa",
          "mozilla",
          "twitchcon",
          "microsoft",
          "copilot",
        ],
        weakPatterns: [
          "scrum master",
          "agile ceremony",
          "jira hygiene",
          "engineering only",
          "technical program manager",
          "customer education",
          "customer enablement",
          "technical education",
          "developer tools",
          "enterprise saas",
          "sales operations",
          "revenue operations",
          "finance operations",
          "talent operations",
          "people operations",
        ],
      },
    ],
    wrongLanePatterns: [
      "procurement operations",
      "front office brokerage",
      "brokerage operations",
      "issuing bank",
      "banking operations",
      "customer education",
      "customer enablement",
      "technical education",
      "developer education",
      "developer tools",
      "enterprise customer adoption",
      "sales operations",
      "revenue operations",
      "finance operations",
      "talent acquisition",
      "people operations",
      "hr operations",
      "compensation operations",
      "it operations",
      "security operations",
      "data operations",
      "regulatory operations",
      "compliance operations",
    ],
  },
  hardExcludedTitlePatterns: [
    "software engineer",
    "frontend engineer",
    "backend engineer",
    "full stack engineer",
    "principal designer",
    "product designer",
    "visual designer",
    "design director",
    "creative director",
    "art director",
    "copywriter",
    "counsel",
    "legal",
    "attorney",
    "lawyer",
    "policy communications",
    "communications lead",
    "technical project manager",
    "technical program manager",
    "customer education",
    "customer enablement",
    "technical education",
    "developer education",
    "compute infrastructure",
    "cloud inference",
    "ai infrastructure",
    "hardware operations",
    "supply chain",
    "it operations",
    "cpu storage",
    "pop wan",
    "it asset",
    "asset management",
    "data operations",
    "human data",
    "data acquisition",
    "corporate security",
    "cybersecurity",
    "cyber security",
    "talent acquisition",
    "performance and talent",
    "compensation operations",
    "recruiting",
    "operations sourcing manager",
    "data center",
    "compliance",
    "regulatory",
    "grc",
    "performance marketing",
    "social media manager",
    "usaid",
    "newsgathering",
    "news producer",
    "podcast producer",
    "influencer marketing",
    "procurement operations",
    "front office brokerage",
    "brokerage operations",
    "issuing bank",
    "banking operations",
  ],
  requiredQualificationMismatchPatterns: [],
  authoritySignals: [
    "own",
    "lead",
    "oversee",
    "strategy",
    "roadmap",
    "cross-functional",
    "stakeholder",
    "delivery",
    "workflow",
    "operations",
    "production",
    "studio",
    "program",
    "budget",
    "vendor",
    "process",
  ],
  juniorSignals: ["intern", "junior", "assistant", "coordinator", "entry level", "associate"],
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isTitleFamilyRule(value: unknown): value is TitleFamilyRule {
  if (!value || typeof value !== "object") return false;

  const rule = value as Partial<TitleFamilyRule>;
  return typeof rule.family === "string" && isStringArray(rule.include) && isStringArray(rule.exclude);
}

export function isMatchingRuleConfig(value: unknown): value is MatchingRuleConfig {
  if (!value || typeof value !== "object") return false;

  const config = value as Partial<MatchingRuleConfig>;
  return (
    typeof config.rulesVersion === "string" &&
    Array.isArray(config.titleFamilyRules) &&
    config.titleFamilyRules.every(isTitleFamilyRule) &&
    isStringArray(config.hardExcludedTitlePatterns) &&
    isStringArray(config.authoritySignals) &&
    isStringArray(config.juniorSignals)
  );
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").replace(/\s+/g, " ").trim();
}

function termsFromProfile(terms: string[]) {
  return terms.map(normalize).filter(Boolean);
}

function includesTerm(content: string, term: string) {
  return content.includes(normalize(term));
}

function matchingTerms(content: string, terms: string[]) {
  return Array.from(new Set(termsFromProfile(terms).filter((term) => term && content.includes(term))));
}

function classifyTitleFamily(title: string, profile: UserSearchProfile, config: MatchingRuleConfig) {
  const normalizedTitle = normalize(title);
  const targetTitleMatches = matchingTerms(normalizedTitle, profile.targetTitles);
  const stretchTitleMatches = matchingTerms(normalizedTitle, config.stretchTitlePatterns ?? []);

  for (const rule of config.titleFamilyRules) {
    if (rule.exclude.some((term) => includesTerm(normalizedTitle, term))) {
      continue;
    }

    if (rule.include.some((term) => includesTerm(normalizedTitle, term))) {
      return {
        family: rule.family,
        strength: "strong" as const,
        evidence: rule.include.filter((term) => includesTerm(normalizedTitle, term)),
      };
    }
  }

  if (targetTitleMatches.length > 0) {
    return {
      family: "profile-target",
      strength: "strong" as const,
      evidence: targetTitleMatches,
    };
  }

  if (stretchTitleMatches.length > 0) {
    return {
      family: "profile-adjacent-stretch",
      strength: "stretch" as const,
      evidence: stretchTitleMatches,
    };
  }

  return {
    family: "unclassified",
    strength: "none" as const,
    evidence: [],
  };
}

function actionFromBucket(bucket: FitBucket, needsContactResearch: boolean): RecommendedAction {
  if (bucket === "A") return needsContactResearch ? "research_contact" : "apply_and_message_today";
  if (bucket === "B" || bucket === "C") return "review";
  if (bucket === "monitor") return "monitor";
  return "skip";
}

function bucketFromScore(score: number, risks: string[]): FitBucket {
  if (risks.some((risk) => risk.startsWith("hard exclude") || risk === "do-not-apply company")) return "skip";
  if (score >= 82) return "A";
  if (score >= 68) return "B";
  if (score >= 50) return "C";
  if (score >= 38) return "monitor";
  return "skip";
}

function qualityFromDecision(input: {
  included: boolean;
  score: number;
  bucket: FitBucket;
  confidence: MatchDecision["confidence"];
  risks: string[];
}) {
  if (!input.included || input.bucket === "skip") return "bad";
  if (
    (input.bucket === "A" || input.bucket === "B") &&
    input.confidence === "high" &&
    !input.risks.some((risk) => (
      risk.includes("stretch title signal") ||
      risk.includes("location") ||
      risk.includes("remote status unclear for") ||
      risk.includes("posting content not available") ||
      risk.includes("resume track not confirmed") ||
      risk.includes("compensation may be low") ||
      risk.includes("no compensation")
    ))
  ) {
    return "good";
  }
  return "stretch";
}

function salaryClearsFloor(job: MatchInput, profile: UserSearchProfile) {
  const values = [job.salaryMin ?? 0, job.salaryMax ?? 0].filter((value) => value > 0);

  if (job.employmentType === "contract" || job.employmentType === "freelance") {
    return values.some((value) => (value < 10000 ? value >= profile.freelanceRateFloor : value >= profile.compensationFloor));
  }

  return values.some((value) => value >= profile.compensationFloor);
}

function postedSalaryBelowFloor(job: MatchInput, profile: UserSearchProfile) {
  if (profile.compensationFloor <= 0) return false;
  if (job.employmentType !== "full-time") return false;
  const postedMax = job.salaryMax ?? 0;
  return postedMax >= 10000 && postedMax < profile.compensationFloor;
}

function hasRemoteLocationSignal(location: string) {
  const normalizedLocation = normalize(location);
  return /\b(remote|distributed|work from home|wfh|anywhere|worldwide)\b/.test(normalizedLocation);
}

function isBroadRemoteEligibleRegion(location: string) {
  const normalizedLocation = normalize(location);
  return (
    normalizedLocation === "" ||
    normalizedLocation === "remote" ||
    normalizedLocation === "united states" ||
    normalizedLocation === "usa" ||
    normalizedLocation === "us" ||
    normalizedLocation === "u s" ||
    normalizedLocation === "north america" ||
    normalizedLocation === "americas"
  );
}

function hasConcreteLocationWithoutRemoteSignal(location: string) {
  return Boolean(location.trim()) && !hasRemoteLocationSignal(location) && !isBroadRemoteEligibleRegion(location);
}

const usInclusiveLocationPattern = new RegExp([
  "united states", "usa", "u s", "us", "us only", "us based", "us remote", "remote us",
  "north america", "americas",
  "eastern time", "pacific time", "central time", "mountain time", "est", "pst", "cst", "mst",
].map((term) => `\\b${term}\\b`).join("|"));

const nonUsRestrictedLocationPattern = new RegExp([
  // Europe
  "united kingdom", "uk", "england", "scotland", "wales", "ireland", "london", "dublin",
  "europe", "european union", "emea", "germany", "france", "spain", "portugal", "italy",
  "netherlands", "belgium", "sweden", "norway", "denmark", "finland", "poland", "romania",
  "czech republic", "czechia", "austria", "switzerland", "greece", "hungary", "ukraine",
  "estonia", "latvia", "lithuania", "serbia", "croatia", "bulgaria", "slovakia", "slovenia",
  "cyprus", "malta", "turkey",
  // Asia-Pacific (countries and common offshore hub cities)
  "asia", "apac", "india", "philippines", "singapore", "japan", "tokyo", "china", "hong kong",
  "south korea", "korea", "vietnam", "thailand", "indonesia", "malaysia", "pakistan",
  "bangladesh", "sri lanka", "nepal", "australia", "new zealand",
  "bengaluru", "bangalore", "mumbai", "hyderabad", "chennai", "pune", "gurgaon", "gurugram",
  "noida", "new delhi", "kolkata", "ahmedabad", "manila", "cebu",
  // Africa and Middle East
  "africa", "nigeria", "kenya", "south africa", "egypt", "middle east", "israel",
  "united arab emirates", "uae", "dubai", "saudi arabia",
  // Americas restrictions that exclude US-based candidates
  "canada", "mexico", "brazil", "argentina", "colombia", "peru", "chile", "ecuador",
  "uruguay", "paraguay", "bolivia", "venezuela", "costa rica", "guatemala", "honduras",
  "nicaragua", "panama", "dominican republic", "latam", "latin america", "south america",
  "central america",
].map((term) => `\\b${term}\\b`).join("|"));

function isNonUsRestrictedLocation(location: string) {
  const normalizedLocation = normalize(location);
  if (!normalizedLocation) return false;
  if (usInclusiveLocationPattern.test(normalizedLocation)) return false;
  return nonUsRestrictedLocationPattern.test(normalizedLocation);
}

function hasReviewPlausibleUnclassifiedTitle(title: string) {
  const normalizedTitle = normalize(title);
  const reviewTitleSignals = [
    "operations",
    "program",
    "producer",
    "production",
    "creative",
    "studio",
    "strategy",
    "product",
    "delivery",
    "transformation",
    "enablement",
    "chief",
    "director",
    "head of",
    "lead",
    "manager",
  ];
  const blockedTitleSignals = [
    "engineer",
    "developer",
    "architect",
    "analyst",
    "account manager",
    "sales",
    "support",
    "counsel",
    "legal",
    "designer",
    "recruiter",
    "security",
  ];

  return reviewTitleSignals.some((signal) => includesTerm(normalizedTitle, signal)) && !blockedTitleSignals.some((signal) => includesTerm(normalizedTitle, signal));
}

function evaluateResumeRoleTrack(title: string, content: string, config: MatchingRuleConfig) {
  const roleTracks = config.resumeRoleSignals?.roleTracks ?? [];
  const trackDecisions = roleTracks.map((track) => {
    const titleMatches = matchingTerms(title, track.titlePatterns);
    const responsibilityMatches = matchingTerms(content, track.responsibilityPatterns);
    const contextMatches = matchingTerms(content, track.contextPatterns);
    const proofMatches = matchingTerms(content, track.proofPatterns);
    const weakMatches = matchingTerms(content, track.weakPatterns);
    const supportCount = responsibilityMatches.length + contextMatches.length + proofMatches.length;
    const score = titleMatches.length * 5 + responsibilityMatches.length * 3 + contextMatches.length * 2 + proofMatches.length - weakMatches.length * 4;
    const confirmed = titleMatches.length > 0 && (
      responsibilityMatches.length >= 2 ||
      (responsibilityMatches.length >= 1 && contextMatches.length >= 1 && supportCount >= 3)
    );

    return {
      track,
      titleMatches,
      responsibilityMatches,
      contextMatches,
      proofMatches,
      weakMatches,
      score,
      confirmed,
    };
  });

  return trackDecisions.sort((firstTrack, secondTrack) => secondTrack.score - firstTrack.score)[0];
}

function isUnsupportedMarketingTitle(title: string) {
  const normalizedTitle = normalize(title);
  const hasMarketingSignal = /\b(marketing|marketer)\b/.test(normalizedTitle);
  const hasProductionOrProgramSignal = /\b(production|producer|program|programs)\b/.test(normalizedTitle);

  return hasMarketingSignal && !hasProductionOrProgramSignal;
}

const gameIndustryContentPattern = /\b(video games?|game studio|games studio|game development|game developer|gameplay|aaa games?|aaa titles?|mobile games?|game design|gaming compan(?:y|ies)|games compan(?:y|ies)|game publisher)\b/g;

function isGameStudioRoleWithoutCreativeException(title: string, companyName: string, content: string) {
  const normalizedTitle = normalize(title);
  const distinctGamePhrases = new Set(content.match(gameIndustryContentPattern) ?? []);
  const hasGameStudioSignal = /\bgames?\b/.test(normalize(companyName)) || distinctGamePhrases.size >= 2;
  if (!hasGameStudioSignal) return false;

  const hasCreativeProductionTitle = /\b(marketing|creative|brand|content)\b/.test(normalizedTitle) && /\b(producer|production)\b/.test(normalizedTitle);
  const titleCentersGameplay = /\bgameplay\b/.test(normalizedTitle);

  return !hasCreativeProductionTitle || titleCentersGameplay;
}

export function evaluateJobMatch(job: MatchInput, profile: UserSearchProfile, config = randallPrivateMatchingConfig): MatchDecision {
  const title = normalize(job.title);
  const content = normalize(`${job.title} ${job.department} ${job.descriptionText} ${job.companyName} ${job.location}`);
  const positives: string[] = [];
  const risks: string[] = [];
  const evidence: string[] = [];
  let score = 20;

  if (profile.doNotApplyCompanies.some((companyName) => includesTerm(normalize(job.companyName), companyName))) {
    risks.push("do-not-apply company");
  }

  const hardExcludedTitle = config.hardExcludedTitlePatterns.find((term) => includesTerm(title, term));
  if (hardExcludedTitle) {
    risks.push(`hard exclude title family: ${hardExcludedTitle}`);
  }

  if (!hardExcludedTitle && isUnsupportedMarketingTitle(job.title)) {
    risks.push("hard exclude title family: marketing without production/program");
  }

  if (!hardExcludedTitle && isGameStudioRoleWithoutCreativeException(job.title, job.companyName, content)) {
    risks.push("hard exclude title family: game studio role without marketing/creative production exception");
  }

  const negativeTitleMatch = matchingTerms(title, profile.negativeKeywords);
  if (negativeTitleMatch.length > 0) {
    risks.push(`negative title signal: ${negativeTitleMatch.slice(0, 2).join(", ")}`);
  }

  const titleFamily = classifyTitleFamily(job.title, profile, config);
  if (titleFamily.strength === "strong" || titleFamily.strength === "stretch") {
    score += titleFamily.strength === "strong" ? 34 : 24;
    positives.push(`role family: ${titleFamily.family}`);
    evidence.push(`title evidence: ${titleFamily.evidence.slice(0, 2).join(", ")}`);
    if (titleFamily.strength === "stretch") {
      risks.push("stretch title signal");
    }
  } else {
    risks.push("title family not confirmed");
  }

  const profileKeywordMatches = matchingTerms(content, profile.positiveKeywords);
  const authorityMatches = matchingTerms(content, config.authoritySignals);
  const resumeSupportedMatches = matchingTerms(content, config.resumeRoleSignals?.supportedQualificationPatterns ?? []);
  const resumeTrackDecision = evaluateResumeRoleTrack(title, content, config);
  const hasResumeRoleTrackRules = (config.resumeRoleSignals?.roleTracks?.length ?? 0) > 0;

  if (profileKeywordMatches.length > 0) {
    score += Math.min(16, profileKeywordMatches.length * 4);
    positives.push(`profile evidence: ${profileKeywordMatches.slice(0, 3).join(", ")}`);
  }

  if (authorityMatches.length >= 3) {
    score += 12;
    positives.push(`authority evidence: ${authorityMatches.slice(0, 4).join(", ")}`);
  } else if (authorityMatches.length > 0) {
    score += 5;
    positives.push(`some authority evidence: ${authorityMatches.slice(0, 2).join(", ")}`);
  } else {
    risks.push("no responsibility/authority evidence");
  }

  if (resumeSupportedMatches.length > 0) {
    score += Math.min(8, resumeSupportedMatches.length * 2);
    positives.push(`resume evidence: ${resumeSupportedMatches.slice(0, 3).join(", ")}`);
  }

  if (resumeTrackDecision?.confirmed) {
    score += Math.min(14, 6 + resumeTrackDecision.responsibilityMatches.length * 2 + resumeTrackDecision.contextMatches.length);
    positives.push(`resume track: ${resumeTrackDecision.track.label}`);
    evidence.push(`track title: ${resumeTrackDecision.titleMatches.slice(0, 2).join(", ")}`);
    evidence.push(`track responsibility: ${resumeTrackDecision.responsibilityMatches.slice(0, 3).join(", ")}`);
    if (resumeTrackDecision.contextMatches.length > 0) {
      evidence.push(`track context: ${resumeTrackDecision.contextMatches.slice(0, 3).join(", ")}`);
    }
  } else if (hasResumeRoleTrackRules) {
    score -= 12;
    risks.push("resume track not confirmed");
  }

  if (resumeTrackDecision && resumeTrackDecision.weakMatches.length > 0) {
    score -= Math.min(18, resumeTrackDecision.weakMatches.length * 6);
    risks.push(`track weak signal: ${resumeTrackDecision.weakMatches.slice(0, 2).join(", ")}`);
  }

  const requiredQualificationMismatches = matchingTerms(content, [
    ...(config.requiredQualificationMismatchPatterns ?? []),
    ...(config.resumeRoleSignals?.weakOrUnsupportedQualificationPatterns ?? []),
  ]);
  if (requiredQualificationMismatches.length >= 3) {
    score -= 30;
    risks.push(`required qualification mismatch: ${requiredQualificationMismatches.slice(0, 3).join(", ")}`);
  } else if (requiredQualificationMismatches.length > 0) {
    score -= 14;
    risks.push(`possible qualification mismatch: ${requiredQualificationMismatches.slice(0, 2).join(", ")}`);
  }

  const restrictionEvidence = profile.remoteOnly
    ? (isNonUsRestrictedLocation(job.location)
        ? job.location
        : isNonUsRestrictedLocation(job.title) ? "region named in title" : "")
    : "";

  if (restrictionEvidence) {
    score -= 30;
    risks.push(`location restricted to ${restrictionEvidence}`);
    risks.push("hard remote constraint: not eligible for US-based candidates");
  } else if (job.remoteType === "remote") {
    score += 10;
    positives.push("remote role");
  } else if (profile.remoteOnly && job.remoteType === "onsite") {
    score -= 28;
    risks.push("onsite location");
    risks.push("hard remote constraint: onsite posting");
  } else if (profile.remoteOnly && job.remoteType === "hybrid") {
    score -= 16;
    risks.push("hybrid location");
    risks.push("remote risk: listed as hybrid; pursue only if remote exceptions are plausible");
  } else if (profile.remoteOnly && hasConcreteLocationWithoutRemoteSignal(job.location)) {
    score -= 18;
    risks.push(`remote status unclear for ${job.location}`);
  } else if (profile.remoteOnly) {
    risks.push("remote status unclear");
    evidence.push("remote status not listed");
  }

  if (
    profile.remoteOnly &&
    titleFamily.strength === "stretch" &&
    job.remoteType !== "remote" &&
    !hasConcreteLocationWithoutRemoteSignal(job.location)
  ) {
    risks.push("hard remote constraint: stretch title requires confirmed remote posting");
  }

  if (salaryClearsFloor(job, profile)) {
    score += 8;
    positives.push("compensation clears floor");
  } else if (postedSalaryBelowFloor(job, profile)) {
    score -= 24;
    risks.push("hard compensation constraint: posted maximum below floor");
  } else if (job.salaryText) {
    score -= 5;
    risks.push("compensation may be low");
  } else {
    evidence.push("compensation not listed");
  }

  const targetIndustryMatches = matchingTerms(content, profile.targetIndustries);
  if (targetIndustryMatches.length > 0) {
    score += Math.min(6, targetIndustryMatches.length * 2);
    positives.push(`industry evidence: ${targetIndustryMatches.slice(0, 2).join(", ")}`);
  }

  const negativeContentMatches = matchingTerms(content, profile.negativeKeywords);
  if (negativeContentMatches.length > negativeTitleMatch.length) {
    score -= 18;
    risks.push(`negative content signal: ${negativeContentMatches.slice(0, 2).join(", ")}`);
  }

  const wrongLaneMatches = matchingTerms(content, config.resumeRoleSignals?.wrongLanePatterns ?? []);
  if (wrongLaneMatches.length > 0) {
    score -= 28;
    risks.push(`profile wrong lane: ${wrongLaneMatches.slice(0, 2).join(", ")}`);
  }

  if (matchingTerms(title, config.juniorSignals).length > 0) {
    score -= 22;
    risks.push("junior/seniority mismatch");
  }

  const firstSeen = new Date(job.firstSeenAt).getTime();
  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  if (Number.isFinite(firstSeen) && firstSeen < fourteenDaysAgo && score < 82) {
    score -= 6;
    risks.push("older than 14 days");
  }

  const contentTooThinToJudge = normalize(job.descriptionText).length < 80;
  if (contentTooThinToJudge && titleFamily.strength === "strong") {
    risks.push("posting content not available from source");
  }

  const hasConfirmedRoleFamily = titleFamily.strength === "strong" || titleFamily.strength === "stretch";
  const hasAuthorityEvidence = authorityMatches.length >= 2 || profileKeywordMatches.length >= 2 || (contentTooThinToJudge && titleFamily.strength === "strong");
  const resumeTrackConfirmed = !hasResumeRoleTrackRules || Boolean(resumeTrackDecision?.confirmed);
  const stretchPartialTrackEvidence = (
    titleFamily.strength === "stretch" &&
    job.remoteType === "remote" &&
    (resumeTrackDecision?.responsibilityMatches.length ?? 0) >= 1
  );
  const hasResumeTrackEvidence = resumeTrackConfirmed || titleFamily.strength === "strong" || stretchPartialTrackEvidence;
  const hasStrongContentReviewEvidence = !hasConfirmedRoleFamily && hasReviewPlausibleUnclassifiedTitle(job.title) && authorityMatches.length >= 3 && (profileKeywordMatches.length >= 2 || resumeSupportedMatches.length >= 2);
  const hasHardRisk = risks.some((risk) => (
    risk.startsWith("hard exclude") ||
    risk.startsWith("hard remote constraint") ||
    risk.startsWith("hard compensation constraint") ||
    risk.startsWith("profile wrong lane") ||
    risk === "do-not-apply company" ||
    risk.includes("negative title signal")
  ));
  if (hasStrongContentReviewEvidence && !hasHardRisk) {
    evidence.push("content-led review evidence");
    risks.push("title family unconfirmed; keep out of matcher-pass batch");
  }

  const preliminaryIncluded = hasConfirmedRoleFamily && hasAuthorityEvidence && hasResumeTrackEvidence && !hasHardRisk;
  const candidateScore = preliminaryIncluded ? Math.max(0, Math.min(100, score)) : Math.min(37, Math.max(0, score));
  const candidateBucket = bucketFromScore(candidateScore, risks);
  const included = preliminaryIncluded && candidateBucket !== "skip";
  const clampedScore = included ? candidateScore : Math.min(37, candidateScore);
  const bucket = bucketFromScore(clampedScore, risks);
  const confidence = included && titleFamily.evidence.length > 0 && authorityMatches.length >= 3 ? "high" : included ? "medium" : "low";
  const matchQuality = qualityFromDecision({
    included,
    score: clampedScore,
    bucket,
    confidence,
    risks,
  });

  return {
    included,
    score: clampedScore,
    bucket,
    matchQuality,
    recommendedAction: actionFromBucket(bucket, job.needsContactResearch),
    fitSummary: included
      ? `${matchQuality === "good" ? "Good match" : "Stretch match"}: ${positives.slice(0, 3).join("; ")}.`
      : `Bad match: ${risks.slice(0, 3).join("; ") || "role family not confirmed"}.`,
    positives,
    risks,
    evidence,
    roleFamily: titleFamily.family,
    confidence,
    rulesVersion: config.rulesVersion,
  };
}

export function evaluateConnectorJobMatch(
  job: NormalizedConnectorJob,
  company: Company,
  profile: UserSearchProfile,
  config = randallPrivateMatchingConfig
): MatchDecision {
  return evaluateJobMatch({
    title: job.title,
    companyName: job.companyName || company.companyName,
    department: job.department,
    location: job.location,
    remoteType: job.remoteType,
    employmentType: job.employmentType,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryText: job.salaryText,
    descriptionText: job.descriptionText,
    firstSeenAt: new Date().toISOString(),
    needsContactResearch: true,
  }, profile, config);
}
