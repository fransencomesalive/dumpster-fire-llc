import assert from "node:assert/strict";
import {
  buildConnectorPlan,
  normalizeAshbyJob,
  normalizeAdzunaPayload,
  normalizeConnectorPayload,
  normalizeGreenhouseJob,
  normalizeHtmlJob,
  normalizeLeverJob,
  normalizeWorkableAggregatePayload,
  normalizeWorkablePayload,
  normalizeWorkdayJob,
  parseRssJobs,
  salaryRangeFromText,
} from "../lib/scan/sources/connectors";
import type { JobSource } from "../lib/scan/sources/types";

function source(overrides: Partial<JobSource> = {}): JobSource {
  return {
    id: "src-1",
    companyName: "Useful Studio",
    websiteUrl: "https://useful.example",
    careersUrl: "",
    atsProvider: "greenhouse",
    atsBoardToken: "usefulstudio",
    ...overrides,
  };
}

// ---- buildConnectorPlan endpoints (all primary providers) ----
assert.equal(
  buildConnectorPlan(source({ atsProvider: "greenhouse", atsBoardToken: "useful" })).endpointUrl,
  "https://boards-api.greenhouse.io/v1/boards/useful/jobs?content=true",
);
assert.equal(
  buildConnectorPlan(source({ atsProvider: "lever", atsBoardToken: "useful" })).endpointUrl,
  "https://api.lever.co/v0/postings/useful?mode=json",
);
assert.equal(
  buildConnectorPlan(source({ atsProvider: "ashby", atsBoardToken: "useful" })).endpointUrl,
  "https://api.ashbyhq.com/posting-api/job-board/useful",
);
const workdayPlan = buildConnectorPlan(source({
  atsProvider: "workday",
  atsBoardToken: "",
  careersUrl: "https://company.wd1.myworkdayjobs.com/en-US/External",
}));
assert.equal(workdayPlan.endpointUrl, "https://company.wd1.myworkdayjobs.com/wday/cxs/company/External/jobs");
assert.equal(workdayPlan.canPreview, true);
const blockedPlan = buildConnectorPlan(source({ atsProvider: "greenhouse", atsBoardToken: "" }));
assert.equal(blockedPlan.canPreview, false);
assert.ok(blockedPlan.warnings.length > 0);

// ---- salary parsing ----
const parsedRange = salaryRangeFromText("$120,000 - $150,000");
assert.equal(parsedRange.salaryMin, 120000);
assert.equal(parsedRange.salaryMax, 150000);
const hourly = salaryRangeFromText("$25/hour");
assert.equal(hourly.salaryMin, undefined);

// ---- Greenhouse ----
const greenhouse = normalizeGreenhouseJob({
  id: 123,
  absolute_url: "https://boards.greenhouse.io/usefulstudio/jobs/123",
  title: "Program Director",
  location: { name: "Remote - US" },
  content: "<p>Lead delivery and operations. $120,000 - $150,000</p>",
  departments: { name: "Operations" },
}, source());
assert.equal(greenhouse.sourceProvider, "greenhouse");
assert.equal(greenhouse.externalJobId, "123");
assert.equal(greenhouse.sourceUrl, "https://boards.greenhouse.io/usefulstudio/jobs/123");
assert.equal(greenhouse.title, "Program Director");
assert.equal(greenhouse.location, "Remote - US");
assert.equal(greenhouse.remoteType, "remote");
assert.equal(greenhouse.department, "Operations");
assert.equal(greenhouse.salaryMin, 120000);
assert.equal(greenhouse.salaryMax, 150000);
assert.ok(greenhouse.descriptionText.includes("Lead delivery"));

// ---- Lever (structured salaryRange) ----
const lever = normalizeLeverJob({
  id: "abc",
  text: "Senior Producer",
  categories: { location: "New York, NY", team: "Production" },
  description: "<p>Make things happen.</p>",
  hostedUrl: "https://jobs.lever.co/usefulstudio/abc",
  applyUrl: "https://jobs.lever.co/usefulstudio/abc/apply",
  salaryRange: { min: 130000, max: 160000 },
}, source({ atsProvider: "lever" }));
assert.equal(lever.sourceProvider, "lever");
assert.equal(lever.externalJobId, "abc");
assert.equal(lever.sourceUrl, "https://jobs.lever.co/usefulstudio/abc");
assert.equal(lever.applyUrl, "https://jobs.lever.co/usefulstudio/abc/apply");
assert.equal(lever.location, "New York, NY");
assert.equal(lever.department, "Production");
assert.equal(lever.salaryMin, 130000);
assert.equal(lever.salaryMax, 160000);

// ---- Ashby (tier summary salary) ----
const ashby = normalizeAshbyJob({
  id: "ash1",
  title: "Creative Director",
  location: "Remote",
  descriptionHtml: "<p>Lead creative direction.</p>",
  compensation: { compensationTierSummary: "$140K - $170K" },
  jobUrl: "https://jobs.ashbyhq.com/usefulstudio/ash1",
  applyUrl: "https://jobs.ashbyhq.com/usefulstudio/ash1/application",
  department: "Creative",
}, source({ atsProvider: "ashby" }));
assert.equal(ashby.sourceProvider, "ashby");
assert.equal(ashby.sourceUrl, "https://jobs.ashbyhq.com/usefulstudio/ash1");
assert.equal(ashby.location, "Remote");
assert.equal(ashby.remoteType, "remote");
assert.equal(ashby.department, "Creative");
assert.equal(ashby.salaryMin, 140000);
assert.equal(ashby.salaryMax, 170000);

// ---- Workday ----
const workday = normalizeWorkdayJob({
  title: "Staff Engineer",
  externalPath: "/job/Staff-Engineer_R7654321",
  bulletFields: ["R7654321", "New York, NY"],
  locationsText: "",
}, source({
  atsProvider: "workday",
  atsBoardToken: "",
  careersUrl: "https://company.wd1.myworkdayjobs.com/en-US/External",
}));
assert.equal(workday.sourceProvider, "workday");
assert.equal(workday.title, "Staff Engineer");
assert.equal(workday.location, "New York, NY");
assert.ok(workday.sourceUrl.includes("/External/job/Staff-Engineer_R7654321"));

// ---- HTML (generic object) ----
const html = normalizeHtmlJob({
  title: "Designer",
  url: "https://example.com/jobs/designer",
  location: "Remote",
  description: "Design things. $90,000-$110,000",
  company: { name: "Example Co" },
}, source({ atsProvider: "html", careersUrl: "https://example.com/careers" }));
assert.equal(html.sourceProvider, "html");
assert.equal(html.sourceUrl, "https://example.com/jobs/designer");
assert.equal(html.companyName, "Example Co");
assert.equal(html.salaryMin, 90000);
assert.equal(html.salaryMax, 110000);

// ---- Adzuna payload ----
const adzunaSource = source({ atsProvider: "html", careersUrl: "https://api.adzuna.com/v1/api/jobs/us/search/1" });
const adzuna = normalizeAdzunaPayload({
  results: [{
    id: "a1",
    title: "Producer",
    redirect_url: "https://www.adzuna.com/job/a1",
    company: { display_name: "Studio X" },
    location: { display_name: "Remote" },
    category: { label: "Creative" },
    contract_time: "full_time",
    contract_type: "permanent",
    salary_min: 100000,
    salary_max: 120000,
    salary_is_predicted: "0",
    description: "Produce great work.",
  }],
}, adzunaSource);
assert.equal(adzuna.length, 1);
assert.equal(adzuna[0].title, "Producer");
assert.equal(adzuna[0].companyName, "Studio X");
assert.equal(adzuna[0].sourceUrl, "https://www.adzuna.com/job/a1");

// adzuna routed through normalizeConnectorPayload by careersUrl
const adzunaViaPayload = normalizeConnectorPayload({
  results: [{ id: "a2", title: "Editor", redirect_url: "https://www.adzuna.com/job/a2", company: { display_name: "Studio Y" }, location: { display_name: "NYC" }, description: "Edit." }],
}, adzunaSource);
assert.equal(adzunaViaPayload.length, 1);
assert.equal(adzunaViaPayload[0].sourceUrl, "https://www.adzuna.com/job/a2");

// ---- Workable (apply + aggregate) ----
const workable = normalizeWorkablePayload({
  jobs: [{
    title: "Operations Lead",
    url: "https://apply.workable.com/useful/j/ABC123",
    shortcode: "ABC123",
    city: "Austin",
    state: "TX",
    country: "USA",
    department: "Operations",
    employment_type: "Full-time",
    description: "Run ops.",
    telecommuting: true,
  }],
}, source({ atsProvider: "html", careersUrl: "https://apply.workable.com/api/v1/widget/accounts/useful" }));
assert.equal(workable.length, 1);
assert.equal(workable[0].title, "Operations Lead");
assert.ok(workable[0].location.includes("Remote"));

const workableAggregate = normalizeWorkableAggregatePayload({
  jobs: [{
    id: "agg1",
    title: "Brand Manager",
    url: "https://jobs.workable.com/view/agg1",
    company: { title: "Aggregate Co" },
    location: { city: "Denver", subregion: "CO", countryName: "USA" },
    workplace: "remote",
    department: "Marketing",
    employmentType: "Full-time",
    description: "Own brand.",
  }],
}, source({ atsProvider: "html", careersUrl: "https://jobs.workable.com/api/v1/jobs" }));
assert.equal(workableAggregate.length, 1);
assert.equal(workableAggregate[0].companyName, "Aggregate Co");
assert.ok(workableAggregate[0].location.includes("Remote"));

// ---- RSS ----
const rss = parseRssJobs(`<?xml version="1.0"?><rss><channel>
  <item><title>Acme Co: Remote Producer</title><link>https://jobs.example/rss/1</link><region>Remote</region><country>USA</country><type>Full-time</type><category>Production</category><description>Produce.</description></item>
</channel></rss>`) as Array<Record<string, unknown>>;
assert.equal(rss.length, 1);
assert.equal(rss[0].title, "Remote Producer");
assert.equal(rss[0].companyName, "Acme Co");
assert.equal(rss[0].sourceUrl, "https://jobs.example/rss/1");

console.log("scan sources: all assertions passed");
