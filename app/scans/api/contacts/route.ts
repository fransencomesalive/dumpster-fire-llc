import OpenAI from "openai";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getJobSearchAuthState } from "../../auth";
import { getDashboardState, saveJobContacts, type ContactResearchInput } from "../../store";
import type { ContactStatus, ContactType, Job } from "../../types";

export const maxDuration = 60;

const CONTACT_TYPES = new Set<ContactType>([
  "recruiter",
  "talent_partner",
  "hiring_manager",
  "department_leader",
  "creative_lead",
  "production_lead",
  "unknown",
]);

async function requireContactsAuth() {
  const authState = getJobSearchAuthState(await cookies());
  if (!authState.authenticated) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  return null;
}

// Hiring-manager outreach rules, mirrored from app/scans/job_search_context_for_codex.md §7 + §10.
const SYSTEM_PROMPT = [
  "You are a contact-research assistant for one private job-search dashboard.",
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
  "Prefer people who are reachable on LinkedIn.",
  "Return JSON only, matching the requested schema. No commentary outside the JSON.",
].join(" ");

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function firstUrl(value: string) {
  return value.match(/https?:\/\/[^\s)\]]+/i)?.[0] ?? "";
}

function cleanField(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = cleanString(row[key]);
    if (value) return value;
  }
  return "";
}

function isSpecificPersonName(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.includes("unverified") || normalized.includes("unknown")) return false;
  if (normalized.startsWith("(") || normalized.startsWith("the ")) return false;
  if (/^(group director|director|vp|svp|head of|recruiter|talent acquisition|hiring manager)\b/.test(normalized)) return false;
  const words = normalized.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.some((word) => /^[a-z][a-z'-]+$/.test(word));
}

function clampConfidence(value: unknown): number {
  let num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return 40;
  // Models return confidence on either a 0-1 or 0-100 scale; normalize the fractional form.
  if (num > 0 && num <= 1) num *= 100;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function normalizeContactType(value: unknown): ContactType {
  const raw = cleanString(value).toLowerCase();
  const compact = raw.replace(/\s+/g, "_");
  if (CONTACT_TYPES.has(compact as ContactType)) return compact as ContactType;
  if (raw.includes("functional leader")) return "department_leader";
  if (raw.includes("long shot")) return "department_leader";
  // Models return human-readable labels ("Recruiter / Talent Partner"); map by keyword.
  if (raw.includes("hiring manager")) return "hiring_manager";
  if (raw.includes("talent")) return "talent_partner";
  if (raw.includes("recruit")) return "recruiter";
  if (raw.includes("creative")) return "creative_lead";
  if (raw.includes("production") || raw.includes("producer")) return "production_lead";
  if (raw.includes("department") || raw.includes("vp") || raw.includes("head of") || raw.includes("director")) return "department_leader";
  return "unknown";
}

function normalizeStatus(value: unknown, hasEvidence: boolean): ContactStatus {
  const raw = cleanString(value).toLowerCase();
  if (raw === "identified") return "identified";
  if (raw === "to_research") return "to_research";
  // Default by evidence strength: a cited, current-employment source counts as identified.
  return hasEvidence ? "identified" : "to_research";
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

function parseResearchedContacts(value: unknown): ContactResearchInput[] {
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
    .map((item): ContactResearchInput | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const name = cleanField(row, "name", "fullName", "full_name", "person");
      const title = cleanField(row, "title", "jobTitle", "job_title", "currentTitle", "current_title");
      if (!name || !title) return null;
      if (!isSpecificPersonName(name)) return null;

      const rawLinkedinUrl = cleanField(row, "linkedinUrl", "linkedin_url", "linkedInUrl", "linkedIn", "linkedin", "profileUrl", "profile_url");
      const linkedinUrl = firstUrl(rawLinkedinUrl) || (rawLinkedinUrl.startsWith("http") ? rawLinkedinUrl : "");
      const candidateRole = cleanField(row, "candidateRole", "candidate_role", "role", "recommendationType", "recommendation_type");
      const roleConnection = cleanField(row, "roleConnection", "role_connection", "connection");
      const notes = cleanString(row.notes);
      const reason = cleanString(row.reason);
      const rawEvidenceUrl = cleanField(row, "evidenceUrl", "evidence_url", "sourceUrl", "source_url", "url");
      const evidenceUrl = firstUrl(rawEvidenceUrl)
        || firstUrl(notes)
        || firstUrl(reason)
        || linkedinUrl
        || (rawEvidenceUrl.startsWith("http") ? rawEvidenceUrl : "");
      return {
        name,
        title,
        contactType: normalizeContactType(row.contactType ?? row.contact_type ?? candidateRole),
        linkedinUrl,
        evidenceUrl,
        confidence: clampConfidence(row.confidence),
        reason,
        notes: [candidateRole, roleConnection || notes, !evidenceUrl && rawEvidenceUrl ? `Evidence note: ${rawEvidenceUrl.slice(0, 180)}` : ""].filter(Boolean).join(": "),
        status: normalizeStatus(row.status, Boolean(evidenceUrl || linkedinUrl)),
      };
    })
    .filter((contact): contact is ContactResearchInput => Boolean(contact))
    .slice(0, 5);
}

function inferContactResearchPlan(job: Job) {
  const text = `${job.title} ${job.department} ${job.descriptionText}`.toLowerCase();

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

function buildUserPrompt(job: Job) {
  const researchPlan = inferContactResearchPlan(job);
  return JSON.stringify({
    task: "Find real people who influence hiring for this role by building and testing a chain-of-command hypothesis before selecting contacts.",
    role: {
      title: job.title,
      company: job.companyName,
      location: job.location,
      department: job.department,
      postingUrl: job.sourceUrl,
      summary: job.descriptionText.slice(0, 3000),
    },
    chainOfCommandHypothesis: {
      owningFunction: researchPlan.owningFunction,
      likelyOneLevelAboveTitles: researchPlan.likelyReportsTo,
      avoidFunctions: researchPlan.avoidFunctions,
      publicEvidenceTargets: researchPlan.publicEvidenceTargets,
      targetOrder: ["Hiring Manager", "Functional Leader", "Recruiter", "Long Shot"],
    },
    outputSchema: {
      contacts: [
        {
          name: "Real full name from a search result",
          title: "Their current title",
          candidateRole: "Hiring Manager | Functional Leader | Recruiter | Long Shot",
          contactType: "hiring_manager | department_leader | recruiter | talent_partner | creative_lead | production_lead | unknown",
          linkedinUrl: "Direct LinkedIn profile URL, or empty string if not found",
          evidenceUrl: "URL proving they currently work at the company (LinkedIn, company page, press, etc.)",
          confidence: "0-100 integer: how sure they are current and relevant to this role",
          reason: "One sentence explaining why this person matters for THIS role and where they sit in the likely reporting chain",
          roleConnection: "Likely direct manager, manager's boss, assigned recruiter, or long-shot executive sponsor; include uncertainty plainly",
          notes: "Useful outreach/search note, including what public evidence made this person credible",
          status: "identified if current employment is evidenced, otherwise to_research",
        },
      ],
    },
    limits: "Return 2-5 contacts maximum. Prefer one strong functional leader over multiple weak recruiter matches. Empty array is acceptable if nothing credible is found.",
    searchHints: [
      `${job.companyName} ${job.title} reports to`,
      ...researchPlan.likelyReportsTo.slice(0, 4).map((title) => `${job.companyName} ${title} LinkedIn`),
      `${job.companyName} ${researchPlan.owningFunction} leadership`,
      `${job.companyName} recruiter talent acquisition ${job.department || job.title}`,
    ],
  });
}

function contactDedupKey(contact: ContactResearchInput) {
  return `${contact.name.toLowerCase()}|${contact.title.toLowerCase()}`;
}

function mergeResearchedContacts(primary: ContactResearchInput[], supplemental: ContactResearchInput[]) {
  const seen = new Set<string>();
  const merged: ContactResearchInput[] = [];
  for (const contact of [...primary, ...supplemental]) {
    const key = contactDedupKey(contact);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(contact);
  }
  return merged
    .sort((a, b) => {
      const roleRank = (contact: ContactResearchInput) => {
        if (contact.notes.toLowerCase().startsWith("hiring manager")) return 0;
        if (contact.notes.toLowerCase().startsWith("functional leader")) return 1;
        if (contact.contactType === "recruiter" || contact.contactType === "talent_partner") return 2;
        return 3;
      };
      return roleRank(a) - roleRank(b) || b.confidence - a.confidence;
    })
    .slice(0, 5);
}

function buildGapFillPrompt(job: Job, existing: ContactResearchInput[]) {
  const researchPlan = inferContactResearchPlan(job);
  return JSON.stringify({
    task: "The first contact search was too thin. Continue the chain-of-command search and return only additional contacts not already found.",
    role: {
      title: job.title,
      company: job.companyName,
      location: job.location,
      department: job.department,
      postingUrl: job.sourceUrl,
    },
    existingContacts: existing.map((contact) => ({
      name: contact.name,
      title: contact.title,
      candidateRole: contact.notes.split(":")[0] || contact.contactType,
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
    outputSchema: {
      contacts: [
        {
          name: "Real full name from a search result",
          title: "Their current title",
          candidateRole: "Hiring Manager | Functional Leader | Recruiter | Long Shot",
          contactType: "hiring_manager | department_leader | recruiter | talent_partner | creative_lead | production_lead | unknown",
          linkedinUrl: "Direct LinkedIn profile URL, or empty string if not found",
          evidenceUrl: "URL proving they currently work at the company",
          confidence: "0-100 integer",
          reason: "Why this person matters for this role and where they sit in the likely reporting chain",
          roleConnection: "Likely direct manager, manager's boss, assigned recruiter, or long-shot executive sponsor",
          notes: "Evidence and uncertainty note",
          status: "identified if current employment is evidenced, otherwise to_research",
        },
      ],
    },
  });
}

function contactSearchGuidance(job: Job) {
  const researchPlan = inferContactResearchPlan(job);
  return [
    `Manual search path: start with ${researchPlan.owningFunction}.`,
    `Search one-level-up titles: ${researchPlan.likelyReportsTo.slice(0, 4).join(", ")}.`,
    "Prioritize current functional leaders over recruiters; use recruiters second.",
    `Avoid unrelated lanes: ${researchPlan.avoidFunctions.join(", ")}.`,
  ].join(" ");
}

export async function POST(request: Request) {
  const authError = await requireContactsAuth();
  if (authError) return authError;

  const body = await request.json().catch(() => null) as { jobId?: unknown } | null;
  if (!body || typeof body.jobId !== "string") {
    return NextResponse.json({ error: "Expected jobId." }, { status: 400 });
  }

  const dashboard = await getDashboardState();
  const job = dashboard.jobs.find((item) => item.id === body.jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Contact research is not configured. Add OPENAI_API_KEY to enable web search.", reason: "contact_research_not_configured" },
      { status: 503 }
    );
  }

  let researched: ContactResearchInput[];
  try {
    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
      model: process.env.JOB_SEARCH_CONTACT_MODEL ?? "gpt-4.1",
      tools: [{ type: "web_search" }],
      include: ["web_search_call.action.sources"],
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(job) },
      ],
    });
    researched = parseResearchedContacts(extractJson(response.output_text ?? ""));
    const hasFunctionalLead = researched.some((contact) =>
      ["hiring_manager", "department_leader", "creative_lead", "production_lead"].includes(contact.contactType)
    );
    if (researched.length < 3 || !hasFunctionalLead) {
      const supplementalResponse = await client.responses.create({
        model: process.env.JOB_SEARCH_CONTACT_MODEL ?? "gpt-4.1",
        tools: [{ type: "web_search" }],
        include: ["web_search_call.action.sources"],
        input: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildGapFillPrompt(job, researched) },
        ],
      });
      researched = mergeResearchedContacts(
        researched,
        parseResearchedContacts(extractJson(supplementalResponse.output_text ?? ""))
      );
    }
  } catch (error) {
    console.error("Contact research failed", error);
    const detail = error instanceof Error ? error.message : "";
    return NextResponse.json(
      {
        error: "Contact research search failed.",
        detail: detail ? `The search service returned: ${detail}` : "The search service did not return a usable result.",
        reason: "contact_research_failed",
      },
      { status: 502 }
    );
  }

  let dashboardState;
  try {
    dashboardState = await saveJobContacts(job.id, job.companyId, researched);
  } catch (error) {
    console.error("Contact research save failed", error);
    const detail = error instanceof Error ? error.message : "";
    return NextResponse.json(
      {
        error: "Contact research found contacts but could not save them.",
        detail: detail ? `The database returned: ${detail}` : "The database did not accept the researched contacts.",
        reason: "contact_research_save_failed",
      },
      { status: 502 }
    );
  }
  const contacts = dashboardState.contactSuggestions.filter((contact) => contact.jobId === job.id);

  return NextResponse.json({ contacts, dashboardState, source: "web_search", found: researched.length, searchGuidance: contactSearchGuidance(job) });
}
