import assert from "node:assert/strict";
import {
  buildBroadDiscoveryPrompt,
  buildBroadProfileVerificationPrompt,
  buildLaneDiscoveryPrompt,
  buildEmployerRosterPrompt,
  buildOrganizationLeadershipPrompt,
  buildProfileVerificationPrompt,
  buildUserPrompt,
  contactSearchBudget,
  createOpenAIHumanPathProvider,
  parseProfileVerifications,
  parseResearchedContacts,
  resolveEmployerIdentities,
} from "../lib/public-profile/pursuits/contact-provider.ts";

const pursuit = { id: "pursuit-1" };
const job = {
  id: "job-1",
  title: "Programmatic Media Director",
  companyName: "Useful Studio",
  description: "Own paid media and performance marketing for a growth-stage brand.",
};

function candidate(name, title, linkedinUrl, overrides = {}) {
  return {
    ...overrides,
    name,
    title,
    companyName: overrides.companyName ?? "Useful Studio",
    linkedinUrl,
    evidenceUrl: overrides.evidenceUrl ?? linkedinUrl,
    confidence: overrides.confidence ?? 90,
    reason: overrides.reason ?? "Current public evidence supports this candidate.",
    roleConnection: overrides.roleConnection ?? "Connection requires independent verification.",
    ...(overrides.candidateRole ? { candidateRole: overrides.candidateRole } : {}),
  };
}

function verification(candidateKey, currentName, currentTitle, lane, overrides = {}) {
  const currentCompany = overrides.currentCompany ?? "Useful Studio";
  const linkedinUrl = overrides.linkedinUrl ?? `https://www.linkedin.com/in/${currentName.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  const classificationEvidenceText = overrides.classificationEvidenceText
    ?? (lane === "likely_hiring_manager"
      ? `${currentName} leads the Programmatic Media team and is hiring for the group.`
      : lane === "functional_leader"
        ? `${currentName} leads the Programmatic Media practice.`
        : `${currentTitle} at ${currentCompany}`);
  return {
    candidateKey,
    currentName,
    linkedinHeadline: overrides.linkedinHeadline ?? currentTitle,
    linkedinHeadlineEvidenceText: overrides.linkedinHeadlineEvidenceText ?? `${currentName} | ${currentTitle}`,
    currentTitle,
    currentTitleSource: overrides.currentTitleSource ?? "linkedin_experience",
    currentCompany,
    currentRoleEvidenceText: overrides.currentRoleEvidenceText ?? currentTitle,
    currentRoleEvidenceUrl: overrides.currentRoleEvidenceUrl ?? linkedinUrl,
    currentCompanyEvidenceText: overrides.currentCompanyEvidenceText ?? `${currentName} works at ${currentCompany}`,
    currentCompanyEvidenceUrl: overrides.currentCompanyEvidenceUrl ?? linkedinUrl,
    currentRoleIsCurrent: overrides.currentRoleIsCurrent ?? true,
    linkedinUrl,
    identityMatches: overrides.identityMatches ?? true,
    companyMatches: overrides.companyMatches ?? true,
    classificationSupported: overrides.classificationSupported ?? true,
    classificationEvidenceText,
    classificationEvidenceUrl: overrides.classificationEvidenceUrl ?? linkedinUrl,
    relevanceStatus: overrides.relevanceStatus ?? "plausible",
    relevanceEvidenceText: overrides.relevanceEvidenceText ?? classificationEvidenceText,
    relevanceEvidenceUrl: overrides.relevanceEvidenceUrl ?? linkedinUrl,
    alignmentSignals: overrides.alignmentSignals ?? ["Public evidence supports a plausible role connection."],
    conflictSignals: overrides.conflictSignals ?? [],
    confidence: overrides.confidence ?? 90,
    reason: overrides.reason ?? `Verified current ${lane} contact.`,
    roleConnection: overrides.roleConnection ?? `Verified ${lane} connection.`,
  };
}

function laneFixtureProvider({
  discovery,
  verifications,
  organizationLeadership = [],
  rosterFallback = [],
}) {
  return createOpenAIHumanPathProvider({
    callModel: async ({ phase, strategy, user, lane }) => {
      assert.ok(phase, "provider calls identify discovery or verification");
      if (phase === "discovery") {
        if (strategy === "roster_fallback") {
          const prompt = JSON.parse(user);
          assert.match(prompt.task, /broad public employee roster/i);
          assert.equal("categories" in prompt, false);
          return JSON.stringify({
            contacts: rosterFallback.map((contact) => ({
              ...contact,
              candidateRole: contact.candidateRole ?? "recruiter",
            })),
          });
        }
        assert.equal(strategy, "category");
        assert.ok(lane, "category discovery identifies its requested lane");
        const laneRows = discovery[lane];
        if (laneRows === undefined) return undefined;
        const contacts = laneRows.map((contact) => ({ ...contact, candidateRole: lane }));
        if (lane === "likely_hiring_manager" || lane === "functional_leader") {
          for (const contact of organizationLeadership) {
            contacts.push({ ...contact, candidateRole: lane });
          }
        }
        return JSON.stringify({ contacts });
      }
      const prompt = JSON.parse(user);
      return JSON.stringify({
        verifications: prompt.untrustedCandidates.flatMap((candidate) => {
          const rows = verifications[candidate.requestedLane] ?? [];
          const row = rows.find((verificationRow) => verificationRow.currentName === candidate.claimedName);
          return row ? [{ ...row, candidateKey: candidate.candidateKey }] : [];
        }),
      });
    },
  });
}

// All three category searches failing is a provider outage, not a legitimate zero result.
const unavailable = await createOpenAIHumanPathProvider({
  callModel: async () => undefined,
})({ pursuit, job });
assert.equal(unavailable.status, "provider_unavailable");
assert.equal(unavailable.reason, "Contact discovery is unavailable right now.");

// Category discovery and verification are independent. The deterministic assembler puts one
// contact from every category near the top, then retains every useful result without a hard cap.
const variedProvider = laneFixtureProvider({
  discovery: {
    likely_hiring_manager: [
      candidate("Dana Lee", "Director, Programmatic Media", "https://www.linkedin.com/in/dana-lee"),
      candidate("Taylor Reed", "Paid Media Team Manager", "https://www.linkedin.com/in/taylor-reed"),
      candidate("Jordan Bell", "Group Media Director", "https://www.linkedin.com/in/jordan-bell"),
      candidate("Robin Park", "Media Practice Lead", "https://www.linkedin.com/in/robin-park"),
    ],
    recruiter: [
      candidate("Rene Ortiz", "Principal Recruiter", "https://www.linkedin.com/in/rene-ortiz"),
      candidate("Quinn Patel", "Talent Acquisition Partner", "https://www.linkedin.com/in/quinn-patel"),
      candidate("Sam Rivera", "Senior Recruiter", "https://www.linkedin.com/in/sam-rivera"),
      candidate("Alex Morgan", "Talent Partner", "https://www.linkedin.com/in/alex-morgan"),
    ],
    functional_leader: [
      candidate("Morgan Chen", "VP, Programmatic Media", "https://www.linkedin.com/in/morgan-chen"),
      candidate("Avery Shah", "Head of Paid Media", "https://www.linkedin.com/in/avery-shah"),
      candidate("Cameron Wells", "Managing Director, Media", "https://www.linkedin.com/in/cameron-wells"),
      candidate("Drew Wilson", "Performance Media Lead", "https://www.linkedin.com/in/drew-wilson"),
    ],
  },
  verifications: {
    likely_hiring_manager: [
      verification("0", "Dana Lee", "Director, Programmatic Media", "likely_hiring_manager"),
      verification("1", "Taylor Reed", "Paid Media Team Manager", "likely_hiring_manager", {
        classificationEvidenceText: "Taylor Reed manages the Paid Media team and is hiring for the group.",
      }),
      verification("2", "Jordan Bell", "Group Media Director", "likely_hiring_manager", {
        classificationEvidenceText: "Jordan Bell is Group Media Director for the Programmatic Media organization.",
      }),
      verification("3", "Robin Park", "Media Practice Lead", "likely_hiring_manager"),
    ],
    recruiter: [
      verification("0", "Rene Ortiz", "Principal Recruiter", "recruiter"),
      verification("1", "Quinn Patel", "Talent Acquisition Partner", "recruiter"),
      verification("2", "Sam Rivera", "Senior Recruiter", "recruiter"),
      verification("3", "Alex Morgan", "Talent Partner", "recruiter"),
    ],
    functional_leader: [
      verification("0", "Morgan Chen", "VP, Programmatic Media", "functional_leader"),
      verification("1", "Avery Shah", "Head of Paid Media", "functional_leader"),
      verification("2", "Cameron Wells", "Managing Director, Media", "functional_leader"),
      verification("3", "Drew Wilson", "Performance Media Lead", "functional_leader"),
    ],
  },
});
const varied = await variedProvider({ pursuit, job });
assert.equal(varied.status, "generated");
assert.equal(varied.contacts.length, 12);
assert.deepEqual(
  varied.contacts.map((contact) => contact.contactType),
  [
    "likely_hiring_manager", "recruiter", "functional_leader",
    "likely_hiring_manager", "recruiter", "functional_leader",
    "likely_hiring_manager", "recruiter", "functional_leader",
    "likely_hiring_manager", "recruiter", "functional_leader",
  ],
);
assert.equal(varied.diagnostics.assembledCount, 12);
assert.deepEqual(
  varied.diagnostics.lanes.map((lane) => [lane.lane, lane.acceptedCount]),
  [
    ["likely_hiring_manager", 4],
    ["recruiter", 4],
    ["functional_leader", 4],
  ],
);

// A missing category remains visible in diagnostics and never suppresses another lane.
const partialProvider = laneFixtureProvider({
  discovery: {
    likely_hiring_manager: [],
    recruiter: [candidate("Rene Ortiz", "Principal Recruiter", "https://www.linkedin.com/in/rene-ortiz")],
    functional_leader: undefined,
  },
  verifications: {
    recruiter: [verification("0", "Rene Ortiz", "Principal Recruiter", "recruiter")],
  },
});
const partial = await partialProvider({ pursuit, job });
assert.equal(partial.status, "generated");
assert.deepEqual(partial.contacts.map((contact) => contact.contactType), ["recruiter"]);
assert.equal(
  partial.diagnostics.lanes.find((lane) => lane.lane === "functional_leader")?.discoveryStatus,
  "provider_unavailable",
);
assert.equal(
  partial.diagnostics.lanes.find((lane) => lane.lane === "likely_hiring_manager")?.acceptedCount,
  0,
);

// Partial verification output is diagnosed without triggering per-person web searches.
// The foreground budget remains three parallel discovery calls plus one verification call.
const recoveryCandidates = [
  candidate("Rene Ortiz", "Principal Recruiter", "https://www.linkedin.com/in/rene-ortiz"),
  candidate("Quinn Patel", "Talent Acquisition Partner", "https://www.linkedin.com/in/quinn-patel"),
  candidate("Sam Rivera", "Senior Recruiter", "https://www.linkedin.com/in/sam-rivera"),
  candidate("Alex Morgan", "Talent Partner", "https://www.linkedin.com/in/alex-morgan"),
];
const recoveryRows = recoveryCandidates.map((contact, index) => (
  verification(String(index), contact.name, contact.title, "recruiter")
));
const verificationBatchSizes = [];
let boundedModelCalls = 0;
const partialVerificationProvider = createOpenAIHumanPathProvider({
  callModel: async ({ phase, user, lane }) => {
    boundedModelCalls += 1;
    if (phase === "discovery") {
      if (lane !== "recruiter") return JSON.stringify({ contacts: [] });
      return JSON.stringify({
        contacts: recoveryCandidates.map((contact) => ({
          ...contact,
          candidateRole: "recruiter",
        })),
      });
    }
    const prompt = JSON.parse(user);
    verificationBatchSizes.push(prompt.untrustedCandidates.length);
    return JSON.stringify({
      verifications: prompt.untrustedCandidates.slice(0, 1).map((candidate) => {
        const row = recoveryRows.find((verificationRow) => verificationRow.currentName === candidate.claimedName);
        return { ...row, candidateKey: candidate.candidateKey };
      }),
    });
  },
});
const recoveredPartialVerification = await partialVerificationProvider({ pursuit, job });
assert.equal(recoveredPartialVerification.status, "generated");
assert.equal(recoveredPartialVerification.contacts.length, 1);
assert.deepEqual(verificationBatchSizes, [4]);
assert.equal(boundedModelCalls, 4);
assert.equal(
  recoveredPartialVerification.diagnostics.lanes.find((lane) => lane.lane === "recruiter")?.rejected.length,
  3,
);

// Posting-backed employer identities are searched and accepted without opening
// the door to unrelated agencies or inferred affiliates.
const brandedEmployerJob = {
  id: "job-branded-employer",
  title: "Senior Program Manager",
  companyName: "Northstar Advisory",
  description: "Northstar Advisory is a premier recruitment agency and brand of Summit Talent Partners, specializing in executive search. This is a position within Northstar Advisory and not with one of its clients.",
};
assert.deepEqual(
  resolveEmployerIdentities(brandedEmployerJob).map(({ name, relationship }) => ({ name, relationship })),
  [
    { name: "Northstar Advisory", relationship: "primary" },
    { name: "Summit Talent Partners", relationship: "brand" },
  ],
);
assert.deepEqual(
  resolveEmployerIdentities({
    ...brandedEmployerJob,
    description: "We work with clients and recruiting partners around the world.",
  }).map((identity) => identity.name),
  ["Northstar Advisory"],
);

function evidenceCompleteCandidate(name, title, linkedinUrl, companyName, classificationEvidenceText) {
  return candidate(name, title, linkedinUrl, {
    companyName,
    currentTitleSource: "organization_directory",
    identityEvidenceText: `${name} public profile`,
    identityEvidenceUrl: linkedinUrl,
    currentRoleEvidenceText: title,
    currentRoleEvidenceUrl: linkedinUrl,
    currentCompanyEvidenceText: `${name} works at ${companyName}`,
    currentCompanyEvidenceUrl: linkedinUrl,
    classificationEvidenceText,
    classificationEvidenceUrl: linkedinUrl,
    relevanceStatus: "unknown",
    relevanceEvidenceText: "",
    relevanceEvidenceUrl: "",
    conflictSignals: [],
  });
}

// Evidence-complete discovery is reconciled deterministically, avoiding a
// redundant second model call and web-search context.
let evidenceCompleteModelCalls = 0;
const evidenceCompleteProvider = createOpenAIHumanPathProvider({
  callModel: async ({ phase, lane }) => {
    evidenceCompleteModelCalls += 1;
    assert.equal(phase, "discovery");
    if (lane !== "recruiter") return JSON.stringify({ contacts: [] });
    return JSON.stringify({
      contacts: [
        evidenceCompleteCandidate(
          "Avery Torres",
          "Recruiter",
          "https://www.linkedin.com/in/avery-torres",
          "Summit Talent Partners",
          "Avery Torres recruits experienced professionals for executive searches.",
        ),
        evidenceCompleteCandidate(
          "Jordan Patel",
          "Senior Partner",
          "https://www.linkedin.com/in/jordan-patel",
          "Summit Talent Partners",
          "Jordan Patel leads executive search engagements and helps clients hire senior leaders.",
        ),
        evidenceCompleteCandidate(
          "Morgan Lee",
          "Consultant",
          "https://www.linkedin.com/in/morgan-lee",
          "Northstar Advisory",
          "Morgan Lee supports recruiting and executive search at Northstar Advisory.",
        ),
      ].map((contact) => ({ ...contact, candidateRole: "recruiter" })),
    });
  },
});
const evidenceComplete = await evidenceCompleteProvider({ pursuit, job: brandedEmployerJob });
assert.equal(evidenceCompleteModelCalls, 3);
assert.deepEqual(
  evidenceComplete.contacts.map((contact) => [contact.name, contact.title]),
  [
    ["Avery Torres", "Recruiter"],
    ["Jordan Patel", "Senior Partner"],
    ["Morgan Lee", "Consultant"],
  ],
);

// Mixed evidence verifies only unresolved candidates and remaps their local
// verification keys back into the full discovery batch.
let mixedEvidenceModelCalls = 0;
let mixedVerificationBatchSize = 0;
const mixedEvidenceProvider = createOpenAIHumanPathProvider({
  callModel: async ({ phase, user, lane }) => {
    mixedEvidenceModelCalls += 1;
    if (phase === "discovery") {
      if (lane !== "recruiter") return JSON.stringify({ contacts: [] });
      return JSON.stringify({
        contacts: [
          {
            ...evidenceCompleteCandidate(
              "Avery Torres",
              "Recruiter",
              "https://www.linkedin.com/in/avery-torres",
              "Summit Talent Partners",
              "Avery Torres recruits experienced professionals for executive searches.",
            ),
            candidateRole: "recruiter",
          },
          {
            ...candidate(
              "Jordan Patel",
              "Senior Partner",
              "https://www.linkedin.com/in/jordan-patel",
              { companyName: "Summit Talent Partners" },
            ),
            candidateRole: "recruiter",
          },
        ],
      });
    }
    const prompt = JSON.parse(user);
    mixedVerificationBatchSize = prompt.untrustedCandidates.length;
    return JSON.stringify({
      verifications: [verification("0", "Jordan Patel", "Senior Partner", "recruiter", {
        currentCompany: "Summit Talent Partners",
        linkedinUrl: "https://www.linkedin.com/in/jordan-patel",
        classificationEvidenceText: "Jordan Patel leads executive search engagements.",
      })],
    });
  },
});
const mixedEvidence = await mixedEvidenceProvider({ pursuit, job: brandedEmployerJob });
assert.equal(mixedEvidenceModelCalls, 4);
assert.equal(mixedVerificationBatchSize, 1);
assert.deepEqual(
  mixedEvidence.contacts.map((contact) => contact.name).sort(),
  ["Avery Torres", "Jordan Patel"],
);

// A shortened discovery title cannot qualify as evidence-complete when the
// verbatim title evidence contains a different title. The verified exact title
// is the only one that may be presented.
const airbnbRecruiterJob = {
  id: "job-airbnb-recruiter",
  title: "Program Manager",
  companyName: "Airbnb",
  description: "Lead product programs across design and engineering.",
};
let titleReconciliationCalls = 0;
const titleReconciliationProvider = createOpenAIHumanPathProvider({
  callModel: async ({ phase, lane }) => {
    titleReconciliationCalls += 1;
    if (phase === "discovery") {
      if (lane !== "recruiter") return JSON.stringify({ contacts: [] });
      return JSON.stringify({
        contacts: [{
          ...evidenceCompleteCandidate(
            "Sarah Kim",
            "Principal Recruiter, Product",
            "https://www.linkedin.com/in/sarah-kim",
            "Airbnb",
            "Sarah Kim recruits product and design leaders at Airbnb.",
          ),
          currentRoleEvidenceText: "Principal Recruiter, Product and Design",
          candidateRole: "recruiter",
        }],
      });
    }
    return JSON.stringify({
      verifications: [verification("0", "Sarah Kim", "Principal Recruiter, Product and Design", "recruiter", {
        currentCompany: "Airbnb",
        linkedinUrl: "https://www.linkedin.com/in/sarah-kim",
        currentRoleEvidenceText: "Principal Recruiter, Product and Design",
        currentCompanyEvidenceText: "Sarah Kim works at Airbnb",
      })],
    });
  },
});
const titleReconciliation = await titleReconciliationProvider({ pursuit, job: airbnbRecruiterJob });
assert.equal(titleReconciliationCalls, 4);
assert.equal(titleReconciliation.contacts[0]?.title, "Principal Recruiter, Product and Design");

const brandedEmployerProvider = laneFixtureProvider({
  discovery: {
    likely_hiring_manager: [],
    recruiter: [candidate("Avery Torres", "Recruiter", "https://www.linkedin.com/in/avery-torres", {
      companyName: "Summit Talent Partners",
    })],
    functional_leader: [],
  },
  verifications: {
    recruiter: [verification("0", "Avery Torres", "Recruiter", "recruiter", {
      currentCompany: "Summit Talent Partners",
      companyMatches: false,
      linkedinUrl: "https://www.linkedin.com/in/avery-torres",
    })],
  },
});
const brandedEmployer = await brandedEmployerProvider({ pursuit, job: brandedEmployerJob });
assert.equal(brandedEmployer.status, "generated");
assert.deepEqual(brandedEmployer.contacts.map((contact) => contact.name), ["Avery Torres"]);

// A cost-bounded verification pass may be unable to independently reopen every
// public profile it receives. Preserve discovery-backed recruiters at low
// confidence, but never repeat an unverified title or override a contradiction.
const incompleteVerificationProvider = laneFixtureProvider({
  discovery: {
    likely_hiring_manager: [],
    recruiter: [
      candidate("Avery Torres", "Recruiter", "https://www.linkedin.com/in/avery-torres", {
        companyName: "Summit Talent Partners",
      }),
      candidate("Jordan Patel", "Executive Search Partner", "https://www.linkedin.com/in/jordan-patel", {
        companyName: "Summit Talent Partners",
      }),
      candidate("Morgan Lee", "Recruiter", "https://www.linkedin.com/in/morgan-lee", {
        companyName: "Northstar Advisory",
      }),
      candidate("Wrong Profile", "Recruiter", "https://www.linkedin.com/in/wrong-profile", {
        companyName: "Northstar Advisory",
      }),
    ],
    functional_leader: [],
  },
  verifications: {
    recruiter: [
      ...[
        "Avery Torres",
        "Jordan Patel",
        "Morgan Lee",
      ].map((name, index) => verification(String(index), name, "", "recruiter", {
        currentTitleSource: "",
        currentCompany: "",
        currentRoleEvidenceText: "",
        currentRoleEvidenceUrl: "",
        currentCompanyEvidenceText: "",
        currentCompanyEvidenceUrl: "",
        linkedinUrl: "",
        identityMatches: false,
        companyMatches: false,
        classificationSupported: false,
        classificationEvidenceText: "",
        classificationEvidenceUrl: "",
        relevanceStatus: "unknown",
        relevanceEvidenceText: "",
        relevanceEvidenceUrl: "",
        confidence: 0,
        roleConnection: "",
      })),
      verification("3", "Wrong Profile", "", "recruiter", {
        currentTitleSource: "",
        currentCompany: "",
        currentRoleEvidenceText: "",
        currentRoleEvidenceUrl: "",
        currentCompanyEvidenceText: "",
        currentCompanyEvidenceUrl: "",
        linkedinUrl: "https://www.linkedin.com/in/different-person",
        identityMatches: false,
        companyMatches: false,
        classificationSupported: false,
        classificationEvidenceText: "",
        classificationEvidenceUrl: "",
        relevanceStatus: "unknown",
        relevanceEvidenceText: "",
        relevanceEvidenceUrl: "",
        confidence: 0,
        roleConnection: "",
      }),
    ],
  },
});
const incompleteVerification = await incompleteVerificationProvider({ pursuit, job: brandedEmployerJob });
assert.deepEqual(
  incompleteVerification.contacts.map((contact) => [
    contact.name,
    contact.title,
    contact.linkedinUrl,
    contact.confidence,
  ]),
  [
    ["Avery Torres", "", "https://www.linkedin.com/in/avery-torres", "low"],
    ["Jordan Patel", "", "https://www.linkedin.com/in/jordan-patel", "low"],
    ["Morgan Lee", "", "https://www.linkedin.com/in/morgan-lee", "low"],
  ],
);
assert.equal(
  incompleteVerification.diagnostics.lanes.find((lane) => lane.lane === "recruiter")
    ?.rejected.some((row) => row.name === "Wrong Profile"),
  true,
);

const rosterSeededProvider = laneFixtureProvider({
  discovery: {
    likely_hiring_manager: [],
    recruiter: [],
    functional_leader: [],
  },
  rosterFallback: [
    candidate("Avery Torres", "Recruiter", "https://www.linkedin.com/in/avery-torres", {
      companyName: "Summit Talent Partners",
    }),
    candidate("Cameron Brooks", "", "https://www.linkedin.com/in/cameron-brooks", {
      companyName: "Summit Talent Partners",
      evidenceUrl: "https://www.linkedin.com/company/summit-talent-partners",
    }),
  ],
  verifications: {
    recruiter: [
      verification("0", "Avery Torres", "Recruiter", "recruiter", {
        currentCompany: "Summit Talent Partners",
        linkedinUrl: "https://www.linkedin.com/in/avery-torres",
      }),
      verification("1", "Cameron Brooks", "Senior Recruitment Consultant", "recruiter", {
        currentCompany: "Summit Talent Partners",
        linkedinUrl: "https://www.linkedin.com/in/cameron-brooks",
        currentTitleSource: "organization_directory",
        currentRoleEvidenceText: "Senior Recruitment Consultant",
        currentRoleEvidenceUrl: "https://www.summittalentpartners.com/press/",
        currentCompanyEvidenceText: "Cameron Brooks of Summit Talent Partners",
        currentCompanyEvidenceUrl: "https://www.summittalentpartners.com/press/",
      }),
    ],
  },
});
const rosterSeeded = await rosterSeededProvider({ pursuit, job: brandedEmployerJob });
assert.deepEqual(rosterSeeded.contacts.map((contact) => [contact.name, contact.title]), [
  ["Avery Torres", "Recruiter"],
  ["Cameron Brooks", "Senior Recruitment Consultant"],
]);

const titleUnavailableProvider = laneFixtureProvider({
  discovery: {
    likely_hiring_manager: [],
    recruiter: [],
    functional_leader: [],
  },
  rosterFallback: [
    candidate("Avery Torres", "", "https://www.linkedin.com/in/avery-torres", {
      companyName: "Summit Talent Partners",
    }),
    candidate("Jordan Patel", "", "https://www.linkedin.com/in/jordan-patel", {
      companyName: "Summit Talent Partners",
    }),
  ],
  verifications: {
    recruiter: [
      verification("0", "Avery Torres", "", "recruiter", {
        currentTitleSource: "",
        currentCompany: "Summit Talent Partners",
        currentRoleEvidenceText: "",
        currentRoleEvidenceUrl: "",
        currentCompanyEvidenceText: "Avery Torres works at Summit Talent Partners",
        currentCompanyEvidenceUrl: "https://www.linkedin.com/in/avery-torres",
        linkedinUrl: "https://www.linkedin.com/in/avery-torres",
        classificationSupported: true,
        classificationEvidenceText: "I recruit experienced professionals for client searches.",
        classificationEvidenceUrl: "https://www.linkedin.com/in/avery-torres",
        relevanceStatus: "unknown",
        relevanceEvidenceText: "",
        relevanceEvidenceUrl: "",
      }),
      verification("1", "Jordan Patel", "", "recruiter", {
        currentTitleSource: "",
        currentCompany: "Summit Talent Partners",
        currentRoleEvidenceText: "",
        currentRoleEvidenceUrl: "",
        currentCompanyEvidenceText: "Jordan Patel works at Summit Talent Partners",
        currentCompanyEvidenceUrl: "https://www.linkedin.com/in/jordan-patel",
        linkedinUrl: "https://www.linkedin.com/in/jordan-patel",
        classificationSupported: false,
        classificationEvidenceText: "",
        classificationEvidenceUrl: "",
        relevanceStatus: "unknown",
        relevanceEvidenceText: "",
        relevanceEvidenceUrl: "",
      }),
    ],
  },
});
const titleUnavailable = await titleUnavailableProvider({ pursuit, job: brandedEmployerJob });
assert.deepEqual(titleUnavailable.contacts.map((contact) => [contact.name, contact.title, contact.confidence]), [
  ["Avery Torres", "", "medium"],
]);
assert.deepEqual(
  titleUnavailable.diagnostics.lanes.find((lane) => lane.lane === "recruiter")?.rejected.find((row) => row.name === "Jordan Patel")?.reasonCodes,
  ["classification_unverified"],
);

const recoveredClassificationProvider = laneFixtureProvider({
  discovery: {
    likely_hiring_manager: [],
    recruiter: [],
    functional_leader: [],
  },
  rosterFallback: [
    candidate("Riley Morgan", "", "https://www.linkedin.com/in/riley-morgan", {
      companyName: "Summit Talent Partners",
    }),
    candidate("Casey Parker", "", "https://www.linkedin.com/in/casey-parker", {
      companyName: "Summit Talent Partners",
    }),
    candidate("Taylor Quinn", "Partner", "https://www.linkedin.com/in/taylor-quinn", {
      companyName: "Summit Talent Partners",
    }),
    candidate("Morgan Search", "Executive Search Consultant", "https://www.linkedin.com/in/morgan-search", {
      companyName: "Summit Talent Partners",
    }),
    candidate("Avery Key", "Partner", "https://www.linkedin.com/in/avery-key", {
      companyName: "Summit Talent Partners",
      reason: "Avery Key helps companies hire senior leaders.",
    }),
  ],
  verifications: {
    recruiter: [
      verification("0", "Riley Morgan", "", "recruiter", {
        currentTitleSource: "",
        currentCompany: "Summit Talent Partners",
        currentRoleEvidenceText: "",
        currentRoleEvidenceUrl: "",
        currentCompanyEvidenceText: "Riley Morgan works at Summit Talent Partners",
        currentCompanyEvidenceUrl: "https://www.linkedin.com/in/riley-morgan",
        linkedinUrl: "",
        classificationSupported: true,
        classificationEvidenceText: "Riley Morgan helps companies hire senior leaders.",
        classificationEvidenceUrl: "https://www.linkedin.com/in/riley-morgan",
        relevanceStatus: "unknown",
        relevanceEvidenceText: "",
        relevanceEvidenceUrl: "",
      }),
      verification("1", "Casey Parker", "", "recruiter", {
        currentTitleSource: "",
        currentCompany: "Summit Talent Partners",
        currentRoleEvidenceText: "",
        currentRoleEvidenceUrl: "",
        currentCompanyEvidenceText: "Casey Parker works at Summit Talent Partners",
        currentCompanyEvidenceUrl: "https://www.linkedin.com/in/casey-parker",
        linkedinUrl: "https://www.linkedin.com/in/casey-parker",
        classificationSupported: false,
        classificationEvidenceText: "",
        classificationEvidenceUrl: "",
        relevanceStatus: "unknown",
        relevanceEvidenceText: "",
        relevanceEvidenceUrl: "",
      }),
      verification("2", "Taylor Quinn", "Partner", "recruiter", {
        currentCompany: "Summit Talent Partners",
        currentRoleEvidenceText: "Partner",
        currentRoleEvidenceUrl: "https://www.linkedin.com/in/taylor-quinn",
        currentCompanyEvidenceText: "Partner at Summit Talent Partners",
        currentCompanyEvidenceUrl: "https://www.linkedin.com/in/taylor-quinn",
        linkedinUrl: "https://www.linkedin.com/in/taylor-quinn",
        classificationSupported: true,
        classificationEvidenceText: "Taylor Quinn leads executive searches and helps clients hire senior leaders.",
        classificationEvidenceUrl: "https://www.linkedin.com/in/taylor-quinn",
        relevanceStatus: "unknown",
        relevanceEvidenceText: "",
        relevanceEvidenceUrl: "",
      }),
      verification("3", "Morgan Search", "", "recruiter", {
        currentTitleSource: "",
        currentCompany: "Summit Talent Partners",
        currentRoleEvidenceText: "",
        currentRoleEvidenceUrl: "",
        currentCompanyEvidenceText: "Morgan Search works at Summit Talent Partners",
        currentCompanyEvidenceUrl: "https://www.linkedin.com/in/morgan-search",
        linkedinUrl: "https://www.linkedin.com/in/morgan-search",
        classificationSupported: false,
        classificationEvidenceText: "",
        classificationEvidenceUrl: "",
        relevanceStatus: "unknown",
        relevanceEvidenceText: "",
        relevanceEvidenceUrl: "",
      }),
      verification("4", "Avery Key", "Partner", "recruiter", {
        currentCompany: "Summit Talent Partners",
        currentRoleEvidenceText: "Partner",
        currentRoleEvidenceUrl: "https://www.linkedin.com/in/avery-key",
        currentCompanyEvidenceText: "Partner at Summit Talent Partners",
        currentCompanyEvidenceUrl: "https://www.linkedin.com/in/avery-key",
        linkedinUrl: "https://www.linkedin.com/in/avery-key",
        classificationSupported: false,
        classificationEvidenceText: "",
        classificationEvidenceUrl: "",
        relevanceStatus: "unknown",
        relevanceEvidenceText: "",
        relevanceEvidenceUrl: "",
      }),
    ],
  },
});
const recoveredClassification = await recoveredClassificationProvider({ pursuit, job: brandedEmployerJob });
assert.deepEqual(recoveredClassification.contacts.map((contact) => [contact.name, contact.title, contact.confidence]), [
  ["Taylor Quinn", "Partner", "medium"],
  ["Riley Morgan", "", "medium"],
  ["Avery Key", "Partner", "low"],
  ["Morgan Search", "", "low"],
]);
assert.deepEqual(
  recoveredClassification.diagnostics.lanes.find((lane) => lane.lane === "recruiter")?.rejected.find((row) => row.name === "Casey Parker")?.reasonCodes,
  ["classification_unverified"],
);

const unrelatedAgencyProvider = laneFixtureProvider({
  discovery: {
    likely_hiring_manager: [],
    recruiter: [candidate("Morgan Agent", "Recruiter", "https://www.linkedin.com/in/morgan-agent", {
      companyName: "Unstated Search Partners",
    })],
    functional_leader: [],
  },
  verifications: {
    recruiter: [verification("0", "Morgan Agent", "Recruiter", "recruiter", {
      currentCompany: "Unstated Search Partners",
      companyMatches: true,
      linkedinUrl: "https://www.linkedin.com/in/morgan-agent",
    })],
  },
});
const unrelatedAgency = await unrelatedAgencyProvider({ pursuit, job: brandedEmployerJob });
assert.deepEqual(unrelatedAgency.contacts, []);
assert.deepEqual(
  unrelatedAgency.diagnostics.lanes.find((lane) => lane.lane === "recruiter")?.rejected[0]?.reasonCodes,
  ["company_unverified"],
);

// Autodesk regression: unknown remit remains visible at lower confidence, while an explicit
// career-stage contradiction is rejected. No Autodesk-specific rule is required to do either.
const autodeskJob = {
  id: "job-autodesk",
  title: "Principal Program Manager, Design Operations",
  companyName: "Autodesk",
  description: "Lead DesignOps programs in the Experience Design (XD) team within the Product Design and Manufacturing Solutions (PDMS) organization.",
};
const autodeskProvider = laneFixtureProvider({
  discovery: {
    likely_hiring_manager: [],
    recruiter: [
      candidate("Kevin Martin", "Principal Recruiter", "https://www.linkedin.com/in/kevinmartinautodesk", {
        companyName: "Autodesk",
      }),
      candidate("Laura Annino", "Early Career Recruiter", "https://www.linkedin.com/in/laura-annino", {
        companyName: "Autodesk",
      }),
    ],
    functional_leader: [
      candidate("Brian Yoder", "Director, Experience Design, Product Design & Manufacturing Solutions", "https://www.linkedin.com/in/byoder", {
        companyName: "Autodesk",
      }),
      candidate("Christiana Lackner", "Chief of Staff / Design Operations", "https://www.linkedin.com/in/christiana-lackner", {
        companyName: "Autodesk",
      }),
    ],
  },
  organizationLeadership: [candidate("Steffani Aranas", "Director, Chief Of Staff, Experience Design, PDMS Organization", "https://www.linkedin.com/in/steffani-aranas-4101233", {
    companyName: "Autodesk",
  })],
  verifications: {
    likely_hiring_manager: [verification("0", "Steffani Aranas", "Director, Chief Of Staff, Experience Design, PDMS Organization", "likely_hiring_manager", {
      currentCompany: "Autodesk",
      linkedinUrl: "https://www.linkedin.com/in/steffani-aranas-4101233",
      currentRoleEvidenceText: "Director, Chief Of Staff, Experience Design, PDMS Organization",
      currentCompanyEvidenceText: "Steffani Aranas serves as Director and Chief of Staff at Autodesk.",
      classificationEvidenceText: "I'm hiring! UX Design Program Manager. This key position helps our XD team deliver excellence.",
      relevanceStatus: "strong",
      roleConnection: "Current PDMS Experience Design chief of staff with public evidence of hiring Autodesk design program managers.",
    })],
    recruiter: [
      verification("0", "Kevin Martin", "Principal Recruiter", "recruiter", {
        currentCompany: "Autodesk",
        linkedinUrl: "https://www.linkedin.com/in/kevinmartinautodesk",
        relevanceStatus: "unknown",
        relevanceEvidenceText: "",
        relevanceEvidenceUrl: "",
        alignmentSignals: [],
        classificationSupported: false,
      }),
      verification("1", "Laura Annino", "Early Career Recruiter", "recruiter", {
        currentCompany: "Autodesk",
        linkedinUrl: "https://www.linkedin.com/in/laura-annino",
        relevanceStatus: "conflicting",
        relevanceEvidenceText: "Early Career Recruiter, Pipeline Builder, Program Manager, Adviser, Problem Solver",
        conflictSignals: ["Public remit is early-career recruiting, while the opening is a principal-level experienced role."],
      }),
    ],
    functional_leader: [
      verification("0", "Steffani Aranas", "Director, Chief Of Staff, Experience Design, PDMS Organization", "functional_leader", {
        currentCompany: "Autodesk",
        linkedinUrl: "https://www.linkedin.com/in/steffani-aranas-4101233",
        currentRoleEvidenceText: "Director, Chief Of Staff, Experience Design, PDMS Organization",
        currentCompanyEvidenceText: "Steffani Aranas serves as Director and Chief of Staff at Autodesk.",
        classificationEvidenceText: "I'm hiring! UX Design Program Manager. This key position helps our XD team deliver excellence.",
        relevanceStatus: "strong",
      }),
      verification("1", "Brian Yoder", "Director, Experience Design, Product Design & Manufacturing Solutions", "functional_leader", {
        currentCompany: "Autodesk",
        linkedinUrl: "https://www.linkedin.com/in/byoder",
        classificationEvidenceText: "Brian Yoder leads Experience Design within Product Design & Manufacturing Solutions.",
        relevanceStatus: "unknown",
        relevanceEvidenceText: "",
        relevanceEvidenceUrl: "",
        alignmentSignals: [],
        classificationSupported: false,
      }),
      verification("2", "Christiana Lackner", "Chief of Staff / Design Operations", "functional_leader", {
        currentCompany: "Autodesk",
        linkedinUrl: "https://www.linkedin.com/in/christiana-lackner",
        classificationEvidenceText: "Christiana Lackner leads Design Operations programs at Autodesk.",
      }),
    ],
  },
});
const autodesk = await autodeskProvider({ pursuit, job: autodeskJob });
assert.equal(autodesk.status, "generated");
assert.deepEqual(autodesk.contacts.map((contact) => contact.name), ["Steffani Aranas", "Kevin Martin", "Christiana Lackner", "Brian Yoder"]);
assert.equal(autodesk.contacts.find((contact) => contact.name === "Kevin Martin")?.confidence, "medium");
assert.deepEqual(
  autodesk.diagnostics.lanes.find((lane) => lane.lane === "recruiter")?.rejected.find((row) => row.name === "Laura Annino")?.reasonCodes,
  ["relevance_conflict"],
);

// Airbnb regressions: Joe's verified analyst title cannot be relabeled as Hiring Manager.
// Sarah's exact current Experience title is displayed without headline synthesis.
const airbnbJob = {
  id: "job-airbnb",
  title: "Program Manager, Roadmap Planning & Program Management",
  companyName: "Airbnb",
  description: "Lead roadmap planning programs.",
};
const airbnbProvider = laneFixtureProvider({
  discovery: {
    likely_hiring_manager: [candidate("Joe Andrews", "Program Manager", "https://www.linkedin.com/in/joe-andrews", {
      companyName: "Airbnb",
    })],
    recruiter: [candidate("Sarah Kim", "Principal Recruiter, Product and Design", "https://www.linkedin.com/in/sarah-kim", {
      companyName: "Airbnb",
    })],
    functional_leader: [],
  },
  verifications: {
    likely_hiring_manager: [verification("0", "Joe Andrews", "Senior Project Analyst", "likely_hiring_manager", {
      currentCompany: "Airbnb",
      linkedinUrl: "https://www.linkedin.com/in/joe-andrews",
      classificationSupported: false,
      classificationEvidenceText: "Senior Project Analyst at Airbnb",
    })],
    recruiter: [verification("0", "Sarah Kim", "Principal Recruiter, Product and Creative", "recruiter", {
      currentCompany: "Airbnb",
      linkedinUrl: "https://www.linkedin.com/in/sarah-kim",
      linkedinHeadline: "Principal Recruiter, Product and Design",
      currentRoleEvidenceText: "Principal Recruiter, Product and Creative",
    })],
  },
});
const airbnb = await airbnbProvider({ pursuit, job: airbnbJob });
assert.equal(airbnb.status, "generated");
assert.deepEqual(airbnb.contacts.map((contact) => contact.name), ["Sarah Kim"]);
assert.equal(airbnb.contacts[0].title, "Principal Recruiter, Product and Creative");
assert.equal(airbnb.contacts.some((contact) => contact.name === "Joe Andrews"), false);

// Headlines, employer-suffixed labels, and truncated prose cannot become display titles.
// A bad title field is treated as unavailable instead of discarding an otherwise verified person.
const malformedTitleProvider = laneFixtureProvider({
  discovery: {
    likely_hiring_manager: [],
    recruiter: [
      candidate("Casey Rivera", "Recruiter", "https://www.linkedin.com/in/casey-rivera"),
      candidate("Jamie Brooks", "Principal Recruiter", "https://www.linkedin.com/in/jamie-brooks"),
    ],
    functional_leader: [],
  },
  verifications: {
    recruiter: [
      verification("0", "Casey Rivera", "Full-cycle recruiter specializing in technical and marketing…", "recruiter"),
      verification("1", "Jamie Brooks", "Principal Recruiter at Useful Studio", "recruiter"),
    ],
  },
});
const malformedTitles = await malformedTitleProvider({ pursuit, job });
assert.deepEqual(
  malformedTitles.contacts.map((contact) => [contact.name, contact.title]),
  [["Casey Rivera", ""], ["Jamie Brooks", ""]],
);

// Organization-plus-title headings are rejected, while real surnames that resemble role words survive.
const junk = parseResearchedContacts({
  contacts: [
    { name: "Director", title: "Director of Media", confidence: 50 },
    { name: "(unknown)", title: "VP", confidence: 50 },
    { name: "Coinbase Principal Recruiter", title: "Principal Recruiter", confidence: 90 },
    { name: "Principal Recruiter Coinbase", title: "Principal Recruiter", confidence: 90 },
    { name: "Real Person", title: "VP Media", candidateRole: "Functional Leader", confidence: 50 },
    { name: "Anthony Head", title: "VP Media", candidateRole: "Functional Leader", confidence: 50 },
  ],
}, "Coinbase");
assert.deepEqual(junk.map((contact) => contact.name), ["Real Person", "Anthony Head"]);

// Web-search models may group the same contract by category or use a category
// alias. The ingestion boundary accepts both without weakening person checks.
const groupedContacts = parseResearchedContacts({
  contacts: {
    hiringManagers: [{
      name: "Dana Lee citeturn1search0",
      title: "Director, Programmatic Media",
      companyName: "Useful Studio",
    }],
    recruiters: [{
      name: "Rene Ortiz",
      title: "Principal Recruiter",
      companyName: "Useful Studio",
    }],
    functional_leaders: [{
      name: "Morgan Chen",
      title: "VP, Programmatic Media",
      companyName: "Useful Studio",
    }],
  },
}, "Useful Studio");
assert.deepEqual(
  groupedContacts.map((contact) => [contact.name, contact.contactType]),
  [
    ["Dana Lee", "likely_hiring_manager"],
    ["Rene Ortiz", "recruiter"],
    ["Morgan Chen", "functional_leader"],
  ],
);
assert.equal(
  parseResearchedContacts({
    contacts: [{
      name: "Quinn Patel",
      title: "Talent Acquisition Partner",
      category: "recruiter",
    }],
  }, "Useful Studio")[0]?.contactType,
  "recruiter",
);
assert.deepEqual(
  parseProfileVerifications({
    results: [{
      candidateKey: 0,
      currentName: "Rene Ortiz",
    }],
  }).map((verification) => [verification.candidateKey, verification.currentName]),
  [["0", "Rene Ortiz"]],
);
assert.deepEqual(
  parseProfileVerifications({
    verifications: {
      1: {
        currentName: "Quinn Patel",
      },
    },
  }).map((verification) => [verification.candidateKey, verification.currentName]),
  [["1", "Quinn Patel"]],
);

const hiringPrompt = JSON.parse(buildLaneDiscoveryPrompt(autodeskJob, "likely_hiring_manager"));
const recruiterPrompt = JSON.parse(buildLaneDiscoveryPrompt(autodeskJob, "recruiter"));
const functionalPrompt = JSON.parse(buildLaneDiscoveryPrompt(autodeskJob, "functional_leader"));
const broadPrompt = JSON.parse(buildBroadDiscoveryPrompt(autodeskJob));
assert.equal(hiringPrompt.requestedLane, "likely_hiring_manager");
assert.deepEqual(hiringPrompt.functionContext.organizationAnchors, ["Experience Design (XD)", "Product Design and Manufacturing Solutions (PDMS)", "XD", "PDMS"]);
assert.match(JSON.stringify(hiringPrompt.requiredSearches), /PDMS/);
assert.match(JSON.stringify(hiringPrompt.requiredSearches), /Chief of Staff/);
assert.match(buildOrganizationLeadershipPrompt(autodeskJob), /Product Design and Manufacturing Solutions \(PDMS\)/);
assert.equal(recruiterPrompt.requestedLane, "recruiter");
assert.equal(recruiterPrompt.targetCount, 5);
assert.match(recruiterPrompt.countRule, /not a cap/);
assert.equal(functionalPrompt.requestedLane, "functional_leader");
assert.match(JSON.stringify(functionalPrompt.categoryRules), /plausible adjacent leaders/);
assert.deepEqual(Object.keys(broadPrompt.categories), [
  "likely_hiring_manager",
  "recruiter",
  "functional_leader",
]);
assert.equal(broadPrompt.categories.recruiter.targetCount, 5);
assert.match(JSON.stringify(broadPrompt.requiredSearches), /talent acquisition/);
assert.match(JSON.stringify(broadPrompt.requiredSearches), /functional_leader/);
assert.match(buildBroadDiscoveryPrompt(autodeskJob, undefined, true), /LinkedIn employees/);
assert.match(buildUserPrompt(job), /Programmatic Media Director/);
assert.match(buildProfileVerificationPrompt(job, [], "recruiter"), /strong \| plausible \| unknown \| conflicting/);
const broadVerificationPrompt = JSON.parse(buildBroadProfileVerificationPrompt(job, [
  {
    ...parseResearchedContacts({
      contacts: [{
        ...candidate("Rene Ortiz", "Principal Recruiter", "https://www.linkedin.com/in/rene-ortiz"),
        candidateRole: "recruiter",
      }],
    }, job.companyName)[0],
  },
]));
assert.equal(broadVerificationPrompt.untrustedCandidates[0].requestedLane, "recruiter");
assert.equal("requestedLane" in broadVerificationPrompt, false);

const brandedRecruiterPrompt = JSON.parse(buildLaneDiscoveryPrompt(brandedEmployerJob, "recruiter"));
assert.deepEqual(
  brandedRecruiterPrompt.role.acceptedEmployerIdentities.map((identity) => identity.name),
  ["Northstar Advisory", "Summit Talent Partners"],
);
assert.match(JSON.stringify(brandedRecruiterPrompt.requiredSearches), /Summit Talent Partners/);
const brandedRosterPrompt = JSON.parse(buildEmployerRosterPrompt(brandedEmployerJob));
assert.doesNotMatch(JSON.stringify(brandedRosterPrompt), /requestedLane/);
assert.match(JSON.stringify(brandedRosterPrompt.requiredSearches), /LinkedIn employees/);
assert.match(JSON.stringify(brandedRosterPrompt.rules), /missing public title is allowed/i);
assert.deepEqual(
  contactSearchBudget("discovery", "broad_category"),
  { maxToolCalls: 1, searchContextSize: "low" },
);
assert.deepEqual(
  contactSearchBudget("discovery", "roster_fallback"),
  { maxToolCalls: 1, searchContextSize: "low" },
);
assert.deepEqual(
  contactSearchBudget("verification", "broad_category"),
  { maxToolCalls: 1, searchContextSize: "low" },
);
const brandedVerificationPrompt = JSON.parse(buildProfileVerificationPrompt(
  brandedEmployerJob,
  [candidate("Avery Torres", "Recruiter", "https:\/\/www.linkedin.com\/in\/avery-torres", {
    companyName: "Summit Talent Partners",
  })],
  "recruiter",
));
assert.deepEqual(
  brandedVerificationPrompt.role.acceptedEmployerIdentities.map((identity) => identity.name),
  ["Northstar Advisory", "Summit Talent Partners"],
);

const clinicalJob = {
  id: "job-clinical",
  title: "Director, Clinical Trial Operations",
  companyName: "Example Health",
  description: "Lead global phase three trial operations within the Oncology Development organization.",
};
const universalPrompt = JSON.parse(buildLaneDiscoveryPrompt(clinicalJob, "likely_hiring_manager", {
  roleTrackName: "Clinical Operations Leadership",
  targetTitles: ["Clinical Operations Director"],
  keyResponsibilities: ["Global trial delivery"],
  targetIndustries: ["Biotechnology"],
  skills: ["Clinical development"],
}));
assert.equal(universalPrompt.role.title, clinicalJob.title);
assert.equal(universalPrompt.functionContext.candidateContext.roleTrackName, "Clinical Operations Leadership");
assert.match(universalPrompt.functionContext.candidateContext.usageRule, /job posting remains authoritative/);
assert.doesNotMatch(
  JSON.stringify(universalPrompt),
  /Design Operations|Programmatic Media|Creative Production|Program Management \/ PMO/,
);

console.log("public profile contact discovery: all assertions passed");
