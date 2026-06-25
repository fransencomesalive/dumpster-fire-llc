import assert from "node:assert/strict";
import { buildConnectorPlan, normalizeConnectorJob } from "../app/scans/connectors.ts";
import { reviewDetailsFromJob } from "../app/scans/near-miss-review.ts";
import { searchSourceKindForCompany } from "../app/scans/search-sources.ts";

function company(overrides) {
  return {
    id: "company-test",
    companyName: "Test Company",
    websiteUrl: "https://example.com",
    careersUrl: "https://example.com/careers",
    atsProvider: "html",
    atsBoardToken: "",
    status: "active",
    sourceType: "company_website",
    roleSearch: "",
    notes: "",
    priority: 1,
    ...overrides,
  };
}

function assertDetails(label, job, expectedResponsibility, expectedExperience) {
  const details = reviewDetailsFromJob(job);

  assert.ok(
    details.responsibilitySnippets.some((snippet) => snippet.includes(expectedResponsibility)),
    `${label} responsibility snippets missed "${expectedResponsibility}": ${JSON.stringify(details.responsibilitySnippets)}`,
  );
  assert.ok(
    details.experienceSnippets.some((snippet) => snippet.includes(expectedExperience)),
    `${label} experience snippets missed "${expectedExperience}": ${JSON.stringify(details.experienceSnippets)}`,
  );
}

const greenhouseJob = normalizeConnectorJob({
  id: 1001,
  title: "Creative Operations Lead",
  absolute_url: "https://job-boards.greenhouse.io/test/jobs/1001",
  location: { name: "Remote" },
  content: `
    <h2>About Us</h2><p>We make useful things.</p>
    <h2>Responsibilities</h2>
    <ul>
      <li>Lead creative production intake and delivery across cross-functional stakeholders.</li>
      <li>Manage studio workflow, vendor timelines, and launch coordination.</li>
    </ul>
    <h2>Qualifications</h2>
    <ul>
      <li>8+ years of experience in creative operations or production leadership.</li>
      <li>Proven ability to manage complex delivery programs.</li>
    </ul>
  `,
}, company({ atsProvider: "greenhouse" }));
assertDetails(greenhouseJob.sourceProvider, greenhouseJob, "Lead creative production intake", "8+ years of experience");

const greenhouseCompany = company({
  companyName: "Anthropic",
  careersUrl: "https://www.anthropic.com/careers",
  atsProvider: "greenhouse",
  atsBoardToken: "anthropic",
});
const greenhousePlan = buildConnectorPlan(greenhouseCompany);
assert.equal(greenhousePlan.requestLabel, "Public job-board API");
assert.equal(
  greenhousePlan.endpointUrl,
  "https://boards-api.greenhouse.io/v1/boards/anthropic/jobs?content=true",
);
assert.equal(searchSourceKindForCompany(greenhouseCompany), "targeted_company_careers");

const leverJob = normalizeConnectorJob({
  id: "lever-1",
  text: "Program Delivery Manager",
  hostedUrl: "https://jobs.lever.co/test/lever-1",
  categories: { location: "Remote", team: "Operations" },
  description: `
    <h3>What You'll Do</h3>
    <p>Own roadmap delivery rituals and stakeholder operating cadence.</p>
    <p>Partner with design, product, and operations leaders on launch execution.</p>
    <h3>What We're Looking For</h3>
    <p>Experience managing cross-functional programs in fast-moving environments.</p>
    <p>Strong written communication and executive stakeholder management.</p>
  `,
}, company({ atsProvider: "lever" }));
assertDetails(leverJob.sourceProvider, leverJob, "Own roadmap delivery rituals", "Experience managing cross-functional programs");

const collapsedAshbyLikeJob = normalizeConnectorJob({
  id: "ashby-1",
  title: "Infrastructure Partnership Delivery Lead",
  jobUrl: "https://jobs.ashbyhq.com/test/ashby-1",
  location: "Remote - US",
  description: "About the Role This role owns large programs. Key Responsibilities Own operational delivery for partner programs Serve as the primary delivery interface Coordinate execution across workstreams Qualifications 12+ years of experience in infrastructure delivery Experience managing complex partner relationships Strong understanding of physical infrastructure operations Preferred Skills Experience with hyperscale environments",
}, company({ atsProvider: "ashby" }));
assertDetails(collapsedAshbyLikeJob.sourceProvider, collapsedAshbyLikeJob, "Own operational delivery", "12+ years of experience");

const genericHtmlJob = normalizeConnectorJob({
  id: "html-1",
  title: "Studio Operations Director",
  url: "https://remote.example/jobs/html-1",
  location: "Remote",
  description_html: `
    <section><h2>Your Impact</h2><p>Oversee studio operating systems and cross-functional production planning.</p></section>
    <section><h2>Skills and Experience</h2><p>Background leading production operations for creative or content teams.</p></section>
  `,
}, company({ atsProvider: "html" }));
assertDetails(genericHtmlJob.sourceProvider, genericHtmlJob, "Oversee studio operating systems", "Background leading production operations");

const workdayJob = normalizeConnectorJob({
  id: "workday-1",
  title: "Business Process Analyst",
  externalPath: "/job/Barcelona-ESP/Business-Process-Analyst_26WD98402-2",
  locationsText: "Barcelona, ESP",
  bulletFields: ["Posted 2 Days Ago", "26WD98402"],
}, company({
  atsProvider: "workday",
  careersUrl: "https://autodesk.wd1.myworkdayjobs.com/Ext",
  atsBoardToken: "autodesk/Ext",
}));
assert.equal(
  workdayJob.sourceUrl,
  "https://autodesk.wd1.myworkdayjobs.com/Ext/job/Barcelona-ESP/Business-Process-Analyst_26WD98402-2",
);

console.log("Dumpster Fire review detail extraction fixtures passed.");
