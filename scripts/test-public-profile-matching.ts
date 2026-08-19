import assert from "node:assert/strict";
import type { CandidateProfileAggregate } from "../lib/public-profile/types";
import { evaluateMatch } from "../lib/public-profile/matching/engine";
import {
  evaluatePublicJobDecision,
  matchingSignalsForAggregate,
} from "../lib/public-profile/matching/decision";
import { classifyOccupation } from "../lib/public-profile/matching/occupation";
import {
  hasGenericCrossIndustryRoleHead,
  isGenericCrossIndustryTitle,
} from "../lib/public-profile/matching/industry-context";
import type { MatchJob } from "../lib/public-profile/matching/types";
import { completeCandidateProfileAggregate } from "./fixtures/public-profile";

const now = "2026-06-28T12:00:00.000Z";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function profile(overrides: Partial<CandidateProfileAggregate> = {}) {
  const aggregate = completeCandidateProfileAggregate(now);
  aggregate.profile.targetCompensationMin = 140000;
  aggregate.profile.targetCompensationPreferred = 165000;
  aggregate.companyWatchlist = [{
    id: "watch-1",
    profileId: "profile-1",
    companyName: "Useful Studio",
    reason: "Product-led company with messy workflow problems.",
    priority: "high",
    createdAt: now,
    updatedAt: now,
  }];
  return Object.assign(aggregate, overrides);
}

const strongJob: MatchJob = {
  id: "job-strong",
  title: "Program Director, AI Workflow Systems",
  companyName: "Useful Studio",
  description: [
    "Lead ambiguous systems work across product and operations.",
    "Own stakeholder alignment for internal AI workflow systems.",
    "This role needs cross-functional programs and program leadership.",
  ].join(" "),
  location: "Remote",
  remoteType: "remote",
  employmentType: "full_time",
  compensationText: "$170k-$190k",
  industry: "AI",
  postedAt: "2026-06-27T12:00:00.000Z",
  applyMethod: "direct",
};

const strong = evaluateMatch({ profile: profile(), job: strongJob, evaluatedAt: now });
assert.equal(strong.label, "Strong Match");
assert.ok(strong.internalScore >= 80);
assert.equal(strong.recommendations.roleTrack?.roleTrack.name, "Program Director");
assert.equal(strong.recommendations.resume?.resume.name, "Program Director Resume");
assert.equal(strong.recommendations.workExample?.workExample.title, "Phred");
assert.ok(strong.whyMatched.some((reason) => reason.includes("Program Director")));
assert.deepEqual(strong.softExclusions, []);

const weakJob: MatchJob = {
  id: "job-weak",
  title: "Senior Platform Engineering Manager",
  companyName: "Enterprise Staffing Co",
  description: [
    "Own deep platform engineering management.",
    "Heavy Adobe Commerce specialization.",
    "Staffing-only delivery with pure scrum ceremony.",
  ].join(" "),
  location: "Onsite in Dallas, TX",
  remoteType: "onsite",
  employmentType: "full_time",
  compensationText: "$80k-$95k",
  industry: "Staffing",
  postedAt: "2026-05-01T12:00:00.000Z",
  applyMethod: "easy_apply",
};

const weakProfile = profile();
weakProfile.profile.remotePreference = "remote_only";
if (weakProfile.preferences) {
  weakProfile.preferences.avoidIndustries = ["Staffing"];
  weakProfile.preferences.avoidCompanies = ["Enterprise Staffing Co"];
}
const weak = evaluateMatch({ profile: weakProfile, job: weakJob, evaluatedAt: now });
assert.equal(weak.label, "Probably Not Worth Your Time");
assert.ok(weak.internalScore < 40);
assert.ok(weak.softExclusions.some((reason) => reason.toLowerCase().includes("avoid list")));
assert.ok(weak.softExclusions.some((reason) => reason.toLowerCase().includes("onsite")));
assert.ok(weak.softExclusions.some((reason) => reason.toLowerCase().includes("below your floor")));
assert.ok(weak.whyNotMatched.some((reason) => reason.includes("Staffing")));
assert.ok(weak.risks.length > 0);

const softEdgeProfile = profile();
softEdgeProfile.profile.remotePreference = "remote_only";
const softEdge = evaluateMatch({
  profile: softEdgeProfile,
  job: {
    ...strongJob,
    id: "job-soft-edge",
    location: "Hybrid in Denver, CO",
    remoteType: "hybrid",
  },
  evaluatedAt: now,
  remoteExceptions: [{
    companyName: "Useful Studio",
    remoteRiskReduction: "high",
    reason: "Recent remote exceptions have been credible.",
  }],
});
assert.ok(softEdge.internalScore > 0);
assert.ok(softEdge.whyNotMatched.some((reason) => reason.includes("Hybrid")));
assert.ok(softEdge.categoryFits.some((fit) => fit.category === "location" && fit.reasons.some((reason) => reason.includes("Remote exception noted"))));

const noPreferenceProfile = profile();
noPreferenceProfile.profile.remotePreference = "no_preference";
const noPreferenceRemote = evaluateMatch({
  profile: noPreferenceProfile,
  job: { ...strongJob, id: "job-no-preference-remote", location: "Remote", remoteType: "remote" },
  evaluatedAt: now,
});
const noPreferenceOnsite = evaluateMatch({
  profile: noPreferenceProfile,
  job: { ...strongJob, id: "job-no-preference-onsite", location: "Onsite", remoteType: "onsite" },
  evaluatedAt: now,
});
const noPreferenceRemoteFit = noPreferenceRemote.categoryFits.find((fit) => fit.category === "location");
const noPreferenceOnsiteFit = noPreferenceOnsite.categoryFits.find((fit) => fit.category === "location");
assert.equal(noPreferenceRemoteFit?.score, noPreferenceOnsiteFit?.score);
assert.deepEqual(noPreferenceRemoteFit?.risks, []);
assert.deepEqual(noPreferenceOnsiteFit?.risks, []);

const noPreferenceSignals = matchingSignalsForAggregate(noPreferenceProfile);
const neutralRemoteDecision = evaluatePublicJobDecision(
  { ...strongJob, id: "decision-no-preference-remote", location: "", remoteType: "remote" },
  noPreferenceSignals,
  now,
);
const neutralOnsiteDecision = evaluatePublicJobDecision(
  { ...strongJob, id: "decision-no-preference-onsite", location: "", remoteType: "onsite" },
  noPreferenceSignals,
  now,
);
assert.equal(neutralRemoteDecision.score, neutralOnsiteDecision.score);
assert.equal(neutralRemoteDecision.risks.some((risk) => /remote|onsite/i.test(risk)), false);
assert.equal(neutralOnsiteDecision.risks.some((risk) => /remote|onsite/i.test(risk)), false);

const missingDataProfile = clone(profile());
missingDataProfile.workExamples = [];
missingDataProfile.resumes = [];
missingDataProfile.roleTracks[0].resumeIds = [];
const missingData = evaluateMatch({
  profile: missingDataProfile,
  job: {
    id: "job-missing",
    title: "Program Director",
    companyName: "Quiet Company",
    description: "Lead stakeholder alignment.",
  },
  evaluatedAt: now,
});
assert.ok(missingData.internalScore > 0);
assert.ok(missingData.categoryFits.some((fit) => fit.category === "work_example" && fit.risks.length > 0));
assert.ok(missingData.categoryFits.some((fit) => fit.category === "resume" && fit.risks.length > 0));
assert.equal(missingData.recommendations.resume, undefined);
assert.equal(missingData.recommendations.workExample, undefined);

// --- Hourly↔yearly compensation normalization (2026-07-09) ---

// Hourly-only profile vs a yearly posting: $72.50/hr ≈ $150,800/yr clears a
// $170k–$190k posting but a $60k posting lands below the floor.
const hourlyProfile = clone(profile());
hourlyProfile.profile.targetCompensationMin = undefined;
hourlyProfile.profile.targetCompensationPreferred = undefined;
hourlyProfile.profile.targetCompensationHourlyMin = 72.5;
const hourlyVsYearly = evaluateMatch({ profile: hourlyProfile, job: strongJob, evaluatedAt: now });
const hourlyCompFit = hourlyVsYearly.categoryFits.find((fit) => fit.category === "compensation");
assert.ok(hourlyCompFit && hourlyCompFit.score >= 0.7, "hourly floor should clear a $170k+ posting");

const lowYearlyJob: MatchJob = { ...strongJob, id: "job-low", compensationText: "$60k" };
const hourlyVsLow = evaluateMatch({ profile: hourlyProfile, job: lowYearlyJob, evaluatedAt: now });
const hourlyLowFit = hourlyVsLow.categoryFits.find((fit) => fit.category === "compensation");
assert.ok(hourlyLowFit && hourlyLowFit.score <= 0.2, "a $60k posting sits below a $72.50/hr floor");

// Yearly profile vs an hourly posting: "$90 - $100 / hr" ≈ $187k–$208k clears
// a $140k floor; "$30/hr" ≈ $62k does not.
const yearlyVsHourly = evaluateMatch({
  profile: profile(),
  job: { ...strongJob, id: "job-hourly", compensationText: "$90 - $100 / hr" },
  evaluatedAt: now,
});
const yearlyHourlyFit = yearlyVsHourly.categoryFits.find((fit) => fit.category === "compensation");
assert.ok(yearlyHourlyFit && yearlyHourlyFit.score >= 0.7, "an hourly posting should convert before comparing");

const lowHourly = evaluateMatch({
  profile: profile(),
  job: { ...strongJob, id: "job-low-hourly", compensationText: "$30/hr" },
  evaluatedAt: now,
});
const lowHourlyFit = lowHourly.categoryFits.find((fit) => fit.category === "compensation");
assert.ok(lowHourlyFit && lowHourlyFit.score <= 0.2, "a $30/hr posting sits below a $140k floor");

// --- Employment type: soft signal, never a hard filter (2026-07-09) ---

const contractProfile = clone(profile());
if (contractProfile.preferences) contractProfile.preferences.employmentTypes = ["contract", "freelance"];
const contractJob = evaluateMatch({
  profile: contractProfile,
  job: { ...strongJob, id: "job-contract", employmentType: "Contract" },
  evaluatedAt: now,
});
const contractFit = contractJob.categoryFits.find((fit) => fit.category === "employment_type");
assert.ok(contractFit && contractFit.score >= 0.85, "contract preference should match a contract posting");

const mismatch = evaluateMatch({
  profile: contractProfile,
  job: { ...strongJob, id: "job-ft", employmentType: "Full-time" },
  evaluatedAt: now,
});
const mismatchFit = mismatch.categoryFits.find((fit) => fit.category === "employment_type");
assert.ok(mismatchFit && mismatchFit.score <= 0.4, "a full-time posting scores low for a contract-only profile");
assert.ok(mismatchFit && mismatchFit.softExclusions.length === 0, "employment type must never hard-exclude");
assert.ok(mismatch.internalScore > 0, "mismatched employment type still surfaces the job");

const noPref = evaluateMatch({ profile: profile(), job: { ...strongJob, id: "job-nopref", employmentType: undefined }, evaluatedAt: now });
const noPrefFit = noPref.categoryFits.find((fit) => fit.category === "employment_type");
assert.ok(noPrefFit, "employment_type category always present");

// --- Wrong-lane exclusion, ported from the legacy occupation classifier (2026-07-16 P0) ---
// A remote, fresh, well-paid posting in an unrelated lane must never float to a
// mid rating on neutral category defaults; the 2026-07-16 bug rated these 3 stars.

const wrongLaneJobs: MatchJob[] = [
  {
    id: "job-swe",
    title: "Senior Staff Software Engineer, Payments",
    companyName: "Big Exchange",
    description: "Own backend engineering for payments. Write code, design APIs, lead architecture reviews for our platform. Cross-functional delivery with product stakeholders.",
    remoteType: "remote",
    compensationText: "$220k-$260k",
    postedAt: "2026-06-27T12:00:00.000Z",
    scrapedAt: now,
  },
  {
    id: "job-finance",
    title: "Manager, Finance Operations",
    companyName: "Big Exchange",
    description: "Own financial forecast and budget model operations. Lead vendor contracts and procurement process across stakeholders.",
    remoteType: "remote",
    compensationText: "$180k-$210k",
    postedAt: "2026-06-27T12:00:00.000Z",
    scrapedAt: now,
  },
];
for (const wrongLaneJob of wrongLaneJobs) {
  const wrongLane = evaluateMatch({ profile: profile(), job: wrongLaneJob, evaluatedAt: now });
  assert.equal(wrongLane.label, "Probably Not Worth Your Time", `${wrongLaneJob.title} must not rate`);
  assert.ok(wrongLane.internalScore <= 37, `${wrongLaneJob.title} must stay under the excluded-score cap`);
}

// A more specific wrong-lane title beats a generic target-title hit: a profile
// targeting "Program Director"/"Program Manager" roles must not rate technical
// program management as a fit (legacy hard-exclude semantics).
const tpmProfile = profile();
tpmProfile.roleTracks[0].targetTitles = ["Program Director", "Program Manager"];
const tpm = evaluateMatch({
  profile: tpmProfile,
  job: {
    id: "job-tpm",
    title: "Technical Program Manager, Compute Infrastructure",
    companyName: "Big Exchange",
    description: "Own infrastructure and hardware compute programs. Lead cross-functional delivery with engineering stakeholders across network and storage roadmaps.",
    remoteType: "remote",
    compensationText: "$200k",
    postedAt: "2026-06-27T12:00:00.000Z",
    scrapedAt: now,
  },
  evaluatedAt: now,
});
assert.equal(tpm.label, "Probably Not Worth Your Time", "technical program manager must not outrank the lane block");
assert.ok(tpm.internalScore <= 37);

// --- Executive Producer scan titles (Randall 2026-07-16): explicit target
// titles drive the scan, and producer-family roles must rate on those titles alone.
const epProfile = profile();
epProfile.roleTracks[0].name = "Executive Producer";
epProfile.roleTracks[0].targetTitles = ["Executive Producer", "creative producer", "production lead"];
const epJob: MatchJob = {
  id: "job-ep",
  title: "Executive Producer",
  companyName: "Big Agency",
  description: "Lead integrated campaign production across film and digital. Own budgets, vendor relationships, and delivery timelines with creative and account stakeholders.",
  remoteType: "remote",
  compensationText: "$190,000 - $230,000",
  postedAt: "2026-06-27T12:00:00.000Z",
  scrapedAt: now,
};
const ep = evaluateMatch({ profile: epProfile, job: epJob, evaluatedAt: now });
assert.equal(ep.label, "Strong Match", "a remote, well-paid Executive Producer role must rate Strong");
assert.ok(ep.whyMatched.some((reason) => reason.includes("Executive Producer")));

const epWrongLane = evaluateMatch({
  profile: epProfile,
  job: {
    id: "job-ep-swe",
    title: "Staff Software Engineer, Production Infrastructure",
    companyName: "Big Agency",
    description: "Own backend engineering for production systems. Write code, design APIs, and lead architecture for our platform infrastructure.",
    remoteType: "remote",
    compensationText: "$220,000",
    postedAt: "2026-06-27T12:00:00.000Z",
    scrapedAt: now,
  },
  evaluatedAt: now,
});
assert.equal(epWrongLane.label, "Probably Not Worth Your Time", "engineering roles must not ride the word 'production'");
assert.ok(epWrongLane.internalScore <= 37);

// --- Production feedback regressions (2026-08-04) ---
// Remote-work arrangement and geographic hiring eligibility are separate dimensions.
// Explicit country restrictions must be compared with each user's profile location.
for (const restrictedLocation of ["China", "Australia, New Zealand", "Argentina", "Romania"]) {
  const restricted = evaluateMatch({
    profile: profile(),
    job: {
      ...strongJob,
      id: `job-restricted-${restrictedLocation}`,
      location: restrictedLocation,
      remoteType: "remote",
    },
    evaluatedAt: now,
  });
  assert.equal(restricted.label, "Probably Not Worth Your Time", `${restrictedLocation} restriction must not receive a remote boost`);
  assert.ok(restricted.softExclusions.some((reason) => reason.toLowerCase().includes("location")));
  const locationFit = restricted.categoryFits.find((fit) => fit.category === "location");
  assert.equal(locationFit?.score, 0.05);
  assert.ok(locationFit?.softExclusions.includes("Location eligibility conflict."));
}

const usRestricted = evaluateMatch({
  profile: profile(),
  job: { ...strongJob, id: "job-us-restricted", location: "Remote - US", remoteType: "remote" },
  evaluatedAt: now,
});
assert.equal(usRestricted.label, "Strong Match", "a US restriction must remain compatible with Denver, CO");

const canadianProfile = profile();
canadianProfile.profile.location = "Toronto, ON, CA";
const canadaRestricted = evaluateMatch({
  profile: canadianProfile,
  job: { ...strongJob, id: "job-canada-restricted", location: "Canada", remoteType: "remote" },
  evaluatedAt: now,
});
assert.equal(canadaRestricted.label, "Strong Match", "a Canada restriction must remain compatible with Toronto, ON");

const noPreferenceRestrictedProfile = profile();
noPreferenceRestrictedProfile.profile.remotePreference = "no_preference";
const noPreferenceRestricted = evaluateMatch({
  profile: noPreferenceRestrictedProfile,
  job: { ...strongJob, id: "job-no-preference-china", location: "China", remoteType: "remote" },
  evaluatedAt: now,
});
assert.equal(noPreferenceRestricted.label, "Probably Not Worth Your Time", "No preference must not erase country eligibility");

// Specialized operations titles outrank broad program/operations language. A user who targets
// Marketing should not receive a Strong Match for Sales Operations merely because the posting
// mentions hospitality, strategy, and cross-functional ownership.
const marketingProfile = profile();
marketingProfile.roleTracks[0] = {
  ...marketingProfile.roleTracks[0],
  name: "Marketing",
  targetTitles: ["Director of Marketing", "Content Strategy Director"],
  keyResponsibilities: ["Content Strategy", "Brand Voice"],
  requiredExperiencePatterns: ["Marketing leadership"],
  strongJobSignals: ["Hospitality", "Travel"],
};
if (marketingProfile.preferences) marketingProfile.preferences.targetIndustries = ["hospitality", "travel"];
const salesOperations = evaluateMatch({
  profile: marketingProfile,
  job: {
    id: "job-sales-operations-feedback",
    title: "Senior Sales Operations Lead",
    companyName: "Travel Marketplace",
    description: "Own global acquisition strategy, sales forecasting, quotas, pipeline analysis, and cross-functional revenue operations.",
    location: "United States",
    remoteType: "remote",
    compensationText: "$204,000 - $249,000",
    postedAt: "2026-06-27T12:00:00.000Z",
  },
  evaluatedAt: now,
});
assert.equal(salesOperations.label, "Probably Not Worth Your Time");
assert.ok(salesOperations.whyNotMatched.some((reason) => reason.includes("different lane")));

// A generic Program Manager target does not override a title-qualified Enterprise Technology
// specialization when the user's Role Tracks do not support that technical lane.
const enterpriseTechnology = evaluateMatch({
  profile: profile(),
  job: {
    id: "job-enterprise-technology-feedback",
    title: "Senior Program Manager, Enterprise Technology & AI",
    companyName: "Developer Platform",
    description: "Lead enterprise IT programs spanning business systems, data, security, infrastructure, and enterprise architecture.",
    location: "Remote - US",
    remoteType: "remote",
    postedAt: "2026-06-27T12:00:00.000Z",
  },
  evaluatedAt: now,
});
assert.equal(enterpriseTechnology.label, "Probably Not Worth Your Time");
assert.ok(enterpriseTechnology.whyNotMatched.some((reason) => reason.includes("different lane")));

// With explicit target titles, résumé and Work Example coverage cannot cap a
// related discovery result. Posting and search settings own the match score.
const thinStretch = evaluateMatch({
  profile: profile(),
  job: {
    id: "job-thin-strategy-operations-feedback",
    title: "Director of Programs, Company Strategy & Operations",
    companyName: "Payments Company",
    description: "Lead corporate strategy, investment analysis, executive recommendations, and cross-functional strategic initiatives.",
    industry: "AI",
    location: "Remote - US",
    remoteType: "remote",
    postedAt: "2026-06-27T12:00:00.000Z",
  },
  evaluatedAt: now,
});
assert.equal(thinStretch.label, "Strong Match");
assert.ok(thinStretch.internalScore >= 60);
assert.equal(thinStretch.whyNotMatched.some((reason) => reason.includes("too thin")), false);

// Compound functional titles stay in their specific occupation family. A profile
// targeting Marketing Project Manager must not inherit the entire generic program
// management lane, while nearby marketing/creative project roles remain eligible.
const marketingCreativeProfile = profile();
marketingCreativeProfile.roleTracks[0] = {
  ...marketingCreativeProfile.roleTracks[0],
  name: "Marketing",
  targetTitles: [
    "Director of Marketing",
    "Creative Director",
    "Director of Content",
    "Head of Content",
    "Head of Creative",
    "Head of Brand Creative",
    "Brand Marketing Director",
    "Director of Social Media",
    "Digital Marketing Director",
    "Marketing Project Manager",
  ],
  keyResponsibilities: ["Lead brand marketing campaigns", "Own creative and content strategy"],
  requiredExperiencePatterns: ["Marketing leadership", "Creative team leadership"],
  strongJobSignals: ["Brand marketing", "Content production", "Social media"],
  weakJobSignals: [],
  mismatchSignals: [],
};
const marketingCreativeSignals = matchingSignalsForAggregate(marketingCreativeProfile);
assert.ok(marketingCreativeSignals.lanes.coreLanes.has("marketing-creative-project-management"));
assert.ok(marketingCreativeSignals.lanes.coreLanes.has("marketing-management"));
assert.ok(marketingCreativeSignals.lanes.coreLanes.has("creative-leadership"));
assert.ok(marketingCreativeSignals.lanes.coreLanes.has("social-creative"));
assert.equal(marketingCreativeSignals.lanes.coreLanes.has("program-project-management"), false);

// Explicit target titles and declared search preferences are authoritative for
// discovery. Experience evidence can explain a result later, but it must not
// redirect the search, suppress an eligible title-family match, or reorder the
// pool. Ambiguous account titles use declared industry and posting context.
const marketingAccountProfile = profile();
marketingAccountProfile.preferences = {
  ...marketingAccountProfile.preferences!,
  targetIndustries: ["Advertising Services", "Marketing Services", "Retail Media", "Paid Media"],
};
marketingAccountProfile.roleTracks[0] = {
  ...marketingAccountProfile.roleTracks[0],
  name: "Revenue Leadership",
  targetTitles: ["Account Director", "Sales Director"],
  keyResponsibilities: ["Enterprise sales", "Quota ownership"],
  requiredExperiencePatterns: ["Pipeline generation"],
  strongJobSignals: ["Revenue growth"],
  weakJobSignals: ["Integrated marketing"],
  mismatchSignals: ["Advertising campaigns"],
};
marketingAccountProfile.skills[0] = {
  ...marketingAccountProfile.skills[0],
  skillName: "Enterprise sales",
  evidence: ["Owned a sales pipeline"],
};
if (marketingAccountProfile.fitSignals) {
  marketingAccountProfile.fitSignals.goodSignals = ["Quota attainment"];
  marketingAccountProfile.fitSignals.poorFitSignals = ["Agency account services"];
}

const oppositeExperienceProfile = clone(marketingAccountProfile);
oppositeExperienceProfile.roleTracks[0] = {
  ...oppositeExperienceProfile.roleTracks[0],
  name: "Agency Leadership",
  keyResponsibilities: ["Integrated marketing", "Client services"],
  requiredExperiencePatterns: ["Advertising campaigns"],
  strongJobSignals: ["Retail media"],
  weakJobSignals: ["Enterprise sales"],
  mismatchSignals: ["Quota ownership"],
};
oppositeExperienceProfile.skills[0] = {
  ...oppositeExperienceProfile.skills[0],
  skillName: "Integrated marketing",
  evidence: ["Led agency accounts"],
};
if (oppositeExperienceProfile.fitSignals) {
  oppositeExperienceProfile.fitSignals.goodSignals = ["Agency account services"];
  oppositeExperienceProfile.fitSignals.poorFitSignals = ["Pipeline generation"];
}

const marketingAccountSignals = matchingSignalsForAggregate(marketingAccountProfile);
const oppositeExperienceSignals = matchingSignalsForAggregate(oppositeExperienceProfile);
assert.deepEqual(marketingAccountSignals.titleTerms, ["Account Director", "Sales Director"]);
assert.deepEqual(marketingAccountSignals.positiveKeywords, []);
assert.deepEqual(marketingAccountSignals.negativeKeywords, []);
assert.deepEqual(oppositeExperienceSignals.titleTerms, marketingAccountSignals.titleTerms);
assert.deepEqual(oppositeExperienceSignals.positiveKeywords, []);
assert.deepEqual(oppositeExperienceSignals.negativeKeywords, []);

const agencyAccountJob: MatchJob = {
  id: "job-040-agency-account-director",
  title: "Senior Account Director",
  companyName: "Independent Agency",
  description: "Lead integrated marketing and advertising campaigns, own client services, oversee retail media strategy, and guide cross-functional delivery.",
  remoteType: "remote",
  postedAt: "2026-06-27T12:00:00.000Z",
};
const enterpriseSalesAccountJob: MatchJob = {
  id: "job-040-enterprise-sales-account-director",
  title: "Senior Account Director",
  companyName: "Enterprise Software Company",
  description: "Own an enterprise sales quota, build pipeline, close software deals, forecast revenue, and lead account planning for strategic customers.",
  remoteType: "remote",
  postedAt: "2026-06-27T12:00:00.000Z",
};

const agencyAccountDecision = evaluatePublicJobDecision(agencyAccountJob, marketingAccountSignals, now);
const agencyAccountOppositeDecision = evaluatePublicJobDecision(agencyAccountJob, oppositeExperienceSignals, now);
assert.equal(agencyAccountDecision.included, true, "marketing Account Director roles should follow declared search context");
assert.equal(agencyAccountOppositeDecision.included, agencyAccountDecision.included);
assert.equal(agencyAccountOppositeDecision.score, agencyAccountDecision.score);

const agencyAccountRendered = evaluateMatch({ profile: marketingAccountProfile, job: agencyAccountJob, evaluatedAt: now });
const agencyAccountOppositeRendered = evaluateMatch({ profile: oppositeExperienceProfile, job: agencyAccountJob, evaluatedAt: now });
assert.equal(agencyAccountOppositeRendered.internalScore, agencyAccountRendered.internalScore);
assert.equal(agencyAccountOppositeRendered.label, agencyAccountRendered.label);

const thinMarketingAccountProfile = clone(marketingAccountProfile);
thinMarketingAccountProfile.resumes[0].parsedText = "Account Director";
thinMarketingAccountProfile.resumes[0].highlights = [];
thinMarketingAccountProfile.resumes[0].strengths = [];
thinMarketingAccountProfile.workExamples = [];
thinMarketingAccountProfile.skills = [];
const agencyAccountThinRendered = evaluateMatch({ profile: thinMarketingAccountProfile, job: agencyAccountJob, evaluatedAt: now });
assert.equal(agencyAccountThinRendered.internalScore, agencyAccountRendered.internalScore);
assert.equal(agencyAccountThinRendered.label, agencyAccountRendered.label);

const sparseAccountJob: MatchJob = {
  ...agencyAccountJob,
  id: "job-040-sparse-account-context",
  companyName: "Context-Light Company",
  description: "Lead the account team and own cross-functional stakeholder delivery.",
};
const sparseAccountDecision = evaluatePublicJobDecision(sparseAccountJob, marketingAccountSignals, now);
assert.equal(sparseAccountDecision.included, true, "an exact title with unknown context stays eligible instead of being guessed into a function");

const richOrdering = [agencyAccountJob, sparseAccountJob]
  .map((job) => ({ id: job.id, score: evaluateMatch({ profile: marketingAccountProfile, job, evaluatedAt: now }).internalScore }))
  .sort((first, second) => second.score - first.score);
const oppositeOrdering = [agencyAccountJob, sparseAccountJob]
  .map((job) => ({ id: job.id, score: evaluateMatch({ profile: oppositeExperienceProfile, job, evaluatedAt: now }).internalScore }))
  .sort((first, second) => second.score - first.score);
assert.deepEqual(oppositeOrdering, richOrdering);

const enterpriseSalesAccountDecision = evaluatePublicJobDecision(enterpriseSalesAccountJob, marketingAccountSignals, now);
const enterpriseSalesAccountOppositeDecision = evaluatePublicJobDecision(enterpriseSalesAccountJob, oppositeExperienceSignals, now);
assert.equal(enterpriseSalesAccountDecision.included, false, "an ambiguous Account Director title must not become enterprise sales from experience overlap");
assert.ok(enterpriseSalesAccountDecision.risks.some((risk) => risk.includes("declared search context")));
assert.equal(enterpriseSalesAccountOppositeDecision.included, enterpriseSalesAccountDecision.included);
assert.equal(enterpriseSalesAccountOppositeDecision.score, enterpriseSalesAccountDecision.score);

for (const [id, description] of [
  [
    "job-040-sales-growth-word",
    "Drive revenue growth across enterprise accounts. Own quota, close new business, and lead customer relationships.",
  ],
  [
    "job-040-sales-client-services-word",
    "Own sales quota and grow client services revenue through pipeline generation, forecasting, and new business.",
  ],
  [
    "job-040-sales-business-development",
    "Own business development across an assigned territory. Lead prospecting, negotiate deals, and manage CRM activity with executive buyers.",
  ],
  [
    "job-040-sales-quota-territory",
    "Own a quota-carrying territory and lead customer acquisition across enterprise accounts.",
  ],
  [
    "job-040-advertising-sales",
    "Lead sales of advertising campaigns for brands and media agencies. Own quota and pipeline for new business.",
  ],
  [
    "job-040-advertising-sales-quota",
    "Sell advertising campaigns to brands and own a sales quota.",
  ],
  [
    "job-040-brand-advertising-sales-quota",
    "Lead advertising sales for brand campaigns and own quota attainment.",
  ],
  [
    "job-040-advertising-quota",
    "Own quota for advertising campaigns and brand media solutions.",
  ],
] as const) {
  const salesContextDecision = evaluatePublicJobDecision({
    ...enterpriseSalesAccountJob,
    id,
    description,
  }, marketingAccountSignals, now);
  assert.equal(salesContextDecision.included, false, `${id} must resolve from the full sales context, not one marketing word`);
  assert.ok(salesContextDecision.risks.some((risk) => risk.includes("declared search context")));
}

for (const title of [
  "Advertising Sales Account Director",
  "Media Sales Account Director",
  "Account Director, Advertising Sales",
]) {
  const explicitSalesTitleDecision = evaluatePublicJobDecision({
    ...enterpriseSalesAccountJob,
    id: `job-040-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title,
    description: "Lead the account team, own stakeholder relationships, and guide cross-functional delivery.",
  }, marketingAccountSignals, now);
  assert.equal(explicitSalesTitleDecision.included, false, `${title} states its sales function in the title`);
  assert.ok(explicitSalesTitleDecision.risks.some((risk) => risk.includes("declared search context")));
}


for (const [id, description] of [
  [
    "job-040-agency-account-economics",
    "Lead brand campaigns and client relationships. Own account revenue, forecast growth, identify new business, and manage account planning.",
  ],
  [
    "job-040-advertising-account-economics",
    "Lead advertising campaigns and brand strategy while owning account revenue, new business, forecasting, and account planning.",
  ],
] as const) {
  const marketingEconomicsDecision = evaluatePublicJobDecision({
    ...agencyAccountJob,
    id,
    description,
  }, marketingAccountSignals, now);
  assert.equal(marketingEconomicsDecision.included, true, `${id} must stay marketing when ordinary account economics are present`);
}

const explicitSalesDirectorDecision = evaluatePublicJobDecision({
  ...enterpriseSalesAccountJob,
  id: "job-040-explicit-sales-director",
  title: "Sales Director",
}, marketingAccountSignals, now);
assert.equal(explicitSalesDirectorDecision.included, true, "an explicitly saved Sales Director title remains authoritative");

// Declared industries disambiguate unknown titles only. They must not become
// occupation lanes of their own when the explicit title already has a stable
// function. "Legal Services" cannot expand a Software Engineer search into law.
const knownTitleIndustryProfile = profile();
knownTitleIndustryProfile.preferences = {
  ...knownTitleIndustryProfile.preferences!,
  targetIndustries: ["Legal Services"],
};
knownTitleIndustryProfile.roleTracks[0] = {
  ...knownTitleIndustryProfile.roleTracks[0],
  name: "Technology",
  targetTitles: ["Software Engineer"],
  keyResponsibilities: ["Legal compliance"],
  requiredExperiencePatterns: ["Contract review"],
  strongJobSignals: ["Regulatory policy"],
};
const knownTitleIndustrySignals = matchingSignalsForAggregate(knownTitleIndustryProfile);
assert.ok(knownTitleIndustrySignals.lanes.coreLanes.has("technical-engineering"));
assert.equal(knownTitleIndustrySignals.lanes.coreLanes.has("legal-compliance"), false);
assert.equal(knownTitleIndustrySignals.lanes.stretchLanes.has("legal-compliance"), false);
const legalIndustryExpansionDecision = evaluatePublicJobDecision({
  id: "job-explicit-title-industry-expansion",
  title: "Senior Legal Counsel",
  companyName: "Legal Services Company",
  description: "Lead contract review, legal compliance, regulatory policy, stakeholder strategy, and cross-functional operations.",
  remoteType: "remote",
  postedAt: "2026-06-27T12:00:00.000Z",
}, knownTitleIndustrySignals, now);
assert.equal(legalIndustryExpansionDecision.included, false);
assert.ok(legalIndustryExpansionDecision.risks.some((risk) => risk.includes("different lane")));

for (const title of [
  "Senior Program Manager",
  "Program Director, Workforce Planning",
  "Project Manager, New Product Engineering",
]) {
  const genericProgramDecision = evaluatePublicJobDecision({
    id: `generic-${title}`,
    title,
    companyName: "Generic Company",
    description: "Own cross-functional planning, stakeholder alignment, delivery milestones, risk, scope, and executive reporting.",
    location: "Remote - US",
    remoteType: "remote",
    postedAt: "2026-06-27T12:00:00.000Z",
  }, marketingCreativeSignals, now);
  assert.equal(genericProgramDecision.included, false, `${title} must not inherit a compound marketing project target`);
  assert.equal(genericProgramDecision.label, "Probably Not Worth Your Time");
  assert.ok(genericProgramDecision.risks.some((risk) => risk.includes("different lane")));
}

for (const title of ["Marketing Project Manager", "Creative Project Manager", "Campaign Program Lead"]) {
  const specializedDecision = evaluatePublicJobDecision({
    id: `specialized-${title}`,
    title,
    companyName: "Creative Company",
    description: "Own brand marketing campaigns, creative assets, content production, stakeholder planning, and cross-functional delivery.",
    location: "Remote - US",
    remoteType: "remote",
    postedAt: "2026-06-27T12:00:00.000Z",
  }, marketingCreativeSignals, now);
  assert.equal(specializedDecision.included, true, `${title} should remain eligible for this profile`);
  assert.equal(specializedDecision.roleFamily, title === "Marketing Project Manager"
    ? "profile-target"
    : "marketing-creative-project-management");
}

// General operations, finance/accounting, and procurement are separate occupation
// families. A Chief of Staff target must not make Accounting or Controller jobs a
// core match, while profiles that explicitly target those specialties keep them.
const generalOperationsProfile = profile();
generalOperationsProfile.roleTracks[0] = {
  ...generalOperationsProfile.roleTracks[0],
  name: "General",
  targetTitles: ["Chief of Staff", "Operations Manager", "Director of Operations"],
  keyResponsibilities: ["Lead cross-functional business operations and executive planning"],
  requiredExperiencePatterns: ["Operating rhythm and stakeholder alignment"],
  strongJobSignals: ["Strategic initiatives", "Business planning"],
  weakJobSignals: [],
  mismatchSignals: [],
};
const generalOperationsSignals = matchingSignalsForAggregate(generalOperationsProfile);
assert.ok(generalOperationsSignals.lanes.coreLanes.has("strategy-operations"));
assert.equal(generalOperationsSignals.lanes.coreLanes.has("finance-accounting"), false);
assert.equal(generalOperationsSignals.lanes.stretchLanes.has("finance-accounting"), false);
assert.equal(generalOperationsSignals.lanes.coreLanes.has("procurement-supply-chain-operations"), false);
assert.equal(generalOperationsSignals.lanes.stretchLanes.has("procurement-supply-chain-operations"), false);

const unrelatedFinanceJobs: MatchJob[] = [
  {
    id: "job-037-finance-operations",
    title: "Manager, Finance Operations",
    companyName: "Finance Company",
    description: "Own financial planning, forecasting, budget models, and month-end reporting.",
  },
  {
    id: "job-037-accounting-manager",
    title: "Senior Manager, Accounting",
    companyName: "Accounting Company",
    description: "Lead accounting policy, audits, reconciliations, and financial reporting.",
  },
  {
    id: "job-037-controller",
    title: "Senior Manager, Assistant Controller",
    companyName: "Controller Company",
    description: "Own controllership, accounting close, audit readiness, and financial controls.",
  },
  {
    id: "job-037-procurement",
    title: "Procurement Manager",
    companyName: "Procurement Company",
    description: "Lead procurement, supplier management, sourcing, and vendor contracts.",
  },
  {
    id: "job-037-sourcing",
    title: "Strategic Sourcing Manager",
    companyName: "Sourcing Company",
    description: "Own strategic sourcing, supplier negotiations, procurement, and category strategy.",
  },
  {
    id: "job-037-accounts-receivable",
    title: "Accounts Receivable and Billing Operations Manager",
    companyName: "Billing Company",
    description: "Own accounts receivable, billing operations, collections, and financial reporting.",
  },
  {
    id: "job-037-fraud-strategy",
    title: "Fraud Strategy Manager",
    companyName: "Financial Services Company",
    description: "Own fraud controls, fraud investigations, risk policy, and loss prevention.",
  },
];

for (const unrelatedJob of unrelatedFinanceJobs) {
  const decision = evaluatePublicJobDecision(unrelatedJob, generalOperationsSignals, now);
  assert.equal(decision.included, false, `${unrelatedJob.title} must not inherit a general-operations target`);
  assert.equal(decision.label, "Probably Not Worth Your Time");
  assert.ok(decision.score <= 37, `${unrelatedJob.title} must stay under the excluded-score cap`);
  assert.ok(decision.risks.some((risk) => risk.includes("different lane")));
}

for (const title of ["Chief of Staff", "Business Operations Manager", "Director of Operations"]) {
  const decision = evaluatePublicJobDecision({
    id: `job-general-operations-${title}`,
    title,
    companyName: "Operations Company",
    description: "Lead business operations, executive planning, operating rhythms, and cross-functional strategic initiatives.",
  }, generalOperationsSignals, now);
  assert.equal(decision.included, true, `${title} should remain eligible for a general-operations profile`);
}

const financeProfile = profile();
financeProfile.roleTracks[0] = {
  ...financeProfile.roleTracks[0],
  name: "Finance Leadership",
  targetTitles: ["Director of Finance", "Corporate Controller"],
  keyResponsibilities: ["Lead financial planning, accounting, forecasting, and reporting"],
  requiredExperiencePatterns: ["Controllership and audit leadership"],
  strongJobSignals: ["Budget ownership", "Financial controls"],
  weakJobSignals: [],
  mismatchSignals: [],
};
const financeSignals = matchingSignalsForAggregate(financeProfile);
assert.ok(financeSignals.lanes.coreLanes.has("finance-accounting"));
for (const title of ["Finance Operations Manager", "Corporate Controller", "Accounts Receivable Manager"]) {
  const decision = evaluatePublicJobDecision({
    id: `job-finance-supported-${title}`,
    title,
    companyName: "Finance Company",
    description: "Own financial planning, accounting, forecasting, reporting, and audit readiness.",
  }, financeSignals, now);
  assert.equal(decision.included, true, `${title} should remain eligible for a finance profile`);
}

const fraudRiskProfile = profile();
fraudRiskProfile.roleTracks[0] = {
  ...fraudRiskProfile.roleTracks[0],
  name: "Fraud Risk Leadership",
  targetTitles: ["Fraud Strategy Manager", "Fraud Operations Manager"],
  keyResponsibilities: ["Lead fraud controls, investigations, risk policy, and loss prevention"],
  requiredExperiencePatterns: ["Fraud prevention and risk operations leadership"],
  strongJobSignals: ["Fraud strategy", "Risk controls"],
  weakJobSignals: [],
  mismatchSignals: [],
};
const fraudRiskSignals = matchingSignalsForAggregate(fraudRiskProfile);
assert.ok(fraudRiskSignals.lanes.coreLanes.has("risk-safety-operations"));
const fraudRiskDecision = evaluatePublicJobDecision({
  id: "job-fraud-risk-supported",
  title: "Fraud Strategy Manager",
  companyName: "Financial Services Company",
  description: "Own fraud controls, investigations, risk policy, and loss prevention.",
}, fraudRiskSignals, now);
assert.equal(fraudRiskDecision.included, true, "Fraud roles should remain eligible for a fraud-risk profile");

const procurementProfile = profile();
procurementProfile.roleTracks[0] = {
  ...procurementProfile.roleTracks[0],
  name: "Procurement Leadership",
  targetTitles: ["Procurement Manager", "Strategic Sourcing Manager"],
  keyResponsibilities: ["Lead procurement, strategic sourcing, and supplier management"],
  requiredExperiencePatterns: ["Vendor contracts and supply chain operations"],
  strongJobSignals: ["Supplier negotiations", "Category strategy"],
  weakJobSignals: [],
  mismatchSignals: [],
};
const procurementSignals = matchingSignalsForAggregate(procurementProfile);
assert.ok(procurementSignals.lanes.coreLanes.has("procurement-supply-chain-operations"));
for (const title of ["Procurement Operations Manager", "Strategic Sourcing Manager"]) {
  const decision = evaluatePublicJobDecision({
    id: `job-procurement-supported-${title}`,
    title,
    companyName: "Procurement Company",
    description: "Lead procurement, strategic sourcing, supplier management, and vendor contracts.",
  }, procurementSignals, now);
  assert.equal(decision.included, true, `${title} should remain eligible for a procurement profile`);
}

assert.equal(classifyOccupation({
  title: "Finance Strategy Manager",
  companyName: "Finance Company",
  description: "Own financial planning, forecasting, and executive finance strategy.",
}).lane, "finance-accounting");

// Regression 2026-08-17: unknown AI targets must never inherit a marketing
// occupation lane merely because the account also targets Advertising Services.
const producerAiProgramProfile = profile();
producerAiProgramProfile.preferences = {
  ...producerAiProgramProfile.preferences!,
  targetIndustries: [
    "AI",
    "web3",
    "crypto",
    "Advertising Services",
    "outdoor",
    "AI Enablement",
    "AI deployment",
    "AI operations",
    "AI solutions",
  ],
};
producerAiProgramProfile.roleTracks[0] = {
  ...producerAiProgramProfile.roleTracks[0],
  name: "Producer, AI Enablement, and Program Leadership",
  targetTitles: [
    "Executive Producer",
    "creative producer",
    "production lead",
    "AI Enablement Specialist",
    "AI Solution Strategist",
    "Enterprise AI Operations Lead",
    "AI Operations Specialist",
    "Program director",
    "program manager",
  ],
};
const producerAiProgramSignals = matchingSignalsForAggregate(producerAiProgramProfile);
assert.deepEqual([...producerAiProgramSignals.lanes.coreLanes].sort(), [
  "ai-enablement-operations",
  "content-video-production",
  "digital-production",
  "program-project-management",
]);
assert.equal(producerAiProgramSignals.lanes.coreLanes.has("marketing-management"), false);
assert.equal(producerAiProgramSignals.lanes.coreLanes.has("creative-strategy"), false);
for (const title of [
  "AI Enablement Specialist",
  "AI Solution Strategist",
  "Enterprise AI Operations Lead",
  "AI Operations Specialist",
]) {
  assert.equal(classifyOccupation({ title, description: "", companyName: "" }).lane, "ai-enablement-operations");
}

const unrelatedMarketingDecision = evaluatePublicJobDecision({
  id: "job-ai-profile-marketing-regression",
  title: "Director of Product Marketing",
  companyName: "AI Company",
  description: "Lead product marketing strategy, campaigns, stakeholder alignment, operations, and cross-functional delivery for an AI platform.",
  remoteType: "remote",
  postedAt: "2026-06-27T12:00:00.000Z",
}, producerAiProgramSignals, now);
assert.equal(unrelatedMarketingDecision.included, false);
assert.ok(unrelatedMarketingDecision.risks.some((risk) => risk.includes("different lane")));

const aiEnablementDecision = evaluatePublicJobDecision({
  id: "job-ai-enablement-supported",
  title: "Enterprise AI Enablement Lead",
  companyName: "AI Company",
  description: "Own enterprise AI adoption, AI deployment, stakeholder enablement, workflow delivery, and cross-functional planning.",
  remoteType: "remote",
  postedAt: "2026-06-27T12:00:00.000Z",
}, producerAiProgramSignals, now);
assert.equal(aiEnablementDecision.included, true);
assert.equal(aiEnablementDecision.roleFamily, "ai-enablement-operations");

// Unknown title families do not receive a lane from target industries. Industry
// disambiguation remains limited to the explicitly modeled Account Director case.
const communicationsProfile = profile();
communicationsProfile.preferences = {
  ...communicationsProfile.preferences!,
  targetIndustries: ["Information Technology", "Cloud Infrastructure"],
};
communicationsProfile.roleTracks[0] = {
  ...communicationsProfile.roleTracks[0],
  name: "Communications Leadership",
  targetTitles: [
    "Communications Director",
    "Strategic Communications Director",
    "Vice President of Communications",
    "Executive Communications Director",
  ],
};
const communicationsSignals = matchingSignalsForAggregate(communicationsProfile);
assert.equal(communicationsSignals.lanes.coreLanes.has("data-it-infrastructure"), false);
assert.deepEqual(
  communicationsSignals.lanes.coreLanes,
  new Set(["communications-leadership"]),
);
for (const title of communicationsProfile.roleTracks[0].targetTitles) {
  assert.equal(
    classifyOccupation({ title, description: "", companyName: "" }).lane,
    "communications-leadership",
  );
}
const communicationsDecision = evaluatePublicJobDecision({
  id: "job-communications-leadership",
  title: "Director of Executive Communications",
  companyName: "Cloud Company",
  description: "Own executive messaging, media relations, strategic communications, stakeholder alignment, and cross-functional delivery.",
  remoteType: "remote",
  postedAt: "2026-06-27T12:00:00.000Z",
}, communicationsSignals, now);
assert.equal(communicationsDecision.included, true);
assert.equal(communicationsDecision.roleFamily, "communications-leadership");

// Exact saved targets rank ahead of broad same-lane matches when all other
// posting evidence is equivalent.
const exactProducerProfile = profile();
exactProducerProfile.roleTracks[0] = {
  ...exactProducerProfile.roleTracks[0],
  name: "Executive Producer",
  targetTitles: ["Executive Producer"],
};
const exactProducerSignals = matchingSignalsForAggregate(exactProducerProfile);
const equivalentProducerJob = {
  companyName: "Production Company",
  description: "Lead content production, own budgets, vendors, stakeholders, strategy, and cross-functional delivery.",
  remoteType: "remote",
  postedAt: "2026-06-27T12:00:00.000Z",
};
const exactProducerDecision = evaluatePublicJobDecision({
  ...equivalentProducerJob,
  id: "job-exact-executive-producer",
  title: "Executive Producer",
}, exactProducerSignals, now);
const broadProducerDecision = evaluatePublicJobDecision({
  ...equivalentProducerJob,
  id: "job-broad-video-producer",
  title: "Video Producer",
}, exactProducerSignals, now);
assert.equal(exactProducerDecision.included, true);
assert.equal(broadProducerDecision.included, true);
assert.ok(exactProducerDecision.score > broadProducerDecision.score);

// Explicit titles on one track must not deactivate another valid track whose
// maintained name is its only declared title-family signal.
const partiallyTitledProfile = profile();
partiallyTitledProfile.roleTracks = [
  {
    ...partiallyTitledProfile.roleTracks[0],
    id: "track-explicit-program",
    name: "Program Leadership",
    targetTitles: ["Program Director"],
  },
  {
    ...partiallyTitledProfile.roleTracks[0],
    id: "track-name-only-producer",
    name: "Executive Producer",
    targetTitles: [],
  },
];
const partiallyTitledSignals = matchingSignalsForAggregate(partiallyTitledProfile);
assert.ok(partiallyTitledSignals.lanes.coreLanes.has("program-project-management"));
assert.ok(partiallyTitledSignals.lanes.coreLanes.has("content-video-production"));
assert.deepEqual(partiallyTitledSignals.titleTerms, ["Program Director", "Executive Producer"]);

// Regression 2026-08-18: a generic target title is only the role layer. The
// posting's current industry or functional context is a separate layer, and the
// same rule must work symmetrically for every user's declared industry.
const genericProgramContexts = [
  {
    id: "advertising",
    targetIndustry: "Advertising Services",
    department: "Advertising Account Services",
    description: "Lead advertising campaigns, creative production, media planning, stakeholder strategy, and cross-functional delivery.",
  },
  {
    id: "it",
    targetIndustry: "Information Technology",
    department: "Information Technology",
    description: "Lead enterprise information technology programs across cloud infrastructure, cybersecurity, systems delivery, stakeholders, scope, and planning.",
  },
  {
    id: "healthcare",
    targetIndustry: "Healthcare",
    department: "Clinical Operations",
    description: "Lead healthcare modernization across clinical programs, patient services, regulatory care delivery, stakeholders, scope, and planning.",
  },
] as const;

function genericProgramProfile(targetIndustry: string) {
  const aggregate = profile();
  aggregate.preferences = {
    ...aggregate.preferences!,
    targetIndustries: targetIndustry ? [targetIndustry] : [],
    avoidIndustries: [],
    avoidCompanies: [],
  };
  aggregate.roleTracks[0] = {
    ...aggregate.roleTracks[0],
    name: "Program Leadership",
    targetTitles: ["Program Director"],
    keyResponsibilities: [],
    requiredExperiencePatterns: [],
    strongJobSignals: [],
    weakJobSignals: [],
    mismatchSignals: [],
  };
  aggregate.skills = [];
  aggregate.workExamples = [];
  aggregate.fitSignals = undefined;
  return aggregate;
}

function genericProgramJob(context: typeof genericProgramContexts[number]): MatchJob {
  return {
    id: `job-generic-program-${context.id}`,
    title: "Program Director",
    companyName: `${context.id} organization`,
    department: context.department,
    description: context.description,
    remoteType: "remote",
    postedAt: "2026-06-27T12:00:00.000Z",
  };
}

for (const profileContext of genericProgramContexts) {
  const aggregate = genericProgramProfile(profileContext.targetIndustry);
  const signals = matchingSignalsForAggregate(aggregate);
  for (const jobContext of genericProgramContexts) {
    const decision = evaluatePublicJobDecision(genericProgramJob(jobContext), signals, now);
    assert.equal(
      decision.included,
      profileContext.id === jobContext.id,
      `${profileContext.targetIndustry} Program Director search must ${profileContext.id === jobContext.id ? "include" : "exclude"} ${jobContext.id} context`,
    );
    assert.equal(decision.industryContext.status, profileContext.id === jobContext.id ? "aligned" : "conflict");
  }
}

for (const [targetIndustry, jobContext] of [
  ["Technology, Information and Internet", genericProgramContexts[1]],
  ["Hospitals and Health Care", genericProgramContexts[2]],
  ["Brand", genericProgramContexts[0]],
] as const) {
  const decision = evaluatePublicJobDecision(
    genericProgramJob(jobContext),
    matchingSignalsForAggregate(genericProgramProfile(targetIndustry)),
    now,
  );
  assert.equal(decision.included, true, `${targetIndustry} catalogue label must resolve to ${jobContext.id}`);
  assert.equal(decision.industryContext.status, "aligned");
}

for (const title of [
  "Program Director",
  "Project Manager",
  "Operations Director",
  "Chief of Staff",
  "COO",
  "Fractional COO",
  "Program Analyst",
  "Program Specialist",
  "Program Administrator",
  "Program Associate",
  "Program Management Office Director",
  "Program Management Office Analyst",
  "PMO Director",
]) {
  assert.equal(isGenericCrossIndustryTitle(title), true, `${title} must require industry context`);
}
for (const title of [
  "Program Director, Integrated Healthcare Modernization",
  "Senior Information Technology Program Manager",
  "Legal Account Director",
]) {
  assert.equal(hasGenericCrossIndustryRoleHead(title), true, `${title} must retain its generic role head`);
}
for (const title of ["Marketing Program Director", "Technical Program Manager", "Clinical Operations Director"]) {
  assert.equal(isGenericCrossIndustryTitle(title), false, `${title} already carries functional context`);
}

// Multiple target industries are a union. Adding IT makes both advertising and
// IT contexts valid without admitting an unrelated healthcare context.
const multiIndustryProgramProfile = genericProgramProfile("Advertising Services");
multiIndustryProgramProfile.preferences!.targetIndustries = ["Advertising Services", "Information Technology"];
const multiIndustryProgramSignals = matchingSignalsForAggregate(multiIndustryProgramProfile);
for (const jobContext of genericProgramContexts) {
  const decision = evaluatePublicJobDecision(genericProgramJob(jobContext), multiIndustryProgramSignals, now);
  assert.equal(decision.included, jobContext.id !== "healthcare");
}

// Functional qualifiers remain authoritative. A Marketing Program Director on
// a health-care company's marketing team is not reclassified as a clinical role.
const qualifiedMarketingProgramProfile = genericProgramProfile("Advertising Services");
qualifiedMarketingProgramProfile.roleTracks[0].targetTitles = ["Marketing Program Director"];
const qualifiedMarketingProgramDecision = evaluatePublicJobDecision({
  id: "job-qualified-marketing-program-healthcare-company",
  title: "Marketing Program Director",
  companyName: "Hospital Network",
  department: "Integrated Marketing",
  description: "Lead brand marketing, advertising campaigns, media planning, creative production, stakeholders, and delivery for a healthcare organization.",
  remoteType: "remote",
  postedAt: "2026-06-27T12:00:00.000Z",
}, matchingSignalsForAggregate(qualifiedMarketingProgramProfile), now);
assert.equal(qualifiedMarketingProgramDecision.included, true);
assert.equal(qualifiedMarketingProgramDecision.industryContext.status, "not_applicable");

// A generic target cannot hijack a separate specialized target in the same
// profile. Each posting is validated against the intent that supports it.
const marketingOnlyProfile = genericProgramProfile("Advertising Services");
marketingOnlyProfile.roleTracks[0].targetTitles = ["Marketing Director"];
const mixedMarketingAndProgramProfile = clone(marketingOnlyProfile);
mixedMarketingAndProgramProfile.roleTracks[0].targetTitles.push("Program Director");
const marketingStrategyJob: MatchJob = {
  id: "job-marketing-strategy-director-mixed-targets",
  title: "Director of Marketing Strategy",
  companyName: "Advertising Agency",
  department: "Marketing",
  description: "Lead brand marketing strategy, advertising campaigns, media planning, and creative production.",
  remoteType: "remote",
  postedAt: "2026-06-27T12:00:00.000Z",
};
const marketingOnlyDecision = evaluatePublicJobDecision(
  marketingStrategyJob,
  matchingSignalsForAggregate(marketingOnlyProfile),
  now,
);
const mixedMarketingAndProgramDecision = evaluatePublicJobDecision(
  marketingStrategyJob,
  matchingSignalsForAggregate(mixedMarketingAndProgramProfile),
  now,
);
assert.equal(mixedMarketingAndProgramDecision.included, marketingOnlyDecision.included);
assert.equal(mixedMarketingAndProgramDecision.score, marketingOnlyDecision.score);
assert.equal(mixedMarketingAndProgramDecision.industryContext.status, marketingOnlyDecision.industryContext.status);

// Search context, not experience history, controls the industry layer.
const advertisingProgramProfile = genericProgramProfile("Advertising Services");
const oppositeExperienceProgramProfile = clone(advertisingProgramProfile);
oppositeExperienceProgramProfile.roleTracks[0].keyResponsibilities = ["Lead clinical healthcare modernization and hospital programs"];
oppositeExperienceProgramProfile.skills = [{
  ...profile().skills[0],
  skillName: "Clinical operations",
  evidence: ["Hospital transformation"],
}];
const advertisingProgramSignals = matchingSignalsForAggregate(advertisingProgramProfile);
const oppositeExperienceProgramSignals = matchingSignalsForAggregate(oppositeExperienceProgramProfile);
for (const jobContext of genericProgramContexts) {
  const job = genericProgramJob(jobContext);
  const baselineDecision = evaluatePublicJobDecision(job, advertisingProgramSignals, now);
  const oppositeExperienceDecision = evaluatePublicJobDecision(job, oppositeExperienceProgramSignals, now);
  assert.equal(oppositeExperienceDecision.included, baselineDecision.included);
  assert.equal(oppositeExperienceDecision.score, baselineDecision.score);
}

// With no declared industry, the industry layer is neutral. A sparse posting is
// unknown rather than falsely contradictory.
const unconstrainedProgramDecision = evaluatePublicJobDecision(
  genericProgramJob(genericProgramContexts[1]),
  matchingSignalsForAggregate(genericProgramProfile("")),
  now,
);
assert.equal(unconstrainedProgramDecision.included, true);
assert.equal(unconstrainedProgramDecision.industryContext.status, "not_applicable");
const unknownContextProgramDecision = evaluatePublicJobDecision({
  id: "job-generic-program-unknown",
  title: "Program Director",
  companyName: "Organization",
  description: "Own strategy, lead cross-functional delivery, manage stakeholders, scope, planning, and budget across the organization.",
  remoteType: "remote",
  postedAt: "2026-06-27T12:00:00.000Z",
}, matchingSignalsForAggregate(genericProgramProfile("Advertising Services")), now);
assert.equal(unknownContextProgramDecision.included, true);
assert.equal(unknownContextProgramDecision.industryContext.status, "unknown");
const alignedContextProgramDecision = evaluatePublicJobDecision(
  genericProgramJob(genericProgramContexts[0]),
  matchingSignalsForAggregate(genericProgramProfile("Advertising Services")),
  now,
);
assert.ok(alignedContextProgramDecision.score > unknownContextProgramDecision.score);

// A selected industry mentioned incidentally in the body cannot override a
// contradictory functional modifier in the title or department.
const aiProgramSignals = matchingSignalsForAggregate(genericProgramProfile("AI"));
const aiMentionInsideItProgram = evaluatePublicJobDecision({
  id: "job-generic-program-it-with-ai-mention",
  title: "Program Director, Information Technology",
  companyName: "Enterprise Organization",
  department: "Information Technology",
  description: "Lead cloud infrastructure, enterprise systems, cybersecurity, and an AI modernization workstream across stakeholders and delivery.",
  remoteType: "remote",
  postedAt: "2026-06-27T12:00:00.000Z",
}, aiProgramSignals, now);
assert.equal(aiMentionInsideItProgram.included, false);
assert.equal(aiMentionInsideItProgram.industryContext.status, "conflict");
const aiQualifiedGenericProgram = evaluatePublicJobDecision({
  id: "job-generic-program-ai-qualified",
  title: "AI Program Director",
  companyName: "Enterprise Organization",
  department: "AI Enablement",
  description: "Lead enterprise AI deployment, generative AI workflows, stakeholders, strategy, and cross-functional delivery.",
  remoteType: "remote",
  postedAt: "2026-06-27T12:00:00.000Z",
}, aiProgramSignals, now);
assert.equal(aiQualifiedGenericProgram.included, true);
assert.equal(aiQualifiedGenericProgram.industryContext.status, "aligned");
const aiCompanyLegalProgram = evaluatePublicJobDecision({
  id: "job-generic-program-legal-at-ai-company",
  title: "Legal Program Manager",
  companyName: "AI Company",
  department: "Legal and Compliance",
  description: "Lead contract governance and regulatory compliance for an artificial intelligence company, managing stakeholders, scope, and delivery.",
  remoteType: "remote",
  postedAt: "2026-06-27T12:00:00.000Z",
}, matchingSignalsForAggregate(genericProgramProfile("Artificial Intelligence")), now);
assert.equal(aiCompanyLegalProgram.included, false);
assert.equal(aiCompanyLegalProgram.industryContext.status, "conflict");

// Industry validation also applies when an existing broad role lane admits a
// different generic title. Exact-title wording cannot be the only protected path.
const financeChiefOfStaffProfile = genericProgramProfile("Financial Services");
financeChiefOfStaffProfile.roleTracks[0].targetTitles = ["Chief of Staff"];
const healthcareProgramForFinanceOperations = evaluatePublicJobDecision(
  genericProgramJob(genericProgramContexts[2]),
  matchingSignalsForAggregate(financeChiefOfStaffProfile),
  now,
);
assert.equal(healthcareProgramForFinanceOperations.industryContext.status, "conflict");
assert.equal(healthcareProgramForFinanceOperations.included, false);

// Generic-title morphology cannot be a bypass. Word order, plurals, and
// non-functional modifiers still require the same industry validation.
for (const title of [
  "Director of Programs",
  "Senior Director of Programs",
  "Head of Programs",
  "Strategic Program Director",
  "Director of Strategic Programs",
  "Program Management Director",
  "Head of Strategic Programs",
]) {
  assert.equal(isGenericCrossIndustryTitle(title), true, `${title} must be treated as a generic title`);
  const alignedDecision = evaluatePublicJobDecision({
    ...genericProgramJob(genericProgramContexts[0]),
    id: `job-generic-variant-aligned-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title,
  }, matchingSignalsForAggregate(genericProgramProfile("Advertising Services")), now);
  assert.equal(alignedDecision.industryContext.status, "aligned");
  assert.equal(alignedDecision.included, true, `${title} must remain eligible in the selected industry`);
  const decision = evaluatePublicJobDecision({
    ...genericProgramJob(genericProgramContexts[2]),
    id: `job-generic-variant-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title,
  }, matchingSignalsForAggregate(genericProgramProfile("Advertising Services")), now);
  assert.equal(decision.industryContext.status, "conflict", `${title} cannot bypass industry validation`);
  assert.equal(decision.included, false);
}

// Catalogue leaves remain atomic. Shared parent words such as "manufacturing"
// do not turn sibling industries into matches, while a broad selected parent
// can accept a more specific descendant.
const sportingGoodsSignals = matchingSignalsForAggregate(genericProgramProfile("Sporting Goods Manufacturing"));
const automotiveProgramJob: MatchJob = {
  id: "job-generic-program-automotive-manufacturing",
  title: "Program Director",
  companyName: "Vehicle Manufacturer",
  department: "Automotive Manufacturing",
  description: "Lead Motor Vehicle Manufacturing programs across vehicle plants, suppliers, stakeholders, scope, and delivery.",
  remoteType: "remote",
  postedAt: "2026-06-27T12:00:00.000Z",
};
const sportingGoodsAgainstAutomotive = evaluatePublicJobDecision(automotiveProgramJob, sportingGoodsSignals, now);
assert.equal(sportingGoodsAgainstAutomotive.included, false);
assert.equal(sportingGoodsAgainstAutomotive.industryContext.status, "conflict");
const sportingGoodsProgramJob: MatchJob = {
  ...automotiveProgramJob,
  id: "job-generic-program-sporting-goods-manufacturing",
  companyName: "Sporting Goods Manufacturer",
  department: "Sporting Goods Manufacturing",
  description: "Lead sporting goods manufacturing programs across athletic products, suppliers, stakeholders, scope, and delivery.",
};
assert.equal(evaluatePublicJobDecision(sportingGoodsProgramJob, sportingGoodsSignals, now).industryContext.status, "aligned");
assert.equal(
  evaluatePublicJobDecision(
    sportingGoodsProgramJob,
    matchingSignalsForAggregate(genericProgramProfile("Manufacturing")),
    now,
  ).industryContext.status,
  "aligned",
  "a selected parent industry must accept a catalogue descendant",
);
const broadManufacturingPosting = evaluatePublicJobDecision({
  ...automotiveProgramJob,
  id: "job-generic-program-broad-manufacturing",
  department: "Manufacturing",
  description: "Lead manufacturing programs across plants, suppliers, stakeholders, scope, and delivery.",
}, sportingGoodsSignals, now);
assert.equal(broadManufacturingPosting.industryContext.status, "unknown", "a broad parent cannot confirm a specific leaf");

const medicalEquipmentAgainstHealthcare = evaluatePublicJobDecision(
  genericProgramJob(genericProgramContexts[2]),
  matchingSignalsForAggregate(genericProgramProfile("Medical Equipment Manufacturing")),
  now,
);
assert.equal(medicalEquipmentAgainstHealthcare.included, false);
assert.equal(medicalEquipmentAgainstHealthcare.industryContext.status, "conflict");
const consumerServicesAgainstHealthcare = evaluatePublicJobDecision(
  genericProgramJob(genericProgramContexts[2]),
  matchingSignalsForAggregate(genericProgramProfile("Consumer Services")),
  now,
);
assert.equal(consumerServicesAgainstHealthcare.included, false);
assert.equal(consumerServicesAgainstHealthcare.industryContext.status, "conflict");

// A target phrase in body copy participates in the same evidence comparison;
// it cannot short-circuit a decisive, contradictory title or department.
const consultingMentionInsideItProgram = evaluatePublicJobDecision({
  ...genericProgramJob(genericProgramContexts[1]),
  id: "job-generic-program-it-with-consulting-mention",
  description: "Lead enterprise information technology programs and coordinate with management consulting partners across stakeholders and delivery.",
}, matchingSignalsForAggregate(genericProgramProfile("Management Consulting")), now);
assert.equal(consultingMentionInsideItProgram.included, false);
assert.equal(consultingMentionInsideItProgram.industryContext.status, "conflict");

// Role validation runs before industry validation. Sharing a broad occupation
// lane and target industry cannot turn a different generic role into the saved
// role.
const financeOperationsProfile = genericProgramProfile("Financial Services");
financeOperationsProfile.roleTracks[0].targetTitles = ["Director of Operations"];
const financeStrategistForOperations = evaluatePublicJobDecision({
  id: "job-finance-strategist-for-operations-director",
  title: "Strategy Manager",
  companyName: "Financial Organization",
  department: "Financial Services",
  description: "Lead financial services deal strategy, stakeholders, planning, and cross-functional delivery.",
  remoteType: "remote",
  postedAt: "2026-06-27T12:00:00.000Z",
}, matchingSignalsForAggregate(financeOperationsProfile), now);
assert.equal(financeStrategistForOperations.included, false);
assert.ok(financeStrategistForOperations.risks.some((risk) => risk.includes("role family differs")));

const advertisingRoleFirstProgramProfile = genericProgramProfile("Advertising Services");
const advertisingOperationsForProgram = evaluatePublicJobDecision({
  id: "job-advertising-operations-for-program-director",
  title: "Director of Operations",
  companyName: "Advertising Agency",
  department: "Advertising Services",
  description: "Lead advertising operations, planning, stakeholders, and cross-functional delivery.",
  remoteType: "remote",
  postedAt: "2026-06-27T12:00:00.000Z",
}, matchingSignalsForAggregate(advertisingRoleFirstProgramProfile), now);
assert.equal(advertisingOperationsForProgram.included, false);
assert.ok(advertisingOperationsForProgram.risks.some((risk) => risk.includes("role family differs")));

const advertisingOperationsProfile = genericProgramProfile("Advertising Services");
advertisingOperationsProfile.roleTracks[0].targetTitles = ["Director of Operations"];
const advertisingProgramForOperations = evaluatePublicJobDecision({
  id: "job-advertising-program-for-operations-director",
  title: "Program Director",
  companyName: "Advertising Agency",
  department: "Advertising Services",
  description: "Lead advertising programs, planning, stakeholders, and cross-functional delivery.",
  remoteType: "remote",
  postedAt: "2026-06-27T12:00:00.000Z",
}, matchingSignalsForAggregate(advertisingOperationsProfile), now);
assert.equal(advertisingProgramForOperations.included, false);
assert.ok(advertisingProgramForOperations.risks.some((risk) => risk.includes("role family differs")));

const advertisingProgramOfficerForDirector = evaluatePublicJobDecision({
  id: "job-advertising-program-officer-for-program-director",
  title: "Senior Program Officer",
  companyName: "Advertising Agency",
  department: "Advertising Services",
  description: "Support advertising programs, planning, stakeholders, and cross-functional delivery.",
  remoteType: "remote",
  postedAt: "2026-06-27T12:00:00.000Z",
}, matchingSignalsForAggregate(advertisingRoleFirstProgramProfile), now);
assert.equal(advertisingProgramOfficerForDirector.included, false);
assert.ok(advertisingProgramOfficerForDirector.risks.some((risk) => risk.includes("role family differs")));

const advertisingProgramAnalystProfile = genericProgramProfile("Advertising Services");
advertisingProgramAnalystProfile.roleTracks[0].targetTitles = ["Program Analyst"];
const advertisingProgramAnalyst = evaluatePublicJobDecision({
  id: "job-advertising-program-analyst",
  title: "Program Analyst",
  companyName: "Advertising Agency",
  department: "Advertising Services",
  description: "Analyze advertising programs, campaign planning, stakeholders, and delivery.",
  remoteType: "remote",
  postedAt: "2026-06-27T12:00:00.000Z",
}, matchingSignalsForAggregate(advertisingProgramAnalystProfile), now);
assert.equal(advertisingProgramAnalyst.included, true);
assert.equal(advertisingProgramAnalyst.industryContext.status, "aligned");
const informationTechnologyProgramAnalyst = evaluatePublicJobDecision({
  id: "job-information-technology-program-analyst",
  title: "Program Analyst",
  companyName: "Technology Company",
  department: "Information Technology",
  description: "Analyze enterprise information technology programs, systems, stakeholders, and delivery.",
  remoteType: "remote",
  postedAt: "2026-06-27T12:00:00.000Z",
}, matchingSignalsForAggregate(advertisingProgramAnalystProfile), now);
assert.equal(informationTechnologyProgramAnalyst.included, false);
assert.equal(informationTechnologyProgramAnalyst.industryContext.status, "conflict");

const advertisingPmoDirectorProfile = genericProgramProfile("Advertising Services");
advertisingPmoDirectorProfile.roleTracks[0].targetTitles = ["PMO Director"];
for (const [id, department, description, expectedIncluded, expectedStatus] of [
  [
    "advertising",
    "Advertising Services",
    "Lead the advertising program management office across campaigns, stakeholders, and delivery.",
    true,
    "aligned",
  ],
  [
    "information-technology",
    "Information Technology",
    "Lead the enterprise information technology program management office across systems and delivery.",
    false,
    "conflict",
  ],
] as const) {
  const decision = evaluatePublicJobDecision({
    id: `job-${id}-pmo-director`,
    title: "Program Management Office Director",
    companyName: "Organization",
    department,
    description,
    remoteType: "remote",
    postedAt: "2026-06-27T12:00:00.000Z",
  }, matchingSignalsForAggregate(advertisingPmoDirectorProfile), now);
  assert.equal(decision.included, expectedIncluded);
  assert.equal(decision.industryContext.status, expectedStatus);
}

const advertisingProgramOfficerProfile = genericProgramProfile("Advertising Services");
advertisingProgramOfficerProfile.roleTracks[0].targetTitles = ["Program Officer"];
const advertisingProgramOfficer = evaluatePublicJobDecision({
  id: "job-advertising-program-officer",
  title: "Senior Program Officer",
  companyName: "Advertising Agency",
  department: "Advertising Services",
  description: "Support advertising programs, planning, stakeholders, and cross-functional delivery.",
  remoteType: "remote",
  postedAt: "2026-06-27T12:00:00.000Z",
}, matchingSignalsForAggregate(advertisingProgramOfficerProfile), now);
assert.equal(advertisingProgramOfficer.included, true);
assert.equal(advertisingProgramOfficer.industryContext.status, "aligned");

// Production rows currently provide posting text, not structured industry.
// Every catalogue leaf must therefore be visible from title, department, and
// description text even when neither side belongs to a supplemental alias.
for (const [targetIndustry, postingIndustry] of [
  ["Dairy Product Manufacturing", "Chemical Manufacturing"],
  ["Museums, Historical Sites, and Zoos", "Restaurants"],
  ["Airlines and Aviation", "Freight and Package Transportation"],
  ["Primary and Secondary Education", "Oil and Gas"],
] as const) {
  const decision = evaluatePublicJobDecision({
    id: `job-production-shape-${postingIndustry.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title: "Program Director",
    companyName: "Organization",
    department: postingIndustry,
    description: `Lead ${postingIndustry} programs across strategy, stakeholders, scope, and cross-functional delivery.`,
    remoteType: "remote",
    postedAt: "2026-06-27T12:00:00.000Z",
  }, matchingSignalsForAggregate(genericProgramProfile(targetIndustry)), now);
  assert.equal(decision.industryContext.status, "conflict", `${postingIndustry} must be visible against ${targetIndustry}`);
  assert.equal(decision.included, false);
}

for (const [targetIndustry, postingIndustry] of [
  ["Software Development", "IT Services and IT Consulting"],
  ["IT Services and IT Consulting", "Software Development"],
  ["Advertising Services", "Marketing Services"],
  ["Marketing Services", "Advertising Services"],
] as const) {
  const decision = evaluatePublicJobDecision({
    id: `job-catalogue-sibling-${targetIndustry.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${postingIndustry.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title: "Program Director",
    companyName: "Organization",
    department: postingIndustry,
    description: `Lead ${postingIndustry} programs across strategy, stakeholders, scope, and cross-functional delivery.`,
    remoteType: "remote",
    postedAt: "2026-06-27T12:00:00.000Z",
  }, matchingSignalsForAggregate(genericProgramProfile(targetIndustry)), now);
  assert.equal(decision.industryContext.status, "conflict", `${targetIndustry} must not absorb sibling ${postingIndustry}`);
  assert.equal(decision.included, false);
}

const stableGenericFamilyDecision = evaluatePublicJobDecision({
  ...genericProgramJob(genericProgramContexts[0]),
  id: "job-generic-program-management-director-family",
  title: "Director of Program Management",
}, matchingSignalsForAggregate(genericProgramProfile("Advertising Services")), now);
assert.equal(stableGenericFamilyDecision.included, true);
assert.equal(stableGenericFamilyDecision.roleFamily, "program-project-management");

const coordinatorForDirectorDecision = evaluatePublicJobDecision({
  ...genericProgramJob(genericProgramContexts[0]),
  id: "job-program-coordinator-for-director",
  title: "Program Coordinator",
}, matchingSignalsForAggregate(genericProgramProfile("Advertising Services")), now);
assert.equal(coordinatorForDirectorDecision.included, false, "Program Coordinator cannot inherit Program Director equivalence");

for (const title of ["Assistant Program Director", "Associate Program Director", "Deputy Program Director"]) {
  const subordinateDecision = evaluatePublicJobDecision({
    ...genericProgramJob(genericProgramContexts[0]),
    id: `job-subordinate-program-director-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title,
  }, matchingSignalsForAggregate(genericProgramProfile("Advertising Services")), now);
  assert.equal(subordinateDecision.included, false, `${title} cannot receive exact Program Director treatment`);
  assert.ok(subordinateDecision.risks.some((risk) => risk.includes("subordinate to the saved target level")));
}

const assistantProgramProfile = genericProgramProfile("Advertising Services");
assistantProgramProfile.roleTracks[0].targetTitles = ["Assistant Program Director"];
const assistantProgramSignals = matchingSignalsForAggregate(assistantProgramProfile);
const alignedAssistantProgram = evaluatePublicJobDecision({
  ...genericProgramJob(genericProgramContexts[0]),
  id: "job-assistant-program-director-advertising",
  title: "Assistant Program Director",
}, assistantProgramSignals, now);
assert.equal(alignedAssistantProgram.included, true);
assert.equal(alignedAssistantProgram.industryContext.status, "aligned");
const conflictingAssistantProgram = evaluatePublicJobDecision({
  ...genericProgramJob(genericProgramContexts[1]),
  id: "job-assistant-program-director-it",
  title: "Assistant Program Director",
}, assistantProgramSignals, now);
assert.equal(conflictingAssistantProgram.included, false);
assert.equal(conflictingAssistantProgram.industryContext.status, "conflict");

for (const [targetIndustry, description] of [
  [
    "Climate Technology",
    "Lead clinical healthcare programs and coordinate with Climate Technology partners across strategy, stakeholders, and delivery.",
  ],
  [
    "Circular Economy Platforms",
    "Lead Financial Services programs and coordinate with Circular Economy Platforms partners across strategy, stakeholders, and delivery.",
  ],
] as const) {
  const decision = evaluatePublicJobDecision({
    id: `job-custom-industry-ambiguous-${targetIndustry.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title: "Program Director",
    companyName: "Organization",
    department: "Program Management",
    description,
    remoteType: "remote",
    postedAt: "2026-06-27T12:00:00.000Z",
  }, matchingSignalsForAggregate(genericProgramProfile(targetIndustry)), now);
  assert.equal(decision.industryContext.status, "unknown", "equal-source custom evidence must remain ambiguous");
}

console.log("public profile matching: all assertions passed");
