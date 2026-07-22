import assert from "node:assert/strict";
import {
  buildLaneDiscoveryPrompt,
  buildOrganizationLeadershipPrompt,
  buildProfileVerificationPrompt,
  buildUserPrompt,
  createOpenAIHumanPathProvider,
  parseResearchedContacts,
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
    name,
    title,
    companyName: overrides.companyName ?? "Useful Studio",
    linkedinUrl,
    evidenceUrl: overrides.evidenceUrl ?? linkedinUrl,
    confidence: overrides.confidence ?? 90,
    reason: overrides.reason ?? "Current public evidence supports this candidate.",
    roleConnection: overrides.roleConnection ?? "Connection requires independent verification.",
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
    currentRoleEvidenceText: overrides.currentRoleEvidenceText ?? `${currentTitle} at ${currentCompany}`,
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
    confidence: overrides.confidence ?? 90,
    reason: overrides.reason ?? `Verified current ${lane} contact.`,
    roleConnection: overrides.roleConnection ?? `Verified ${lane} connection.`,
  };
}

function laneFixtureProvider({ discovery, verifications, organizationLeadership = [] }) {
  return createOpenAIHumanPathProvider({
    callModel: async ({ lane, phase, strategy, user }) => {
      assert.ok(lane, "provider calls identify the result lane");
      assert.ok(phase, "provider calls identify discovery or verification");
      if (phase === "discovery") {
        if (strategy === "organization_leadership") {
          return JSON.stringify({ contacts: organizationLeadership });
        }
        const value = discovery[lane];
        return value === undefined ? undefined : JSON.stringify({ contacts: value });
      }
      const prompt = JSON.parse(user);
      const rows = verifications[lane] ?? [];
      assert.equal(prompt.requestedLane, lane);
      return JSON.stringify({ verifications: rows });
    },
  });
}

// All three category searches failing is a provider outage, not a legitimate zero result.
const unavailable = await createOpenAIHumanPathProvider({
  callModel: async () => undefined,
})({ pursuit, job });
assert.equal(unavailable.status, "provider_unavailable");

// Category discovery and verification are independent. The deterministic assembler reserves
// hiring-manager and recruiter slots, includes a functional leader, then fills to five.
const variedProvider = laneFixtureProvider({
  discovery: {
    likely_hiring_manager: [
      candidate("Dana Lee", "Director, Programmatic Media", "https://www.linkedin.com/in/dana-lee"),
      candidate("Taylor Reed", "Paid Media Team Manager", "https://www.linkedin.com/in/taylor-reed"),
    ],
    recruiter: [
      candidate("Rene Ortiz", "Principal Recruiter", "https://www.linkedin.com/in/rene-ortiz"),
      candidate("Quinn Patel", "Talent Acquisition Partner", "https://www.linkedin.com/in/quinn-patel"),
    ],
    functional_leader: [
      candidate("Morgan Chen", "VP, Programmatic Media", "https://www.linkedin.com/in/morgan-chen"),
      candidate("Avery Shah", "Head of Paid Media", "https://www.linkedin.com/in/avery-shah"),
    ],
  },
  verifications: {
    likely_hiring_manager: [
      verification("0", "Dana Lee", "Director, Programmatic Media", "likely_hiring_manager"),
      verification("1", "Taylor Reed", "Paid Media Team Manager", "likely_hiring_manager", {
        classificationEvidenceText: "Taylor Reed manages the Paid Media team and is hiring for the group.",
      }),
    ],
    recruiter: [
      verification("0", "Rene Ortiz", "Principal Recruiter", "recruiter"),
      verification("1", "Quinn Patel", "Talent Acquisition Partner", "recruiter"),
    ],
    functional_leader: [
      verification("0", "Morgan Chen", "VP, Programmatic Media", "functional_leader"),
      verification("1", "Avery Shah", "Head of Paid Media", "functional_leader"),
    ],
  },
});
const varied = await variedProvider({ pursuit, job });
assert.equal(varied.status, "generated");
assert.equal(varied.contacts.length, 5);
assert.deepEqual(
  varied.contacts.map((contact) => contact.contactType),
  ["likely_hiring_manager", "recruiter", "functional_leader", "likely_hiring_manager", "recruiter"],
);
assert.equal(varied.diagnostics.assembledCount, 5);
assert.deepEqual(
  varied.diagnostics.lanes.map((lane) => [lane.lane, lane.acceptedCount]),
  [
    ["likely_hiring_manager", 2],
    ["recruiter", 2],
    ["functional_leader", 1],
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

// Autodesk regression: broad Experience Design adjacency does not qualify Brian Yoder for
// Design Operations. A verified recruiter and an explicitly Design Operations leader survive.
const autodeskJob = {
  id: "job-autodesk",
  title: "Principal Program Manager, Design Operations",
  companyName: "Autodesk",
  description: "Lead DesignOps programs in the Experience Design (XD) team within the Product Design and Manufacturing Solutions (PDMS) organization.",
};
const autodeskProvider = laneFixtureProvider({
  discovery: {
    likely_hiring_manager: [],
    recruiter: [candidate("Kevin Martin", "Principal Recruiter", "https://www.linkedin.com/in/kevinmartinautodesk", {
      companyName: "Autodesk",
    })],
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
      roleConnection: "Current PDMS Experience Design chief of staff with public evidence of hiring Autodesk design program managers.",
    })],
    recruiter: [verification("0", "Kevin Martin", "Principal Recruiter", "recruiter", {
      currentCompany: "Autodesk",
      linkedinUrl: "https://www.linkedin.com/in/kevinmartinautodesk",
    })],
    functional_leader: [
      verification("0", "Steffani Aranas", "Director, Chief Of Staff, Experience Design, PDMS Organization", "functional_leader", {
        currentCompany: "Autodesk",
        linkedinUrl: "https://www.linkedin.com/in/steffani-aranas-4101233",
        currentRoleEvidenceText: "Director, Chief Of Staff, Experience Design, PDMS Organization",
        currentCompanyEvidenceText: "Steffani Aranas serves as Director and Chief of Staff at Autodesk.",
        classificationEvidenceText: "I'm hiring! UX Design Program Manager. This key position helps our XD team deliver excellence.",
      }),
      verification("1", "Brian Yoder", "Director, Experience Design, Product Design & Manufacturing Solutions", "functional_leader", {
        currentCompany: "Autodesk",
        linkedinUrl: "https://www.linkedin.com/in/byoder",
        classificationEvidenceText: "Brian Yoder leads Experience Design within Product Design & Manufacturing Solutions.",
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
assert.deepEqual(autodesk.contacts.map((contact) => contact.name), ["Steffani Aranas", "Kevin Martin", "Christiana Lackner"]);
assert.equal(autodesk.contacts.some((contact) => contact.name === "Brian Yoder"), false);
assert.deepEqual(
  autodesk.diagnostics.lanes.find((lane) => lane.lane === "functional_leader")?.rejected[0].reasonCodes,
  ["classification_unverified"],
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
      currentRoleEvidenceText: "Principal Recruiter, Product and Creative at Airbnb",
    })],
  },
});
const airbnb = await airbnbProvider({ pursuit, job: airbnbJob });
assert.equal(airbnb.status, "generated");
assert.deepEqual(airbnb.contacts.map((contact) => contact.name), ["Sarah Kim"]);
assert.equal(airbnb.contacts[0].title, "Principal Recruiter, Product and Creative");
assert.equal(airbnb.contacts.some((contact) => contact.name === "Joe Andrews"), false);

// Headlines, employer-suffixed labels, and truncated prose cannot become display titles.
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
assert.deepEqual(malformedTitles.contacts, []);
assert.deepEqual(
  malformedTitles.diagnostics.lanes.find((lane) => lane.lane === "recruiter")?.rejected.map((row) => row.reasonCodes),
  [["current_role_unverified"], ["current_role_unverified"]],
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

const hiringPrompt = JSON.parse(buildLaneDiscoveryPrompt(autodeskJob, "likely_hiring_manager"));
const recruiterPrompt = JSON.parse(buildLaneDiscoveryPrompt(autodeskJob, "recruiter"));
const functionalPrompt = JSON.parse(buildLaneDiscoveryPrompt(autodeskJob, "functional_leader"));
assert.equal(hiringPrompt.requestedLane, "likely_hiring_manager");
assert.deepEqual(hiringPrompt.functionContext.organizationAnchors, ["Experience Design (XD)", "Product Design and Manufacturing Solutions (PDMS)", "XD", "PDMS"]);
assert.match(JSON.stringify(hiringPrompt.requiredSearches), /PDMS/);
assert.match(JSON.stringify(hiringPrompt.requiredSearches), /Chief of Staff/);
assert.match(buildOrganizationLeadershipPrompt(autodeskJob), /Product Design and Manufacturing Solutions \(PDMS\)/);
assert.equal(recruiterPrompt.requestedLane, "recruiter");
assert.equal(functionalPrompt.requestedLane, "functional_leader");
assert.match(JSON.stringify(functionalPrompt.categoryRules), /Experience Design leadership alone is insufficient/);
assert.match(buildUserPrompt(job), /Programmatic Media Director/);
assert.match(buildProfileVerificationPrompt(job, [], "recruiter"), /Principal Recruiter|Recruiter/);

console.log("public profile contact discovery: all assertions passed");
