import type { MatchingRuleConfig, ResumeRoleTrackSignal, TitleFamilyRule } from "./matching";
import { randallPrivateMatchingConfig } from "./matching";
import type { UserSearchProfile } from "./types";

export type ProfileCompilerPreferences = {
  desiredTitles?: string[];
  avoidedTitles?: string[];
  desiredIndustries?: string[];
  avoidedKeywords?: string[];
  roleTracks?: ResumeRoleTrackSignal[];
  compensationFloor?: number;
  freelanceRateFloor?: number;
  remoteOnly?: boolean;
  doNotApplyCompanies?: string[];
  approvedLoginEmail?: string;
  baseMatchingConfig?: MatchingRuleConfig;
};

export type ProfileCompilerInput = {
  resumeText: string;
  profileText?: string;
  preferences?: ProfileCompilerPreferences;
};

export type CompiledProfileEvidence = {
  targetTitles: string[];
  positiveKeywords: string[];
  negativeKeywords: string[];
  targetIndustries: string[];
  inferredRoleFamilies: string[];
  roleTracks: Array<Pick<ResumeRoleTrackSignal, "id" | "label" | "titlePatterns" | "responsibilityPatterns" | "contextPatterns" | "proofPatterns" | "weakPatterns">>;
};

export type CompiledSearchProfile = {
  searchProfile: UserSearchProfile;
  matchingConfig: MatchingRuleConfig;
  confidence: "high" | "medium" | "low";
  missingInputs: string[];
  evidence: CompiledProfileEvidence;
};

type TermRule = {
  term: string;
  aliases?: string[];
  families?: string[];
};

export const profileOnboardingQuestions = [
  "Which 2-5 role titles or applying-as tracks should the search optimize for?",
  "What are the non-negotiable constraints: location, compensation, employment type, and companies to avoid?",
  "Which responsibilities, proof points, and seniority signals should count as strong evidence?",
  "Which adjacent-looking roles should be down-ranked or blocked because they are structurally wrong?",
  "Which industries, team contexts, and writing style should shape recommendations and outreach?",
];

const commonTitleRules: TermRule[] = [
  { term: "executive producer", families: ["production-leadership"] },
  { term: "head of production", families: ["production-leadership"] },
  { term: "director of production", families: ["production-leadership"] },
  { term: "senior producer", families: ["production-leadership"] },
  { term: "creative producer", families: ["production-leadership"] },
  { term: "program director", families: ["program-leadership"] },
  { term: "program manager", families: ["program-leadership"] },
  { term: "project manager", families: ["program-leadership"] },
  { term: "operations director", families: ["operations-leadership"] },
  { term: "operations manager", families: ["operations-leadership"] },
  { term: "creative operations", families: ["creative-operations"] },
  { term: "studio operations", families: ["creative-operations"] },
  { term: "product manager", families: ["product"] },
  { term: "product marketing", families: ["marketing"] },
  { term: "software engineer", families: ["engineering"] },
  { term: "engineering manager", families: ["engineering"] },
  { term: "designer", families: ["design"] },
  { term: "design manager", families: ["design"] },
  { term: "sales director", families: ["sales"] },
  { term: "account executive", families: ["sales"] },
  { term: "customer success", families: ["customer-success"] },
  { term: "talent acquisition", families: ["people"] },
  { term: "human resources", aliases: ["hr business partner"], families: ["people"] },
  { term: "counsel", aliases: ["attorney", "lawyer"], families: ["legal"] },
  { term: "compliance", aliases: ["regulatory", "grc"], families: ["legal-compliance"] },
];

const keywordRules: TermRule[] = [
  { term: "cross-functional" },
  { term: "stakeholder" },
  { term: "roadmap" },
  { term: "budget" },
  { term: "vendor" },
  { term: "workflow" },
  { term: "operations" },
  { term: "production" },
  { term: "studio" },
  { term: "program" },
  { term: "campaign" },
  { term: "brand" },
  { term: "launch" },
  { term: "strategy" },
  { term: "delivery" },
  { term: "systems" },
  { term: "process" },
  { term: "people management", aliases: ["managed a team", "led a team"] },
  { term: "client services", aliases: ["client relationship", "account management"] },
  { term: "ai", aliases: ["machine learning", "llm", "generative ai"] },
];

const industryRules: TermRule[] = [
  { term: "creative agency", aliases: ["agency"] },
  { term: "internal creative studio", aliases: ["in-house studio", "brand studio"] },
  { term: "technology", aliases: ["tech", "saas", "software"] },
  { term: "ai", aliases: ["artificial intelligence", "machine learning", "generative ai"] },
  { term: "fintech", aliases: ["financial technology"] },
  { term: "healthcare" },
  { term: "education", aliases: ["edtech"] },
  { term: "media", aliases: ["entertainment", "publishing"] },
  { term: "consumer" },
  { term: "nonprofit" },
];

const familyDefaultExclusions: Record<string, string[]> = {
  engineering: ["account executive", "sales director", "counsel", "attorney", "compliance"],
  design: ["software engineer", "sales director", "account executive", "counsel", "compliance"],
  "production-leadership": ["software engineer", "frontend engineer", "backend engineer", "account executive", "counsel", "compliance"],
  "program-leadership": ["software engineer", "frontend engineer", "backend engineer", "account executive", "counsel", "compliance"],
  sales: ["software engineer", "designer", "counsel", "compliance"],
  legal: ["software engineer", "designer", "account executive"],
  "legal-compliance": ["software engineer", "designer", "account executive"],
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").replace(/\s+/g, " ").trim();
}

function compactTerm(value: string) {
  return normalize(value);
}

function uniqueTerms(values: string[], limit: number) {
  const seen = new Set<string>();
  const terms: string[] = [];

  for (const value of values.map(compactTerm).filter(Boolean)) {
    if (seen.has(value)) continue;
    seen.add(value);
    terms.push(value);
    if (terms.length >= limit) break;
  }

  return terms;
}

function findRuleMatches(content: string, rules: TermRule[]) {
  return rules.filter((rule) => {
    const terms = [rule.term, ...(rule.aliases ?? [])];
    return terms.some((term) => content.includes(normalize(term)));
  });
}

function extractTitleCandidates(content: string, preferences: ProfileCompilerPreferences) {
  const explicitTitles = preferences.desiredTitles ?? [];
  const matchedTitles = findRuleMatches(content, commonTitleRules).map((rule) => rule.term);
  const headlineTitle = content.match(/\b(?:senior|principal|lead|director|head|manager|producer|designer|engineer|strategist)\s+[a-z0-9+# ]{2,48}\b/g) ?? [];

  return uniqueTerms([...explicitTitles, ...matchedTitles, ...headlineTitle], 12);
}

function inferFamilies(content: string, targetTitles: string[]) {
  const matchedFamilies = findRuleMatches(`${content} ${targetTitles.join(" ")}`, commonTitleRules)
    .flatMap((rule) => rule.families ?? []);
  return uniqueTerms(matchedFamilies, 8);
}

function titleRulesFromCompiledProfile(targetTitles: string[], families: string[], avoidedTitles: string[]): TitleFamilyRule[] {
  const include = uniqueTerms(targetTitles, 16);
  const family = families[0] ?? "compiled-target";
  const excludes = uniqueTerms(avoidedTitles, 12);
  const ruleByFamily = new Map<string, TitleFamilyRule>();
  const normalizedFamilies = new Set(families.map(normalize));

  for (const fallbackRule of randallPrivateMatchingConfig.titleFamilyRules) {
    if (!normalizedFamilies.has(normalize(fallbackRule.family))) continue;

    ruleByFamily.set(fallbackRule.family, {
      family: fallbackRule.family,
      include: uniqueTerms(fallbackRule.include, 32),
      exclude: uniqueTerms([...fallbackRule.exclude, ...excludes], 24),
    });
  }

  if (ruleByFamily.size === 0 && !ruleByFamily.has(family)) {
    ruleByFamily.set(family, {
      family,
      include,
      exclude: excludes,
    });
  }

  for (const secondaryFamily of families.slice(1, 5)) {
    if (ruleByFamily.has(secondaryFamily)) continue;

    const secondaryInclude = include.filter((title) => title.includes(secondaryFamily.replace(/-.+$/, ""))).slice(0, 4);
    if (secondaryInclude.length === 0) continue;

    ruleByFamily.set(secondaryFamily, {
      family: secondaryFamily,
      include: secondaryInclude,
      exclude: excludes,
    });
  }

  return Array.from(ruleByFamily.values());
}

function inferHardExclusions(families: string[], preferences: ProfileCompilerPreferences) {
  const familyExclusions = families.flatMap((family) => familyDefaultExclusions[family] ?? []);
  return uniqueTerms([
    ...(preferences.avoidedTitles ?? []),
    ...(preferences.avoidedKeywords ?? []),
    ...familyExclusions,
  ], 32);
}

function confidenceFromEvidence(targetTitles: string[], positiveKeywords: string[], targetIndustries: string[], missingInputs: string[]): CompiledSearchProfile["confidence"] {
  if (targetTitles.length >= 3 && positiveKeywords.length >= 6 && targetIndustries.length >= 2 && missingInputs.length === 0) return "high";
  if (targetTitles.length >= 2 && positiveKeywords.length >= 4) return "medium";
  return "low";
}

function compiledRoleTracks(input: {
  targetTitles: string[];
  positiveKeywords: string[];
  negativeKeywords: string[];
  targetIndustries: string[];
  explicitRoleTracks?: ResumeRoleTrackSignal[];
}): ResumeRoleTrackSignal[] {
  const explicitTracks = (input.explicitRoleTracks ?? [])
    .map((track) => ({
      id: compactTerm(track.id),
      label: track.label.replace(/\s+/g, " ").trim(),
      titlePatterns: uniqueTerms(track.titlePatterns, 24),
      responsibilityPatterns: uniqueTerms(track.responsibilityPatterns, 40),
      contextPatterns: uniqueTerms(track.contextPatterns, 24),
      proofPatterns: uniqueTerms(track.proofPatterns, 32),
      weakPatterns: uniqueTerms(track.weakPatterns, 32),
    }))
    .filter((track) => track.id && track.label && track.titlePatterns.length > 0 && track.responsibilityPatterns.length > 0);

  if (explicitTracks.length > 0) return explicitTracks.slice(0, 4);
  if (input.targetTitles.length === 0 || input.positiveKeywords.length < 2) return [];

  return [{
    id: "compiled-primary",
    label: "Compiled Profile Track",
    titlePatterns: uniqueTerms(input.targetTitles, 18),
    responsibilityPatterns: uniqueTerms(input.positiveKeywords, 24),
    contextPatterns: uniqueTerms(input.targetIndustries, 12),
    proofPatterns: uniqueTerms([
      ...input.positiveKeywords,
      ...input.targetIndustries,
    ], 24),
    weakPatterns: uniqueTerms(input.negativeKeywords, 18),
  }];
}

export function compileSearchProfile(input: ProfileCompilerInput): CompiledSearchProfile {
  const preferences = input.preferences ?? {};
  const content = normalize(`${input.resumeText} ${input.profileText ?? ""}`);
  const targetTitles = extractTitleCandidates(content, preferences);
  const positiveKeywords = uniqueTerms([
    ...findRuleMatches(content, keywordRules).map((rule) => rule.term),
    ...targetTitles.flatMap((title) => title.split(" ").filter((part) => part.length > 4)),
  ], 18);
  const targetIndustries = uniqueTerms([
    ...(preferences.desiredIndustries ?? []),
    ...findRuleMatches(content, industryRules).map((rule) => rule.term),
  ], 10);
  const negativeKeywords = uniqueTerms([
    ...(preferences.avoidedKeywords ?? []),
    ...(preferences.avoidedTitles ?? []),
  ], 24);
  const inferredRoleFamilies = inferFamilies(content, targetTitles);
  const missingInputs = [
    targetTitles.length === 0 ? "target titles" : "",
    positiveKeywords.length < 4 ? "specific accomplishments or skills" : "",
    targetIndustries.length === 0 ? "target industries" : "",
    typeof preferences.compensationFloor !== "number" ? "compensation floor" : "",
    preferences.remoteOnly === undefined ? "remote/location constraint" : "",
    negativeKeywords.length === 0 ? "roles or responsibilities to avoid" : "",
  ].filter(Boolean);
  const hardExcludedTitlePatterns = inferHardExclusions(inferredRoleFamilies, preferences);
  const roleTracks = compiledRoleTracks({
    targetTitles,
    positiveKeywords,
    negativeKeywords,
    targetIndustries,
    explicitRoleTracks: preferences.roleTracks,
  });
  const roleTrackSupportedPatterns = roleTracks.flatMap((track) => [
    ...track.responsibilityPatterns,
    ...track.contextPatterns,
    ...track.proofPatterns,
  ]);
  const roleTrackWeakPatterns = roleTracks.flatMap((track) => track.weakPatterns);
  const baseConfig = preferences.baseMatchingConfig;
  const matchingConfig: MatchingRuleConfig = baseConfig
    ? {
        ...baseConfig,
        rulesVersion: `compiled-${baseConfig.rulesVersion}`,
        hardExcludedTitlePatterns: uniqueTerms([
          ...baseConfig.hardExcludedTitlePatterns,
          ...(preferences.avoidedTitles ?? []),
        ], 64),
      }
    : {
        rulesVersion: `compiled-profile-2026-06-09-profile-evidence`,
        titleFamilyRules: titleRulesFromCompiledProfile(targetTitles, inferredRoleFamilies, preferences.avoidedTitles ?? []),
        hardExcludedTitlePatterns,
        authoritySignals: uniqueTerms([
          ...randallPrivateMatchingConfig.authoritySignals,
          ...positiveKeywords,
        ], 30),
        juniorSignals: randallPrivateMatchingConfig.juniorSignals,
        resumeRoleSignals: {
          sourceDocuments: ["compiled resume/profile input"],
          supportedQualificationPatterns: uniqueTerms([
            ...positiveKeywords,
            ...targetTitles,
            ...targetIndustries,
            ...roleTrackSupportedPatterns,
          ], 36),
          weakOrUnsupportedQualificationPatterns: uniqueTerms([
            ...negativeKeywords,
            ...hardExcludedTitlePatterns,
            ...roleTrackWeakPatterns,
          ], 36),
          roleTracks,
          wrongLanePatterns: uniqueTerms([
            ...negativeKeywords,
            ...hardExcludedTitlePatterns,
            ...roleTrackWeakPatterns,
          ], 36),
        },
      };
  const searchProfile: UserSearchProfile = {
    targetTitles,
    positiveKeywords,
    negativeKeywords,
    targetIndustries,
    compensationFloor: preferences.compensationFloor ?? 0,
    freelanceRateFloor: preferences.freelanceRateFloor ?? 0,
    remoteOnly: preferences.remoteOnly ?? false,
    doNotApplyCompanies: preferences.doNotApplyCompanies ?? [],
    approvedLoginEmail: preferences.approvedLoginEmail ?? "",
  };

  return {
    searchProfile,
    matchingConfig,
    confidence: confidenceFromEvidence(targetTitles, positiveKeywords, targetIndustries, missingInputs),
    missingInputs,
    evidence: {
      targetTitles,
      positiveKeywords,
      negativeKeywords,
      targetIndustries,
      inferredRoleFamilies,
      roleTracks: roleTracks.map((track) => ({
        id: track.id,
        label: track.label,
        titlePatterns: track.titlePatterns,
        responsibilityPatterns: track.responsibilityPatterns,
        contextPatterns: track.contextPatterns,
        proofPatterns: track.proofPatterns,
        weakPatterns: track.weakPatterns,
      })),
    },
  };
}
