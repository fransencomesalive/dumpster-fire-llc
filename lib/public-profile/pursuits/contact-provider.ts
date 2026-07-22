import type { HumanPathContact, HumanPathProvider, HumanPathProviderInput } from "./types";

// Human Path contact discovery (Phase F). Ported from the legacy, proven
// `app/scans/api/contacts/route.ts`: OpenAI (gpt-4.1) Responses API with the
// web_search tool builds and tests a chain-of-command hypothesis, then returns
// REAL, cited people who plausibly influence hiring for a specific role. The
// model call is injected so it can be mocked in tests and skipped gracefully
// when no OPENAI_API_KEY is provisioned (falls back to provider_unavailable,
// the same convention as the outreach generator).

type HumanPathJob = HumanPathProviderInput["job"];

// The injected model-call seam. Returns the model's raw text output, or
// undefined when the model is unavailable (no key / transport error).
export type ContactModelCall = (args: { system: string; user: string }) => Promise<string | undefined>;

export type ContactProviderDependencies = {
  callModel?: ContactModelCall;
};

// Internal shape carried through parse -> merge/rank -> map. `rank` and the
// numeric `confidence` exist only for ordering; the public HumanPathContact
// buckets confidence to low/medium/high and drops rank.
type ResearchedContact = {
  name: string;
  title: string;
  companyName: string;
  contactType: HumanPathContact["contactType"];
  confidence: number;
  linkedinUrl?: string;
  professionalContactUrl?: string;
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
  currentExperienceTitle: string;
  currentExperienceCompany: string;
  currentExperienceEvidenceText: string;
  linkedinUrl: string;
  contactType: HumanPathContact["contactType"];
  confidence: number;
  relevanceReason: string;
  roleConnection: string;
  headlineEvidenceUrl: string;
  experienceEvidenceUrl: string;
  identityMatches: boolean;
  companyMatches: boolean;
  roleEligible: boolean;
  currentExperienceIsCurrent: boolean;
  rank: number;
};

function resolveHumanPathReachability(contact: Pick<ResearchedContact, "linkedinUrl" | "professionalContactUrl">): HumanPathContact["reachability"] {
  if (contact.linkedinUrl) return { method: "linkedin", url: contact.linkedinUrl };
  if (contact.professionalContactUrl) return { method: "contact_page", url: contact.professionalContactUrl };
  return { method: "none" };
}

// Hiring-manager outreach rules, mirrored from the legacy prompt
// (app/scans/job_search_context_for_codex.md §7 + §10).
const SYSTEM_PROMPT = [
  "You are a contact-research assistant for a job-search product.",
  "Use web search to identify REAL people who plausibly influence hiring for a specific role at a specific company.",
  "Do not start by collecting names. Start by forming a chain-of-command hypothesis for who owns the function and who the role likely reports to.",
  "Method: first identify the function that owns the role, then search for the management layer one level above the role, then find that leader's boss, then look for recruiter/talent contacts.",
  "Rank contacts in this order: Hiring Manager, Functional Leader, Recruiter, Long Shot.",
  "A Hiring Manager must be a current employee in the correct function and plausibly one reporting layer above the opening.",
  "A Functional Leader is a current employee in the same function who plausibly owns the broader team or practice.",
  "A Recruiter is useful only after functional leaders; do not return recruiters as the top recommendation unless no credible functional leader can be found.",
  "A Long Shot is an executive sponsor or adjacent leader; include only when you clearly label the uncertainty.",
  "For agencies, expect unusual reporting chains. Programmatic roles usually sit under Paid Media, Media Strategy, Performance Marketing, or Programmatic Media, not production, creative, delivery, or program management.",
  "Never invent names, titles, or URLs. Every contact must come from a real search result you can cite with an evidenceUrl.",
  "If you cannot find anyone credible, return an empty contacts array rather than guessing.",
  "Validate that each person currently works at the target company and in the correct or adjacent function using recent evidence.",
  "For creative, brand, growth, content, producer, or marketing-adjacent roles, include creative operations leaders, VP/Head of Marketing, lifecycle/growth marketing leaders, and relevant marketing department leaders when they plausibly own the team.",
  "Avoid recommending: random peers; founders or CEOs unless the company is small and outreach is realistic; unrelated executives; designers or engineers unless they are explicitly the hiring manager.",
  "Public evidence is stronger when it connects to the role's function: hiring posts, team announcements, thought leadership, company blog posts, podcasts, conference talks, or practice leadership pages.",
  "A direct LinkedIn profile is the preferred contact route. A URL is a LinkedIn profile only when it points to that person's /in/ page, not a post, company page, or search result.",
  "Only return a contact when you can verify a direct LinkedIn /in/ profile for that specific person. A role label, team name, search-result heading, or company-plus-title phrase is not a person's name.",
  "If no direct LinkedIn profile can be verified, omit the contact. Do not reuse an evidence-only page as a contact route.",
  "Do not return, infer, or guess email addresses.",
  "Return JSON only, matching the requested schema. No commentary outside the JSON.",
].join(" ");

const PROFILE_VERIFICATION_SYSTEM_PROMPT = [
  "You independently verify job-search contacts after discovery. Treat every supplied name, title, company, role classification, confidence score, and URL as an untrusted claim.",
  "Use web search to inspect current public evidence for each supplied candidate. Return one verification decision for every candidate key, including rejected candidates.",
  "Preserve the LinkedIn headline and the current Experience entry as two separate facts. Copy both verbatim from evidence; never combine, shorten, normalize, paraphrase, or reconcile their wording.",
  "linkedinHeadline must be the exact headline text. currentExperienceTitle and currentExperienceCompany must be the exact title and employer from the current Experience entry at the target company.",
  "The current Experience title is the canonical display title. The headline is supporting evidence only. If the headline and Experience entry disagree, return both exact strings and do not invent a third version.",
  "linkedinHeadlineEvidenceText and currentExperienceEvidenceText must be verbatim evidence excerpts containing the corresponding exact facts. If exact current Experience evidence is unavailable, leave its fields empty and set currentExperienceIsCurrent false.",
  "A direct LinkedIn profile must point to that exact person's /in/ page. A post, company page, search result, or another same-name person's profile does not qualify.",
  "Set roleEligible true only when the exact current Experience title and function make the person plausibly useful in the requested hiring chain. A peer, analyst, project analyst, or unrelated employee is not a Hiring Manager or Functional Leader.",
  "Reassess contact type from scratch using the exact current Experience entry. Do not use the supplied title or a synthesized title for relevance or classification.",
  "Set companyMatches true only when current evidence shows the person currently works at the target company. Set identityMatches true only when the evidence and profile belong to the supplied person.",
  "Do not infer or guess missing facts. Do not return email addresses. Return JSON only, matching the requested schema.",
].join(" ");

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

function normalizedNamePhrase(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isSpecificPersonName(value: string, companyName: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.includes("unverified") || normalized.includes("unknown")) return false;
  if (normalized.startsWith("(") || normalized.startsWith("the ")) return false;
  if (/^(group director|director|vp|svp|head of|recruiter|talent acquisition|hiring manager)\b/.test(normalized)) return false;
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;

  const normalizedCompany = normalizedNamePhrase(companyName);
  const normalizedCandidate = normalizedNamePhrase(value);
  if (normalizedCompany && (
    normalizedCandidate === normalizedCompany
    || normalizedCandidate.startsWith(`${normalizedCompany} `)
  )) return false;

  // Search-result headings often look name-like to a shallow word-count check
  // (for example, "Coinbase Principal Recruiter"). A returned contact must be
  // a person's name, not an organization plus a job title or recruiting team.
  const roleWords = new Set([
    "acquisition", "chief", "coordinator", "department", "director", "executive",
    "group", "head", "hiring", "lead", "leader", "manager", "officer", "partner",
    "president", "principal", "recruiter", "recruiting", "svp", "talent", "team",
    "vice", "vp",
  ]);
  if (words.some((word) => roleWords.has(word.replace(/[^a-z]/g, "")))) return false;

  return words.every((word) => /^[a-z][a-z.'-]*$/.test(word));
}

function clampConfidence(value: unknown): number {
  let num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return 40;
  // Models return confidence on either a 0-1 or 0-100 scale; normalize the fractional form.
  if (num > 0 && num <= 1) num *= 100;
  return Math.max(0, Math.min(100, Math.round(num)));
}

// Maps human-readable role labels and legacy contact types onto the public
// HumanPathContact contact-type enum.
function normalizeContactType(value: unknown): { contactType: HumanPathContact["contactType"]; rank: number } {
  // Treat underscores as spaces so both "long shot" and "long_shot" (and
  // "hiring_manager", "executive_sponsor", etc.) match the phrase checks.
  const words = cleanString(value).toLowerCase().replace(/_/g, " ");
  if (words.includes("hiring manager")) {
    return { contactType: "likely_hiring_manager", rank: 0 };
  }
  if (words.includes("functional leader")) {
    return { contactType: "functional_leader", rank: 1 };
  }
  if (words.includes("recruit") || words.includes("talent")) {
    return { contactType: "recruiter", rank: 2 };
  }
  if (words.includes("long shot") || words.includes("executive") || words.includes("sponsor")) {
    return { contactType: "executive_sponsor", rank: 3 };
  }
  if (words.includes("referral")) {
    return { contactType: "referral_candidate", rank: 3 };
  }
  // Legacy functional-leader-adjacent labels all map to functional_leader.
  if (words.includes("department") || words.includes("creative") || words.includes("production") || words.includes("producer") || words.includes("vp") || words.includes("head of") || words.includes("director")) {
    return { contactType: "functional_leader", rank: 1 };
  }
  return { contactType: "unknown", rank: 3 };
}

function bucketConfidence(value: number): HumanPathContact["confidence"] {
  if (value >= 70) return "high";
  if (value >= 40) return "medium";
  return "low";
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

export function parseResearchedContacts(value: unknown, companyName: string): ResearchedContact[] {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const list = Array.isArray(record.contacts)
    ? record.contacts
    : Array.isArray(record.people)
      ? record.people
      : Array.isArray(record.recommendations)
        ? record.recommendations
        : Array.isArray(record.suggestions)
          ? record.suggestions
          : Array.isArray(value) ? value : [];

  return list
    .map((item): ResearchedContact | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const name = cleanField(row, "name", "fullName", "full_name", "person");
      const title = cleanField(row, "title", "jobTitle", "job_title", "currentTitle", "current_title");
      if (!name || !title) return null;
      if (!isSpecificPersonName(name, companyName)) return null;

      const rawLinkedinUrl = cleanField(row, "linkedinUrl", "linkedin_url", "linkedInUrl", "linkedIn", "linkedin", "profileUrl", "profile_url");
      const linkedinUrl = normalizedLinkedinProfileUrl(rawLinkedinUrl);
      const rawProfessionalContactUrl = cleanField(row, "professionalContactUrl", "professional_contact_url", "contactPageUrl", "contact_page_url");
      const professionalContactUrl = normalizedPublicUrl(rawProfessionalContactUrl);
      const candidateRole = cleanField(row, "candidateRole", "candidate_role", "role", "recommendationType", "recommendation_type");
      const roleConnection = cleanField(row, "roleConnection", "role_connection", "connection");
      const notes = cleanString(row.notes);
      const reason = cleanString(row.reason) || cleanString(row.relevanceReason) || cleanString(row.relevance_reason);
      const rawEvidenceUrl = cleanField(row, "evidenceUrl", "evidence_url", "sourceUrl", "source_url", "url");
      const evidenceUrl = firstUrl(rawEvidenceUrl)
        || firstUrl(notes)
        || firstUrl(reason)
        || normalizedPublicUrl(rawLinkedinUrl)
        || linkedinUrl
        || (rawEvidenceUrl.startsWith("http") ? rawEvidenceUrl : "");

      const { contactType, rank } = normalizeContactType(row.contactType ?? row.contact_type ?? candidateRole);

      const verificationNotes = [
        candidateRole,
        evidenceUrl ? `Evidence: ${evidenceUrl}` : "",
        notes && !firstUrl(notes) ? notes : "",
        !evidenceUrl && rawEvidenceUrl ? `Evidence note: ${rawEvidenceUrl.slice(0, 180)}` : "",
      ].filter(Boolean);

      return {
        name,
        title,
        companyName: cleanField(row, "companyName", "company_name", "company") || companyName,
        contactType,
        confidence: clampConfidence(row.confidence),
        linkedinUrl: linkedinUrl || undefined,
        professionalContactUrl: professionalContactUrl || undefined,
        relevanceReason: reason,
        roleConnection: roleConnection || notes,
        verificationNotes,
        rank,
      };
    })
    .filter((contact): contact is ResearchedContact => Boolean(contact))
    .slice(0, 5);
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
      avoidFunctions: ["Recruiting-only", "General operations", "Unrelated product leadership"],
      publicEvidenceTargets: ["design ops leadership", "design operations talks", "design team announcements"],
    };
  }

  if (/\b(producer|production|executive producer)\b/.test(text)) {
    return {
      owningFunction: "Production / Creative Production",
      likelyReportsTo: ["Head of Production", "Executive Producer", "VP Production", "Director of Production", "Managing Director"],
      avoidFunctions: ["Engineering", "Generic program management", "Unrelated marketing ops"],
      publicEvidenceTargets: ["production leadership", "creative production work", "campaign production announcements"],
    };
  }

  if (/\b(delivery|client delivery|implementation)\b/.test(text)) {
    return {
      owningFunction: "Delivery / Client Delivery",
      likelyReportsTo: ["Head of Delivery", "VP Delivery", "Executive Director Delivery", "Delivery Practice Lead", "Managing Director"],
      avoidFunctions: ["Creative Production", "Talent-only", "Unrelated operations"],
      publicEvidenceTargets: ["delivery leadership", "practice lead pages", "client delivery talks"],
    };
  }

  if (/\b(program director|program manager|program management|pmo)\b/.test(text)) {
    return {
      owningFunction: "Program Management / PMO",
      likelyReportsTo: ["VP Program Management", "Head of Program Management", "Director PMO", "Program Management Lead", "Managing Director"],
      avoidFunctions: ["Recruiting-only", "Unrelated finance", "Unrelated technical engineering"],
      publicEvidenceTargets: ["program management leadership", "PMO leadership", "operations leadership"],
    };
  }

  return {
    owningFunction: "Role-specific functional org inferred from title and posting",
    likelyReportsTo: ["Head of function", "VP of function", "Director of function", "Practice Lead", "Managing Director"],
    avoidFunctions: ["Random peers", "Unrelated executives", "Recruiting-only as first result"],
    publicEvidenceTargets: ["function leadership", "team announcement", "hiring post", "thought leadership"],
  };
}

const OUTPUT_SCHEMA = {
  contacts: [
    {
      name: "Real full name from a search result",
      title: "Their current title",
      candidateRole: "Hiring Manager | Functional Leader | Recruiter | Long Shot",
      contactType: "likely_hiring_manager | functional_leader | recruiter | executive_sponsor | referral_candidate | unknown",
      linkedinUrl: "Direct LinkedIn /in/ profile URL, or empty string if not found",
      evidenceUrl: "URL proving they currently work at the company (LinkedIn, company page, press, etc.)",
      confidence: "0-100 integer: how sure they are current and relevant to this role",
      reason: "One sentence explaining why this person matters for THIS role and where they sit in the likely reporting chain",
      roleConnection: "Likely direct manager, manager's boss, assigned recruiter, or long-shot executive sponsor; include uncertainty plainly",
      notes: "Useful outreach/search note, including what public evidence made this person credible",
    },
  ],
};

export function buildUserPrompt(job: HumanPathJob) {
  const researchPlan = inferContactResearchPlan(job);
  return JSON.stringify({
    task: "Find real people who influence hiring for this role by building and testing a chain-of-command hypothesis before selecting contacts.",
    role: {
      title: job.title,
      company: job.companyName,
      summary: job.description.slice(0, 3000),
    },
    chainOfCommandHypothesis: {
      owningFunction: researchPlan.owningFunction,
      likelyOneLevelAboveTitles: researchPlan.likelyReportsTo,
      avoidFunctions: researchPlan.avoidFunctions,
      publicEvidenceTargets: researchPlan.publicEvidenceTargets,
      targetOrder: ["Hiring Manager", "Functional Leader", "Recruiter", "Long Shot"],
    },
    outputSchema: OUTPUT_SCHEMA,
    limits: "Return 2-5 contacts maximum. Prefer one strong functional leader over multiple weak recruiter matches. Empty array is acceptable if nothing credible is found.",
    searchHints: [
      `${job.companyName} ${job.title} reports to`,
      ...researchPlan.likelyReportsTo.slice(0, 4).map((title) => `${job.companyName} ${title} LinkedIn`),
      `${job.companyName} ${researchPlan.owningFunction} leadership`,
      `${job.companyName} recruiter talent acquisition ${job.title}`,
    ],
  });
}

export function buildGapFillPrompt(job: HumanPathJob, existing: ResearchedContact[]) {
  const researchPlan = inferContactResearchPlan(job);
  return JSON.stringify({
    task: "The first contact search was too thin. Continue the chain-of-command search and return only additional contacts not already found.",
    role: {
      title: job.title,
      company: job.companyName,
    },
    existingContacts: existing.map((contact) => ({
      name: contact.name,
      title: contact.title,
      candidateRole: contact.contactType,
    })),
    gapsToFill: [
      "Find one likely one-level-above Hiring Manager if evidence exists.",
      "Find one broader Functional Leader in the same owning function if evidence exists.",
      "Find one Recruiter or Talent Acquisition Partner only after functional leaders.",
      "If you cannot verify current function/company evidence, do not return the person.",
    ],
    chainOfCommandHypothesis: {
      owningFunction: researchPlan.owningFunction,
      likelyOneLevelAboveTitles: researchPlan.likelyReportsTo,
      avoidFunctions: researchPlan.avoidFunctions,
      publicEvidenceTargets: researchPlan.publicEvidenceTargets,
    },
    requiredSearchAngles: [
      ...researchPlan.likelyReportsTo.map((title) => `${job.companyName} ${title}`),
      `${job.companyName} ${researchPlan.owningFunction} leadership`,
      `${job.companyName} ${researchPlan.owningFunction} LinkedIn`,
      `${job.companyName} talent acquisition ${job.title}`,
    ],
    outputSchema: OUTPUT_SCHEMA,
  });
}

export function buildProfileVerificationPrompt(job: HumanPathJob, contacts: ResearchedContact[]) {
  return JSON.stringify({
    task: "Independently verify each candidate's identity, current employer, current title, direct LinkedIn profile, and relevance to this hiring chain.",
    role: {
      title: job.title,
      company: job.companyName,
      summary: job.description.slice(0, 2000),
    },
    untrustedCandidates: contacts.map((contact, index) => ({
      candidateKey: String(index),
      claimedName: contact.name,
      claimedTitle: contact.title,
      claimedCompany: contact.companyName,
      claimedContactType: contact.contactType,
      claimedLinkedinUrl: contact.linkedinUrl || "",
    })),
    requiredSearches: contacts.flatMap((contact) => [
      `site:linkedin.com/in \"${contact.name}\" \"${contact.companyName}\"`,
      `\"${contact.name}\" \"${contact.companyName}\" \"${contact.title}\"`,
    ]),
    outputSchema: {
      verifications: [{
        candidateKey: "Exact supplied candidate key",
        currentName: "Full name supported by the verified current profile",
        linkedinHeadline: "Verbatim LinkedIn headline, or empty string when unavailable",
        linkedinHeadlineEvidenceText: "Verbatim evidence excerpt containing the exact LinkedIn headline",
        currentExperienceTitle: "Verbatim title from the current Experience entry at the target company",
        currentExperienceCompany: "Verbatim employer from that same current Experience entry",
        currentExperienceEvidenceText: "Verbatim evidence excerpt containing that exact title and employer",
        currentExperienceIsCurrent: "boolean: evidence identifies this as a current Experience entry",
        linkedinUrl: "Verified direct LinkedIn /in/ profile URL, or empty string",
        identityMatches: "boolean: profile belongs to the supplied person",
        companyMatches: "boolean: person currently works at the target company",
        roleEligible: "boolean: verified current role is plausibly useful in this job's hiring chain",
        contactType: "likely_hiring_manager | functional_leader | recruiter | executive_sponsor | referral_candidate | unknown",
        confidence: "0-100 confidence in the verified decision",
        reason: "One sentence grounded in the verified current role explaining relevance or rejection",
        roleConnection: "Verified relationship to this hiring chain, with uncertainty stated plainly",
        headlineEvidenceUrl: "Current public source supporting the verbatim headline",
        experienceEvidenceUrl: "Current public source supporting the verbatim current Experience title and employer",
      }],
    },
  });
}

function contactDedupKey(contact: ResearchedContact) {
  return `${contact.name.toLowerCase()}|${contact.title.toLowerCase()}`;
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
  return merged
    .sort((a, b) => a.rank - b.rank || b.confidence - a.confidence)
    .slice(0, 5);
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

function titleSupportsContactType(title: string, contactType: HumanPathContact["contactType"]) {
  const normalized = normalizedNamePhrase(title);
  const leadershipTitle = /\b(manager|director|head|lead|chief|president|supervisor|vp|svp|evp)\b/.test(normalized);
  if (contactType === "likely_hiring_manager" || contactType === "functional_leader") return leadershipTitle;
  if (contactType === "recruiter") return /\b(recruiter|recruiting|talent acquisition|talent partner|sourcer)\b/.test(normalized);
  if (contactType === "executive_sponsor") return /\b(chief|president|executive|founder|ceo|coo|cmo|cto|vp|svp|evp)\b/.test(normalized);
  return contactType === "referral_candidate";
}

function evidenceContainsVerbatim(evidenceText: string, value: string) {
  const normalizedEvidence = evidenceText.replace(/\s+/g, " ").trim();
  const normalizedValue = value.replace(/\s+/g, " ").trim();
  return Boolean(normalizedValue && normalizedEvidence.includes(normalizedValue));
}

export function parseProfileVerifications(value: unknown): ContactProfileVerification[] {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const list = Array.isArray(record.verifications) ? record.verifications : [];

  return list.map((item): ContactProfileVerification | null => {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const candidateKey = cleanField(row, "candidateKey", "candidate_key");
    const currentName = cleanField(row, "currentName", "current_name", "name");
    const linkedinHeadline = cleanField(row, "linkedinHeadline", "linkedin_headline");
    const linkedinHeadlineEvidenceText = cleanField(row, "linkedinHeadlineEvidenceText", "linkedin_headline_evidence_text");
    const currentExperienceTitle = cleanField(row, "currentExperienceTitle", "current_experience_title");
    const currentExperienceCompany = cleanField(row, "currentExperienceCompany", "current_experience_company");
    const currentExperienceEvidenceText = cleanField(row, "currentExperienceEvidenceText", "current_experience_evidence_text");
    const linkedinUrl = normalizedLinkedinProfileUrl(cleanField(row, "linkedinUrl", "linkedin_url"));
    const headlineEvidenceUrl = normalizedPublicUrl(cleanField(row, "headlineEvidenceUrl", "headline_evidence_url"));
    const experienceEvidenceUrl = normalizedPublicUrl(cleanField(row, "experienceEvidenceUrl", "experience_evidence_url"));
    const relevanceReason = cleanField(row, "reason", "relevanceReason", "relevance_reason");
    const roleConnection = cleanField(row, "roleConnection", "role_connection");
    const { contactType, rank } = normalizeContactType(row.contactType ?? row.contact_type);

    if (!candidateKey || !currentName) return null;
    return {
      candidateKey,
      currentName,
      linkedinHeadline,
      linkedinHeadlineEvidenceText,
      currentExperienceTitle,
      currentExperienceCompany,
      currentExperienceEvidenceText,
      linkedinUrl,
      contactType,
      confidence: clampConfidence(row.confidence),
      relevanceReason,
      roleConnection,
      headlineEvidenceUrl,
      experienceEvidenceUrl,
      identityMatches: row.identityMatches === true || row.identity_matches === true,
      companyMatches: row.companyMatches === true || row.company_matches === true,
      roleEligible: row.roleEligible === true || row.role_eligible === true,
      currentExperienceIsCurrent: row.currentExperienceIsCurrent === true || row.current_experience_is_current === true,
      rank,
    };
  }).filter((verification): verification is ContactProfileVerification => Boolean(verification));
}

export function applyProfileVerifications(contacts: ResearchedContact[], verifications: ContactProfileVerification[]) {
  const verificationGroups = new Map<string, ContactProfileVerification[]>();
  for (const verification of verifications) {
    const group = verificationGroups.get(verification.candidateKey) ?? [];
    group.push(verification);
    verificationGroups.set(verification.candidateKey, group);
  }

  return contacts.flatMap((contact, index): ResearchedContact[] => {
    const matches = verificationGroups.get(String(index)) ?? [];
    const verification = matches.length === 1 ? matches[0] : undefined;
    if (!verification
      || !verification.identityMatches
      || !verification.companyMatches
      || !verification.roleEligible
      || !verification.currentExperienceIsCurrent
      || !verification.linkedinUrl
      || !verification.headlineEvidenceUrl
      || !verification.experienceEvidenceUrl
      || verification.contactType === "unknown"
      || !verification.linkedinHeadline
      || !evidenceContainsVerbatim(verification.linkedinHeadlineEvidenceText, verification.linkedinHeadline)
      || !evidenceContainsVerbatim(verification.currentExperienceEvidenceText, verification.currentExperienceTitle)
      || !evidenceContainsVerbatim(verification.currentExperienceEvidenceText, verification.currentExperienceCompany)
      || !titleSupportsContactType(verification.currentExperienceTitle, verification.contactType)
      || !isSpecificPersonName(verification.currentName, verification.currentExperienceCompany)
      || !companyNamesMatch(contact.companyName, verification.currentExperienceCompany)) return [];
    return [{
      ...contact,
      name: verification.currentName,
      title: verification.currentExperienceTitle,
      companyName: verification.currentExperienceCompany,
      linkedinUrl: verification.linkedinUrl,
      professionalContactUrl: undefined,
      contactType: verification.contactType,
      confidence: Math.min(contact.confidence, verification.confidence),
      relevanceReason: verification.relevanceReason,
      roleConnection: verification.roleConnection,
      verificationNotes: verification.experienceEvidenceUrl ? [`Evidence: ${verification.experienceEvidenceUrl}`] : [],
      rank: verification.rank,
    }];
  }).sort((a, b) => a.rank - b.rank || b.confidence - a.confidence).slice(0, 5);
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

// Creates a HumanPathProvider backed by the injected model call. With no
// OPENAI_API_KEY (or a transport error on the first call) it degrades to
// provider_unavailable, mirroring the outreach generator's no-key behavior.
export function createOpenAIHumanPathProvider(dependencies: ContactProviderDependencies = {}): HumanPathProvider {
  const callModel = dependencies.callModel ?? defaultCallModel;
  return async ({ job }) => {
    const firstRaw = await callModel({ system: SYSTEM_PROMPT, user: buildUserPrompt(job) });
    if (firstRaw === undefined) {
      return {
        status: "provider_unavailable",
        reason: "Contact discovery is not configured. Add OPENAI_API_KEY to enable web search.",
      };
    }

    let contacts = parseResearchedContacts(extractJson(firstRaw), job.companyName);
    const hasFunctionalLead = contacts.some(
      (contact) => contact.contactType === "likely_hiring_manager" || contact.contactType === "functional_leader",
    );

    if (contacts.length < 3 || !hasFunctionalLead) {
      const gapRaw = await callModel({ system: SYSTEM_PROMPT, user: buildGapFillPrompt(job, contacts) });
      if (gapRaw !== undefined) {
        contacts = mergeResearchedContacts(contacts, parseResearchedContacts(extractJson(gapRaw), job.companyName));
      }
    } else {
      contacts = mergeResearchedContacts(contacts, []);
    }

    if (contacts.length === 0) return { status: "generated", contacts: [] };

    const verificationRaw = await callModel({
      system: PROFILE_VERIFICATION_SYSTEM_PROMPT,
      user: buildProfileVerificationPrompt(job, contacts),
    });
    if (verificationRaw === undefined) return { status: "generated", contacts: [] };

    contacts = applyProfileVerifications(
      contacts,
      parseProfileVerifications(extractJson(verificationRaw)),
    );
    return { status: "generated", contacts: contacts.map(toHumanPathContact) };
  };
}

export const openAIHumanPathProvider: HumanPathProvider = createOpenAIHumanPathProvider();
