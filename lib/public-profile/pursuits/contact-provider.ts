import type {
  HumanPathContact,
  HumanPathDiagnostics,
  HumanPathLane,
  HumanPathLaneDiagnostic,
  HumanPathProvider,
  HumanPathProviderInput,
  HumanPathRejectionCode,
} from "./types";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";

type HumanPathJob = HumanPathProviderInput["job"];
type HumanPathCandidateContext = HumanPathProviderInput["candidateContext"];
type ContactRelevanceStatus = "strong" | "plausible" | "unknown" | "conflicting";

export type EmployerIdentity = {
  name: string;
  relationship: "primary" | "brand" | "subsidiary" | "division" | "business_unit" | "part_of" | "owned_by" | "operating_company";
  evidenceText: string;
};

export type ContactModelCall = (args: {
  system: string;
  user: string;
  lane?: HumanPathLane;
  phase?: "discovery" | "verification";
  strategy?: "category" | "organization_leadership" | "broad_category" | "roster_fallback";
}) => Promise<string | ContactModelCallResult | undefined>;

type ContactModelCallResult = {
  text: string;
  telemetry?: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    webSearchCalls: number;
  };
};

export type ContactProviderDependencies = {
  callModel?: ContactModelCall;
};

type ResearchedContact = {
  name: string;
  title: string;
  companyName: string;
  contactType: HumanPathContact["contactType"];
  confidence: number;
  linkedinUrl?: string;
  professionalContactUrl?: string;
  evidenceUrl?: string;
  relevanceReason: string;
  roleConnection: string;
  verificationNotes: string[];
  currentTitleSource?: ContactProfileVerification["currentTitleSource"];
  identityEvidenceText?: string;
  identityEvidenceUrl?: string;
  currentRoleEvidenceText?: string;
  currentRoleEvidenceUrl?: string;
  currentCompanyEvidenceText?: string;
  currentCompanyEvidenceUrl?: string;
  classificationEvidenceText?: string;
  classificationEvidenceUrl?: string;
  relevanceEvidenceText?: string;
  relevanceEvidenceUrl?: string;
  conflictSignals?: string[];
  relevanceStatus?: ContactRelevanceStatus;
  rank: number;
};

type ContactProfileVerification = {
  candidateKey: string;
  currentName: string;
  linkedinHeadline: string;
  linkedinHeadlineEvidenceText: string;
  currentTitle: string;
  currentTitleSource: "linkedin_experience" | "company_page" | "organization_directory" | "";
  currentCompany: string;
  currentRoleEvidenceText: string;
  currentRoleEvidenceUrl: string;
  currentCompanyEvidenceText: string;
  currentCompanyEvidenceUrl: string;
  currentRoleIsCurrent: boolean;
  linkedinUrl: string;
  identityMatches: boolean;
  companyMatches: boolean;
  classificationSupported: boolean;
  classificationEvidenceText: string;
  classificationEvidenceUrl: string;
  relevanceStatus: ContactRelevanceStatus;
  relevanceEvidenceText: string;
  relevanceEvidenceUrl: string;
  alignmentSignals: string[];
  conflictSignals: string[];
  confidence: number;
  relevanceReason: string;
  roleConnection: string;
};

type LaneVerificationResult = {
  contacts: ResearchedContact[];
  rejected: HumanPathLaneDiagnostic["rejected"];
  verifiedCount: number;
};

type LaneRun = {
  lane: HumanPathLane;
  discovered: ResearchedContact[];
  verified: ResearchedContact[];
  diagnostic: HumanPathLaneDiagnostic;
};

const LANES: HumanPathLane[] = [
  "likely_hiring_manager",
  "recruiter",
  "functional_leader",
];
const DISCOVERY_TARGET_PER_LANE = 5;
const MAX_VERIFICATION_CANDIDATES = 18;
const CONTACT_MODEL_TIMEOUT_MS = 18_000;
const WEB_SEARCH_COST_USD = 0.01;
type ContactSearchBudget = {
  maxToolCalls: number;
  searchContextSize: "low" | "medium" | "high";
};

// Stored on Human Path generation events so zero-result pursuits can be
// reconsidered once after a material provider-contract change.
export const HUMAN_PATH_PROVIDER_VERSION = 11;

export function contactSearchBudget(
  phase?: "discovery" | "verification",
  strategy?: Parameters<ContactModelCall>[0]["strategy"],
): ContactSearchBudget {
  if (phase === "verification" || strategy === "category" || strategy === "roster_fallback") {
    return { maxToolCalls: 1, searchContextSize: "low" };
  }
  return { maxToolCalls: 1, searchContextSize: "low" };
}

const LANE_LABEL: Record<HumanPathLane, string> = {
  likely_hiring_manager: "Hiring Manager",
  recruiter: "Recruiter",
  functional_leader: "Functional Leader",
};

const LANE_RANK: Record<HumanPathLane, number> = {
  likely_hiring_manager: 0,
  recruiter: 1,
  functional_leader: 2,
};

function resolveHumanPathReachability(
  contact: Pick<ResearchedContact, "linkedinUrl" | "professionalContactUrl">,
): HumanPathContact["reachability"] {
  if (contact.linkedinUrl) return { method: "linkedin", url: contact.linkedinUrl };
  if (contact.professionalContactUrl) return { method: "contact_page", url: contact.professionalContactUrl };
  return { method: "none" };
}

function cleanString(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/cite[^]+/g, "").replace(/\s+/g, " ").trim()
    : "";
}

function firstUrl(value: string) {
  return (value.match(/https?:\/\/[^\s)\]]+/i)?.[0] ?? "").replace(/[.,;:]+$/g, "");
}

function normalizedPublicUrl(value: string) {
  const candidate = firstUrl(value) || (value.startsWith("http") ? value : "");
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function normalizedLinkedinProfileUrl(value: string) {
  const candidate = normalizedPublicUrl(value);
  if (!candidate) return "";
  const url = new URL(candidate);
  const hostname = url.hostname.toLowerCase();
  if (hostname !== "linkedin.com" && !hostname.endsWith(".linkedin.com")) return "";
  if (!/^\/in\/[^/]+\/?$/i.test(url.pathname)) return "";
  url.protocol = "https:";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function linkedinProfileSlugSearchPhrase(value?: string) {
  if (!value) return "";
  try {
    const slug = new URL(value).pathname.match(/^\/in\/([^/]+)\/?$/i)?.[1] ?? "";
    const phrase = decodeURIComponent(slug).replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
    const words = phrase.split(" ").filter(Boolean);
    if (words.length < 2 || words.some((word) => /^\d+$/.test(word))) return "";
    return phrase;
  } catch {
    return "";
  }
}

function cleanField(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = cleanString(row[key]);
    if (value) return value;
  }
  return "";
}

function cleanStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(cleanString).filter(Boolean)
    : [];
}

function normalizeRelevanceStatus(value: unknown): ContactRelevanceStatus {
  const normalized = cleanString(value).toLowerCase();
  if (normalized === "strong" || normalized === "plausible" || normalized === "conflicting") {
    return normalized;
  }
  return "unknown";
}

function normalizedPhrase(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizedCompanyName(name: string) {
  return name.toLowerCase()
    .replace(/\b(incorporated|corporation|company|limited|inc|corp|co|llc|ltd)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function companyNamesMatch(expected: string, observed: string) {
  const left = normalizedCompanyName(expected);
  const right = normalizedCompanyName(observed);
  const containsPhrase = (whole: string, phrase: string) => ` ${whole} `.includes(` ${phrase} `);
  return Boolean(left && right && (
    left === right
    || containsPhrase(left, right)
    || containsPhrase(right, left)
  ));
}

const EMPLOYER_RELATIONSHIP_PATTERNS: Array<{
  relationship: Exclude<EmployerIdentity["relationship"], "primary">;
  pattern: RegExp;
}> = [
  { relationship: "brand", pattern: /\bbrand\s+of\s+([^,.;:\n()]{2,100})/gi },
  { relationship: "subsidiary", pattern: /\bsubsidiary\s+of\s+([^,.;:\n()]{2,100})/gi },
  { relationship: "division", pattern: /\bdivision\s+of\s+([^,.;:\n()]{2,100})/gi },
  { relationship: "business_unit", pattern: /\bbusiness\s+unit\s+of\s+([^,.;:\n()]{2,100})/gi },
  { relationship: "part_of", pattern: /\bpart\s+of\s+([^,.;:\n()]{2,100})/gi },
  { relationship: "owned_by", pattern: /\bowned\s+by\s+([^,.;:\n()]{2,100})/gi },
  { relationship: "operating_company", pattern: /\boperating\s+company\s+of\s+([^,.;:\n()]{2,100})/gi },
];

function sentenceContaining(text: string, index: number) {
  const start = Math.max(
    text.lastIndexOf(".", index - 1),
    text.lastIndexOf("!", index - 1),
    text.lastIndexOf("?", index - 1),
    text.lastIndexOf("\n", index - 1),
  ) + 1;
  const endings = [
    text.indexOf(".", index),
    text.indexOf("!", index),
    text.indexOf("?", index),
    text.indexOf("\n", index),
  ].filter((value) => value >= 0);
  const end = endings.length > 0 ? Math.min(...endings) + 1 : text.length;
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function cleanEmployerIdentityCandidate(value: string) {
  const cleaned = value
    .replace(/\b(?:which|that|specializing|providing|offering|focused|based)\b[\s\S]*$/i, "")
    .replace(/^(?:an?|the)\s+/i, "")
    .replace(/[\s'\"]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 10) return "";
  if (/^(?:company|organization|business|group|client|clients|us|our team)$/i.test(cleaned)) return "";
  return cleaned;
}

/**
 * Resolve only employer identities that the posting states explicitly. This is
 * deliberately narrower than general corporate-affiliation inference: a model
 * cannot introduce an alternate employer that is absent from the job evidence.
 */
export function resolveEmployerIdentities(job: HumanPathJob): EmployerIdentity[] {
  const identities: EmployerIdentity[] = [{
    name: job.companyName,
    relationship: "primary",
    evidenceText: `Job company: ${job.companyName}`,
  }];
  const seen = new Set([normalizedCompanyName(job.companyName)]);

  for (const { relationship, pattern } of EMPLOYER_RELATIONSHIP_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of job.description.matchAll(pattern)) {
      const name = cleanEmployerIdentityCandidate(match[1] ?? "");
      const normalized = normalizedCompanyName(name);
      if (!name || !normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      identities.push({
        name,
        relationship,
        evidenceText: sentenceContaining(job.description, match.index ?? 0),
      });
      if (identities.length >= 6) return identities;
    }
  }
  return identities;
}

function employerIdentityNames(job: HumanPathJob) {
  return resolveEmployerIdentities(job).map((identity) => identity.name);
}

function currentCompanyMatchesPosting(job: HumanPathJob, observed: string) {
  return employerIdentityNames(job).some((expected) => companyNamesMatch(expected, observed));
}

function isSpecificPersonName(value: string, companyName: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.includes("unverified") || normalized.includes("unknown")) return false;
  if (normalized.startsWith("(") || normalized.startsWith("the ")) return false;
  if (/^(group director|director|vp|svp|head of|recruiter|talent acquisition|hiring manager)\b/.test(normalized)) return false;
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;

  const normalizedCompany = normalizedPhrase(companyName);
  const normalizedCandidate = normalizedPhrase(value);
  if (normalizedCompany && ` ${normalizedCandidate} `.includes(` ${normalizedCompany} `)) return false;
  return words.every((word) => /^[a-z][a-z.'-]*$/.test(word));
}

function clampConfidence(value: unknown): number {
  let num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return 40;
  if (num > 0 && num <= 1) num *= 100;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function bucketConfidence(value: number): HumanPathContact["confidence"] {
  if (value >= 70) return "high";
  if (value >= 40) return "medium";
  return "low";
}

function normalizeContactType(value: unknown): { contactType: HumanPathContact["contactType"]; rank: number } {
  const words = cleanString(value)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[_-]/g, " ");
  if (words.includes("hiring manager")) return { contactType: "likely_hiring_manager", rank: 0 };
  if (words.includes("functional leader")) return { contactType: "functional_leader", rank: 2 };
  if (words.includes("recruit") || words.includes("talent")) return { contactType: "recruiter", rank: 1 };
  if (words.includes("long shot") || words.includes("executive") || words.includes("sponsor")) {
    return { contactType: "executive_sponsor", rank: 3 };
  }
  if (words.includes("referral")) return { contactType: "referral_candidate", rank: 3 };
  if (words.includes("department") || words.includes("creative") || words.includes("production")
    || words.includes("producer") || words.includes("vp") || words.includes("head of")
    || words.includes("director")) {
    return { contactType: "functional_leader", rank: 2 };
  }
  return { contactType: "unknown", rank: 3 };
}

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

type ResearchedContactRow = {
  item: Record<string, unknown>;
  impliedLane?: HumanPathLane;
};

function researchedContactRows(value: unknown): ResearchedContactRow[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => (
      item && typeof item === "object"
        ? [{ item: item as Record<string, unknown> }]
        : []
    ));
  }
  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const containers = [
    record.contacts,
    record.people,
    record.recommendations,
    record.suggestions,
  ].filter((container) => container !== undefined);
  const candidates = containers.length > 0 ? containers : [record];

  return candidates.flatMap((container): ResearchedContactRow[] => {
    if (Array.isArray(container)) {
      return container.flatMap((item) => (
        item && typeof item === "object"
          ? [{ item: item as Record<string, unknown> }]
          : []
      ));
    }
    if (!container || typeof container !== "object") return [];
    return Object.entries(container as Record<string, unknown>).flatMap(([group, rows]) => {
      if (!Array.isArray(rows)) return [];
      const normalizedGroup = normalizeContactType(group).contactType;
      const impliedLane = LANES.includes(normalizedGroup as HumanPathLane)
        ? normalizedGroup as HumanPathLane
        : undefined;
      return rows.flatMap((item) => (
        item && typeof item === "object"
          ? [{ item: item as Record<string, unknown>, impliedLane }]
          : []
      ));
    });
  });
}

export function parseResearchedContacts(
  value: unknown,
  companyName: string,
  forcedLane?: HumanPathLane,
  allowMissingTitle = false,
): ResearchedContact[] {
  return researchedContactRows(value).map(({ item: row, impliedLane }): ResearchedContact | null => {
    const name = cleanField(row, "name", "fullName", "full_name", "person");
    const title = cleanField(row, "title", "jobTitle", "job_title", "currentTitle", "current_title");
    if (!name || (!title && !allowMissingTitle) || !isSpecificPersonName(name, companyName)) return null;

    const rawLinkedinUrl = cleanField(
      row,
      "linkedinUrl",
      "linkedin_url",
      "linkedInUrl",
      "linkedIn",
      "linkedin",
      "profileUrl",
      "profile_url",
    );
    const linkedinUrl = normalizedLinkedinProfileUrl(rawLinkedinUrl);
    const candidateRole = cleanField(
      row,
      "candidateRole",
      "candidate_role",
      "role",
      "category",
      "contactCategory",
      "contact_category",
      "recommendationType",
      "recommendation_type",
    );
    const parsedType = normalizeContactType(row.contactType ?? row.contact_type ?? candidateRole);
    const contactType = forcedLane ?? impliedLane ?? parsedType.contactType;
    const rank = forcedLane
      ? LANE_RANK[forcedLane]
      : impliedLane
        ? LANE_RANK[impliedLane]
        : parsedType.rank;
    const roleConnection = cleanField(row, "roleConnection", "role_connection", "connection");
    const notes = cleanString(row.notes);
    const reason = cleanString(row.reason) || cleanString(row.relevanceReason) || cleanString(row.relevance_reason);
    const rawEvidenceUrl = cleanField(row, "evidenceUrl", "evidence_url", "sourceUrl", "source_url", "url");
    const evidenceUrl = normalizedPublicUrl(rawEvidenceUrl)
      || firstUrl(notes)
      || firstUrl(reason)
      || linkedinUrl;
    const currentTitleSource = cleanField(row, "currentTitleSource", "current_title_source");

    return {
      name,
      title,
      companyName: cleanField(row, "companyName", "company_name", "company") || companyName,
      contactType,
      confidence: clampConfidence(row.confidence),
      linkedinUrl: linkedinUrl || undefined,
      evidenceUrl: evidenceUrl || undefined,
      relevanceReason: reason,
      roleConnection: roleConnection || notes,
      verificationNotes: evidenceUrl ? [`Discovery evidence: ${evidenceUrl}`] : [],
      currentTitleSource: ["linkedin_experience", "company_page", "organization_directory"].includes(currentTitleSource)
        ? currentTitleSource as ContactProfileVerification["currentTitleSource"]
        : "",
      identityEvidenceText: cleanField(row, "identityEvidenceText", "identity_evidence_text"),
      identityEvidenceUrl: normalizedPublicUrl(cleanField(
        row,
        "identityEvidenceUrl",
        "identity_evidence_url",
      )) || undefined,
      currentRoleEvidenceText: cleanField(row, "currentRoleEvidenceText", "current_role_evidence_text"),
      currentRoleEvidenceUrl: normalizedPublicUrl(cleanField(
        row,
        "currentRoleEvidenceUrl",
        "current_role_evidence_url",
      )) || undefined,
      currentCompanyEvidenceText: cleanField(
        row,
        "currentCompanyEvidenceText",
        "current_company_evidence_text",
      ),
      currentCompanyEvidenceUrl: normalizedPublicUrl(cleanField(
        row,
        "currentCompanyEvidenceUrl",
        "current_company_evidence_url",
      )) || undefined,
      classificationEvidenceText: cleanField(
        row,
        "classificationEvidenceText",
        "classification_evidence_text",
      ),
      classificationEvidenceUrl: normalizedPublicUrl(cleanField(
        row,
        "classificationEvidenceUrl",
        "classification_evidence_url",
      )) || undefined,
      relevanceEvidenceText: cleanField(row, "relevanceEvidenceText", "relevance_evidence_text"),
      relevanceEvidenceUrl: normalizedPublicUrl(cleanField(
        row,
        "relevanceEvidenceUrl",
        "relevance_evidence_url",
      )) || undefined,
      conflictSignals: cleanStringArray(row.conflictSignals ?? row.conflict_signals),
      relevanceStatus: normalizeRelevanceStatus(row.relevanceStatus ?? row.relevance_status),
      rank,
    };
  }).filter((contact): contact is ResearchedContact => Boolean(contact));
}

function organizationAnchors(job: HumanPathJob) {
  const text = `${job.title} ${job.description}`;
  const ignoredAcronyms = new Set([
    "AI", "API", "ET", "PMP", "PT", "SDLC", "US", "USA",
  ]);
  const acronyms = Array.from(text.matchAll(/\b[A-Z][A-Z0-9&]{1,9}\b/g))
    .map((match) => match[0])
    .filter((value) => !ignoredAcronyms.has(value));
  const pairedOrganizations = Array.from(text.matchAll(
    /\b([A-Z][A-Za-z&]+(?:\s+(?:[A-Z][A-Za-z&]+|and|of)){0,7})\s*\(([A-Z][A-Z0-9&]{1,9})\)/g,
  )).map((match) => `${match[1]} (${match[2]})`);
  const namedOrganizations = Array.from(text.matchAll(
    /(?:within|supporting|across|in)\s+(?:the\s+|our\s+)?([A-Z][A-Za-z0-9&() /-]{2,80}?)\s+(?:organization|team|group|division)\b/g,
  )).map((match) => match[1].trim());
  return Array.from(new Set([...pairedOrganizations, ...namedOrganizations, ...acronyms])).slice(0, 6);
}

function candidateContextForPrompt(candidateContext?: HumanPathCandidateContext) {
  if (!candidateContext) return undefined;
  return {
    roleTrackName: candidateContext.roleTrackName || "",
    targetTitles: candidateContext.targetTitles.slice(0, 8),
    keyResponsibilities: candidateContext.keyResponsibilities.slice(0, 8),
    targetIndustries: candidateContext.targetIndustries.slice(0, 8),
    skills: candidateContext.skills.slice(0, 12),
    usageRule: "Use this only to disambiguate transferable role context. The job posting remains authoritative, and prior employers must never become contact-search targets.",
  };
}

function jobSearchPhrases(job: HumanPathJob) {
  const titleParts = job.title
    .split(/[,|/]/)
    .map((value) => value.trim())
    .filter((value) => value.length >= 4);
  return Array.from(new Set([job.title, ...titleParts])).slice(0, 4);
}

const LANE_DISCOVERY_SYSTEM_PROMPT = [
  "You research one requested hiring-path category for one job.",
  "Use the single available web search to find several real named people in that category, not to summarize the company or job.",
  "Treat the supplied requiredSearches as query options and choose the query most likely to expose multiple named candidates.",
  "Return only the requested category and set candidateRole to that exact requestedLane value.",
  "The role payload may include multiple accepted employer identities that are explicitly connected by the job posting. Search every supplied identity and treat current employment at any of them as target-company employment.",
  "Never invent another parent, affiliate, client, agency, or employer identity beyond that supplied list.",
  "Never synthesize a person's title from the job posting or search query.",
  "Make discovery independently usable: return separate verbatim evidence for identity, exact current title, current company, and requested category.",
  "currentRoleEvidenceText must equal the complete exact title only. If the complete title is not visible, leave title, currentTitleSource, and currentRoleEvidenceText empty.",
  "A LinkedIn headline or About statement is not current-title evidence. currentTitleSource must be linkedin_experience, company_page, organization_directory, or empty.",
  "Evidence URLs must be literal public URLs. A company name, department, search-result heading, or company-plus-title phrase is not a person's name.",
  "Do not return email addresses. Return one JSON object with a contacts array and no prose outside it.",
].join(" ");

const BROAD_FALLBACK_SYSTEM_PROMPT = [
  "The first hiring-path search returned no usable people. Use one final web-search pass to discover real named employees from public employer rosters.",
  "Search official team pages, LinkedIn company employee pages, public recruiting activity, and accepted affiliate identities supplied by the posting.",
  "Label each person as likely_hiring_manager, recruiter, or functional_leader based on the best public evidence. Do not invent another category or employer.",
  "Return an exact current title only when it is visible in public evidence. Otherwise leave title empty; never invent, normalize, or infer one.",
  "Return separate verbatim identity, title, company, and category evidence. currentRoleEvidenceText must equal the complete exact title only.",
  "Return a direct LinkedIn /in/ URL when public search exposes it. Do not return email addresses. Return JSON only.",
].join(" ");

const VERIFICATION_SYSTEM_PROMPT = [
  "You independently verify a complete batch of hiring-path candidates in one web-search pass.",
  "Treat every supplied name, title, category, confidence score, and URL as untrusted.",
  "Each candidate includes its requested category. Verify identity, current employment at one of the supplied accepted employer identities, exact current title, direct LinkedIn /in/ profile, and evidence for that requested category.",
  "The accepted employer identities come from explicit job-posting evidence. Do not add an unstated parent, affiliate, client, agency, or employer.",
  "Use the exact current LinkedIn Experience title when visible. Otherwise use an exact current title from a company page, organization directory, or recent public profile.",
  "currentTitle must contain only the exact job title. Never use a headline, About sentence, employer suffix, search-result summary, truncated text, or descriptive prose as currentTitle.",
  "Set currentTitleSource to linkedin_experience, company_page, or organization_directory. A LinkedIn headline or About section is not a valid title source. If none of the allowed sources proves the exact job title, leave currentTitle and currentTitleSource empty. currentRoleIsCurrent may still be true only when separate current-company evidence proves current employment.",
  "Keep the LinkedIn headline separate. Never combine, shorten, normalize, or invent a third title.",
  "currentRoleEvidenceText must equal the complete currentTitle verbatim, with no name, employer, suffix, or descriptive prose. currentRoleEvidenceUrl must be a literal public URL.",
  "currentCompanyEvidenceText must contain currentCompany verbatim and currentCompanyEvidenceUrl must be a literal public URL. Title and company evidence may come from different public excerpts.",
  "classificationEvidenceText must be a verbatim, person-specific public excerpt supporting the requested category, not your inference or summary. When an exact title is unavailable, recruiting activity, an About statement describing the person's work, a team biography, or another person-specific source may support classification. A company description by itself is not person-specific evidence.",
  "Evaluate relevance using the same universal dimensions for every user and industry: career stage, function or discipline, business or product area, role type, geography when relevant, and evidence freshness.",
  "Set relevanceStatus to strong or plausible when public evidence supports alignment, unknown when remit is not public, and conflicting only when public evidence explicitly contradicts the role.",
  "Missing remit evidence is unknown, not conflicting. Do not reject a person merely because requisition-level proof is unavailable.",
  "Use the candidate's discovery evidence, LinkedIn profile, public About text, public activity, team biography, or interviews during this same pass. There will be no per-person retry.",
  "Return one verification for every candidateKey, including rejected candidates. Do not add new people. Return JSON only.",
].join(" ");

function laneDiscoveryInstructions(lane: HumanPathLane) {
  if (lane === "likely_hiring_manager") {
    return [
      "Build a broad set of people who may directly manage this opening. Aim for at least five when evidence supports them, and return more rather than hiding useful candidates.",
      "Prefer evidence connecting the person to the role's function, sub-organization, team, or requisition.",
      "When the posting names a sub-organization or acronym, search that exact identifier and its leadership before broader company leaders.",
      "Do not infer direct ownership from a broad leadership title, but retain plausible leaders when their exact remit is not public.",
      "Useful evidence includes a hiring post, explicit team ownership, an organization chart, or a current title naming the exact function.",
    ];
  }
  if (lane === "recruiter") {
    return [
      "Build a broad set of current recruiters, talent acquisition partners, or sourcers at the target company. Aim for at least five and return more when useful.",
      "Prefer recruiters whose public activity or remit covers the role's function, region, or organization.",
      "Retain current company recruiters whose remit is not public, but state that uncertainty instead of claiming alignment.",
      "Include explicit career-stage, function, business-area, and geography evidence so contradictions can be evaluated later.",
      "Exact assignment to the requisition is not required, but never claim assignment without evidence.",
    ];
  }
  return [
    "Build a broad set of current leaders who may own the role's function or practice. Aim for at least five and return more when useful.",
    "Prefer explicit evidence of function ownership, while retaining plausible adjacent leaders when exact organizational remit is not public.",
    "Do not treat general organizational adjacency as confirmed ownership, and do not invent a reporting relationship.",
  ];
}

function laneSearchHints(job: HumanPathJob, lane: HumanPathLane) {
  const anchors = organizationAnchors(job);
  const rolePhrases = jobSearchPhrases(job);
  const companyNames = employerIdentityNames(job);
  if (lane === "recruiter") {
    return companyNames.flatMap((companyName) => [
      `site:linkedin.com/in "${companyName}" recruiter`,
      `site:linkedin.com/in "${companyName}" "talent acquisition"`,
      ...rolePhrases.map((phrase) => `"${companyName}" recruiter "${phrase}"`),
      ...anchors.map((anchor) => `site:linkedin.com/in "${companyName}" recruiter "${anchor}"`),
    ]);
  }
  if (lane === "functional_leader") {
    return companyNames.flatMap((companyName) => [
      ...rolePhrases.flatMap((phrase) => [
        `site:linkedin.com/in "${companyName}" "${phrase}" leader`,
        `"${companyName}" "${phrase}" leadership`,
      ]),
      ...anchors.map((anchor) => `site:linkedin.com/in "${companyName}" "${anchor}" leader`),
    ]);
  }
  return companyNames.flatMap((companyName) => [
    `"${companyName}" "${job.title}" hiring`,
    `"${companyName}" "${job.title}" team`,
    ...rolePhrases.map((phrase) => `site:linkedin.com/in "${companyName}" "${phrase}" manager`),
    ...anchors.flatMap((anchor) => [
      `site:linkedin.com/in "${companyName}" "${anchor}"`,
      `"${companyName}" "${anchor}" "Chief of Staff"`,
      `"${companyName}" "${anchor}" hiring "${job.title}"`,
    ]),
  ]);
}

const DISCOVERY_OUTPUT_SCHEMA = {
  contacts: [{
    name: "Exact full name from public evidence",
    title: "Exact current title from the cited source",
    companyName: "Current employer",
    candidateRole: "likely_hiring_manager | recruiter | functional_leader",
    linkedinUrl: "Direct LinkedIn /in/ profile URL, or empty string",
    evidenceUrl: "Literal public URL supporting current employment and title",
    currentTitleSource: "linkedin_experience | company_page | organization_directory, or empty string",
    identityEvidenceText: "Verbatim person-specific excerpt containing the exact full name",
    identityEvidenceUrl: "Literal public URL supporting identity",
    currentRoleEvidenceText: "Complete exact title only, copied verbatim; must equal title or be empty",
    currentRoleEvidenceUrl: "Literal public URL supporting the exact title",
    currentCompanyEvidenceText: "Verbatim person-specific excerpt containing companyName",
    currentCompanyEvidenceUrl: "Literal public URL supporting current employment",
    classificationEvidenceText: "Verbatim person-specific excerpt supporting candidateRole",
    classificationEvidenceUrl: "Literal public URL supporting candidateRole",
    relevanceStatus: "strong | plausible | unknown | conflicting",
    relevanceEvidenceText: "Verbatim excerpt supporting alignment or conflict, or empty when unknown",
    relevanceEvidenceUrl: "Literal public URL for relevance evidence, or empty when unknown",
    conflictSignals: "Array of explicit evidence-grounded contradictions",
    confidence: "0-100 confidence in identity and category relevance",
    reason: "Evidence-grounded reason this person may fit the requested category",
    roleConnection: "Exact known connection, with uncertainty stated plainly",
  }],
};

function allLaneSearchHints(job: HumanPathJob) {
  return Object.fromEntries(LANES.map((lane) => [lane, laneSearchHints(job, lane)]));
}

export function buildBroadDiscoveryPrompt(
  job: HumanPathJob,
  candidateContext?: HumanPathCandidateContext,
  fallback = false,
) {
  return JSON.stringify({
    task: fallback
      ? "Find a useful hiring-path roster after the initial broad search returned zero usable candidates."
      : "Discover a varied hiring path covering every requested category in one research pass.",
    role: {
      title: job.title,
      company: job.companyName,
      summary: job.description.slice(0, 3000),
      acceptedEmployerIdentities: resolveEmployerIdentities(job),
    },
    functionContext: {
      organizationAnchors: organizationAnchors(job),
      candidateContext: candidateContextForPrompt(candidateContext),
      relevanceDimensions: [
        "career stage",
        "function or discipline",
        "business or product area",
        "role type",
        "geography when relevant",
        "evidence freshness",
      ],
    },
    categories: Object.fromEntries(LANES.map((lane) => [lane, {
      label: LANE_LABEL[lane],
      targetCount: DISCOVERY_TARGET_PER_LANE,
      rules: laneDiscoveryInstructions(lane),
    }])),
    requiredSearches: fallback
      ? resolveEmployerIdentities(job).flatMap((identity) => [
        `"${identity.name}" LinkedIn employees`,
        `site:linkedin.com/in "${identity.name}" recruiter`,
        `site:linkedin.com/in "${identity.name}" "${job.title}"`,
      ])
      : allLaneSearchHints(job),
    countRule: `Aim for ${DISCOVERY_TARGET_PER_LANE} useful people per category. That target is not a display cap, but do not pad the result with weak or anonymous entries.`,
    categoryRule: "candidateRole is required and must be exactly likely_hiring_manager, recruiter, or functional_leader.",
    outputSchema: DISCOVERY_OUTPUT_SCHEMA,
  });
}

export function buildLaneDiscoveryPrompt(
  job: HumanPathJob,
  lane: HumanPathLane,
  candidateContext?: HumanPathCandidateContext,
) {
  return JSON.stringify({
    task: `Discover candidates only for the ${LANE_LABEL[lane]} category.`,
    requestedLane: lane,
    role: {
      title: job.title,
      company: job.companyName,
      summary: job.description.slice(0, 3000),
      acceptedEmployerIdentities: resolveEmployerIdentities(job),
    },
    functionContext: {
      organizationAnchors: organizationAnchors(job),
      candidateContext: candidateContextForPrompt(candidateContext),
      relevanceDimensions: [
        "career stage",
        "function or discipline",
        "business or product area",
        "role type",
        "geography when relevant",
        "evidence freshness",
      ],
    },
    categoryRules: laneDiscoveryInstructions(lane),
    requiredSearches: laneSearchHints(job, lane),
    targetCount: DISCOVERY_TARGET_PER_LANE,
    countRule: "The target is not a cap. Return every useful, evidence-supported candidate found.",
    outputSchema: DISCOVERY_OUTPUT_SCHEMA,
  });
}

export function buildOrganizationLeadershipPrompt(
  job: HumanPathJob,
  candidateContext?: HumanPathCandidateContext,
) {
  const anchors = organizationAnchors(job);
  return JSON.stringify({
    task: "Discover current leaders in the exact sub-organization named by this posting. These candidates will be independently classified as likely hiring managers or functional leaders later.",
    role: {
      title: job.title,
      company: job.companyName,
      summary: job.description.slice(0, 3000),
      acceptedEmployerIdentities: resolveEmployerIdentities(job),
    },
    organizationAnchors: anchors,
    candidateContext: candidateContextForPrompt(candidateContext),
    rules: [
      "Search every organization anchor exactly as written, including acronyms.",
      "Prioritize leaders one level above the role, chiefs of staff, function leaders, and people who have publicly hired for this work.",
      "Do not substitute broad company leaders who lack evidence connecting them to the named sub-organization.",
      "Retain plausible adjacent leaders when exact remit is not public, but label the uncertainty.",
      "Return exact current titles from cited public evidence. Do not synthesize titles.",
    ],
    requiredSearches: employerIdentityNames(job).flatMap((companyName) => anchors.flatMap((anchor) => [
      `site:linkedin.com/in "${companyName}" "${anchor}"`,
      `"${companyName}" "${anchor}" "Chief of Staff"`,
      `"${companyName}" "${anchor}" hiring "${job.title}"`,
    ])),
    targetCount: DISCOVERY_TARGET_PER_LANE,
    countRule: "The target is not a cap. Return every useful, evidence-supported candidate found.",
    outputSchema: DISCOVERY_OUTPUT_SCHEMA,
  });
}

export function buildEmployerRosterPrompt(
  job: HumanPathJob,
  candidateContext?: HumanPathCandidateContext,
) {
  const identities = resolveEmployerIdentities(job);
  return JSON.stringify({
    task: "Discover a broad public employee roster for the accepted employer identities. This pass seeds names only; later verification decides each person's category and exact title.",
    role: {
      title: job.title,
      company: job.companyName,
      summary: job.description.slice(0, 2200),
      acceptedEmployerIdentities: identities,
    },
    candidateContext: candidateContextForPrompt(candidateContext),
    rules: [
      "Search the official website and LinkedIn company employee page for every accepted employer identity.",
      "Return real named employees who may warrant later review as a recruiter, hiring manager, or functional leader.",
      "Do not exclude a named roster member merely because their category or exact title is not visible yet; independent verification will decide.",
      "When an accepted employer is itself a recruiting or executive-search firm, retain named client-facing, recruiting, consulting, and leadership employees as seeds.",
      "A missing public title is allowed in this discovery pass. Leave title empty so independent verification can search the name without inheriting an invented title.",
      "Do not return anonymous titles, company names, departments, or placeholder people.",
    ],
    requiredSearches: identities.flatMap((identity) => [
      `"${identity.name}" LinkedIn employees`,
      `site:linkedin.com/company "${identity.name}" employees`,
      `site:linkedin.com/in "${identity.name}"`,
    ]),
    targetCount: DISCOVERY_TARGET_PER_LANE,
    countRule: "The target is not a cap. Return every useful named candidate found.",
    outputSchema: DISCOVERY_OUTPUT_SCHEMA,
  });
}

// Kept as a stable exported prompt helper for existing fixtures and diagnostics.
export function buildUserPrompt(job: HumanPathJob) {
  return buildLaneDiscoveryPrompt(job, "likely_hiring_manager");
}

export function buildProfileVerificationPrompt(
  job: HumanPathJob,
  contacts: ResearchedContact[],
  lane: HumanPathLane = "likely_hiring_manager",
  candidateContext?: HumanPathCandidateContext,
) {
  return JSON.stringify({
    task: `Verify these candidates only as ${LANE_LABEL[lane]} contacts.`,
    requestedLane: lane,
    role: {
      title: job.title,
      company: job.companyName,
      summary: job.description.slice(0, 2200),
      acceptedEmployerIdentities: resolveEmployerIdentities(job),
    },
    candidateContext: candidateContextForPrompt(candidateContext),
    relevanceRules: [
      "Use the same dimensions for every role and industry: career stage, function or discipline, business or product area, role type, geography when relevant, and evidence freshness.",
      "strong means direct requisition, team, organization, or clearly matching remit evidence.",
      "plausible means meaningful adjacent evidence without a verified direct assignment.",
      "unknown means the person's remit is not publicly established. Unknown is not a rejection.",
      "conflicting requires explicit public evidence of an incompatible remit, such as a different career stage, function, business area, or geography.",
    ],
    categoryRules: laneDiscoveryInstructions(lane),
    untrustedCandidates: contacts.map((contact, index) => ({
      candidateKey: String(index),
      claimedName: contact.name,
      claimedTitle: contact.title,
      claimedCompany: contact.companyName,
      claimedLinkedinUrl: contact.linkedinUrl || "",
      discoveryEvidenceUrl: contact.evidenceUrl || "",
    })),
    requiredSearches: contacts.flatMap((contact) => [
      ...employerIdentityNames(job).map((companyName) => `site:linkedin.com/in "${contact.name}" "${companyName}"`),
      ...(contact.linkedinUrl ? [`"${contact.linkedinUrl}"`] : []),
      ...(linkedinProfileSlugSearchPhrase(contact.linkedinUrl)
        ? employerIdentityNames(job).map((companyName) => (
          `"${linkedinProfileSlugSearchPhrase(contact.linkedinUrl)}" "${companyName}"`
        ))
        : []),
      ...(contact.evidenceUrl ? [`"${contact.evidenceUrl}"`] : []),
      ...(contact.title
        ? employerIdentityNames(job).map((companyName) => `"${contact.name}" "${companyName}" "${contact.title}"`)
        : []),
      `"${contact.name}" "${job.title}"`,
      ...employerIdentityNames(job).flatMap((companyName) => (
        organizationAnchors(job).map((anchor) => `"${contact.name}" "${companyName}" "${anchor}"`)
      )),
    ]),
    outputSchema: {
      verifications: [{
        candidateKey: "Exact supplied candidate key",
        currentName: "Exact full name from the verified profile",
        linkedinHeadline: "Exact LinkedIn headline, or empty string",
        linkedinHeadlineEvidenceText: "Verbatim excerpt containing the headline, or empty string",
        currentTitle: "Exact current job title only, without employer or descriptive prose",
        currentTitleSource: "linkedin_experience | company_page | organization_directory, or empty string",
        currentCompany: "Exact current employer from that source",
        currentRoleEvidenceText: "Complete currentTitle only, copied verbatim; must equal currentTitle",
        currentRoleEvidenceUrl: "Literal public URL supporting currentTitle and currentCompany",
        currentCompanyEvidenceText: "Verbatim excerpt containing currentCompany",
        currentCompanyEvidenceUrl: "Literal public URL supporting current employment at currentCompany",
        currentRoleIsCurrent: "boolean",
        linkedinUrl: "Verified direct LinkedIn /in/ profile URL, or empty string",
        identityMatches: "boolean",
        companyMatches: "boolean",
        classificationSupported: `boolean: evidence supports ${LANE_LABEL[lane]} specifically`,
        classificationEvidenceText: "Verbatim public excerpt supporting this category",
        classificationEvidenceUrl: "Literal public URL for that category evidence",
        relevanceStatus: "strong | plausible | unknown | conflicting",
        relevanceEvidenceText: "Verbatim public excerpt supporting alignment or conflict, or empty when unknown",
        relevanceEvidenceUrl: "Literal public URL for relevance evidence, or empty when unknown",
        alignmentSignals: "Array of short evidence-grounded alignment facts",
        conflictSignals: "Array of short evidence-grounded contradictions",
        confidence: "0-100 confidence in the verified facts and category",
        reason: "One evidence-grounded sentence explaining relevance or rejection",
        roleConnection: "Verified category connection with uncertainty stated plainly",
      }],
    },
  });
}

export function buildBroadProfileVerificationPrompt(
  job: HumanPathJob,
  contacts: ResearchedContact[],
  candidateContext?: HumanPathCandidateContext,
) {
  const base = JSON.parse(buildProfileVerificationPrompt(
    job,
    contacts,
    "likely_hiring_manager",
    candidateContext,
  )) as Record<string, unknown> & {
    outputSchema: { verifications: Array<Record<string, unknown>> };
  };
  delete base.requestedLane;
  const verifications = base.outputSchema.verifications;
  if (verifications[0]) {
    verifications[0].classificationSupported = "boolean: evidence supports the candidate's requestedLane specifically";
  }
  return JSON.stringify({
    ...base,
    task: "Verify the complete supplied candidate batch. Evaluate each person only against that person's requestedLane.",
    categoryRules: Object.fromEntries(LANES.map((lane) => [lane, laneDiscoveryInstructions(lane)])),
    untrustedCandidates: contacts.map((contact, index) => ({
      candidateKey: String(index),
      requestedLane: contact.contactType,
      claimedName: contact.name,
      claimedTitle: contact.title,
      claimedCompany: contact.companyName,
      claimedLinkedinUrl: contact.linkedinUrl || "",
      discoveryEvidenceUrl: contact.evidenceUrl || "",
    })),
    requiredSearches: contacts.flatMap((contact) => [
      ...employerIdentityNames(job).map((companyName) => (
        `site:linkedin.com/in "${contact.name}" "${companyName}"`
      )),
      ...(contact.linkedinUrl ? [`"${contact.linkedinUrl}"`] : []),
      ...(contact.evidenceUrl ? [`"${contact.evidenceUrl}"`] : []),
      `"${contact.name}" "${LANE_LABEL[contact.contactType as HumanPathLane] ?? "hiring"}"`,
      `"${contact.name}" "${job.title}"`,
    ]),
  });
}


function profileVerificationRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => (
      item && typeof item === "object" ? [item as Record<string, unknown>] : []
    ));
  }
  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const container = record.verifications
    ?? record.results
    ?? record.candidates
    ?? record.profiles;
  if (Array.isArray(container)) {
    return container.flatMap((item) => (
      item && typeof item === "object" ? [item as Record<string, unknown>] : []
    ));
  }
  if (!container || typeof container !== "object") return [];
  return Object.entries(container as Record<string, unknown>).flatMap(([candidateKey, item]) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    return [{
      ...row,
      candidateKey: row.candidateKey ?? row.candidate_key ?? candidateKey,
    }];
  });
}

function cleanCandidateKey(row: Record<string, unknown>) {
  const value = row.candidateKey ?? row.candidate_key;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return String(value);
  return cleanString(value);
}

export function parseProfileVerifications(value: unknown): ContactProfileVerification[] {
  return profileVerificationRows(value).map((row): ContactProfileVerification | null => {
    const candidateKey = cleanCandidateKey(row);
    const currentName = cleanField(row, "currentName", "current_name", "name");
    if (!candidateKey || !currentName) return null;
    return {
      candidateKey,
      currentName,
      linkedinHeadline: cleanField(row, "linkedinHeadline", "linkedin_headline"),
      linkedinHeadlineEvidenceText: cleanField(
        row,
        "linkedinHeadlineEvidenceText",
        "linkedin_headline_evidence_text",
      ),
      currentTitle: cleanField(row, "currentTitle", "current_title", "currentExperienceTitle", "current_experience_title"),
      currentTitleSource: (() => {
        const source = cleanField(row, "currentTitleSource", "current_title_source");
        return ["linkedin_experience", "company_page", "organization_directory"].includes(source)
          ? source as ContactProfileVerification["currentTitleSource"]
          : "";
      })(),
      currentCompany: cleanField(row, "currentCompany", "current_company", "currentExperienceCompany", "current_experience_company"),
      currentRoleEvidenceText: cleanField(
        row,
        "currentRoleEvidenceText",
        "current_role_evidence_text",
        "currentExperienceEvidenceText",
        "current_experience_evidence_text",
      ),
      currentRoleEvidenceUrl: normalizedPublicUrl(cleanField(
        row,
        "currentRoleEvidenceUrl",
        "current_role_evidence_url",
        "experienceEvidenceUrl",
        "experience_evidence_url",
      )),
      currentCompanyEvidenceText: cleanField(
        row,
        "currentCompanyEvidenceText",
        "current_company_evidence_text",
      ),
      currentCompanyEvidenceUrl: normalizedPublicUrl(cleanField(
        row,
        "currentCompanyEvidenceUrl",
        "current_company_evidence_url",
      )),
      currentRoleIsCurrent: row.currentRoleIsCurrent === true
        || row.current_role_is_current === true
        || row.currentExperienceIsCurrent === true
        || row.current_experience_is_current === true,
      linkedinUrl: normalizedLinkedinProfileUrl(cleanField(row, "linkedinUrl", "linkedin_url")),
      identityMatches: row.identityMatches === true || row.identity_matches === true,
      companyMatches: row.companyMatches === true || row.company_matches === true,
      classificationSupported: row.classificationSupported === true
        || row.classification_supported === true
        || row.roleEligible === true
        || row.role_eligible === true,
      classificationEvidenceText: cleanField(
        row,
        "classificationEvidenceText",
        "classification_evidence_text",
      ),
      classificationEvidenceUrl: normalizedPublicUrl(cleanField(
        row,
        "classificationEvidenceUrl",
        "classification_evidence_url",
      )),
      relevanceStatus: normalizeRelevanceStatus(row.relevanceStatus ?? row.relevance_status),
      relevanceEvidenceText: cleanField(
        row,
        "relevanceEvidenceText",
        "relevance_evidence_text",
      ),
      relevanceEvidenceUrl: normalizedPublicUrl(cleanField(
        row,
        "relevanceEvidenceUrl",
        "relevance_evidence_url",
      )),
      alignmentSignals: cleanStringArray(row.alignmentSignals ?? row.alignment_signals),
      conflictSignals: cleanStringArray(row.conflictSignals ?? row.conflict_signals),
      confidence: clampConfidence(row.confidence),
      relevanceReason: cleanField(row, "reason", "relevanceReason", "relevance_reason"),
      roleConnection: cleanField(row, "roleConnection", "role_connection"),
    };
  }).filter((verification): verification is ContactProfileVerification => Boolean(verification));
}

function evidenceContainsVerbatim(evidenceText: string, value: string) {
  const normalizedEvidence = evidenceText.replace(/\s+/g, " ").trim().toLowerCase();
  const normalizedValue = value.replace(/\s+/g, " ").trim().toLowerCase();
  return Boolean(normalizedValue && normalizedEvidence.includes(normalizedValue));
}

function evidenceEqualsCompleteTitle(evidenceText: string, title: string) {
  return normalizedPhrase(evidenceText) === normalizedPhrase(title);
}

function isPlausibleExactJobTitle(title: string, companyName: string) {
  const normalized = title.replace(/\s+/g, " ").trim();
  if (normalized.length < 2 || normalized.length > 120) return false;
  if (/[.…]|\|/.test(normalized)) return false;
  if (/\b(speciali[sz]ing in|passionate about|responsible for|experience in|helping)\b/i.test(normalized)) return false;
  const escapedCompany = companyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`\\s+at\\s+${escapedCompany}\\s*$`, "i").test(normalized)) return false;
  return true;
}

function hasVerifiedExactTitle(verification: ContactProfileVerification) {
  if (!verification.currentTitle && !verification.currentTitleSource) return true;
  return Boolean(verification.currentTitle)
    && Boolean(verification.currentTitleSource)
    && isPlausibleExactJobTitle(verification.currentTitle, verification.currentCompany)
    && Boolean(verification.currentRoleEvidenceText)
    && Boolean(verification.currentRoleEvidenceUrl)
    && evidenceEqualsCompleteTitle(verification.currentRoleEvidenceText, verification.currentTitle);
}

function withoutUnverifiedTitle(verification: ContactProfileVerification) {
  if (hasVerifiedExactTitle(verification)) return verification;
  return {
    ...verification,
    currentTitle: "",
    currentTitleSource: "" as const,
    currentRoleEvidenceText: "",
    currentRoleEvidenceUrl: "",
  };
}

function titleSupportsLane(title: string, lane: HumanPathLane) {
  const normalized = normalizedPhrase(title);
  if (lane === "recruiter") {
    return /\b(recruiter|recruiting|recruitment|talent acquisition|talent partner|sourcer|executive search|headhunter|search consultant)\b/.test(normalized);
  }
  return /\b(manager|mgr|director|head|lead|chief|president|supervisor|vp|svp|evp)\b/.test(normalized);
}

function recruiterEvidenceSupports(value: string) {
  return /\b(recruit|recruits|recruiter|recruiting|recruitment|talent acquisition|talent partner|sourcer|executive search|headhunt|hire|hiring|candidate|candidates|applicant|applicants)\b/.test(
    normalizedPhrase(value),
  );
}

function recruiterDiscoverySignalSupports(value: string) {
  return /\b(recruit|recruits|recruiter|recruiting|recruitment|talent acquisition|talent partner|sourcer|executive search|headhunt|hire|hiring)\b/.test(
    normalizedPhrase(value),
  );
}

function classificationEvidenceSupportsLane(
  job: HumanPathJob,
  lane: HumanPathLane,
  verification: ContactProfileVerification,
) {
  const titleSupports = titleSupportsLane(verification.currentTitle, lane);
  if (verification.currentTitle && titleSupports) {
    if (lane === "recruiter") return true;
    if (lane === "functional_leader"
      && titleSupportsFunctionalContext(job, verification.currentTitle)) return true;
    return verification.classificationSupported
      && Boolean(verification.classificationEvidenceText)
      && Boolean(verification.classificationEvidenceUrl);
  }
  if (!verification.classificationSupported
    || !verification.classificationEvidenceText
    || !verification.classificationEvidenceUrl) return false;

  const evidence = normalizedPhrase(verification.classificationEvidenceText);
  if (lane === "recruiter") {
    return recruiterEvidenceSupports(evidence);
  }
  if (lane === "functional_leader") {
    return /\b(leads|lead|owns|head|director|manager|chief|president|responsible for)\b/.test(evidence);
  }
  return /\b(hiring|hires|manages|leads|owns|reports to|direct manager)\b/.test(evidence);
}

function hasEvidenceBackedRelevanceConflict(verification: ContactProfileVerification) {
  return verification.relevanceStatus === "conflicting"
    && Boolean(verification.relevanceEvidenceText)
    && Boolean(verification.relevanceEvidenceUrl)
    && verification.conflictSignals.length > 0;
}

function verificationFromDiscoveryEvidence(
  job: HumanPathJob,
  contact: ResearchedContact,
  candidateKey: string,
) {
  const linkedinUrl = normalizedLinkedinProfileUrl(contact.linkedinUrl ?? "");
  const identityEvidenceText = contact.identityEvidenceText ?? "";
  const identityEvidenceUrl = normalizedPublicUrl(contact.identityEvidenceUrl ?? "");
  const currentCompanyEvidenceText = contact.currentCompanyEvidenceText ?? "";
  const currentCompanyEvidenceUrl = normalizedPublicUrl(contact.currentCompanyEvidenceUrl ?? "");
  const classificationEvidenceText = contact.classificationEvidenceText ?? "";
  const classificationEvidenceUrl = normalizedPublicUrl(contact.classificationEvidenceUrl ?? "");
  const hasExactTitleEvidence = !contact.title || (
    Boolean(contact.currentTitleSource)
    && Boolean(contact.currentRoleEvidenceUrl)
    && evidenceEqualsCompleteTitle(contact.currentRoleEvidenceText ?? "", contact.title)
  );
  if (!linkedinUrl
    || !identityEvidenceUrl
    || !evidenceContainsVerbatim(identityEvidenceText, contact.name)
    || !currentCompanyMatchesPosting(job, contact.companyName)
    || !currentCompanyEvidenceUrl
    || !evidenceContainsVerbatim(currentCompanyEvidenceText, contact.companyName)
    || !classificationEvidenceText
    || !classificationEvidenceUrl
    || !hasExactTitleEvidence) {
    return undefined;
  }

  const verification: ContactProfileVerification = {
    candidateKey,
    currentName: contact.name,
    linkedinHeadline: "",
    linkedinHeadlineEvidenceText: "",
    currentTitle: contact.title,
    currentTitleSource: contact.title ? contact.currentTitleSource ?? "" : "",
    currentCompany: contact.companyName,
    currentRoleEvidenceText: contact.title ? contact.currentRoleEvidenceText ?? "" : "",
    currentRoleEvidenceUrl: contact.title ? normalizedPublicUrl(contact.currentRoleEvidenceUrl ?? "") : "",
    currentCompanyEvidenceText,
    currentCompanyEvidenceUrl,
    currentRoleIsCurrent: true,
    linkedinUrl,
    identityMatches: true,
    companyMatches: true,
    classificationSupported: true,
    classificationEvidenceText,
    classificationEvidenceUrl,
    relevanceStatus: contact.relevanceStatus ?? "unknown",
    relevanceEvidenceText: contact.relevanceEvidenceText ?? "",
    relevanceEvidenceUrl: normalizedPublicUrl(contact.relevanceEvidenceUrl ?? ""),
    alignmentSignals: [],
    conflictSignals: contact.conflictSignals ?? [],
    confidence: Math.min(contact.confidence, 69),
    relevanceReason: contact.relevanceReason,
    roleConnection: contact.roleConnection,
  };
  const rejectionCodes = rejectionCodesForCandidate(
    job,
    contact.contactType as HumanPathLane,
    verification,
  );
  return rejectionCodes.every((code) => code === "relevance_conflict")
    ? verification
    : undefined;
}

const GENERIC_ROLE_TOKENS = new Set([
  "associate", "chief", "director", "executive", "head", "junior", "lead", "leader",
  "manager", "officer", "principal", "senior", "specialist", "staff", "supervisor", "vice",
]);

function comparableToken(value: string) {
  if (value.endsWith("ies") && value.length > 4) return `${value.slice(0, -3)}y`;
  if (value.endsWith("s") && !value.endsWith("ss") && value.length > 4) return value.slice(0, -1);
  return value;
}

function roleEvidenceTokens(job: HumanPathJob) {
  return Array.from(new Set(
    normalizedPhrase(job.title).split(" ")
      .map(comparableToken)
      .filter((token) => token.length >= 3 && !GENERIC_ROLE_TOKENS.has(token)),
  ));
}

function evidenceContainsOrganizationAnchor(job: HumanPathJob, evidenceText: string) {
  const normalizedEvidence = ` ${normalizedPhrase(evidenceText)} `;
  return organizationAnchors(job).some((anchor) => {
    const variants = [
      normalizedPhrase(anchor),
      normalizedPhrase(anchor.replace(/\s*\([^)]*\)\s*$/, "")),
    ].filter(Boolean);
    return variants.some((variant) => normalizedEvidence.includes(` ${variant} `));
  });
}

function titleSupportsFunctionalContext(job: HumanPathJob, title: string) {
  if (evidenceContainsOrganizationAnchor(job, title)) return true;
  const titleTokens = new Set(
    normalizedPhrase(title).split(" ").map(comparableToken),
  );
  const roleTokens = roleEvidenceTokens(job);
  const matched = roleTokens.filter((token) => titleTokens.has(token));
  return roleTokens.length > 0 && matched.length >= Math.min(2, roleTokens.length);
}

function evidenceSupportsRoleAlignment(job: HumanPathJob, verification: ContactProfileVerification) {
  if (!verification.relevanceEvidenceText || !verification.relevanceEvidenceUrl) return false;
  if (evidenceContainsOrganizationAnchor(job, verification.relevanceEvidenceText)) return true;
  const evidenceTokens = new Set(
    normalizedPhrase(verification.relevanceEvidenceText).split(" ").map(comparableToken),
  );
  const roleTokens = roleEvidenceTokens(job);
  const matched = roleTokens.filter((token) => evidenceTokens.has(token));
  return roleTokens.length > 0 && matched.length >= Math.min(2, roleTokens.length);
}

function evidenceSupportsDirectConnection(
  job: HumanPathJob,
  lane: HumanPathLane,
  verification: ContactProfileVerification,
) {
  const evidence = verification.relevanceEvidenceText;
  if (!evidenceSupportsRoleAlignment(job, verification)) return false;
  if (lane === "recruiter") {
    return /\b(assigned|hiring for|recruiting for|recruits? for|supports? hiring|talent partner for|requisition)\b/i.test(evidence);
  }
  return /\b(hiring|hires|reports to|direct manager|manages? the|leads? the|owns? the|responsible for)\b/i.test(evidence);
}

function effectiveRelevanceStatus(
  job: HumanPathJob,
  lane: HumanPathLane,
  verification: ContactProfileVerification,
): ContactRelevanceStatus {
  if (hasEvidenceBackedRelevanceConflict(verification)) return "conflicting";
  if (verification.relevanceStatus === "unknown" || verification.relevanceStatus === "conflicting") {
    return "unknown";
  }
  if (!evidenceSupportsRoleAlignment(job, verification)) return "unknown";
  if (verification.relevanceStatus === "strong") {
    return evidenceSupportsDirectConnection(job, lane, verification) ? "strong" : "plausible";
  }
  return "plausible";
}

function relevanceSortRank(status?: ContactRelevanceStatus) {
  if (status === "strong") return 0;
  if (status === "plausible") return 1;
  if (status === "unknown") return 2;
  return 3;
}

function confidenceForRelevance(confidence: number, status: ContactRelevanceStatus) {
  if (status === "strong") return Math.min(100, confidence + 5);
  if (status === "plausible") return Math.min(69, confidence);
  if (status === "unknown") return Math.min(55, Math.max(0, confidence - 20));
  return Math.min(39, confidence);
}

function confidenceForTitleAvailability(confidence: number, title: string) {
  return title ? confidence : Math.min(55, Math.max(0, confidence - 10));
}

function rejectionCodesForCandidate(
  job: HumanPathJob,
  lane: HumanPathLane,
  verification: ContactProfileVerification | undefined,
): HumanPathRejectionCode[] {
  if (!verification) return ["verification_unavailable"];
  const reasons: HumanPathRejectionCode[] = [];
  if (!verification.identityMatches || !isSpecificPersonName(verification.currentName, job.companyName)) {
    reasons.push("identity_unverified");
  }
  // Company acceptance is deterministic. The model verifies the observed
  // current employer, but only the posting can authorize which employer
  // identities belong to this hiring path.
  if (!currentCompanyMatchesPosting(job, verification.currentCompany)) {
    reasons.push("company_unverified");
  }
  if (!verification.linkedinUrl) reasons.push("linkedin_profile_unverified");
  const currentCompanyIsVerified = verification.currentRoleIsCurrent
    && Boolean(verification.currentCompany)
    && Boolean(verification.currentCompanyEvidenceText)
    && Boolean(verification.currentCompanyEvidenceUrl)
    && evidenceContainsVerbatim(verification.currentCompanyEvidenceText, verification.currentCompany);
  const exactTitleIsVerified = hasVerifiedExactTitle(verification);
  if (!currentCompanyIsVerified || !exactTitleIsVerified) {
    reasons.push("current_role_unverified");
  }
  if (verification.currentTitle && !titleSupportsLane(verification.currentTitle, lane)) {
    if (!classificationEvidenceSupportsLane(job, lane, verification)) reasons.push("title_mismatch");
  }
  if (!classificationEvidenceSupportsLane(job, lane, verification)) reasons.push("classification_unverified");
  if (hasEvidenceBackedRelevanceConflict(verification)) reasons.push("relevance_conflict");
  return Array.from(new Set(reasons));
}

function defaultRoleConnection(lane: HumanPathLane, relevanceStatus: ContactRelevanceStatus) {
  if (relevanceStatus === "unknown") {
    if (lane === "recruiter") return "Current company recruiter; public evidence does not establish their remit for this role.";
    return `Current ${LANE_LABEL[lane].toLowerCase()} candidate; exact relevance to this opening is not publicly established.`;
  }
  if (lane === "recruiter") return "Current company recruiter with public evidence of a potentially relevant remit; assignment to this opening is not verified.";
  if (lane === "functional_leader") return "Current leader with evidence of relevant functional ownership; direct reporting relationship is not verified.";
  return "Public evidence connects this person to the role's team or hiring path.";
}

function recoverDiscoveryBackedRecruiter(
  job: HumanPathJob,
  contact: ResearchedContact,
  verification: ContactProfileVerification,
) {
  const discoveredProfile = normalizedLinkedinProfileUrl(contact.linkedinUrl ?? "");
  const verifiedProfile = normalizedLinkedinProfileUrl(verification.linkedinUrl);
  const discoveryCategoryText = [
    contact.title,
    contact.relevanceReason,
    contact.roleConnection,
  ].filter(Boolean).join(" ");
  const nameContradictsDiscovery = normalizedPhrase(verification.currentName)
    !== normalizedPhrase(contact.name);
  const profileContradictsDiscovery = Boolean(verifiedProfile)
    && verifiedProfile !== discoveredProfile;
  const companyContradictsPosting = Boolean(verification.currentCompany)
    && !currentCompanyMatchesPosting(job, verification.currentCompany);
  const hasExplicitContradiction = nameContradictsDiscovery
    || profileContradictsDiscovery
    || companyContradictsPosting
    || hasEvidenceBackedRelevanceConflict(verification);
  const canRetainDiscoveryCandidate = contact.contactType === "recruiter"
    && isSpecificPersonName(contact.name, job.companyName)
    && Boolean(discoveredProfile)
    && currentCompanyMatchesPosting(job, contact.companyName)
    && recruiterDiscoverySignalSupports(discoveryCategoryText)
    && !hasExplicitContradiction;
  if (!canRetainDiscoveryCandidate) return undefined;

  const verifiedTitle = hasVerifiedExactTitle(verification)
    ? verification.currentTitle
    : "";
  return {
    ...contact,
    title: verifiedTitle,
    linkedinUrl: discoveredProfile,
    professionalContactUrl: undefined,
    contactType: "recruiter" as const,
    confidence: Math.min(contact.confidence, verification.confidence || 35, 35),
    relevanceReason: "Public profile signals recruiter work; exact remit for this opening is not established.",
    roleConnection: defaultRoleConnection("recruiter", "unknown"),
    verificationNotes: Array.from(new Set([
      ...contact.verificationNotes,
      ...(verification.currentCompanyEvidenceUrl
        ? [`Current company evidence: ${verification.currentCompanyEvidenceUrl}`]
        : []),
    ])),
    relevanceStatus: "unknown" as const,
    rank: LANE_RANK.recruiter,
  };
}

function verifyLaneCandidates(
  job: HumanPathJob,
  lane: HumanPathLane,
  contacts: ResearchedContact[],
  verifications: ContactProfileVerification[],
): LaneVerificationResult {
  const groups = new Map<string, ContactProfileVerification[]>();
  for (const verification of verifications) {
    const group = groups.get(verification.candidateKey) ?? [];
    group.push(verification);
    groups.set(verification.candidateKey, group);
  }

  const accepted: ResearchedContact[] = [];
  const rejected: HumanPathLaneDiagnostic["rejected"] = [];
  contacts.forEach((contact, index) => {
    const candidateKey = String(index);
    const matches = groups.get(candidateKey) ?? [];
    const verification = matches.length === 1 ? matches[0] : undefined;
    const reasonCodes = rejectionCodesForCandidate(job, lane, verification);
    if (!verification || reasonCodes.length > 0) {
      const recovered = verification
        ? recoverDiscoveryBackedRecruiter(job, contact, verification)
        : undefined;
      if (recovered) {
        accepted.push(recovered);
        return;
      }
      rejected.push({ candidateKey, name: contact.name, reasonCodes });
      return;
    }
    const relevanceStatus = effectiveRelevanceStatus(job, lane, verification);
    accepted.push({
      ...contact,
      name: verification.currentName,
      title: verification.currentTitle,
      companyName: verification.currentCompany,
      linkedinUrl: verification.linkedinUrl,
      professionalContactUrl: undefined,
      contactType: lane,
      confidence: confidenceForTitleAvailability(
        confidenceForRelevance(
          Math.min(contact.confidence, verification.confidence),
          relevanceStatus,
        ),
        verification.currentTitle,
      ),
      relevanceReason: verification.relevanceReason || `Verified ${LANE_LABEL[lane]} contact at ${job.companyName}.`,
      roleConnection: relevanceStatus === "unknown"
        ? defaultRoleConnection(lane, relevanceStatus)
        : verification.roleConnection || defaultRoleConnection(lane, relevanceStatus),
      verificationNotes: [
        `Current role evidence: ${verification.currentRoleEvidenceUrl || verification.currentCompanyEvidenceUrl}`,
        verification.classificationEvidenceUrl
          ? `Classification evidence: ${verification.classificationEvidenceUrl}`
          : "",
        verification.relevanceEvidenceUrl
          ? `Relevance evidence: ${verification.relevanceEvidenceUrl}`
          : `Relevance evidence: public remit unknown`,
      ].filter(Boolean),
      relevanceStatus,
      rank: LANE_RANK[lane],
    });
  });

  return {
    contacts: accepted.sort((left, right) => (
      relevanceSortRank(left.relevanceStatus) - relevanceSortRank(right.relevanceStatus)
      || right.confidence - left.confidence
    )),
    rejected,
    verifiedCount: accepted.length,
  };
}

function contactDedupKey(contact: ResearchedContact) {
  return contact.linkedinUrl
    ? `linkedin:${contact.linkedinUrl.toLowerCase().replace(/\/$/, "")}`
    : `name:${normalizedPhrase(contact.name)}|${normalizedCompanyName(contact.companyName)}`;
}

function contactsRepresentSamePerson(left: ResearchedContact, right: ResearchedContact) {
  const leftProfile = normalizedLinkedinProfileUrl(left.linkedinUrl ?? "");
  const rightProfile = normalizedLinkedinProfileUrl(right.linkedinUrl ?? "");
  if (leftProfile && rightProfile) return leftProfile === rightProfile;
  return normalizedPhrase(left.name) === normalizedPhrase(right.name);
}

function combineResearchedContacts(primary: ResearchedContact, supplemental: ResearchedContact) {
  return {
    ...primary,
    title: primary.title || supplemental.title,
    companyName: primary.companyName || supplemental.companyName,
    linkedinUrl: primary.linkedinUrl || supplemental.linkedinUrl,
    professionalContactUrl: primary.professionalContactUrl || supplemental.professionalContactUrl,
    evidenceUrl: primary.evidenceUrl || supplemental.evidenceUrl,
    relevanceReason: primary.relevanceReason || supplemental.relevanceReason,
    roleConnection: primary.roleConnection || supplemental.roleConnection,
    verificationNotes: Array.from(new Set([
      ...primary.verificationNotes,
      ...supplemental.verificationNotes,
    ])),
    confidence: Math.max(primary.confidence, supplemental.confidence),
    rank: Math.min(primary.rank, supplemental.rank),
  };
}

export function mergeResearchedContacts(primary: ResearchedContact[], supplemental: ResearchedContact[]) {
  const merged: ResearchedContact[] = [];
  for (const contact of [...primary, ...supplemental]) {
    const existingIndex = merged.findIndex((existing) => contactsRepresentSamePerson(existing, contact));
    if (existingIndex >= 0) {
      merged[existingIndex] = combineResearchedContacts(merged[existingIndex], contact);
    } else {
      merged.push(contact);
    }
  }
  return merged.sort((left, right) => (
    left.rank - right.rank
    || relevanceSortRank(left.relevanceStatus) - relevanceSortRank(right.relevanceStatus)
    || right.confidence - left.confidence
  ));
}

function assembleLaneResults(runs: LaneRun[]) {
  const selected: ResearchedContact[] = [];
  const used = new Set<string>();
  const offsets = new Map<HumanPathLane, number>(LANES.map((lane) => [lane, 0]));

  const takeNext = (run: LaneRun) => {
    let offset = offsets.get(run.lane) ?? 0;
    while (offset < run.verified.length) {
      const candidate = run.verified[offset];
      offset += 1;
      offsets.set(run.lane, offset);
      const key = contactDedupKey(candidate);
      if (used.has(key)) {
        run.diagnostic.rejected.push({
          candidateKey: `assembled:${offset - 1}`,
          name: candidate.name,
          reasonCodes: ["duplicate_candidate"],
        });
        continue;
      }
      used.add(key);
      selected.push(candidate);
      run.diagnostic.acceptedCount += 1;
      return true;
    }
    return false;
  };

  // Put one useful contact from every available category near the top, then
  // drain every verified lane. Variety is a ranking behavior, not a result cap.
  for (const lane of LANES) {
    const run = runs.find((candidate) => candidate.lane === lane);
    if (run) takeNext(run);
  }
  while (true) {
    let advanced = false;
    for (const lane of LANES) {
      const run = runs.find((candidate) => candidate.lane === lane);
      if (run && takeNext(run)) advanced = true;
    }
    if (!advanced) break;
  }
  return selected;
}

function toHumanPathContact(contact: ResearchedContact): HumanPathContact {
  return {
    name: contact.name,
    title: contact.title,
    companyName: contact.companyName,
    linkedinUrl: contact.linkedinUrl,
    professionalContactUrl: contact.professionalContactUrl,
    reachability: resolveHumanPathReachability(contact),
    contactType: contact.contactType,
    confidence: bucketConfidence(contact.confidence),
    relevanceReason: contact.relevanceReason,
    roleConnection: contact.roleConnection,
    verificationNotes: contact.verificationNotes,
  };
}

const MODEL_TOKEN_RATES_USD_PER_MILLION: Record<string, { input: number; output: number }> = {
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-5.6-terra": { input: 2.5, output: 15 },
  "gpt-5.6-luna": { input: 1, output: 6 },
};

function estimateContactRunCost(args: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  webSearchCalls: number;
}) {
  const rates = MODEL_TOKEN_RATES_USD_PER_MILLION[args.model];
  if (!rates) return undefined;
  return Number((
    (args.inputTokens / 1_000_000) * rates.input
    + (args.outputTokens / 1_000_000) * rates.output
    + args.webSearchCalls * WEB_SEARCH_COST_USD
  ).toFixed(4));
}

const defaultCallModel: ContactModelCall = async ({ system, user, phase, strategy }) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.info("[llm:contact-discovery] skipped: no OPENAI_API_KEY");
    return undefined;
  }
  try {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey, timeout: CONTACT_MODEL_TIMEOUT_MS, maxRetries: 0 });
    const model = process.env.JOB_SEARCH_CONTACT_MODEL ?? "gpt-4.1";
    const searchBudget = contactSearchBudget(phase, strategy);
    // The installed SDK accepts max_tool_calls at runtime and documents it on
    // the Responses request, but its public non-streaming request alias omits
    // the field. Keep the narrow intersection until that export is corrected.
    const request: ResponseCreateParamsNonStreaming & { max_tool_calls: number } = {
      model,
      ...(model.startsWith("gpt-5.6")
        ? { reasoning: { effort: "low" as const } }
        : {}),
      tools: [{ type: "web_search", search_context_size: searchBudget.searchContextSize }],
      tool_choice: "required",
      include: ["web_search_call.action.sources"],
      max_output_tokens: 12_000,
      max_tool_calls: searchBudget.maxToolCalls,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    };
    const response = await client.responses.create(request);
    return {
      text: response.output_text ?? "",
      telemetry: {
        model,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        webSearchCalls: response.output.filter((item) => item.type === "web_search_call").length,
      },
    };
  } catch (error) {
    console.error("Contact discovery model call failed", error);
    return undefined;
  }
};

function selectVerificationCandidates(contacts: ResearchedContact[]) {
  const byLane = new Map<HumanPathLane, ResearchedContact[]>(LANES.map((lane) => [
    lane,
    contacts.filter((contact) => contact.contactType === lane),
  ]));
  const selected: ResearchedContact[] = [];
  const offsets = new Map<HumanPathLane, number>(LANES.map((lane) => [lane, 0]));
  while (selected.length < MAX_VERIFICATION_CANDIDATES) {
    let advanced = false;
    for (const lane of LANES) {
      if (selected.length >= MAX_VERIFICATION_CANDIDATES) break;
      const candidates = byLane.get(lane) ?? [];
      const offset = offsets.get(lane) ?? 0;
      const candidate = candidates[offset];
      if (!candidate) continue;
      selected.push(candidate);
      offsets.set(lane, offset + 1);
      advanced = true;
    }
    if (!advanced) break;
  }
  return selected;
}

function normalizeBatchVerifications(
  contacts: ResearchedContact[],
  value: unknown,
) {
  return parseProfileVerifications(value).flatMap((verification) => {
    const index = Number(verification.candidateKey);
    if (!Number.isInteger(index) || index < 0 || index >= contacts.length) return [];
    const discovered = contacts[index];
    const reconciled = withoutUnverifiedTitle(verification);
    const discoveredProfile = normalizedLinkedinProfileUrl(discovered.linkedinUrl ?? "");
    const normalized = {
      ...reconciled,
      linkedinUrl: reconciled.linkedinUrl
        || (reconciled.identityMatches ? discoveredProfile : ""),
    };
    const discoveryCategoryText = [
      discovered.title,
      discovered.relevanceReason,
      discovered.roleConnection,
    ].filter(Boolean).join(" ");
    const verifiedProfile = normalizedLinkedinProfileUrl(normalized.linkedinUrl);
    const canUseDiscoveryCategory = discovered.contactType === "recruiter"
      && !normalized.classificationSupported
      && !titleSupportsLane(normalized.currentTitle, "recruiter")
      && recruiterDiscoverySignalSupports(discoveryCategoryText)
      && Boolean(discoveredProfile)
      && discoveredProfile === verifiedProfile;
    return [{
      ...normalized,
      ...(canUseDiscoveryCategory ? {
        classificationSupported: true,
        classificationEvidenceText: discoveryCategoryText,
        classificationEvidenceUrl: discoveredProfile,
        confidence: Math.min(normalized.confidence, 45),
        relevanceReason: "Public profile signals recruiter work; exact remit for this opening is not established.",
      } : {}),
    }];
  });
}

export function createOpenAIHumanPathProvider(
  dependencies: ContactProviderDependencies = {},
): HumanPathProvider {
  const baseCallModel = dependencies.callModel ?? defaultCallModel;
  return async ({ job, candidateContext }) => {
    const startedAt = Date.now();
    const runMetrics = {
      model: process.env.JOB_SEARCH_CONTACT_MODEL ?? "gpt-4.1",
      modelCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      webSearchCalls: 0,
      phases: [] as Array<{
        phase: string;
        strategy: string;
        maxToolCalls: number;
        searchContextSize: ContactSearchBudget["searchContextSize"];
        elapsedMs: number;
        available: boolean;
        inputTokens: number;
        outputTokens: number;
        webSearchCalls: number;
      }>,
    };
    const callModel = async (args: Parameters<ContactModelCall>[0]) => {
      const callStartedAt = Date.now();
      const searchBudget = contactSearchBudget(args.phase, args.strategy);
      runMetrics.modelCalls += 1;
      const result = await baseCallModel(args);
      const normalized = typeof result === "string" ? { text: result } : result;
      if (normalized?.telemetry) {
        runMetrics.model = normalized.telemetry.model;
        runMetrics.inputTokens += normalized.telemetry.inputTokens;
        runMetrics.outputTokens += normalized.telemetry.outputTokens;
        runMetrics.webSearchCalls += normalized.telemetry.webSearchCalls;
      }
      runMetrics.phases.push({
        phase: args.phase ?? "unknown",
        strategy: args.strategy ?? "unknown",
        maxToolCalls: searchBudget.maxToolCalls,
        searchContextSize: searchBudget.searchContextSize,
        elapsedMs: Date.now() - callStartedAt,
        available: normalized !== undefined,
        inputTokens: normalized?.telemetry?.inputTokens ?? 0,
        outputTokens: normalized?.telemetry?.outputTokens ?? 0,
        webSearchCalls: normalized?.telemetry?.webSearchCalls ?? 0,
      });
      return normalized?.text;
    };

    try {
      const laneDiscoveryResults = await Promise.all(LANES.map(async (lane) => {
        const raw = await callModel({
          system: LANE_DISCOVERY_SYSTEM_PROMPT,
          user: buildLaneDiscoveryPrompt(job, lane, candidateContext),
          lane,
          phase: "discovery",
          strategy: "category",
        });
        const parsed = raw === undefined ? null : extractJson(raw);
        const contacts = raw === undefined
          ? []
          : parseResearchedContacts(parsed, job.companyName, lane, true);
        console.info("[llm:contact-discovery] discovery parse", {
          lane,
          strategy: "category",
          outputCharacters: raw?.length ?? 0,
          jsonParsed: parsed !== null,
          candidateRows: researchedContactRows(parsed).length,
          topLevelKeys: parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? Object.keys(parsed as Record<string, unknown>).slice(0, 12)
            : Array.isArray(parsed) ? ["<array>"] : [],
          parsedContacts: contacts.length,
        });
        return { lane, raw, contacts };
      }));

      if (laneDiscoveryResults.every((result) => result.raw === undefined)) {
        return {
          status: "provider_unavailable",
          reason: "Contact discovery is unavailable right now.",
        };
      }

      let discovered = laneDiscoveryResults.flatMap((result) => result.contacts);
      let fallbackAvailable = false;
      if (discovered.length === 0) {
        const fallbackRaw = await callModel({
          system: BROAD_FALLBACK_SYSTEM_PROMPT,
          user: buildEmployerRosterPrompt(job, candidateContext),
          phase: "discovery",
          strategy: "roster_fallback",
        });
        fallbackAvailable = fallbackRaw !== undefined;
        const parsedFallback = fallbackRaw === undefined ? null : extractJson(fallbackRaw);
        const parsedFallbackContacts = fallbackRaw === undefined
          ? []
          : parseResearchedContacts(parsedFallback, job.companyName, undefined, true);
        if (fallbackRaw !== undefined) {
          discovered = parsedFallbackContacts
            .filter((contact): contact is ResearchedContact & { contactType: HumanPathLane } => (
              LANES.includes(contact.contactType as HumanPathLane)
            ));
        }
        console.info("[llm:contact-discovery] discovery parse", {
          lane: "all",
          strategy: "roster_fallback",
          outputCharacters: fallbackRaw?.length ?? 0,
          jsonParsed: parsedFallback !== null,
          candidateRows: researchedContactRows(parsedFallback).length,
          topLevelKeys: parsedFallback && typeof parsedFallback === "object" && !Array.isArray(parsedFallback)
            ? Object.keys(parsedFallback as Record<string, unknown>).slice(0, 12)
            : Array.isArray(parsedFallback) ? ["<array>"] : [],
          parsedPeople: parsedFallbackContacts.length,
          unclassifiedPeople: parsedFallbackContacts.filter((contact) => (
            !LANES.includes(contact.contactType as HumanPathLane)
          )).length,
          parsedContacts: discovered.length,
        });
      }

      const selected = selectVerificationCandidates(discovered);
      const discoveryVerifications = selected.flatMap((contact, index) => {
        const verification = verificationFromDiscoveryEvidence(job, contact, String(index));
        return verification ? [verification] : [];
      });
      const discoveryVerifiedKeys = new Set(
        discoveryVerifications.map((verification) => verification.candidateKey),
      );
      const unresolved = selected.flatMap((contact, globalIndex) => (
        discoveryVerifiedKeys.has(String(globalIndex))
          ? []
          : [{ contact, globalIndex }]
      ));
      const verificationRaw = unresolved.length === 0
        ? ""
        : await callModel({
          system: VERIFICATION_SYSTEM_PROMPT,
          user: buildBroadProfileVerificationPrompt(
            job,
            unresolved.map(({ contact }) => contact),
            candidateContext,
          ),
          phase: "verification",
          strategy: "broad_category",
        });
      const parsedVerification = verificationRaw ? extractJson(verificationRaw) : null;
      const parsedVerificationRows = profileVerificationRows(parsedVerification);
      const parsedVerifications = parseProfileVerifications(parsedVerification);
      if (unresolved.length > 0) {
        console.info("[llm:contact-discovery] verification parse", {
          outputCharacters: verificationRaw?.length ?? 0,
          jsonParsed: parsedVerification !== null,
          candidateRows: parsedVerificationRows.length,
          parsedVerifications: parsedVerifications.length,
          candidateKeys: parsedVerifications.map((verification) => verification.candidateKey).slice(0, 18),
          topLevelKeys: parsedVerification
            && typeof parsedVerification === "object"
            && !Array.isArray(parsedVerification)
            ? Object.keys(parsedVerification as Record<string, unknown>).slice(0, 12)
            : Array.isArray(parsedVerification) ? ["<array>"] : [],
        });
      }
      const secondaryVerifications = verificationRaw
        ? normalizeBatchVerifications(
          unresolved.map(({ contact }) => contact),
          parsedVerification,
        ).flatMap((verification) => {
          const localIndex = Number(verification.candidateKey);
          const globalIndex = unresolved[localIndex]?.globalIndex;
          return globalIndex === undefined
            ? []
            : [{ ...verification, candidateKey: String(globalIndex) }];
        })
        : [];
      const verifications = [...discoveryVerifications, ...secondaryVerifications];
      const secondaryVerificationAvailable = unresolved.length === 0 || verificationRaw !== undefined;
      const unresolvedGlobalIndexes = new Set(unresolved.map(({ globalIndex }) => globalIndex));

      const runs = LANES.map((lane): LaneRun => {
        const laneGlobalIndexes = selected.flatMap((contact, index) => (
          contact.contactType === lane ? [index] : []
        ));
        const laneContacts = laneGlobalIndexes.map((index) => selected[index]);
        const localIndexByGlobalIndex = new Map(
          laneGlobalIndexes.map((globalIndex, localIndex) => [String(globalIndex), String(localIndex)]),
        );
        const laneVerifications = verifications.flatMap((verification) => {
          const localKey = localIndexByGlobalIndex.get(verification.candidateKey);
          return localKey === undefined ? [] : [{ ...verification, candidateKey: localKey }];
        });
        const laneNeedsSecondaryVerification = laneGlobalIndexes.some((globalIndex) => (
          unresolvedGlobalIndexes.has(globalIndex)
        ));
        const diagnostic: HumanPathLaneDiagnostic = {
          lane,
          discoveryStatus: laneDiscoveryResults.find((result) => result.lane === lane)?.raw !== undefined
            || fallbackAvailable
            ? "completed"
            : "provider_unavailable",
          verificationStatus: laneContacts.length === 0
            ? "not_needed"
            : laneNeedsSecondaryVerification && !secondaryVerificationAvailable
              ? "provider_unavailable"
              : "completed",
          discoveredCount: discovered.filter((contact) => contact.contactType === lane).length,
          verifiedCount: 0,
          acceptedCount: 0,
          rejected: [],
        };
        if (laneContacts.length === 0) {
          return { lane, discovered: [], verified: [], diagnostic };
        }
        const verification = verifyLaneCandidates(job, lane, laneContacts, laneVerifications);
        diagnostic.verifiedCount = verification.verifiedCount;
        diagnostic.rejected = verification.rejected;
        return {
          lane,
          discovered: laneContacts,
          verified: verification.contacts,
          diagnostic,
        };
      });

      const assembled = assembleLaneResults(runs);
      const diagnostics: HumanPathDiagnostics = {
        schemaVersion: 1,
        lanes: runs.map((run) => run.diagnostic),
        assembledCount: assembled.length,
      };
      console.info("[llm:contact-discovery] lane reconciliation", {
        lanes: diagnostics.lanes.map((lane) => ({
          lane: lane.lane,
          discovered: lane.discoveredCount,
          verified: lane.verifiedCount,
          accepted: lane.acceptedCount,
        })),
        selectedCandidates: selected.length,
        discoveryEvidenceVerified: discoveryVerifications.length,
        selectedForSecondaryVerification: unresolved.length,
        candidatesDeferredByBudget: Math.max(0, discovered.length - selected.length),
        assembled: diagnostics.assembledCount,
      });
      return {
        status: "generated",
        contacts: assembled.map(toHumanPathContact),
        diagnostics,
      };
    } finally {
      console.info("[llm:contact-discovery] run metrics", {
        providerVersion: HUMAN_PATH_PROVIDER_VERSION,
        model: runMetrics.model,
        elapsedMs: Date.now() - startedAt,
        modelCalls: runMetrics.modelCalls,
        webSearchCalls: runMetrics.webSearchCalls,
        inputTokens: runMetrics.inputTokens,
        outputTokens: runMetrics.outputTokens,
        estimatedCostUsd: estimateContactRunCost(runMetrics),
        pricingBasisDate: "2026-07-22",
        phases: runMetrics.phases,
      });
    }
  };
}

export const openAIHumanPathProvider: HumanPathProvider = createOpenAIHumanPathProvider();
