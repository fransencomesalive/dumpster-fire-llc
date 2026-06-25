import assert from "node:assert/strict";
import { normalizeConnectorJob } from "../app/scans/connectors.ts";
import { duplicateKeyForConnectorJob, selectUniqueConnectorJobs } from "../app/scans/dedupe.ts";
import { evaluateJobMatch } from "../app/scans/matching.ts";

const profile = {
  targetTitles: [
    "director of production",
    "head of production",
    "executive producer",
    "senior producer",
    "creative program manager",
    "design program manager",
    "creative operations",
    "studio operations",
    "ai enablement",
  ],
  positiveKeywords: [
    "production leadership",
    "creative operations",
    "studio operations",
    "cross-functional",
    "campaign",
    "brand",
    "content operations",
    "design system",
    "post production",
  ],
  negativeKeywords: [
    "aaa game",
    "scrum master",
    "agile delivery",
    "engineering manager",
    "junior producer",
    "social media manager",
    "performance marketing",
  ],
  targetIndustries: ["creative agency", "design agency", "internal creative studio", "tech", "fintech", "web3", "ai"],
  compensationFloor: 150000,
  freelanceRateFloor: 125,
  remoteOnly: true,
  doNotApplyCompanies: ["Left Field Labs"],
  approvedLoginEmail: "single approved email",
};

function job(overrides) {
  return {
    title: "Executive Producer",
    companyName: "Test Studio",
    department: "Creative Studio",
    location: "Remote, US",
    remoteType: "remote",
    employmentType: "full-time",
    salaryMin: 170000,
    salaryMax: 190000,
    salaryText: "$170k-$190k",
    descriptionText: "Lead cross-functional studio operations, production leadership, campaign delivery, vendor workflow, stakeholder management, and post production systems.",
    firstSeenAt: new Date().toISOString(),
    needsContactResearch: true,
    ...overrides,
  };
}

const strongFit = evaluateJobMatch(job({}), profile);
assert.equal(strongFit.included, true);
assert.equal(strongFit.matchQuality, "good");
assert.equal(strongFit.roleFamily, "production-leadership");
assert.ok(strongFit.score >= 68);

const designerFalsePositive = evaluateJobMatch(job({
  title: "Principal Designer, Brand Systems",
  department: "Design",
  descriptionText: "Lead brand design systems, creative reviews, and cross-functional design strategy for remote teams.",
}), profile);
assert.equal(designerFalsePositive.included, false);
assert.ok(designerFalsePositive.risks.some((risk) => risk.includes("principal designer")));

const softwareFalsePositive = evaluateJobMatch(job({
  title: "Software Engineer, Finance Applications",
  department: "Engineering",
  descriptionText: "Build internal AI tools with cross-functional partners and support production operations in finance workflows.",
}), profile);
assert.equal(softwareFalsePositive.included, false);
assert.ok(softwareFalsePositive.risks.some((risk) => risk.includes("software engineer")));

const onsiteRole = evaluateJobMatch(job({
  title: "Director of Production",
  location: "New York, NY",
  remoteType: "onsite",
}), profile);
assert.equal(onsiteRole.included, false);
assert.equal(onsiteRole.matchQuality, "bad");
assert.ok(onsiteRole.risks.includes("onsite location"));

const stretchFit = evaluateJobMatch(job({
  title: "Creative Program Manager",
  salaryMin: undefined,
  salaryMax: undefined,
  salaryText: "",
  descriptionText: "Lead creative operations, campaign delivery, stakeholder planning, and studio workflow across remote teams.",
}), profile);
assert.equal(stretchFit.included, true);
assert.equal(stretchFit.matchQuality, "good");
assert.ok(!stretchFit.risks.includes("no compensation signal"));

const productOpsStretch = evaluateJobMatch(job({
  title: "Product Operations Manager",
  department: "Operations",
  salaryMin: undefined,
  salaryMax: undefined,
  salaryText: "",
  descriptionText: "Own cross-functional operations, stakeholder workflows, roadmap delivery, and process improvements for creative and product teams.",
}), profile);
assert.equal(productOpsStretch.included, true);
assert.equal(productOpsStretch.matchQuality, "stretch");
assert.ok(productOpsStretch.risks.includes("stretch title signal"));

const customerEducationStretch = evaluateJobMatch(job({
  title: "Customer Education Program Manager, New Products",
  companyName: "OpenAI",
  department: "Go To Market",
  salaryMin: undefined,
  salaryMax: undefined,
  salaryText: "",
  descriptionText: [
    "Lead customer-facing product education, technical content, enablement programs, webinars, demos, guides, and adoption resources.",
    "Required qualifications include experience in enterprise SaaS, AI products, developer tools, or technical education.",
    "Familiarity with enterprise customer adoption and enablement strategies.",
    "Partner with cross-functional stakeholders on launches and product education roadmap.",
  ].join(" "),
}), profile);
assert.equal(customerEducationStretch.included, false);
assert.equal(customerEducationStretch.matchQuality, "bad");
assert.ok(customerEducationStretch.risks.some((risk) => risk.startsWith("required qualification mismatch")));
assert.ok(customerEducationStretch.risks.some((risk) => risk.includes("customer education")));

const aiDeliveryLead = evaluateJobMatch(job({
  title: "AI Delivery Lead",
  companyName: "Accenture",
  department: "Strategy & Consulting",
  salaryMin: undefined,
  salaryMax: undefined,
  salaryText: "",
  descriptionText: [
    "As an AI Strategy/Delivery Lead, you will translate high-level business and industry roadmaps into actionable AI strategies, delivery frameworks and operational models.",
    "Architect and lead end-to-end AI transformation programmes from visioning and strategy through roadmap, business case, use-case prioritisation, value capture model, and scaling to full business operations.",
    "Lead cross-functional teams spanning strategy, design, architecture, engineering, data science, and delivery, including mentoring, resource planning, performance management and high-quality client outcomes.",
    "Manage financial oversight of AI programmes: forecasting, budgeting, commercial tracking, risk mitigation, and value realisation metrics.",
  ].join(" "),
}), profile);
assert.equal(aiDeliveryLead.included, true);
assert.notEqual(aiDeliveryLead.matchQuality, "bad");
assert.ok(aiDeliveryLead.roleFamily === "program-leadership" || aiDeliveryLead.roleFamily === "ai-enablement");

const producerStretch = evaluateJobMatch(job({
  title: "Producer, Global Events",
  remoteType: "hybrid",
  salaryMin: undefined,
  salaryMax: undefined,
  salaryText: "",
  descriptionText: "Lead event production workflows, campaign delivery, vendor coordination, stakeholders, and cross-functional planning.",
}), profile);
assert.equal(producerStretch.included, false);
assert.equal(producerStretch.matchQuality, "bad");
assert.ok(producerStretch.risks.includes("hybrid location"));

// Hybrid is flagged, not hard-excluded: a strong-fit hybrid US role surfaces as stretch with a remote-risk note.
const hybridStrongFit = evaluateJobMatch(job({
  title: "Director of Production",
  location: "New York, NY",
  remoteType: "hybrid",
}), profile);
assert.equal(hybridStrongFit.included, true);
assert.equal(hybridStrongFit.matchQuality, "stretch");
assert.ok(hybridStrongFit.risks.some((risk) => risk.includes("listed as hybrid")));

// Remote roles restricted to non-US countries are not eligible for US-based candidates.
const ukRestrictedRole = evaluateJobMatch(job({
  title: "Senior Producer",
  location: "United Kingdom",
  remoteType: "remote",
}), profile);
assert.equal(ukRestrictedRole.included, false);
assert.equal(ukRestrictedRole.matchQuality, "bad");
assert.ok(ukRestrictedRole.risks.some((risk) => risk.includes("not eligible for US-based candidates")));

const mexicoRestrictedRole = evaluateJobMatch(job({
  title: "Executive Producer",
  location: "Mexico",
  remoteType: "remote",
}), profile);
assert.equal(mexicoRestrictedRole.included, false);
assert.ok(mexicoRestrictedRole.risks.some((risk) => risk.includes("not eligible for US-based candidates")));

// Region restrictions hiding in the title are caught when location does not establish US eligibility.
const emeaTitleRole = evaluateJobMatch(job({
  title: "Sr Product Operations Manager - 100% Remote - EMEA",
  location: "",
  remoteType: "remote",
}), profile);
assert.equal(emeaTitleRole.included, false);
assert.ok(emeaTitleRole.risks.some((risk) => risk.includes("not eligible for US-based candidates")));

// Wrong-industry title lanes learned from Batch 2 chips.
const usaidRole = evaluateJobMatch(job({
  title: "Senior Program Manager - USAID DRG V (Anticipated)",
  descriptionText: "Lead cross-functional program delivery, stakeholder management, and workflow planning for international development programs.",
}), profile);
assert.equal(usaidRole.included, false);
assert.ok(usaidRole.risks.some((risk) => risk.includes("usaid")));

const influencerMarketingRole = evaluateJobMatch(job({
  title: "Senior Producer, B2B Influencer Marketing & PR",
  descriptionText: "Lead influencer marketing campaign production, vendor coordination, stakeholder workflows, and cross-functional planning.",
}), profile);
assert.equal(influencerMarketingRole.included, false);
assert.ok(influencerMarketingRole.risks.some((risk) => risk.includes("influencer marketing")));

// A restriction that includes the US stays eligible.
const usAndCanadaRole = evaluateJobMatch(job({
  title: "Executive Producer",
  location: "United States, Canada",
  remoteType: "remote",
}), profile);
assert.equal(usAndCanadaRole.included, true);

// Game studio roles are out unless the title is marketing/creative production not centered on gameplay.
const gameStudioProducer = evaluateJobMatch(job({
  title: "Senior Producer",
  companyName: "Brightrock Games",
  descriptionText: "Lead game development production, gameplay milestones, cross-functional delivery, vendor workflow, and stakeholder management.",
}), profile);
assert.equal(gameStudioProducer.included, false);
assert.equal(gameStudioProducer.matchQuality, "bad");
assert.ok(gameStudioProducer.risks.some((risk) => risk.includes("game studio role")));

const gameStudioCreativeException = evaluateJobMatch(job({
  title: "Creative Producer, Brand Marketing",
  companyName: "Brightrock Games",
  descriptionText: "Lead brand campaign production, creative operations, trailer and marketing asset delivery, vendor workflow, stakeholder management, and cross-functional planning.",
}), profile);
assert.ok(!gameStudioCreativeException.risks.some((risk) => risk.includes("game studio role")));

// Posted full-time salary clearly below the floor is a hard constraint.
const belowFloorRole = evaluateJobMatch(job({
  title: "Executive Producer",
  salaryMin: 90000,
  salaryMax: 120000,
  salaryText: "$90k-$120k",
}), profile);
assert.equal(belowFloorRole.included, false);
assert.ok(belowFloorRole.risks.some((risk) => risk.includes("hard compensation constraint")));

// Stretch-pattern titles require confirmed remote eligibility; unclear remote is not enough for marginal titles.
const stretchUnclearRemote = evaluateJobMatch(job({
  title: "Product Operations Manager",
  remoteType: "unclear",
  location: "",
  salaryMin: undefined,
  salaryMax: undefined,
  salaryText: "",
  descriptionText: "Own cross-functional operations, stakeholder workflows, roadmap delivery, and process improvements for creative and product teams.",
}), profile);
assert.equal(stretchUnclearRemote.included, false);
assert.ok(stretchUnclearRemote.risks.some((risk) => risk.includes("stretch title requires confirmed remote posting")));

// Strong title family without resume-track confirmation is admitted as stretch, not silently dropped.
const strongFamilyThinPosting = evaluateJobMatch(job({
  title: "Director, Program Management, CX",
  salaryMin: undefined,
  salaryMax: undefined,
  salaryText: "",
  descriptionText: "Lead delivery and process improvements for customer experience programs across the organization.",
}), profile);
assert.equal(strongFamilyThinPosting.included, true);
assert.equal(strongFamilyThinPosting.matchQuality, "stretch");
assert.ok(strongFamilyThinPosting.risks.includes("resume track not confirmed"));

// US-city postings with unstated remote surface as flagged stretch for strong title families (Randall manual-find rule 2026-06-11).
const unclearCityRole = evaluateJobMatch(job({
  title: "Product Design Program Manager",
  location: "San Francisco",
  remoteType: "unclear",
  salaryMin: undefined,
  salaryMax: undefined,
  salaryText: "",
  descriptionText: "Lead design program operations, creative production planning, cross-functional stakeholders, and studio workflows.",
}), profile);
assert.equal(unclearCityRole.included, true);
assert.equal(unclearCityRole.matchQuality, "stretch");
assert.ok(unclearCityRole.risks.some((risk) => risk.includes("remote status unclear for")));

const broadUsRole = evaluateJobMatch(job({
  title: "Director, Program Management",
  location: "United States",
  remoteType: "unclear",
  salaryMin: undefined,
  salaryMax: undefined,
  salaryText: "",
  descriptionText: "Lead cross-functional program operations, brand delivery, roadmap planning, stakeholder workflows, and production process improvements.",
}), profile);
assert.equal(broadUsRole.included, true);
// Bare metadata absence no longer demotes quality (2026-06-11); concrete-city unclear postings still grade stretch.
assert.equal(broadUsRole.matchQuality, "good");
assert.ok(broadUsRole.risks.includes("remote status unclear"));

const itWrongLane = evaluateJobMatch(job({
  title: "Program Manager - IT Operations",
  descriptionText: "Lead IT operations, storage, infrastructure, vendors, and cross-functional delivery.",
}), profile);
assert.equal(itWrongLane.included, false);
assert.equal(itWrongLane.matchQuality, "bad");
assert.ok(itWrongLane.risks.some((risk) => risk.includes("it operations")));

const recruitingWrongLane = evaluateJobMatch(job({
  title: "Talent Acquisition Operations Program Manager",
  descriptionText: "Lead recruiting operations, hiring workflows, onboarding, and stakeholder programs.",
}), profile);
assert.equal(recruitingWrongLane.included, false);
assert.equal(recruitingWrongLane.matchQuality, "bad");
assert.ok(recruitingWrongLane.risks.some((risk) => risk.includes("talent acquisition")));

const dataWrongLane = evaluateJobMatch(job({
  title: "Data Operations Manager, Human Data",
  descriptionText: "Own human data pipelines, research data strategy, vendors, and AI training data operations.",
}), profile);
assert.equal(dataWrongLane.included, false);
assert.equal(dataWrongLane.matchQuality, "bad");
assert.ok(dataWrongLane.risks.some((risk) => risk.includes("data operations")));

const procurementWrongLane = evaluateJobMatch(job({
  title: "Procurement Operations Lead",
  companyName: "Block",
  descriptionText: "Own procurement operations, vendor workflows, supplier process, stakeholder approvals, and cost controls.",
}), profile);
assert.equal(procurementWrongLane.included, false);
assert.equal(procurementWrongLane.matchQuality, "bad");
assert.ok(procurementWrongLane.risks.some((risk) => risk.includes("procurement operations")));

const brokerageWrongLane = evaluateJobMatch(job({
  title: "Front Office Brokerage Operations Lead",
  companyName: "Block",
  descriptionText: "Lead brokerage operations, trading operations controls, stakeholder workflows, and front office process improvements.",
}), profile);
assert.equal(brokerageWrongLane.included, false);
assert.equal(brokerageWrongLane.matchQuality, "bad");
assert.ok(brokerageWrongLane.risks.some((risk) => risk.includes("front office brokerage") || risk.includes("brokerage operations")));

const marketingWrongLane = evaluateJobMatch(job({
  title: "Regional Partner Marketing Manager",
  companyName: "OpenAI",
  location: "San Francisco",
  remoteType: "unclear",
  salaryMin: undefined,
  salaryMax: undefined,
  salaryText: "",
  descriptionText: [
    "Own and scale partner marketing strategy for US based partners.",
    "Design and lead co-marketing programs that drive measurable growth through partners.",
    "Have 10+ years of experience in partner marketing, alliances marketing, co-marketing, or related roles.",
  ].join(" "),
}), profile);
assert.equal(marketingWrongLane.included, false);
assert.equal(marketingWrongLane.matchQuality, "bad");
assert.ok(marketingWrongLane.risks.some((risk) => risk.includes("marketing without production/program")));

const marketingProgramRole = evaluateJobMatch(job({
  title: "Marketing Program Manager, Creative Production",
  companyName: "OpenAI",
  location: "Remote, US",
  remoteType: "remote",
  salaryMin: undefined,
  salaryMax: undefined,
  salaryText: "",
  descriptionText: "Lead creative production programs, campaign delivery, partner workflows, cross-functional stakeholders, and studio operations.",
}), profile);
assert.ok(!marketingProgramRole.risks.some((risk) => risk.includes("marketing without production/program")));

const communicationsWrongLane = evaluateJobMatch(job({
  title: "Head of Communication",
  companyName: "AI Platform",
  salaryMin: undefined,
  salaryMax: undefined,
  salaryText: "",
  descriptionText: "Lead brand campaigns, cross-functional stakeholder strategy, communications planning, and AI product narratives.",
}), profile);
assert.equal(communicationsWrongLane.included, false);
assert.equal(communicationsWrongLane.matchQuality, "bad");
assert.ok(communicationsWrongLane.risks.some((risk) => risk.includes("title family unconfirmed")));

const exportControlsWrongLane = evaluateJobMatch(job({
  title: "Senior Manager, Export Controls",
  companyName: "OpenAI",
  salaryMin: undefined,
  salaryMax: undefined,
  salaryText: "",
  descriptionText: "Own cross-functional export control strategy, stakeholder workflows, regulatory processes, and AI governance operations.",
}), profile);
assert.equal(exportControlsWrongLane.included, false);
assert.equal(exportControlsWrongLane.matchQuality, "bad");
assert.ok(exportControlsWrongLane.risks.some((risk) => risk.includes("title family not confirmed")));

const blockedCompany = evaluateJobMatch(job({
  companyName: "Left Field Labs",
  title: "Executive Producer",
}), profile);
assert.equal(blockedCompany.included, false);
assert.ok(blockedCompany.risks.includes("do-not-apply company"));

function connectorJob(overrides) {
  return {
    companyId: "company-test",
    externalJobId: "job-1",
    sourceProvider: "greenhouse",
    sourceUrl: "https://example.com/job-1",
    applyUrl: "https://example.com/job-1/apply",
    title: "Product Design Program Manager",
    companyName: "OpenAI, Inc.",
    location: "Remote",
    remoteType: "remote",
    employmentType: "full-time",
    department: "Design",
    salaryMin: undefined,
    salaryMax: undefined,
    salaryText: "",
    descriptionText: "Lead production and operations ownership across product design workflows.",
    rawPayload: {},
    ...overrides,
  };
}

const duplicateKey = duplicateKeyForConnectorJob(connectorJob({}));
assert.equal(duplicateKey, duplicateKeyForConnectorJob(connectorJob({
  externalJobId: "job-2",
  title: "Product Design Program Manager (Remote)",
  companyName: "OpenAI",
})));

const duplicateSelection = selectUniqueConnectorJobs([
  connectorJob({ externalJobId: "job-1" }),
  connectorJob({ externalJobId: "job-2", title: "Product Design Program Manager (Remote)", companyName: "OpenAI" }),
  connectorJob({ externalJobId: "job-3", title: "Creative Program Manager" }),
]);
assert.equal(duplicateSelection.selectedJobs.length, 2);
assert.equal(duplicateSelection.duplicateJobs.length, 1);
assert.equal(duplicateSelection.duplicateJobs[0].duplicateOfExternalJobId, "job-1");

// List-only boards (no description at fetch time) admit strong title families as stretch with an explicit flag.
const thinContentStrongTitle = evaluateJobMatch(job({
  title: "Senior Producer",
  location: "United States REMOTE",
  remoteType: "remote",
  salaryMin: undefined,
  salaryMax: undefined,
  salaryText: "",
  descriptionText: "",
}), profile);
assert.equal(thinContentStrongTitle.included, true);
assert.equal(thinContentStrongTitle.matchQuality, "stretch");
assert.ok(thinContentStrongTitle.risks.includes("posting content not available from source"));

// Location/title fields outrank description prose for remote classification.
const remotePriorityJob = normalizeConnectorJob({
  id: 99001,
  title: "Global Experience Producer",
  location: { name: "Remote-United-States" },
  content: "Plan flagship events with occasional on-site presence at venues. Lead production workflows and vendor coordination.",
  absolute_url: "https://job-boards.greenhouse.io/testco/jobs/99001",
}, {
  id: "company-remote-priority",
  companyName: "TestCo",
  websiteUrl: "https://example-co.com",
  careersUrl: "https://job-boards.greenhouse.io/testco",
  atsProvider: "greenhouse",
  atsBoardToken: "testco",
  industryBucket: "Tech",
  remoteLikelihood: 90,
  notes: "",
  status: "active",
  lastSuccessfulScan: "",
});
assert.equal(remotePriorityJob.remoteType, "remote");

const himalayasJob = normalizeConnectorJob({
  title: "Executive Producer, Live Streaming Programs",
  companyName: "The Athletic",
  locationRestrictions: ["United States"],
  minSalary: 150000,
  maxSalary: 180000,
  employmentType: "Full Time",
  description: "The position is 100% remote-US and owns live streaming production.",
  applicationLink: "https://himalayas.app/companies/the-athletic/jobs/executive-producer-live-streaming-programs",
  guid: "https://himalayas.app/companies/the-athletic/jobs/executive-producer-live-streaming-programs",
}, {
  id: "generated-broad-himalayas",
  companyName: "Himalayas Broad Job Board",
  websiteUrl: "https://himalayas.app",
  careersUrl: "https://himalayas.app/jobs/api/search?q=director%20of%20production&sort=recent&page=1",
  atsProvider: "html",
  atsBoardToken: "",
  industryBucket: "Broad job board",
  remoteLikelihood: 95,
  notes: "broad job board generated source",
  status: "active",
  lastSuccessfulScan: "",
});
assert.equal(himalayasJob.companyName, "The Athletic");
assert.equal(himalayasJob.location, "United States");
assert.equal(himalayasJob.remoteType, "remote");
assert.equal(himalayasJob.salaryMin, 150000);
assert.equal(himalayasJob.sourceUrl, "https://himalayas.app/companies/the-athletic/jobs/executive-producer-live-streaming-programs");

console.log("Dumpster Fire matching tests passed.");
