import type {
  HumanPathContact,
  HumanPathDiagnostics,
  HumanPathLane,
  HumanPathProvider,
  HumanPathProviderInput,
} from "./types";

type UnknownRecord = Record<string, unknown>;

type ExaPeopleSearchResponse = {
  results?: unknown[];
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
};

type WorkHistoryEntry = {
  title: string;
  companyName: string;
  current: boolean;
};

type DiscoveredPerson = {
  name: string;
  title: string;
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

// Stored on Human Path generation events so cache reads can distinguish this
// contract from older zero-result provider runs.
export const HUMAN_PATH_PROVIDER_VERSION = 12;

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
const COMPANY_SUFFIXES = new Set([
  "co",
  "company",
  "corp",
  "corporation",
  "inc",
  "incorporated",
  "limited",
  "llc",
  "ltd",
  "plc",
]);
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

function normalizedCompany(value: string): string {
  const words = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  while (words.length > 1 && COMPANY_SUFFIXES.has(words.at(-1)!)) words.pop();
  return words.join("");
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
  expectedCompany: string,
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

  const expectedCompanyKey = normalizedCompany(expectedCompany);
  const currentRole = workHistory(properties.workHistory)
    .find((role) => role.current && normalizedCompany(role.companyName) === expectedCompanyKey);
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
  return [
    LANE_QUERY[lane],
    `Employer: ${input.job.companyName}.`,
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
    return {
      results: Array.isArray(parsed?.results) ? parsed.results : [],
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
    companyName: input.job.companyName,
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

    const runs = await Promise.all(LANES.map(async (lane): Promise<LaneRun> => {
      try {
        const response = await search({ lane, query: buildExaPeopleQuery(input, lane) });
        const results = Array.isArray(response.results) ? response.results : [];
        const exactCompanyPeople: DiscoveredPerson[] = [];
        let companyMismatchCount = 0;
        let missingLinkedinCount = 0;
        results.forEach((result, index) => {
          const parsed = personFromResult(result, input.job.companyName, lane, index + 1);
          if (parsed.person) exactCompanyPeople.push(parsed.person);
          if (parsed.companyMismatch) companyMismatchCount += 1;
          if (parsed.missingLinkedin) missingLinkedinCount += 1;
        });
        return {
          lane,
          status: "completed",
          retrievedCount: results.length,
          exactCompanyPeople,
          companyMismatchCount,
          missingLinkedinCount,
        };
      } catch (error) {
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
