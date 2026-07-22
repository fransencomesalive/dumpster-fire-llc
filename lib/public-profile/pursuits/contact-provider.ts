import type {
  HumanPathContact,
  HumanPathDiagnostics,
  HumanPathLane,
  HumanPathLaneDiagnostic,
  HumanPathProvider,
  HumanPathProviderInput,
  HumanPathRejectionCode,
} from "./types";

type HumanPathJob = HumanPathProviderInput["job"];

export type ContactModelCall = (args: {
  system: string;
  user: string;
  lane?: HumanPathLane;
  phase?: "discovery" | "verification";
  strategy?: "category" | "organization_leadership";
}) => Promise<string | undefined>;

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
const MAX_LANE_CANDIDATES = 3;
const MAX_RESULTS = 5;

// Stored on Human Path generation events so zero-result pursuits can be
// reconsidered once after a material provider-contract change.
export const HUMAN_PATH_PROVIDER_VERSION = 3;

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
  return typeof value === "string" ? value.trim() : "";
}

function firstUrl(value: string) {
  return value.match(/https?:\/\/[^\s)\]]+/i)?.[0] ?? "";
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

function cleanField(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = cleanString(row[key]);
    if (value) return value;
  }
  return "";
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
  const words = cleanString(value).toLowerCase().replace(/_/g, " ");
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

export function parseResearchedContacts(
  value: unknown,
  companyName: string,
  forcedLane?: HumanPathLane,
): ResearchedContact[] {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const list = Array.isArray(record.contacts)
    ? record.contacts
    : Array.isArray(record.people)
      ? record.people
      : Array.isArray(record.recommendations)
        ? record.recommendations
        : Array.isArray(record.suggestions)
          ? record.suggestions
          : Array.isArray(value) ? value : [];

  return list.map((item): ResearchedContact | null => {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const name = cleanField(row, "name", "fullName", "full_name", "person");
    const title = cleanField(row, "title", "jobTitle", "job_title", "currentTitle", "current_title");
    if (!name || !title || !isSpecificPersonName(name, companyName)) return null;

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
      "recommendationType",
      "recommendation_type",
    );
    const parsedType = normalizeContactType(row.contactType ?? row.contact_type ?? candidateRole);
    const contactType = forcedLane ?? parsedType.contactType;
    const rank = forcedLane ? LANE_RANK[forcedLane] : parsedType.rank;
    const roleConnection = cleanField(row, "roleConnection", "role_connection", "connection");
    const notes = cleanString(row.notes);
    const reason = cleanString(row.reason) || cleanString(row.relevanceReason) || cleanString(row.relevance_reason);
    const rawEvidenceUrl = cleanField(row, "evidenceUrl", "evidence_url", "sourceUrl", "source_url", "url");
    const evidenceUrl = normalizedPublicUrl(rawEvidenceUrl)
      || firstUrl(notes)
      || firstUrl(reason)
      || linkedinUrl;

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
      rank,
    };
  }).filter((contact): contact is ResearchedContact => Boolean(contact))
    .slice(0, forcedLane ? MAX_LANE_CANDIDATES : MAX_RESULTS);
}

function inferContactResearchPlan(job: HumanPathJob) {
  const text = `${job.title} ${job.description}`.toLowerCase();

  if (/\b(programmatic|paid media|media strategy|performance marketing|paid social|search|sem|display)\b/.test(text)) {
    return {
      owningFunction: "Programmatic / Paid Media / Performance Marketing",
      likelyReportsTo: ["VP Programmatic", "VP Media", "SVP Media", "Head of Media", "President, Performance Marketing", "Managing Director, Media"],
      avoidFunctions: ["Production", "Creative Studio", "Delivery", "Program Management"],
      publicEvidenceTargets: ["media practice leadership", "performance marketing leadership", "programmatic thought leadership", "paid media hiring posts"],
    };
  }

  if (/\b(design program|design ops|design operations)\b/.test(text)) {
    return {
      owningFunction: "Design Operations / Design Program Management",
      likelyReportsTo: ["Head of Design Operations", "Director of Design Operations", "VP Design", "Head of Design", "Design Program Management Lead"],
      avoidFunctions: ["General operations", "Unrelated product leadership", "Experience Design without Design Operations ownership"],
      publicEvidenceTargets: ["design ops leadership", "design operations hiring posts", "design program management team evidence"],
    };
  }

  if (/\b(producer|production|executive producer)\b/.test(text)) {
    return {
      owningFunction: "Production / Creative Production",
      likelyReportsTo: ["Head of Production", "Executive Producer", "VP Production", "Director of Production", "Managing Director"],
      avoidFunctions: ["Engineering", "Generic program management", "Unrelated marketing operations"],
      publicEvidenceTargets: ["production leadership", "creative production work", "campaign production announcements"],
    };
  }

  if (/\b(delivery|client delivery|implementation)\b/.test(text)) {
    return {
      owningFunction: "Delivery / Client Delivery",
      likelyReportsTo: ["Head of Delivery", "VP Delivery", "Executive Director Delivery", "Delivery Practice Lead", "Managing Director"],
      avoidFunctions: ["Creative Production", "Unrelated operations"],
      publicEvidenceTargets: ["delivery leadership", "practice lead pages", "client delivery talks"],
    };
  }

  if (/\b(program director|program manager|program management|pmo)\b/.test(text)) {
    return {
      owningFunction: "Program Management / PMO",
      likelyReportsTo: ["VP Program Management", "Head of Program Management", "Director PMO", "Program Management Lead", "Managing Director"],
      avoidFunctions: ["Unrelated finance", "Unrelated technical engineering"],
      publicEvidenceTargets: ["program management leadership", "PMO leadership", "operations leadership"],
    };
  }

  return {
    owningFunction: "Role-specific functional organization inferred from the title and posting",
    likelyReportsTo: ["Head of function", "VP of function", "Director of function", "Practice Lead", "Managing Director"],
    avoidFunctions: ["Random peers", "Unrelated executives"],
    publicEvidenceTargets: ["function leadership", "team announcement", "hiring post", "thought leadership"],
  };
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

const DISCOVERY_SYSTEM_PROMPT = [
  "You research one specific contact category for a job-search product.",
  "Use web search and return real people only. Do not substitute another category when this category is difficult.",
  "Every candidate needs a real name, a current title, a direct LinkedIn /in/ profile when available, and a public evidence URL.",
  "Never synthesize a person's title from the job posting or search query.",
  "A company name, department, search-result heading, or company-plus-title phrase is not a person's name.",
  "Do not return email addresses. Return JSON only.",
].join(" ");

const VERIFICATION_SYSTEM_PROMPT = [
  "You independently verify candidates for one specified hiring-path category.",
  "Treat every supplied name, title, category, confidence score, and URL as untrusted.",
  "Verify identity, current target-company employment, exact current title, direct LinkedIn /in/ profile, and category-specific evidence.",
  "Use the exact current LinkedIn Experience title when visible. Otherwise use an exact current title from a company page, organization directory, or recent public profile.",
  "currentTitle must contain only the exact job title. Never use a headline, About sentence, employer suffix, search-result summary, truncated text, or descriptive prose as currentTitle.",
  "Set currentTitleSource to linkedin_experience, company_page, or organization_directory. A LinkedIn headline or About section is not a valid title source. If none of the allowed sources proves the exact job title, leave currentTitle and currentTitleSource empty and set currentRoleIsCurrent false.",
  "Keep the LinkedIn headline separate. Never combine, shorten, normalize, or invent a third title.",
  "currentRoleEvidenceText must contain currentTitle verbatim and currentRoleEvidenceUrl must be a literal public URL.",
  "currentCompanyEvidenceText must contain currentCompany verbatim and currentCompanyEvidenceUrl must be a literal public URL. Title and company evidence may come from different public excerpts.",
  "classificationEvidenceText must be a verbatim public excerpt supporting the requested category, not your inference or summary.",
  "Return one verification for every candidateKey, including rejected candidates. Do not add new people. Return JSON only.",
].join(" ");

function laneDiscoveryInstructions(lane: HumanPathLane) {
  if (lane === "likely_hiring_manager") {
    return [
      "Find up to three people who may directly manage this exact opening.",
      "Require evidence connecting the person to the role's specific function, sub-organization, team, or requisition.",
      "When the posting names a sub-organization or acronym, search that exact identifier and its leadership before broader company leaders.",
      "A broad design, product, operations, or engineering leadership title is not enough by itself.",
      "Useful evidence includes a hiring post, explicit team ownership, an organization chart, or a current title naming the exact function.",
    ];
  }
  if (lane === "recruiter") {
    return [
      "Find up to three current recruiters, talent acquisition partners, or sourcers at the target company.",
      "Prefer recruiters whose public activity or remit covers the role's function, region, or organization.",
      "Exact assignment to the requisition is not required, but never claim assignment without evidence.",
    ];
  }
  return [
    "Find up to three current leaders who own the role's exact function or practice more broadly.",
    "Require explicit evidence of ownership of that function. General organizational adjacency is not enough.",
    "For Design Operations roles, Experience Design leadership alone is insufficient unless Design Operations or Design Program Management ownership is explicit.",
  ];
}

function laneSearchHints(job: HumanPathJob, lane: HumanPathLane) {
  const plan = inferContactResearchPlan(job);
  const anchors = organizationAnchors(job);
  const functionTerms = plan.owningFunction.split("/").map((value) => value.trim()).filter(Boolean);
  if (lane === "recruiter") {
    return [
      `site:linkedin.com/in "${job.companyName}" recruiter`,
      `site:linkedin.com/in "${job.companyName}" "talent acquisition" "${plan.owningFunction}"`,
      ...anchors.slice(0, 2).map((anchor) => `site:linkedin.com/in "${job.companyName}" recruiter "${anchor}"`),
      `"${job.companyName}" recruiter "${job.title}"`,
    ];
  }
  if (lane === "functional_leader") {
    return [
      `site:linkedin.com/in "${job.companyName}" "${plan.owningFunction}"`,
      ...anchors.slice(0, 3).map((anchor) => `site:linkedin.com/in "${job.companyName}" "${anchor}" leader`),
      `${job.companyName} ${plan.owningFunction} leadership`,
      ...plan.likelyReportsTo.slice(0, 3).map((title) => `site:linkedin.com/in "${job.companyName}" "${title}"`),
    ];
  }
  return [
    `"${job.companyName}" "${job.title}" hiring`,
    `"${job.companyName}" "${job.title}" team`,
    ...anchors.slice(0, 3).flatMap((anchor) => [
      ...functionTerms.map((term) => `site:linkedin.com/in "${job.companyName}" "${anchor}" "${term}"`),
      `site:linkedin.com/in "${job.companyName}" "${anchor}"`,
      `"${job.companyName}" "${anchor}" "Chief of Staff"`,
      `"${job.companyName}" "${anchor}" hiring "${job.title}"`,
    ]),
    ...plan.likelyReportsTo.slice(0, 3).map((title) => `site:linkedin.com/in "${job.companyName}" "${title}"`),
  ];
}

const DISCOVERY_OUTPUT_SCHEMA = {
  contacts: [{
    name: "Exact full name from public evidence",
    title: "Exact current title from the cited source",
    companyName: "Current employer",
    linkedinUrl: "Direct LinkedIn /in/ profile URL, or empty string",
    evidenceUrl: "Literal public URL supporting current employment and title",
    confidence: "0-100 confidence in identity and category relevance",
    reason: "Evidence-grounded reason this person may fit the requested category",
    roleConnection: "Exact known connection, with uncertainty stated plainly",
  }],
};

export function buildLaneDiscoveryPrompt(job: HumanPathJob, lane: HumanPathLane) {
  const plan = inferContactResearchPlan(job);
  return JSON.stringify({
    task: `Discover candidates only for the ${LANE_LABEL[lane]} category.`,
    requestedLane: lane,
    role: {
      title: job.title,
      company: job.companyName,
      summary: job.description.slice(0, 3000),
    },
    functionContext: {
      owningFunction: plan.owningFunction,
      organizationAnchors: organizationAnchors(job),
      likelyOneLevelAboveTitles: plan.likelyReportsTo,
      avoidFunctions: plan.avoidFunctions,
      evidenceTargets: plan.publicEvidenceTargets,
    },
    categoryRules: laneDiscoveryInstructions(lane),
    requiredSearches: laneSearchHints(job, lane),
    limit: MAX_LANE_CANDIDATES,
    outputSchema: DISCOVERY_OUTPUT_SCHEMA,
  });
}

export function buildOrganizationLeadershipPrompt(job: HumanPathJob) {
  const plan = inferContactResearchPlan(job);
  const anchors = organizationAnchors(job);
  return JSON.stringify({
    task: "Discover current leaders in the exact sub-organization named by this posting. These candidates will be independently classified as likely hiring managers or functional leaders later.",
    role: {
      title: job.title,
      company: job.companyName,
      summary: job.description.slice(0, 3000),
    },
    organizationAnchors: anchors,
    owningFunction: plan.owningFunction,
    rules: [
      "Search every organization anchor exactly as written, including acronyms.",
      "Prioritize current chiefs of staff, operations leaders, design program management leaders, and people who have publicly hired for this function.",
      "Do not substitute broad company leaders who lack evidence connecting them to the named sub-organization.",
      "Return exact current titles from cited public evidence. Do not synthesize titles.",
    ],
    requiredSearches: anchors.flatMap((anchor) => [
      `site:linkedin.com/in "${job.companyName}" "${anchor}"`,
      `"${job.companyName}" "${anchor}" "Chief of Staff"`,
      `"${job.companyName}" "${anchor}" hiring "${plan.owningFunction.split("/")[0].trim()}"`,
    ]),
    limit: MAX_LANE_CANDIDATES,
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
) {
  const plan = inferContactResearchPlan(job);
  return JSON.stringify({
    task: `Verify these candidates only as ${LANE_LABEL[lane]} contacts.`,
    requestedLane: lane,
    role: {
      title: job.title,
      company: job.companyName,
      summary: job.description.slice(0, 2200),
      owningFunction: plan.owningFunction,
    },
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
      `site:linkedin.com/in "${contact.name}" "${job.companyName}"`,
      ...(contact.linkedinUrl ? [`"${contact.linkedinUrl}"`] : []),
      ...(contact.evidenceUrl ? [`"${contact.evidenceUrl}"`] : []),
      `"${contact.name}" "${job.companyName}" "${contact.title}"`,
      `"${contact.name}" "${plan.owningFunction}"`,
      `"${contact.name}" "${job.companyName}" hiring "${plan.owningFunction.split("/")[0].trim()}"`,
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
        currentRoleEvidenceText: "Verbatim excerpt containing currentTitle",
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
        confidence: "0-100 confidence in the verified facts and category",
        reason: "One evidence-grounded sentence explaining relevance or rejection",
        roleConnection: "Verified category connection with uncertainty stated plainly",
      }],
    },
  });
}

export function parseProfileVerifications(value: unknown): ContactProfileVerification[] {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const list = Array.isArray(record.verifications) ? record.verifications : [];
  return list.map((item): ContactProfileVerification | null => {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const candidateKey = cleanField(row, "candidateKey", "candidate_key");
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

function isPlausibleExactJobTitle(title: string, companyName: string) {
  const normalized = title.replace(/\s+/g, " ").trim();
  if (normalized.length < 2 || normalized.length > 120) return false;
  if (/[.…]|\|/.test(normalized)) return false;
  if (/\b(speciali[sz]ing in|passionate about|responsible for|experience in|helping)\b/i.test(normalized)) return false;
  const escapedCompany = companyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`\\s+at\\s+${escapedCompany}\\s*$`, "i").test(normalized)) return false;
  return true;
}

function titleSupportsLane(title: string, lane: HumanPathLane) {
  const normalized = normalizedPhrase(title);
  if (lane === "recruiter") {
    return /\b(recruiter|recruiting|talent acquisition|talent partner|sourcer)\b/.test(normalized);
  }
  return /\b(manager|mgr|director|head|lead|chief|president|supervisor|vp|svp|evp)\b/.test(normalized);
}

function functionEvidenceMatches(job: HumanPathJob, text: string) {
  const normalized = normalizedPhrase(text);
  const roleText = normalizedPhrase(`${job.title} ${job.description}`);
  if (/\b(design program|design ops|design operations)\b/.test(roleText)) {
    return /\b(design ops|design operations|design program|design program management|designops)\b/.test(normalized);
  }
  if (/\b(programmatic|paid media|media strategy|performance marketing)\b/.test(roleText)) {
    return /\b(programmatic|paid media|media strategy|performance marketing)\b/.test(normalized);
  }
  if (/\b(producer|production|executive producer)\b/.test(roleText)) {
    return /\b(producer|production|creative production)\b/.test(normalized);
  }
  if (/\b(delivery|client delivery|implementation)\b/.test(roleText)) {
    return /\b(delivery|client delivery|implementation)\b/.test(normalized);
  }
  if (/\b(program director|program manager|program management|pmo)\b/.test(roleText)) {
    return /\b(program management|program manager|pmo)\b/.test(normalized);
  }

  const ignored = new Set([
    "senior", "principal", "manager", "director", "head", "lead", "program", "project",
    "the", "and", "for", "with", "role", "team",
  ]);
  const tokens = normalizedPhrase(job.title).split(" ")
    .filter((token) => token.length >= 4 && !ignored.has(token));
  return tokens.some((token) => normalized.split(" ").includes(token));
}

function classificationEvidenceSupportsLane(
  job: HumanPathJob,
  lane: HumanPathLane,
  verification: ContactProfileVerification,
) {
  if (!verification.classificationSupported) return false;
  if (lane === "recruiter") return titleSupportsLane(verification.currentTitle, lane);
  if (!verification.classificationEvidenceText || !verification.classificationEvidenceUrl) return false;
  const evidence = `${verification.currentTitle} ${verification.classificationEvidenceText}`;
  if (!titleSupportsLane(verification.currentTitle, lane) || !functionEvidenceMatches(job, evidence)) return false;
  if (lane === "functional_leader") return true;
  return /\b(hiring|hires|hired|reports to|direct manager|manages? the|leads? the|owns? the|team lead|team manager)\b/i
    .test(verification.classificationEvidenceText);
}

function rejectionCodesForCandidate(
  job: HumanPathJob,
  lane: HumanPathLane,
  contact: ResearchedContact,
  verification: ContactProfileVerification | undefined,
): HumanPathRejectionCode[] {
  if (!verification) return ["verification_unavailable"];
  const reasons: HumanPathRejectionCode[] = [];
  if (!verification.identityMatches || !isSpecificPersonName(verification.currentName, job.companyName)) {
    reasons.push("identity_unverified");
  }
  if (!verification.companyMatches || !companyNamesMatch(contact.companyName, verification.currentCompany)) {
    reasons.push("company_unverified");
  }
  if (!verification.linkedinUrl) reasons.push("linkedin_profile_unverified");
  if (!verification.currentRoleIsCurrent
    || !verification.currentTitle
    || !verification.currentTitleSource
    || !isPlausibleExactJobTitle(verification.currentTitle, verification.currentCompany)
    || !verification.currentCompany
    || !verification.currentRoleEvidenceText
    || !verification.currentRoleEvidenceUrl
    || !evidenceContainsVerbatim(verification.currentRoleEvidenceText, verification.currentTitle)
    || !verification.currentCompanyEvidenceText
    || !verification.currentCompanyEvidenceUrl
    || !evidenceContainsVerbatim(verification.currentCompanyEvidenceText, verification.currentCompany)) {
    reasons.push("current_role_unverified");
  }
  if (!titleSupportsLane(verification.currentTitle, lane)) reasons.push("title_mismatch");
  if (!classificationEvidenceSupportsLane(job, lane, verification)) reasons.push("classification_unverified");
  return Array.from(new Set(reasons));
}

function defaultRoleConnection(lane: HumanPathLane) {
  if (lane === "recruiter") return "Current company recruiter; assignment to this opening is not verified.";
  if (lane === "functional_leader") return "Verified leader in the role's function; direct reporting relationship is not verified.";
  return "Public evidence connects this person to the role's team or hiring path.";
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
    const reasonCodes = rejectionCodesForCandidate(job, lane, contact, verification);
    if (!verification || reasonCodes.length > 0) {
      rejected.push({ candidateKey, name: contact.name, reasonCodes });
      return;
    }
    accepted.push({
      ...contact,
      name: verification.currentName,
      title: verification.currentTitle,
      companyName: verification.currentCompany,
      linkedinUrl: verification.linkedinUrl,
      professionalContactUrl: undefined,
      contactType: lane,
      confidence: Math.min(contact.confidence, verification.confidence),
      relevanceReason: verification.relevanceReason || `Verified ${LANE_LABEL[lane]} contact at ${job.companyName}.`,
      roleConnection: verification.roleConnection || defaultRoleConnection(lane),
      verificationNotes: [
        `Current role evidence: ${verification.currentRoleEvidenceUrl}`,
        verification.classificationEvidenceUrl
          ? `Classification evidence: ${verification.classificationEvidenceUrl}`
          : "",
      ].filter(Boolean),
      rank: LANE_RANK[lane],
    });
  });

  return {
    contacts: accepted.sort((left, right) => right.confidence - left.confidence),
    rejected,
    verifiedCount: accepted.length,
  };
}

function contactDedupKey(contact: ResearchedContact) {
  return contact.linkedinUrl
    ? `linkedin:${contact.linkedinUrl.toLowerCase().replace(/\/$/, "")}`
    : `name:${normalizedPhrase(contact.name)}|${normalizedCompanyName(contact.companyName)}`;
}

export function mergeResearchedContacts(primary: ResearchedContact[], supplemental: ResearchedContact[]) {
  const seen = new Set<string>();
  const merged: ResearchedContact[] = [];
  for (const contact of [...primary, ...supplemental]) {
    const key = contactDedupKey(contact);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(contact);
  }
  return merged.sort((left, right) => left.rank - right.rank || right.confidence - left.confidence)
    .slice(0, MAX_RESULTS);
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

  // Reserve the first slots for the two required categories, then add a
  // functional leader when available. Remaining capacity is filled round-robin.
  for (const lane of LANES) {
    const run = runs.find((candidate) => candidate.lane === lane);
    if (run) takeNext(run);
  }
  while (selected.length < MAX_RESULTS) {
    let advanced = false;
    for (const lane of LANES) {
      if (selected.length >= MAX_RESULTS) break;
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

const defaultCallModel: ContactModelCall = async ({ system, user }) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.info("[llm:contact-discovery] skipped: no OPENAI_API_KEY");
    return undefined;
  }
  try {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey, timeout: 90_000, maxRetries: 1 });
    const response = await client.responses.create({
      model: process.env.JOB_SEARCH_CONTACT_MODEL ?? "gpt-4.1",
      tools: [{ type: "web_search" }],
      include: ["web_search_call.action.sources"],
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    return response.output_text ?? "";
  } catch (error) {
    console.error("Contact discovery model call failed", error);
    return undefined;
  }
};

export function createOpenAIHumanPathProvider(
  dependencies: ContactProviderDependencies = {},
): HumanPathProvider {
  const callModel = dependencies.callModel ?? defaultCallModel;
  return async ({ job }) => {
    const [baseDiscoveryResults, organizationLeadershipRaw] = await Promise.all([
      Promise.all(LANES.map(async (lane) => {
        const raw = await callModel({
          system: DISCOVERY_SYSTEM_PROMPT,
          user: buildLaneDiscoveryPrompt(job, lane),
          lane,
          phase: "discovery",
          strategy: "category",
        });
        return {
          lane,
          raw,
          contacts: raw === undefined
            ? []
            : parseResearchedContacts(extractJson(raw), job.companyName, lane),
        };
      })),
      organizationAnchors(job).length > 0
        ? callModel({
          system: DISCOVERY_SYSTEM_PROMPT,
          user: buildOrganizationLeadershipPrompt(job),
          lane: "likely_hiring_manager",
          phase: "discovery",
          strategy: "organization_leadership",
        })
        : Promise.resolve(undefined),
    ]);

    if (baseDiscoveryResults.every((result) => result.raw === undefined)
      && organizationLeadershipRaw === undefined) {
      return {
        status: "provider_unavailable",
        reason: "Contact discovery is not configured. Add OPENAI_API_KEY to enable web search.",
      };
    }

    const organizationLeadershipContacts = organizationLeadershipRaw === undefined
      ? []
      : parseResearchedContacts(
        extractJson(organizationLeadershipRaw),
        job.companyName,
        "likely_hiring_manager",
      );
    const discoveryResults = LANES.map((lane) => {
      const base = baseDiscoveryResults.find((result) => result.lane === lane);
      const sharedLeadership = lane === "recruiter" ? [] : organizationLeadershipContacts;
      return {
        lane,
        available: base?.raw !== undefined || (lane !== "recruiter" && organizationLeadershipRaw !== undefined),
        contacts: mergeResearchedContacts(base?.contacts ?? [], sharedLeadership),
      };
    });

    const runs = await Promise.all(discoveryResults.map(async (discovery): Promise<LaneRun> => {
      const diagnostic: HumanPathLaneDiagnostic = {
        lane: discovery.lane,
        discoveryStatus: discovery.available ? "completed" : "provider_unavailable",
        verificationStatus: discovery.contacts.length === 0 ? "not_needed" : "completed",
        discoveredCount: discovery.contacts.length,
        verifiedCount: 0,
        acceptedCount: 0,
        rejected: [],
      };
      if (discovery.contacts.length === 0) {
        return { lane: discovery.lane, discovered: [], verified: [], diagnostic };
      }

      const verificationRaw = await callModel({
        system: VERIFICATION_SYSTEM_PROMPT,
        user: buildProfileVerificationPrompt(job, discovery.contacts, discovery.lane),
        lane: discovery.lane,
        phase: "verification",
      });
      if (verificationRaw === undefined) {
        diagnostic.verificationStatus = "provider_unavailable";
        diagnostic.rejected = discovery.contacts.map((contact, index) => ({
          candidateKey: String(index),
          name: contact.name,
          reasonCodes: ["verification_unavailable"],
        }));
        return {
          lane: discovery.lane,
          discovered: discovery.contacts,
          verified: [],
          diagnostic,
        };
      }

      const verification = verifyLaneCandidates(
        job,
        discovery.lane,
        discovery.contacts,
        parseProfileVerifications(extractJson(verificationRaw)),
      );
      diagnostic.verifiedCount = verification.verifiedCount;
      diagnostic.rejected = verification.rejected;
      return {
        lane: discovery.lane,
        discovered: discovery.contacts,
        verified: verification.contacts,
        diagnostic,
      };
    }));

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
      assembled: diagnostics.assembledCount,
    });
    return {
      status: "generated",
      contacts: assembled.map(toHumanPathContact),
      diagnostics,
    };
  };
}

export const openAIHumanPathProvider: HumanPathProvider = createOpenAIHumanPathProvider();
