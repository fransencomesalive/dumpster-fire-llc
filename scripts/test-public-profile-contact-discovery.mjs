import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const rootDir = process.cwd();
const outDir = path.join(tmpdir(), "public-profile-contact-discovery-test-build");
const compile = spawnSync("npx", [
  "tsc",
  "--target",
  "ES2022",
  "--module",
  "commonjs",
  "--moduleResolution",
  "node",
  "--esModuleInterop",
  "--skipLibCheck",
  "--lib",
  "ES2022,DOM",
  "--outDir",
  outDir,
  "lib/public-profile/pursuits/contact-provider.ts",
  "lib/public-profile/pursuits/employer-identities.ts",
], {
  cwd: rootDir,
  stdio: "inherit",
});
if (compile.status !== 0) process.exit(compile.status ?? 1);

const {
  buildExaPeopleQuery,
  createExaHumanPathProvider,
} = await import(pathToFileURL(
  path.join(outDir, "public-profile/pursuits/contact-provider.js"),
).href);
const {
  relatedEmployerSearchTarget,
  resolveEmployerIdentities,
} = await import(pathToFileURL(
  path.join(outDir, "public-profile/pursuits/employer-identities.js"),
).href);

const pursuit = {
  id: "pursuit-1",
  userId: "user-1",
  profileId: "profile-1",
  jobId: "job-1",
  status: "review_complete",
  risks: [],
  recommendedWorkExampleIds: [],
  lastActivityAt: "2026-07-24T00:00:00.000Z",
  createdAt: "2026-07-24T00:00:00.000Z",
  updatedAt: "2026-07-24T00:00:00.000Z",
};

const providerInput = {
  pursuit,
  job: {
    id: "job-1",
    title: "Principal Machine Learning Platform Engineer",
    companyName: "Care Labs",
    description: "Build the machine learning platform used by clinical product teams.",
  },
  candidateContext: {
    roleTrackName: "Machine Learning Engineering",
    targetTitles: ["ML Platform Engineer", "AI Infrastructure Engineer"],
    keyResponsibilities: ["Build reliable model infrastructure"],
    targetIndustries: ["Healthcare technology"],
    skills: ["Python", "Kubernetes", "MLOps"],
  },
};

function personResult({
  name,
  title,
  company = "Care Labs, Inc.",
  url,
  current = true,
  resultTitle,
}) {
  return {
    title: resultTitle ?? `${name} | ${title}`,
    url: url ?? `https://www.linkedin.com/in/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    highlights: ["Provider-only evidence that must not be stored on the contact."],
    entities: [{
      id: `person-${name}`,
      type: "person",
      version: 1,
      properties: {
        name,
        workHistory: [{
          title,
          company: { name: company },
          dates: { from: "2025-01-01", to: current ? null : "2026-01-01" },
        }],
      },
    }],
  };
}

// Queries are derived from the actual opening and candidate profile. There is no
// company, industry, or career-family matrix in the provider.
for (const lane of ["likely_hiring_manager", "recruiter", "functional_leader"]) {
  const query = buildExaPeopleQuery(providerInput, lane);
  assert.match(query, /Care Labs/);
  assert.match(query, /Principal Machine Learning Platform Engineer/);
  assert.match(query, /MLOps/);
  assert.doesNotMatch(query, /Autodesk|Haldren|23 industries/i);
}

// No API key and no injected search function is a provider outage.
const unavailable = await createExaHumanPathProvider({ apiKey: "" })(providerInput);
assert.deepEqual(unavailable, {
  status: "provider_unavailable",
  reason: "Contact discovery is unavailable right now.",
});

const laneResults = {
  likely_hiring_manager: [
    personResult({
      name: "Priya Shah",
      title: "VP Machine Learning Platform",
      url: "https://in.linkedin.com/in/priya-shah?trk=public_profile",
    }),
    personResult({
      name: "Riley Chen",
      title: "Senior Machine Learning Engineer",
    }),
    personResult({
      name: "Wrong Company",
      title: "VP Engineering",
      company: "Care Lab Partners",
    }),
    personResult({
      name: "Former Employee",
      title: "Director of Engineering",
      current: false,
    }),
    personResult({
      name: "Missing LinkedIn",
      title: "Head of Platform",
      url: "https://example.com/missing-linkedin",
    }),
  ],
  recruiter: [
    personResult({
      name: "Sam Rivera",
      title: "Talent Acquisition Partner",
      company: "Care Labs",
    }),
  ],
  functional_leader: [
    personResult({
      name: "Morgan Bell",
      title: "Head of AI Infrastructure",
      company: "Care Labs LLC",
    }),
    personResult({
      name: "Priya Shah",
      title: "VP Machine Learning Platform",
      url: "https://www.linkedin.com/in/priya-shah/",
    }),
  ],
};

const queries = new Map();
const usageEvents = [];
const result = await createExaHumanPathProvider({
  search: async ({ lane, query }) => {
    queries.set(lane, query);
    return {
      results: laneResults[lane],
      requestId: `exa-${lane}`,
      costDollars: lane === "functional_leader" ? undefined : { total: 0.008 },
    };
  },
  recordUsage: async (event) => usageEvents.push(event),
  createId: () => "human-path-correlation-1",
})(providerInput);

assert.equal(result.status, "generated");
assert.equal(queries.size, 3, "all discovery lanes run independently");
assert.equal(result.contacts.length, 4, "useful contacts are not truncated to a five-contact quota");

const contactsByName = new Map(result.contacts.map((contact) => [contact.name, contact]));
assert.equal(contactsByName.get("Priya Shah")?.contactType, "likely_hiring_manager");
assert.equal(contactsByName.get("Sam Rivera")?.contactType, "recruiter");
assert.equal(contactsByName.get("Morgan Bell")?.contactType, "functional_leader");
assert.equal(contactsByName.get("Riley Chen")?.contactType, "other_useful_contact");
assert.equal(contactsByName.get("Riley Chen")?.confidence, "low");
assert.equal(
  contactsByName.get("Priya Shah")?.companyName,
  "Care Labs",
  "ordinary exact-company results retain the job's existing company label",
);
assert.equal(
  contactsByName.get("Priya Shah")?.linkedinUrl,
  "https://www.linkedin.com/in/priya-shah",
);
assert.equal("highlights" in contactsByName.get("Priya Shah"), false);
assert.match(
  contactsByName.get("Priya Shah")?.verificationNotes[0] ?? "",
  /Check the LinkedIn profile/,
);

assert.deepEqual(result.diagnostics.excluded, {
  companyMismatchCount: 2,
  missingLinkedinCount: 1,
  duplicateCount: 1,
});
assert.equal(result.diagnostics.retrievedCount, 8);
assert.equal(result.diagnostics.exactCompanyCount, 5);
assert.equal(result.diagnostics.returnedCount, 4);
assert.deepEqual(
  result.diagnostics.lanes.map((lane) => [
    lane.lane,
    lane.discoveryStatus,
    lane.retrievedCount,
    lane.exactCompanyCount,
    lane.returnedCount,
  ]),
  [
    ["likely_hiring_manager", "completed", 5, 2, 2],
    ["recruiter", "completed", 1, 1, 1],
    ["functional_leader", "completed", 2, 2, 2],
  ],
);
assert.equal(usageEvents.length, 3);
assert.deepEqual(
  usageEvents.map((event) => event.operation).sort(),
  [
    "human_path_people_search_functional_leader",
    "human_path_people_search_likely_hiring_manager",
    "human_path_people_search_recruiter",
  ],
);
assert.equal(
  usageEvents.every((event) =>
    event.userId === "user-1"
    && event.pursuitId === "pursuit-1"
    && event.jobId === "job-1"
    && event.requestCorrelationId === "human-path-correlation-1"
    && event.requestCount === 1),
  true,
);
assert.deepEqual(
  usageEvents.map((event) => event.estimatedCostMicros).sort(),
  [7_000, 8_000, 8_000],
);
assert.deepEqual(
  usageEvents.map((event) => event.resultCount).sort((left, right) => left - right),
  [1, 2, 5],
);

// Posting-backed employer relationships extend only this job's accepted
// identities. They do not weaken the exact-company boundary for normal jobs.
const brandedProviderInput = {
  ...providerInput,
  job: {
    ...providerInput.job,
    id: "job-branded-employer",
    title: "Senior Program Manager",
    companyName: "Haldren Group",
    description: [
      "Haldren is a premier recruitment agency and brand of Keller Executive Search, specializing in executive search.",
      "This is a position within Haldren and not with one of its clients.",
      "Lead cross-functional programs and governance across the United States.",
    ].join(" "),
  },
  candidateContext: {
    ...providerInput.candidateContext,
    roleTrackName: "Program Management",
    targetTitles: ["Senior Program Manager", "Program Director"],
  },
};

assert.deepEqual(
  resolveEmployerIdentities(brandedProviderInput.job).map(({ name, relationship }) => ({
    name,
    relationship,
  })),
  [
    { name: "Haldren Group", relationship: "primary" },
    { name: "Haldren", relationship: "posting_name" },
    { name: "Keller Executive Search", relationship: "brand" },
  ],
);
assert.equal(
  relatedEmployerSearchTarget(brandedProviderInput.job)?.name,
  "Keller Executive Search",
);

const brandedQueries = [];
const brandedResult = await createExaHumanPathProvider({
  search: async ({ lane, query }) => {
    brandedQueries.push({ lane, query });
    if (lane === "recruiter") {
      return {
        results: [
          personResult({
            name: "Kate Coleby",
            title: "Senior Recruiter",
            company: "Keller Executive Search",
          }),
          personResult({
            name: "Unrelated Recruiter",
            title: "Senior Recruiter",
            company: "Client Company",
          }),
        ],
      };
    }
    if (lane === "functional_leader") {
      return {
        results: [personResult({
          name: "Haldren Leader",
          title: "Managing Director",
          company: "Haldren",
        })],
      };
    }
    return { results: [] };
  },
})(brandedProviderInput);

assert.equal(brandedQueries.length, 3, "posting-backed identities add no provider pass");
assert.equal(
  brandedQueries.every(({ query }) =>
    query.includes("Haldren Group")
    && query.includes("Haldren")
    && query.includes("Keller Executive Search")
    && query.includes("not for one of its clients")),
  true,
);
assert.equal(brandedResult.status, "generated");
assert.deepEqual(
  brandedResult.contacts.map(({ name, companyName }) => ({ name, companyName })),
  [
    { name: "Haldren Leader", companyName: "Haldren" },
    { name: "Kate Coleby", companyName: "Keller Executive Search" },
  ],
);
assert.equal(brandedResult.diagnostics.retrievedCount, 3);
assert.equal(brandedResult.diagnostics.exactCompanyCount, 2);
assert.equal(brandedResult.diagnostics.excluded.companyMismatchCount, 1);

const ambiguousRelationshipJob = {
  ...brandedProviderInput.job,
  description: "Haldren partners with Keller Executive Search and works with clients worldwide.",
};
assert.deepEqual(
  resolveEmployerIdentities(ambiguousRelationshipJob).map(({ name }) => name),
  ["Haldren Group"],
  "vague partnerships never become accepted employer identities",
);
assert.equal(relatedEmployerSearchTarget(ambiguousRelationshipJob), undefined);

const unrelatedRelationshipJob = {
  ...brandedProviderInput.job,
  description: "Example Client is a brand of Unrelated Holdings. This role is at Haldren.",
};
assert.deepEqual(
  resolveEmployerIdentities(unrelatedRelationshipJob).map(({ name }) => name),
  ["Haldren Group"],
  "an explicit relationship about another company never expands the target employer",
);

// A single unavailable lane does not suppress useful results from other lanes.
const originalConsoleError = console.error;
console.error = () => {};
try {
  const partialUsageEvents = [];
  const partial = await createExaHumanPathProvider({
    search: async ({ lane }) => {
      if (lane === "functional_leader") throw new Error("temporary outage");
      if (lane === "recruiter") {
        return {
          results: [personResult({
            name: "Avery Jordan",
            title: "Senior Recruiter",
            company: "Care Labs",
          })],
        };
      }
      return { results: [] };
    },
    recordUsage: async (event) => partialUsageEvents.push(event),
    createId: () => "human-path-partial",
  })(providerInput);
  assert.equal(partial.status, "generated");
  assert.deepEqual(partial.contacts.map((contact) => contact.name), ["Avery Jordan"]);
  assert.equal(
    partial.diagnostics.lanes.find((lane) => lane.lane === "functional_leader")?.discoveryStatus,
    "provider_unavailable",
  );
  assert.equal(partialUsageEvents.length, 3);
  assert.equal(
    partialUsageEvents.find((event) =>
      event.operation.endsWith("functional_leader"))?.outcome,
    "failure",
  );
  assert.equal(
    partialUsageEvents.find((event) =>
      event.operation.endsWith("recruiter"))?.outcome,
    "success",
  );
  assert.equal(
    partialUsageEvents.find((event) =>
      event.operation.endsWith("likely_hiring_manager"))?.outcome,
    "empty",
  );

  const fullyUnavailable = await createExaHumanPathProvider({
    search: async () => {
      throw new Error("provider unavailable");
    },
  })(providerInput);
  assert.equal(fullyUnavailable.status, "provider_unavailable");

  const survivesUsageFailure = await createExaHumanPathProvider({
    search: async () => ({ results: [] }),
    recordUsage: async () => {
      throw new Error("telemetry unavailable");
    },
  })(providerInput);
  assert.equal(survivesUsageFailure.status, "generated");
} finally {
  console.error = originalConsoleError;
}

// The production HTTP adapter uses the documented People Search request without
// unsupported domain or date filters.
const requestBodies = [];
const fetched = await createExaHumanPathProvider({
  apiKey: "test-exa-key",
  fetch: async (url, init) => {
    assert.equal(url, "https://api.exa.ai/search");
    assert.equal(init?.method, "POST");
    assert.equal(init?.headers?.Authorization, "Bearer test-exa-key");
    const requestBody = JSON.parse(String(init?.body));
    requestBodies.push(requestBody);
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
})(providerInput);
assert.equal(fetched.status, "generated");
assert.equal(requestBodies.length, 3);
for (const requestBody of requestBodies) {
  assert.equal(requestBody.type, "auto");
  assert.equal(requestBody.category, "people");
  assert.equal(requestBody.numResults, 10);
  assert.deepEqual(requestBody.contents, { highlights: true });
  assert.equal("includeDomains" in requestBody, false);
  assert.equal("excludeDomains" in requestBody, false);
  assert.equal("startPublishedDate" in requestBody, false);
  assert.equal("endPublishedDate" in requestBody, false);
}

console.log("public-profile contact discovery fixtures passed");
