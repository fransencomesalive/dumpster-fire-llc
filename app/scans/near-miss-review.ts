import type { NormalizedConnectorJob } from "./connectors";
import type { MatchDecision } from "./matching";
import type { NearMissReviewDecision } from "./types";

export type NearMissReviewBucket =
  | "included_stretch_match"
  | "source_calibration_candidate"
  | "title_family_without_enough_evidence"
  | "authority_or_profile_evidence_without_title_family"
  | "target_industry_or_remote_signal";

export type NearMissReviewItem = {
  reviewKey: string;
  externalJobId: string;
  companyName: string;
  provider: string;
  title: string;
  location: string;
  remoteType: NormalizedConnectorJob["remoteType"];
  department: string;
  employmentType: NormalizedConnectorJob["employmentType"];
  salaryText: string;
  sourceUrl: string;
  reviewBucket: NearMissReviewBucket;
  reviewPriority: number;
  decision: MatchDecision;
  reasonsToInspect: string[];
  responsibilitySnippets: string[];
  experienceSnippets: string[];
  descriptionSnippet: string;
  risks: string[];
};

export type NearMissReviewSelectionSummary = {
  requested: number;
  returned: number;
  available: number;
  maxPerCompany: number;
  maxPerSignalGroup: number;
  companiesRepresented: number;
  signalGroupsRepresented: number;
  diversityFiltered: number;
};

function riskText(decision: MatchDecision) {
  return decision.risks.join(" ").toLowerCase();
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").replace(/\s+/g, " ").trim();
}

function countBy<T>(items: T[], getKey: (item: T) => string) {
  const counts = new Map<string, number>();

  for (const item of items) {
    const key = getKey(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function keyForCompany(item: NearMissReviewItem) {
  return normalize(item.companyName) || "unknown company";
}

function keyForSignalGroup(item: NearMissReviewItem) {
  return normalize(titleSignalGroup(item.title));
}

function keyForCompanyTitle(item: NearMissReviewItem) {
  return `${keyForCompany(item)}:${normalize(item.title)}`;
}

function keyForCompanySignalGroup(item: NearMissReviewItem) {
  return `${keyForCompany(item)}:${keyForSignalGroup(item)}`;
}

export function selectBalancedNearMissReviewItems(
  items: NearMissReviewItem[],
  limit: number,
  options: {
    maxPerCompany?: number;
    maxPerSignalGroup?: number;
  } = {}
): { items: NearMissReviewItem[]; summary: NearMissReviewSelectionSummary } {
  const sorted = [...items].sort((a, b) => b.reviewPriority - a.reviewPriority || a.title.localeCompare(b.title));
  const companyCount = countBy(sorted, keyForCompany).length;
  const requested = Math.max(1, limit);
  const maxPerCompany = options.maxPerCompany ?? Math.max(2, Math.min(6, Math.ceil(requested / Math.max(1, Math.min(companyCount || 1, 8)))));
  const maxPerSignalGroup = options.maxPerSignalGroup ?? Math.max(2, Math.min(8, Math.ceil(requested / 6)));
  const selected: NearMissReviewItem[] = [];
  const selectedKeys = new Set<string>();
  const selectedCompanyTitleKeys = new Set<string>();
  const selectedCompanySignalKeys = new Set<string>();
  const companyCounts = new Map<string, number>();
  const signalCounts = new Map<string, number>();
  const companiesByStrength = countBy(sorted, keyForCompany).map(([companyKey]) => companyKey);

  while (selected.length < requested) {
    let addedThisRound = false;

    for (const companyKey of companiesByStrength) {
      if (selected.length >= requested) break;
      if ((companyCounts.get(companyKey) ?? 0) >= maxPerCompany) continue;

      const candidate = sorted.find((item) => {
        if (selectedKeys.has(item.reviewKey)) return false;
        if (selectedCompanyTitleKeys.has(keyForCompanyTitle(item))) return false;
        if (selectedCompanySignalKeys.has(keyForCompanySignalGroup(item))) return false;
        if (keyForCompany(item) !== companyKey) return false;
        const signalKey = keyForSignalGroup(item);
        return (signalCounts.get(signalKey) ?? 0) < maxPerSignalGroup;
      });

      if (!candidate) continue;

      const signalKey = keyForSignalGroup(candidate);
      selected.push(candidate);
      selectedKeys.add(candidate.reviewKey);
      selectedCompanyTitleKeys.add(keyForCompanyTitle(candidate));
      selectedCompanySignalKeys.add(keyForCompanySignalGroup(candidate));
      companyCounts.set(companyKey, (companyCounts.get(companyKey) ?? 0) + 1);
      signalCounts.set(signalKey, (signalCounts.get(signalKey) ?? 0) + 1);
      addedThisRound = true;
    }

    if (!addedThisRound) break;
  }

  return {
    items: selected,
    summary: {
      requested,
      returned: selected.length,
      available: sorted.length,
      maxPerCompany,
      maxPerSignalGroup,
      companiesRepresented: companyCounts.size,
      signalGroupsRepresented: signalCounts.size,
      diversityFiltered: Math.max(0, sorted.length - selected.length),
    },
  };
}

export function filterUnreviewedNearMissReviewItems(
  items: NearMissReviewItem[],
  decisions: Pick<NearMissReviewDecision, "reviewKey" | "companyName" | "title" | "titleSignal">[]
) {
  const reviewedKeys = new Set(decisions.map((decision) => decision.reviewKey));
  const reviewedCompanyTitleKeys = new Set(decisions.map((decision) => `${normalize(decision.companyName)}:${normalize(decision.title)}`));
  const reviewedCompanySignalKeys = new Set(decisions.map((decision) => (
    `${normalize(decision.companyName)}:${normalize(titleSignalGroup(decision.titleSignal || decision.title))}`
  )));

  return items.filter((item) => (
    !reviewedKeys.has(item.reviewKey) &&
    !reviewedCompanyTitleKeys.has(`${normalize(item.companyName)}:${normalize(item.title)}`) &&
    !reviewedCompanySignalKeys.has(`${normalize(item.companyName)}:${normalize(titleSignalGroup(item.title))}`)
  ));
}

function stableHash(value: string) {
  let hash = 5381;

  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }

  return (hash >>> 0).toString(36);
}

function reviewKeyForJob(input: {
  companyName: string;
  provider: string;
  externalJobId: string;
  title: string;
  sourceUrl: string;
}) {
  return stableHash([
    normalize(input.companyName),
    normalize(input.provider),
    normalize(input.externalJobId),
    normalize(input.title),
    normalize(input.sourceUrl),
  ].join("|"));
}

export function titleSignalGroup(value: string) {
  const signal = normalize(value);

  if (/(marketing|marketer|market development|go to market|gtm)/.test(signal) && !/(production|producer|program|programs)/.test(signal)) {
    return "Marketing roles";
  }

  if (/(technical program manager|compute|cloud inference|infrastructure|ai infrastructure)/.test(signal)) {
    return "Technical program / infrastructure";
  }

  if (/(hardware|supply chain|procurement|facilities|data center|capital builds)/.test(signal)) {
    return "Hardware, facilities, supply chain";
  }

  if (/(talent|recruit|people|onboarding|enablement|performance|compensation|equity)/.test(signal)) {
    return "People, recruiting, HR operations";
  }

  if (/(revenue|sales|brokerage|regulatory|compliance|legal|bank|finance)/.test(signal)) {
    return "Revenue or regulated operations";
  }

  if (/(producer|production|events|creative|studio|performance producer)/.test(signal)) {
    return "Producer and production roles";
  }

  if (/(product operations|strategy|strategic|partner operations|user safety|risk operations|operations lead|operations manager)/.test(signal)) {
    return "Strategy, product, operations leadership";
  }

  if (/program manager|program lead|program director/.test(signal)) {
    return "General program management";
  }

  return value.trim() || "Unspecified title signal";
}

function titleIncludes(title: string, terms: string[]) {
  const normalizedTitle = normalize(title);
  return terms.some((term) => normalizedTitle.includes(normalize(term)));
}

function hasPlausibleReviewTitle(title: string) {
  return titleIncludes(title, [
    "producer",
    "production",
    "creative operations",
    "studio operations",
    "content operations",
    "creative program",
    "design program",
    "program manager",
    "program director",
    "program lead",
    "delivery lead",
    "product owner",
    "business process",
    "operations lead",
    "operations manager",
    "studio manager",
    "head of production",
    "head of operations",
    "director of production",
    "production director",
    "ai enablement",
    "ai operations",
  ]);
}

function hasWrongLaneTitle(title: string) {
  return titleIncludes(title, [
    "account executive",
    "account manager",
    "account services",
    "accountant",
    "advertising",
    "asic",
    "benefits",
    "business development",
    "certifications",
    "channel sales",
    "compliance",
    "counsel",
    "customer success",
    "customer operations",
    "data analyst",
    "data acquisition",
    "data labeling",
    "data operations",
    "data scientist",
    "deployment engineer",
    "designer",
    "engineer",
    "equity",
    "facilities",
    "field sales",
    "hr business",
    "human data",
    "implementation consultant",
    "legal",
    "marketing",
    "paid search",
    "paid social",
    "performance and talent",
    "pricing analyst",
    "policy",
    "programmatic",
    "regulatory",
    "research engineer",
    "sap",
    "sales",
    "seller",
    "seo",
    "system admin",
    "technical account",
    "technical lead",
    "technical support",
    "success engineer",
    "cyber",
  ]);
}

function hasHardWrongLaneRisk(decision: MatchDecision) {
  const risks = riskText(decision);
  return (
    risks.includes("hard exclude") ||
    risks.includes("do-not-apply") ||
    risks.includes("negative title signal") ||
    risks.includes("hard remote constraint") ||
    risks.includes("onsite location") ||
    risks.includes("junior/seniority")
  );
}

function evidenceCount(decision: MatchDecision, prefix: string) {
  return decision.positives.filter((positive) => positive.startsWith(prefix)).length;
}

function cleanSentence(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .replace(/^[-–•*)\s]+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .trim();
}

function truncateSentence(value: string, maxLength = 220) {
  const cleaned = cleanSentence(value);
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 1).replace(/\s+\S*$/, "")}…`;
}

function sentencesFromDescription(description: string) {
  return description
    .replace(/<\/(?:p|li|h[1-6]|div|br)>/gi, ". ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/([.!?])\s+(?=[A-Z0-9])/g, "$1\n")
    .split(/\n|(?:\s+[•●]\s+)|(?:\s+-\s+)/)
    .map(cleanSentence)
    .filter((sentence) => sentence.length >= 36);
}

function textWithSectionBreaks(description: string) {
  const decoded = description
    .replace(/<\/(?:p|li|h[1-6]|div|br)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\r/g, "\n");
  const sectionHeadings = [
    "About the Team",
    "About the Role",
    "The Role",
    "In This Role",
    "Key Responsibilities",
    "Role Responsibilities",
    "Job Responsibilities",
    "Primary Responsibilities",
    "Essential Duties",
    "Duties and Responsibilities",
    "Responsibilities",
    "What You Will Do",
    "What You'll Do",
    "What You’ll Do",
    "What You Will Be Doing",
    "What You'll Be Doing",
    "What You’ll Be Doing",
    "What You'll Be Working On",
    "What You’ll Be Working On",
    "Your Impact",
    "The Work",
    "Impact",
    "Qualifications",
    "Required Qualifications",
    "Minimum Qualifications",
    "Basic Qualifications",
    "Requirements",
    "Required Experience",
    "Experience Required",
    "Required Skills",
    "Skills and Experience",
    "What You Need",
    "What We're Looking For",
    "What We’re Looking For",
    "Who You Are",
    "About You",
    "You Have",
    "Your Background",
    "Candidate Profile",
    "Preferred Skills",
    "Preferred Qualifications",
    "Nice to Have",
    "Bonus Points",
    "Benefits",
    "Location",
    "Locations",
    "Compensation",
    "Pay Transparency",
    "About Us",
    "About the Company",
    "Additional Information",
  ];
  const headingPattern = new RegExp(`\\b(${sectionHeadings.map((heading) => heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b\\s*:?`, "gi");

  return decoded
    .replace(headingPattern, "\n$1\n")
    .replace(/[•●]\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function isLikelyBoilerplate(sentence: string) {
  const normalizedSentence = normalize(sentence);
  return [
    "after enabling anyone to take payments",
    "we saw sellers stymied",
    "we expanded into software",
    "since we opened our doors",
    "the world of commerce has evolved",
    "we believe in being fair",
    "equal employment opportunity",
    "qualified applicants",
    "compensation at",
    "benefits information",
    "privacy statement",
    "your browser does not support javascript",
  ].some((term) => normalizedSentence.includes(normalize(term)));
}

function nearestSectionIndex(content: string, terms: string[], fromIndex: number) {
  return terms
    .map((term) => content.indexOf(term, fromIndex))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0] ?? -1;
}

function prioritySectionIndex(content: string, terms: string[], fromIndex: number) {
  for (const term of terms) {
    const index = content.indexOf(term, fromIndex);
    if (index >= 0) return index;
  }

  return -1;
}

function splitCollapsedListLine(line: string) {
  const listStarts = [
    "Own",
    "Serve",
    "Coordinate",
    "Drive",
    "Lead",
    "Partner",
    "Collaborate",
    "Oversee",
    "Build",
    "Create",
    "Design",
    "Deliver",
    "Execute",
    "Support",
    "Define",
    "Manage",
    "Ensure",
    "Identify",
    "Establish",
    "Work",
    "Align",
    "Balance",
    "Develop",
    "Contribute",
    "Experience",
    "Strong",
    "Ability",
    "Proven",
    "Deep",
    "Excellent",
    "Demonstrated",
    "Background",
    "Track record",
    "Bachelor",
    "Master",
    "BA",
    "BS",
    "MBA",
  ];
  const pattern = new RegExp(`\\s+(?=(${listStarts.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b)`, "g");

  return line
    .split(pattern)
    .filter((part) => !listStarts.includes(part))
    .map(cleanSentence)
    .filter((part) => part.length >= 20);
}

function isSectionHeadingLine(line: string) {
  return [
    "about the team",
    "about the role",
    "the role",
    "in this role",
    "key responsibilities",
    "role responsibilities",
    "job responsibilities",
    "primary responsibilities",
    "essential duties",
    "duties and responsibilities",
    "responsibilities",
    "what you will do",
    "what you ll do",
    "what you will be doing",
    "what you ll be doing",
    "what you ll be working on",
    "your impact",
    "the work",
    "impact",
    "qualifications",
    "required qualifications",
    "minimum qualifications",
    "basic qualifications",
    "requirements",
    "required experience",
    "experience required",
    "required skills",
    "skills and experience",
    "what you need",
    "what we re looking for",
    "who you are",
    "about you",
    "you have",
    "your background",
    "candidate profile",
    "preferred skills",
    "preferred qualifications",
    "nice to have",
    "bonus points",
    "benefits",
    "location",
    "locations",
    "compensation",
    "pay transparency",
    "about us",
    "about the company",
    "additional information",
  ].includes(normalize(line));
}

function sectionSentences(description: string, starts: string[], stops: string[], limit: number) {
  const sectionedText = textWithSectionBreaks(description);
  const normalizedText = normalize(sectionedText);
  const normalizedStarts = starts.map(normalize);
  const normalizedStops = stops.map(normalize);
  const startIndex = prioritySectionIndex(normalizedText, normalizedStarts, 0);

  if (startIndex < 0) return [];

  const stopIndex = nearestSectionIndex(normalizedText, normalizedStops, startIndex + 1);
  const normalizedSlice = normalizedText.slice(startIndex, stopIndex > startIndex ? stopIndex : undefined);
  const lines = sectionedText
    .split(/\n|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map(cleanSentence)
    .flatMap(splitCollapsedListLine)
    .filter((sentence) => sentence.length >= 20 && !isSectionHeadingLine(sentence) && !isLikelyBoilerplate(sentence));
  const matches = lines.filter((sentence) => normalizedSlice.includes(normalize(sentence)));

  return matches.slice(0, limit).map((sentence) => truncateSentence(sentence));
}

function snippetsMatching(description: string, terms: string[], limit: number) {
  const sentences = sentencesFromDescription(description);
  const used = new Set<string>();
  const matches: string[] = [];

  for (const sentence of sentences) {
    if (isLikelyBoilerplate(sentence)) continue;
    const normalizedSentence = normalize(sentence);
    if (!terms.some((term) => normalizedSentence.includes(normalize(term)))) continue;

    const snippet = truncateSentence(sentence);
    if (used.has(snippet)) continue;
    used.add(snippet);
    matches.push(snippet);
    if (matches.length >= limit) break;
  }

  return matches;
}

export function extractJobSections(descriptionText: string) {
  const responsibilitySnippets = sectionSentences(descriptionText, [
    "key responsibilities",
    "role responsibilities",
    "job responsibilities",
    "primary responsibilities",
    "essential duties",
    "duties and responsibilities",
    "responsibilities",
    "the work",
    "your impact",
    "what you will do",
    "what you will do",
    "what you'll do",
    "what you’ll do",
    "what you will be doing",
    "what you'll be doing",
    "what you’ll be doing",
    "what you'll be working on",
    "what you’ll be working on",
    "in this role",
    "you will",
  ], [
    "qualification",
    "what you need",
    "what we're looking for",
    "what we’re looking for",
    "who you are",
    "about you",
    "you have",
    "required",
    "requirements",
    "minimum",
    "skills and experience",
    "required skills",
    "experience required",
    "bonus",
    "nice to have",
    "preferred",
    "benefits",
    "location",
    "locations",
    "compensation",
    "pay transparency",
    "about",
    "additional information",
  ], 6);
  const fallbackResponsibilitySnippets = snippetsMatching(descriptionText, [
    "responsibilities",
    "you will",
    "what you’ll do",
    "what you'll do",
    "own",
    "lead",
    "manage",
    "oversee",
    "drive",
    "partner",
    "coordinate",
    "collaborate",
    "stakeholder",
    "cross functional",
    "operations",
    "program",
    "production",
  ], 5);
  const experienceSnippets = sectionSentences(descriptionText, [
    "required qualifications",
    "minimum qualifications",
    "basic qualifications",
    "qualifications",
    "qualification",
    "skills and experience",
    "required skills",
    "what you need",
    "requirements",
    "required experience",
    "experience required",
    "what we're looking for",
    "what we’re looking for",
    "who you are",
    "about you",
    "you have",
    "your background",
    "candidate profile",
  ], [
    "bonus",
    "nice to have",
    "preferred skills",
    "preferred qualifications",
    "preferred",
    "responsibilities",
    "what you will do",
    "what you'll do",
    "what you’ll do",
    "your impact",
    "the work",
    "benefits",
    "location",
    "locations",
    "compensation",
    "pay transparency",
    "about",
    "additional information",
    "equal employment",
  ], 6);
  const fallbackExperienceSnippets = snippetsMatching(descriptionText, [
    "experience",
    "years",
    "qualification",
    "required",
    "requirements",
    "you have",
    "we're looking",
    "we are looking",
    "background",
    "skills",
    "proven",
    "track record",
    "minimum",
  ], 5);
  return {
    responsibilitySnippets: responsibilitySnippets.length > 0 ? responsibilitySnippets : fallbackResponsibilitySnippets,
    experienceSnippets: experienceSnippets.length > 0 ? experienceSnippets : fallbackExperienceSnippets,
  };
}

export function reviewDetailsFromJob(job: NormalizedConnectorJob) {
  const { responsibilitySnippets, experienceSnippets } = extractJobSections(job.descriptionText);
  const descriptionSentences = sentencesFromDescription(job.descriptionText);
  const descriptionSnippet = truncateSentence(
    (descriptionSentences.length > 0 ? descriptionSentences.slice(0, 3).join(" ") : job.descriptionText),
    600,
  );

  return {
    responsibilitySnippets,
    experienceSnippets,
    descriptionSnippet,
  };
}

export function buildNearMissReviewItem(input: {
  companyName: string;
  provider: string;
  job: NormalizedConnectorJob;
  decision: MatchDecision;
}): NearMissReviewItem | null {
  const { companyName, provider, job, decision } = input;

  const hasRoleFamily = decision.roleFamily !== "unclassified" && !decision.risks.includes("title family not confirmed");
  const hasAuthorityEvidence = decision.positives.some((positive) => positive.includes("authority evidence"));
  const hasProfileEvidence = evidenceCount(decision, "profile evidence") > 0;
  const hasIndustryEvidence = decision.positives.some((positive) => positive.startsWith("industry evidence"));
  const hasRemoteSignal = decision.positives.includes("remote role");
  const hasHardRisk = hasHardWrongLaneRisk(decision);
  const hasPlausibleTitle = hasPlausibleReviewTitle(job.title);
  const hasWrongTitle = hasWrongLaneTitle(job.title);
  const reasonsToInspect: string[] = [];
  let reviewBucket: NearMissReviewBucket | null = null;
  let reviewPriority = 0;

  if (decision.included && decision.matchQuality !== "stretch") return null;
  if (hasWrongTitle) return null;

  if (decision.included && decision.matchQuality === "stretch") {
    reviewBucket = "included_stretch_match";
    reviewPriority += 85;
    reasonsToInspect.push("currently served as a stretch match");
  } else if (hasRoleFamily && !hasHardRisk && hasPlausibleTitle) {
    reviewBucket = "title_family_without_enough_evidence";
    reviewPriority += 70;
    reasonsToInspect.push(`recognized role family: ${decision.roleFamily}`);
  } else if ((hasAuthorityEvidence || hasProfileEvidence) && !hasHardRisk && hasPlausibleTitle) {
    reviewBucket = "authority_or_profile_evidence_without_title_family";
    reviewPriority += 55;
    reasonsToInspect.push("has responsibility/profile evidence but title family failed");
  } else if ((hasIndustryEvidence || hasRemoteSignal) && !hasHardRisk && hasPlausibleTitle) {
    reviewBucket = "target_industry_or_remote_signal";
    reviewPriority += 35;
    reasonsToInspect.push("has target industry or remote signal");
  }

  if (!reviewBucket) return null;

  reviewPriority += decision.positives.length * 4;
  reviewPriority += decision.evidence.length * 3;
  if (job.remoteType === "remote") reviewPriority += 8;
  if (decision.risks.includes("no compensation signal")) reviewPriority -= 4;
  if (hasHardRisk) reviewPriority -= 20;
  const reviewDetails = reviewDetailsFromJob(job);

  return {
    reviewKey: reviewKeyForJob({
      companyName,
      provider,
      externalJobId: job.externalJobId,
      title: job.title,
      sourceUrl: job.sourceUrl,
    }),
    externalJobId: job.externalJobId,
    companyName,
    provider,
    title: job.title,
    location: job.location,
    remoteType: job.remoteType,
    department: job.department,
    employmentType: job.employmentType,
    salaryText: job.salaryText,
    sourceUrl: job.sourceUrl,
    reviewBucket,
    reviewPriority,
    decision,
    reasonsToInspect,
    responsibilitySnippets: reviewDetails.responsibilitySnippets,
    experienceSnippets: reviewDetails.experienceSnippets,
    descriptionSnippet: reviewDetails.descriptionSnippet,
    risks: decision.risks,
  };
}

export function buildSourceCalibrationReviewItem(input: {
  companyName: string;
  provider: string;
  job: NormalizedConnectorJob;
  decision: MatchDecision;
}): NearMissReviewItem | null {
  const { companyName, provider, job, decision } = input;
  const reviewDetails = reviewDetailsFromJob(job);
  const hasHardRisk = hasHardWrongLaneRisk(decision);
  const hasWrongTitle = hasWrongLaneTitle(job.title);
  const hasPlausibleTitle = hasPlausibleReviewTitle(job.title);
  const hasAnySignal = (
    hasPlausibleTitle ||
    decision.roleFamily !== "unclassified" ||
    evidenceCount(decision, "profile evidence") > 0 ||
    evidenceCount(decision, "resume evidence") > 0 ||
    decision.positives.some((positive) => positive.includes("authority evidence"))
  );
  const hasReviewableEvidence = (
    evidenceCount(decision, "profile evidence") > 0 &&
    evidenceCount(decision, "resume evidence") > 0 &&
    decision.positives.some((positive) => positive.includes("authority evidence"))
  );

  if (hasHardRisk || hasWrongTitle) return null;
  if (!hasAnySignal) return null;
  if (decision.roleFamily === "unclassified" && (!hasPlausibleTitle || !hasReviewableEvidence)) return null;

  return {
    reviewKey: reviewKeyForJob({
      companyName,
      provider,
      externalJobId: job.externalJobId,
      title: job.title,
      sourceUrl: job.sourceUrl,
    }),
    externalJobId: job.externalJobId,
    companyName,
    provider,
    title: job.title,
    location: job.location,
    remoteType: job.remoteType,
    department: job.department,
    employmentType: job.employmentType,
    salaryText: job.salaryText,
    sourceUrl: job.sourceUrl,
    reviewBucket: "source_calibration_candidate",
    reviewPriority: Math.max(1, Math.min(60, decision.score + decision.positives.length * 3 + decision.evidence.length * 2)),
    decision,
    reasonsToInspect: ["source calibration candidate from a board with too few review examples"],
    responsibilitySnippets: reviewDetails.responsibilitySnippets,
    experienceSnippets: reviewDetails.experienceSnippets,
    descriptionSnippet: reviewDetails.descriptionSnippet,
    risks: decision.risks,
  };
}
