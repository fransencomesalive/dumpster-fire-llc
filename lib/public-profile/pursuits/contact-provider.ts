import { randomUUID } from "node:crypto";
import type {
  HumanPathContact,
  HumanPathDiagnostics,
  HumanPathLane,
  HumanPathProvider,
  HumanPathProviderInput,
} from "./types";
import type { ProviderUsageSink } from "../../costs/provider-usage";
import {
  normalizedCompanyKey,
  resolveEmployerIdentities,
  type EmployerIdentity,
} from "./employer-identities";

type UnknownRecord = Record<string, unknown>;

type ExaPeopleSearchResponse = {
  results?: unknown[];
  requestId?: string;
  costDollars?: {
    total?: number;
  };
};

export type ExaPeopleSearchCall = (input: {
  lane: HumanPathLane;
  query: string;
}) => Promise<ExaPeopleSearchResponse>;

export type ExaHumanPathProviderDependencies = {
  apiKey?: string;
  fetch?: typeof fetch;
  search?: ExaPeopleSearchCall;
  timeoutMs?: number;
  recordUsage?: ProviderUsageSink;
  createId?: () => string;
  nowMs?: () => number;
};

type WorkHistoryEntry = {
  title: string;
  companyName: string;
  current: boolean;
};

type DiscoveredPerson = {
  name: string;
  title: string;
  companyName: string;
  linkedinUrl: string;
  lanes: Map<HumanPathLane, number>;
};

type LaneRun = {
  lane: HumanPathLane;
  status: "completed" | "provider_unavailable";
  retrievedCount: number;
  exactCompanyPeople: DiscoveredPerson[];
  companyMismatchCount: number;
  missingLinkedinCount: number;
};

const LANES: HumanPathLane[] = [
  "likely_hiring_manager",
  "recruiter",
  "functional_leader",
];

const RESULTS_PER_LANE = 10;
const DEFAULT_TIMEOUT_MS = 12_000;
const EXA_SEARCH_FALLBACK_COST_MICROS = 7_000;
const EXA_RATE_CARD_VERSION = "exa-search-auto-1-10-v2026-07-24";
const EXA_MODEL_VERSION = "search:auto:people:highlights";

// Stored on Human Path generation events so cache reads can distinguish this
// contract from older zero-result provider runs.
export const HUMAN_PATH_PROVIDER_VERSION = 13;

const LANE_QUERY: Record<HumanPathLane, string> = {
  likely_hiring_manager:
    "Find current employees who may directly manage, staff, or oversee hiring for this opening. Prioritize people responsible for the role's actual function, discipline, business area, or delivery team.",
  recruiter:
    "Find current recruiters, talent acquisition partners, or hiring-team members who may recruit for this opening. Prioritize evidence connecting their remit to the role's function or business area.",
  functional_leader:
    "Find current functional or operational leaders whose remit materially overlaps this opening. Include useful leaders even when exact requisition ownership is unknown.",
};

const RECRUITING_TITLE =
  /\b(recruiter|recruiting|talent acquisition|talent partner|talent scout|sourcer|staffing partner)\b/i;
const LEADERSHIP_TITLE =
  /\b(chief|head|director|vice president|vp|president|managing director|general manager|senior manager|group lead|team lead)\b/i;
const RANK_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

function record(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizedLinkedinProfile(value: unknown): string {
  const candidate = stringValue(value);
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    if (hostname !== "linkedin.com" && !hostname.endsWith(".linkedin.com")) return "";
    const match = url.pathname.match(/^\/in\/([^/]+)\/?$/i);
    if (!match?.[1]) return "";
    return `https://www.linkedin.com/in/${match[1]}`;
  } catch {
    return "";
  }
}

function currentDates(value: unknown): boolean {
  const dates = record(value);
  if (!dates || !Object.hasOwn(dates, "to")) return false;
  if (dates.to === null) return true;
  const end = stringValue(dates.to).toLowerCase();
  return end === "present" || end === "current";
}

function workHistory(value: unknown): WorkHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = record(item);
    const company = record(row?.company);
    const companyName = stringValue(company?.name);
    if (!row || !companyName) return [];
    return [{
      title: stringValue(row.title),
      companyName,
      current: currentDates(row.dates),
    }];
  });
}

function personProperties(result: UnknownRecord): UnknownRecord | undefined {
  if (!Array.isArray(result.entities)) return undefined;
  for (const value of result.entities) {
    const entity = record(value);
    if (stringValue(entity?.type).toLowerCase() !== "person") continue;
    const properties = record(entity?.properties);
    if (properties) return properties;
  }
  return undefined;
}

function titleFromResult(resultTitle: unknown, name: string): string {
  const title = stringValue(resultTitle);
  if (!title) return "";
  const normalizedName = name.toLowerCase();
  return title
    .split(/\s+[|–-]\s+/)
    .map((part) => part.trim())
    .find((part) => part && part.toLowerCase() !== normalizedName) ?? "";
}

function personFromResult(
  value: unknown,
  expectedCompanies: EmployerIdentity[],
  lane: HumanPathLane,
  rank: number,
): {
  person?: DiscoveredPerson;
  companyMismatch: boolean;
  missingLinkedin: boolean;
} {
  const result = record(value);
  const properties = result ? personProperties(result) : undefined;
  if (!result || !properties) {
    return { companyMismatch: true, missingLinkedin: false };
  }

  let matchedIdentity: EmployerIdentity | undefined;
  const currentRole = workHistory(properties.workHistory)
    .find((role) => {
      if (!role.current) return false;
      matchedIdentity = expectedCompanies.find((identity) =>
        normalizedCompanyKey(identity.name) === normalizedCompanyKey(role.companyName));
      return Boolean(matchedIdentity);
    });
  if (!currentRole) {
    return { companyMismatch: true, missingLinkedin: false };
  }

  const linkedinUrl = normalizedLinkedinProfile(result.url);
  if (!linkedinUrl) {
    return { companyMismatch: false, missingLinkedin: true };
  }

  const name = stringValue(properties.name);
  if (!name) {
    return { companyMismatch: false, missingLinkedin: true };
  }

  return {
    person: {
      name,
      title: currentRole.title || titleFromResult(result.title, name) || "Current employee",
      companyName: matchedIdentity?.relationship === "primary"
        ? matchedIdentity.name
        : currentRole.companyName,
      linkedinUrl,
      lanes: new Map([[lane, rank]]),
    },
    companyMismatch: false,
    missingLinkedin: false,
  };
}

function compactContext(input: HumanPathProviderInput): string {
  const context = input.candidateContext;
  const parts = [
    `Job context: ${stringValue(input.job.description).slice(0, 3_000)}`,
    context?.roleTrackName ? `Candidate role track: ${context.roleTrackName}` : "",
    context?.targetTitles.length
      ? `Candidate target titles: ${context.targetTitles.slice(0, 8).join(", ")}`
      : "",
    context?.keyResponsibilities.length
      ? `Candidate responsibilities: ${context.keyResponsibilities.slice(0, 8).join("; ")}`
      : "",
    context?.skills.length
      ? `Candidate skills: ${context.skills.slice(0, 12).join(", ")}`
      : "",
    context?.targetIndustries.length
      ? `Candidate target industries: ${context.targetIndustries.slice(0, 6).join(", ")}`
      : "",
  ];
  return parts.filter(Boolean).join(" ");
}

export function buildExaPeopleQuery(input: HumanPathProviderInput, lane: HumanPathLane): string {
  const employerIdentities = resolveEmployerIdentities(input.job);
  const employerContext = employerIdentities.length > 1
    ? [
        `Employer identities explicitly stated in the posting: ${employerIdentities
          .map((identity) => identity.name)
          .join(", ")}.`,
        `The opening is for ${input.job.companyName}, not for one of its clients.`,
        "Treat only current employees of those stated identities as company matches.",
      ].join(" ")
    : `Employer: ${input.job.companyName}.`;
  return [
    LANE_QUERY[lane],
    employerContext,
    `Opening: ${input.job.title}.`,
    "Return people involved in the employer's hiring path, not candidates who might apply for the job.",
    compactContext(input),
  ].filter(Boolean).join(" ");
}

async function requestExaPeople(
  input: { lane: HumanPathLane; query: string },
  dependencies: ExaHumanPathProviderDependencies,
  apiKey: string,
): Promise<ExaPeopleSearchResponse> {
  const fetchImpl = dependencies.fetch ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  try {
    const response = await fetchImpl("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: input.query,
        type: "auto",
        category: "people",
        numResults: RESULTS_PER_LANE,
        contents: { highlights: true },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Exa People Search returned HTTP ${response.status}.`);
    }
    const body: unknown = await response.json();
    const parsed = record(body);
    const costDollars = record(parsed?.costDollars);
    return {
      results: Array.isArray(parsed?.results) ? parsed.results : [],
      requestId: stringValue(parsed?.requestId) || undefined,
      costDollars: typeof costDollars?.total === "number"
        ? { total: costDollars.total }
        : undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function mergePeople(runs: LaneRun[]): {
  people: DiscoveredPerson[];
  duplicateCount: number;
} {
  const byLinkedin = new Map<string, DiscoveredPerson>();
  const linkedinByIdentity = new Map<string, string>();
  let duplicateCount = 0;

  for (const run of runs) {
    for (const person of run.exactCompanyPeople) {
      const identityKey = person.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
      const existingUrl = linkedinByIdentity.get(identityKey);
      const existing = byLinkedin.get(person.linkedinUrl)
        ?? (existingUrl ? byLinkedin.get(existingUrl) : undefined);
      if (!existing) {
        byLinkedin.set(person.linkedinUrl, person);
        linkedinByIdentity.set(identityKey, person.linkedinUrl);
        continue;
      }

      duplicateCount += 1;
      for (const [lane, rank] of person.lanes) {
        existing.lanes.set(lane, Math.min(existing.lanes.get(lane) ?? rank, rank));
      }
      if (existing.title === "Current employee" && person.title !== "Current employee") {
        existing.title = person.title;
      }
    }
  }

  return { people: [...byLinkedin.values()], duplicateCount };
}

function sortedLanes(person: DiscoveredPerson): HumanPathLane[] {
  return [...person.lanes.entries()]
    .sort((left, right) => left[1] - right[1] || LANES.indexOf(left[0]) - LANES.indexOf(right[0]))
    .map(([lane]) => lane);
}

function contactType(person: DiscoveredPerson): HumanPathContact["contactType"] {
  if (RECRUITING_TITLE.test(person.title)) return "recruiter";
  if (!LEADERSHIP_TITLE.test(person.title)) return "other_useful_contact";
  return sortedLanes(person).find((lane) => lane !== "recruiter") ?? "other_useful_contact";
}

function rankTokens(value: string): Set<string> {
  return new Set(
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter((token) => token.length > 1 && !RANK_STOP_WORDS.has(token)),
  );
}

function rankingScore(person: DiscoveredPerson, input: HumanPathProviderInput): number {
  const bestRank = Math.min(...person.lanes.values());
  const titleTokens = rankTokens(person.title);
  const jobTokens = rankTokens([
    input.job.title,
    input.candidateContext?.roleTrackName ?? "",
    ...(input.candidateContext?.targetTitles ?? []),
  ].join(" "));
  let overlap = 0;
  for (const token of titleTokens) if (jobTokens.has(token)) overlap += 1;
  const type = contactType(person);
  const classificationSignal = type === "other_useful_contact" ? 0 : 6;
  const multiLaneSignal = Math.max(0, person.lanes.size - 1) * 4;
  return 100 - bestRank * 3 + Math.min(overlap, 6) * 3 + classificationSignal + multiLaneSignal;
}

function contactReason(
  type: HumanPathContact["contactType"],
  input: HumanPathProviderInput,
): { relevanceReason: string; roleConnection: string } {
  const opening = `${input.job.title} at ${input.job.companyName}`;
  if (type === "recruiter") {
    return {
      relevanceReason: `Current company recruiting contact surfaced for ${opening}.`,
      roleConnection: "Recruiting responsibility for this specific opening is not confirmed.",
    };
  }
  if (type === "likely_hiring_manager") {
    return {
      relevanceReason: `Current company leader surfaced near the function for ${opening}.`,
      roleConnection: "Direct management or hiring authority for this opening is not confirmed.",
    };
  }
  if (type === "functional_leader") {
    return {
      relevanceReason: `Current company leader surfaced with potential functional overlap for ${opening}.`,
      roleConnection: "Functional proximity is plausible, but requisition ownership is not confirmed.",
    };
  }
  return {
    relevanceReason: `Current company contact surfaced with potential usefulness for ${opening}.`,
    roleConnection: "The contact may be a useful peer or operational connection; hiring authority is unknown.",
  };
}

function toContact(person: DiscoveredPerson, input: HumanPathProviderInput): HumanPathContact {
  const type = contactType(person);
  const reason = contactReason(type, input);
  return {
    name: person.name,
    title: person.title,
    companyName: person.companyName,
    linkedinUrl: person.linkedinUrl,
    reachability: { method: "linkedin", url: person.linkedinUrl },
    contactType: type,
    confidence: type === "other_useful_contact" ? "low" : "medium",
    ...reason,
    verificationNotes: [
      "Check the LinkedIn profile for the latest title, employer, and role relevance before outreach.",
    ],
  };
}

function diagnosticsFor(
  runs: LaneRun[],
  returnedPeople: DiscoveredPerson[],
  duplicateCount: number,
): HumanPathDiagnostics {
  return {
    schemaVersion: 2,
    lanes: runs.map((run) => ({
      lane: run.lane,
      discoveryStatus: run.status,
      retrievedCount: run.retrievedCount,
      exactCompanyCount: run.exactCompanyPeople.length,
      returnedCount: returnedPeople.filter((person) => person.lanes.has(run.lane)).length,
    })),
    retrievedCount: runs.reduce((total, run) => total + run.retrievedCount, 0),
    exactCompanyCount: runs.reduce((total, run) => total + run.exactCompanyPeople.length, 0),
    returnedCount: returnedPeople.length,
    excluded: {
      companyMismatchCount: runs.reduce((total, run) => total + run.companyMismatchCount, 0),
      missingLinkedinCount: runs.reduce((total, run) => total + run.missingLinkedinCount, 0),
      duplicateCount,
    },
  };
}

export function createExaHumanPathProvider(
  dependencies: ExaHumanPathProviderDependencies = {},
): HumanPathProvider {
  return async (input) => {
    const apiKey = dependencies.apiKey ?? process.env.EXA_API_KEY ?? "";
    const search = dependencies.search
      ?? (apiKey
        ? (request: Parameters<ExaPeopleSearchCall>[0]) => requestExaPeople(request, dependencies, apiKey)
        : undefined);
    if (!search) {
      return {
        status: "provider_unavailable",
        reason: "Contact discovery is unavailable right now.",
      };
    }

    const requestCorrelationId = dependencies.createId?.() ?? randomUUID();
    const nowMs = dependencies.nowMs ?? Date.now;
    const employerIdentities = resolveEmployerIdentities(input.job);
    const runs = await Promise.all(LANES.map(async (lane): Promise<LaneRun> => {
      const startedAt = nowMs();
      try {
        const response = await search({ lane, query: buildExaPeopleQuery(input, lane) });
        const results = Array.isArray(response.results) ? response.results : [];
        const reportedCostDollars = response.costDollars?.total;
        const estimatedCostMicros =
          typeof reportedCostDollars === "number"
          && Number.isFinite(reportedCostDollars)
          && reportedCostDollars >= 0
            ? Math.round(reportedCostDollars * 1_000_000)
            : EXA_SEARCH_FALLBACK_COST_MICROS;
        const exactCompanyPeople: DiscoveredPerson[] = [];
        let companyMismatchCount = 0;
        let missingLinkedinCount = 0;
        results.forEach((result, index) => {
          const parsed = personFromResult(result, employerIdentities, lane, index + 1);
          if (parsed.person) exactCompanyPeople.push(parsed.person);
          if (parsed.companyMismatch) companyMismatchCount += 1;
          if (parsed.missingLinkedin) missingLinkedinCount += 1;
        });
        if (dependencies.recordUsage) {
          await dependencies.recordUsage({
            userId: input.pursuit.userId,
            pursuitId: input.pursuit.id,
            jobId: input.job.id,
            providerCategory: "exa",
            operation: `human_path_people_search_${lane}`,
            modelVersion: EXA_MODEL_VERSION,
            requestCount: 1,
            inputTokens: 0,
            outputTokens: 0,
            cacheWriteTokens: 0,
            cacheReadTokens: 0,
            resultCount: results.length,
            durationMs: Math.max(0, Math.round(nowMs() - startedAt)),
            outcome: results.length > 0 ? "success" : "empty",
            estimatedCostMicros,
            rateCardVersion: EXA_RATE_CARD_VERSION,
            requestCorrelationId,
          }).catch((error) => {
            console.error("[costs] Exa provider usage sink rejected", {
              operation: `human_path_people_search_${lane}`,
              errorName: error instanceof Error ? error.name : "UnknownError",
            });
          });
        }
        return {
          lane,
          status: "completed",
          retrievedCount: results.length,
          exactCompanyPeople,
          companyMismatchCount,
          missingLinkedinCount,
        };
      } catch (error) {
        if (dependencies.recordUsage) {
          await dependencies.recordUsage({
            userId: input.pursuit.userId,
            pursuitId: input.pursuit.id,
            jobId: input.job.id,
            providerCategory: "exa",
            operation: `human_path_people_search_${lane}`,
            modelVersion: EXA_MODEL_VERSION,
            requestCount: 1,
            inputTokens: 0,
            outputTokens: 0,
            cacheWriteTokens: 0,
            cacheReadTokens: 0,
            resultCount: 0,
            durationMs: Math.max(0, Math.round(nowMs() - startedAt)),
            outcome: "failure",
            estimatedCostMicros: EXA_SEARCH_FALLBACK_COST_MICROS,
            rateCardVersion: EXA_RATE_CARD_VERSION,
            requestCorrelationId,
          }).catch((usageError) => {
            console.error("[costs] Exa provider usage sink rejected", {
              operation: `human_path_people_search_${lane}`,
              errorName: usageError instanceof Error
                ? usageError.name
                : "UnknownError",
            });
          });
        }
        console.error("Human Path Exa search failed.", {
          lane,
          message: error instanceof Error ? error.message : "Unknown provider error.",
        });
        return {
          lane,
          status: "provider_unavailable",
          retrievedCount: 0,
          exactCompanyPeople: [],
          companyMismatchCount: 0,
          missingLinkedinCount: 0,
        };
      }
    }));

    if (runs.every((run) => run.status === "provider_unavailable")) {
      return {
        status: "provider_unavailable",
        reason: "Contact discovery is unavailable right now.",
      };
    }

    const { people, duplicateCount } = mergePeople(runs);
    const rankedPeople = people.sort((left, right) =>
      rankingScore(right, input) - rankingScore(left, input)
      || left.name.localeCompare(right.name));
    return {
      status: "generated",
      contacts: rankedPeople.map((person) => toContact(person, input)),
      diagnostics: diagnosticsFor(runs, rankedPeople, duplicateCount),
    };
  };
}

export const exaHumanPathProvider: HumanPathProvider = createExaHumanPathProvider();
