import assert from "node:assert/strict";
import {
  salaryFromBodyText,
  salaryFromJsonLdHtml,
  salaryFromJsonLdNode,
  salaryRangeFromText,
  normalizeGreenhouseJob,
  normalizeAshbyJob,
  normalizeConnectorJob,
  parseProviderHtmlJobs,
} from "../app/scans/connectors.ts";

// --- text ranges parse to annual numbers the matcher gate can read ---
const commaRange = salaryRangeFromText("The base pay range is $120,000 - $150,000 plus equity.");
assert.equal(commaRange.salaryText, "$120,000 - $150,000");
assert.equal(commaRange.salaryMin, 120000);
assert.equal(commaRange.salaryMax, 150000);

const kRange = salaryRangeFromText("Compensation: $120k–$150k");
assert.equal(kRange.salaryMin, 120000);
assert.equal(kRange.salaryMax, 150000);

// Single posted value carries to both min and max so the floor checks have something to read.
const single = salaryRangeFromText("Salary: $185,000 annually");
assert.equal(single.salaryMin, 185000);
assert.equal(single.salaryMax, 185000);

// A bare 5-7 digit number without a $ is NOT a salary (could be a requisition id / headcount).
assert.equal(salaryRangeFromText("Requisition 1048576 with 250000 monthly active users").salaryText, "");

// Sub-annual values surface as display text but never feed the annual gate (no false below-floor).
const hourly = salaryFromJsonLdNode({ baseSalary: { value: { minValue: 60, maxValue: 80, unitText: "HOUR" } } });
assert.equal(hourly.salaryMin, undefined);
assert.equal(hourly.salaryMax, undefined);
assert.ok(hourly.salaryText.includes("/ hour"));

// --- JSON-LD node ---
const ldNode = salaryFromJsonLdNode({
  "@type": "JobPosting",
  baseSalary: { "@type": "MonetaryAmount", currency: "USD", value: { minValue: 140000, maxValue: 175000, unitText: "YEAR" } },
});
assert.equal(ldNode.salaryMin, 140000);
assert.equal(ldNode.salaryMax, 175000);
assert.equal(ldNode.salaryText, "$140,000 - $175,000");

assert.equal(salaryFromJsonLdNode({ "@type": "JobPosting", title: "No comp here" }).salaryText, "");

// --- JSON-LD embedded in raw page HTML (hydration parser) ---
const html = `
  <html><head>
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"JobPosting","title":"Senior Producer",
   "baseSalary":{"@type":"MonetaryAmount","currency":"USD","value":{"@type":"QuantitativeValue","minValue":130000,"maxValue":160000,"unitText":"YEAR"}}}
  </script></head><body>Senior Producer</body></html>`;
const fromHtml = salaryFromJsonLdHtml(html);
assert.equal(fromHtml.salaryMin, 130000);
assert.equal(fromHtml.salaryMax, 160000);

// --- normalizers now keep salary the source already handed us ---
const greenhouseCompany = { id: "company-x", companyName: "Acme", atsProvider: "greenhouse", careersUrl: "", websiteUrl: "" };
const greenhouseJob = normalizeGreenhouseJob(
  { id: 1, title: "Director of Production", absolute_url: "https://example.com/x", content: "<p>The salary range for this role is $160,000 - $190,000.</p>", location: { name: "Remote" }, departments: { name: "Studio" } },
  greenhouseCompany
);
assert.equal(greenhouseJob.salaryMin, 160000);
assert.equal(greenhouseJob.salaryMax, 190000);
assert.ok(greenhouseJob.salaryText.includes("160,000"));

const ashbyCompany = { id: "company-y", companyName: "Beta", atsProvider: "ashby", careersUrl: "", websiteUrl: "" };
const ashbyJob = normalizeAshbyJob(
  { id: "2", title: "Program Director", jobUrl: "https://example.com/y", description: "Lead programs.", compensation: { compensationTierSummary: "$150K - $180K" } },
  ashbyCompany
);
assert.equal(ashbyJob.salaryMin, 150000);
assert.equal(ashbyJob.salaryMax, 180000);

// JSON-LD salary on an html-provider careers page threads through to the normalized job.
const htmlCompany = { id: "company-z", companyName: "Gamma", atsProvider: "html", careersUrl: "https://gamma.example/careers", websiteUrl: "" };
const htmlJobs = parseProviderHtmlJobs(html, htmlCompany);
assert.ok(htmlJobs.length >= 1, "expected a JSON-LD job to parse");
assert.equal(htmlJobs[0].salaryMin, 130000);
assert.equal(htmlJobs[0].salaryMax, 160000);

// Body-only fallback (no JSON-LD, no fields) still recovers a printed range.
assert.equal(salaryFromBodyText("We pay $200,000 to $240,000 for this role.").salaryMax, 240000);

const himalayasCompany = { id: "generated-broad-himalayas", companyName: "Himalayas Broad Job Board", atsProvider: "html", careersUrl: "", websiteUrl: "" };
const hourlyHimalayasJob = normalizeConnectorJob(
  {
    title: "Creative Program Manager",
    companyName: "Example Co",
    locationRestrictions: ["United States"],
    minSalary: 43.27,
    maxSalary: 88.5,
    description: "Remote creative program role.",
    applicationLink: "https://himalayas.app/companies/example/jobs/creative-program-manager",
    guid: "https://himalayas.app/companies/example/jobs/creative-program-manager",
  },
  himalayasCompany
);
assert.equal(hourlyHimalayasJob.salaryMin, 43);
assert.equal(hourlyHimalayasJob.salaryMax, 89);
assert.equal(hourlyHimalayasJob.salaryText, "$43-$89");

console.log("dumpster-fire salary extraction: all assertions passed");
