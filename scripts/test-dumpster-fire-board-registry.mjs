import assert from "node:assert/strict";
import { resolveBoardFromUrl } from "../app/scans/board-registry.ts";
import { normalizeAdzunaPayload, parseRssJobs, parseRipplingJobs } from "../app/scans/connectors.ts";

// Posting URLs resolve to per-company boards.
const greenhouse = resolveBoardFromUrl("https://job-boards.greenhouse.io/liquiddeath/jobs/4279680009?gh_src=abc");
assert.equal(greenhouse.status, "resolved");
assert.equal(greenhouse.board.provider, "greenhouse");
assert.equal(greenhouse.board.atsBoardToken, "liquiddeath");
assert.equal(greenhouse.board.careersUrl, "https://job-boards.greenhouse.io/liquiddeath");

const ashby = resolveBoardFromUrl("https://jobs.ashbyhq.com/Jerry.ai/08ebec97-d6e2-4dfd-8e7a-bea4c11c5929?utm_source=x");
assert.equal(ashby.status, "resolved");
assert.equal(ashby.board.provider, "ashby");
assert.equal(ashby.board.atsBoardToken, "Jerry.ai");

const lever = resolveBoardFromUrl("https://jobs.lever.co/acme/some-job-id");
assert.equal(lever.status, "resolved");
assert.equal(lever.board.provider, "lever");
assert.equal(lever.board.atsBoardToken, "acme");

const rippling = resolveBoardFromUrl("https://ats.rippling.com/episode1-agency/jobs/8b351ba0-6b3f-4dc0-891f-49cc4a0bb378");
assert.equal(rippling.status, "resolved");
assert.equal(rippling.board.provider, "html");
assert.equal(rippling.board.careersUrl, "https://ats.rippling.com/episode1-agency/jobs");

const gem = resolveBoardFromUrl("https://jobs.gem.com/fetch/am9icG9zdDpL?utm_source=Otta");
assert.equal(gem.status, "blocked");

const workable = resolveBoardFromUrl("https://apply.workable.com/space150/j/ABC123/");
assert.equal(workable.status, "resolved");
assert.equal(workable.board.provider, "html");
assert.equal(workable.board.careersUrl, "https://apply.workable.com/api/v1/widget/accounts/space150?details=true");

const embedded = resolveBoardFromUrl("https://www.instacart.careers/job?gh_jid=7980420&utm_source=Otta");
assert.equal(embedded.status, "resolved");
assert.equal(embedded.board.provider, "greenhouse");
assert.equal(embedded.board.atsBoardToken, "instacart");
assert.equal(embedded.board.confidence, "guess");

assert.equal(resolveBoardFromUrl("https://example.com/careers").status, "unrecognized");
assert.equal(resolveBoardFromUrl("not a url").status, "unrecognized");

// WWR-style RSS items parse into normalized raw jobs with company/title split.
const rssJobs = parseRssJobs(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<item>
  <title>Acme Studio: Senior Producer, Brand</title>
  <region>Anywhere in the World</region>
  <country>USA</country>
  <category>Product</category>
  <type>Full-Time</type>
  <description>&lt;p&gt;Lead brand production workflows, vendor coordination, and cross-functional stakeholder delivery.&lt;/p&gt;</description>
  <link>https://weworkremotely.com/remote-jobs/acme-studio-senior-producer-brand</link>
</item>
</channel></rss>`);
assert.equal(rssJobs.length, 1);
assert.equal(rssJobs[0].companyName, "Acme Studio");
assert.equal(rssJobs[0].title, "Senior Producer, Brand");
assert.equal(rssJobs[0].location, "Anywhere in the World, USA");
assert.ok(rssJobs[0].sourceUrl.includes("weworkremotely.com/remote-jobs/"));

// Rippling NEXT_DATA boards parse into raw jobs.
const ripplingHtml = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
  props: { pageProps: { dehydratedState: { queries: [
    { state: { data: { items: [
      { id: "8b351ba0", name: "Executive Producer", url: "/episode1-agency/jobs/8b351ba0", department: { name: "Production" }, locations: [{ city: "New York", state: "NY", country: "US", workplaceType: "REMOTE" }] },
    ] } } },
  ] } } },
})}</script></html>`;
const ripplingJobs = parseRipplingJobs(ripplingHtml, "https://ats.rippling.com/episode1-agency/jobs");
assert.equal(ripplingJobs.length, 1);
assert.equal(ripplingJobs[0].title, "Executive Producer");
assert.ok(ripplingJobs[0].location.includes("New York"));
assert.ok(ripplingJobs[0].location.includes("REMOTE"));
assert.ok(ripplingJobs[0].sourceUrl.startsWith("https://ats.rippling.com/"));

// Adzuna payloads normalize; predicted salaries are dropped so they cannot trip the comp floor gate.
const adzunaCompany = {
  id: "generated-broad-adzuna-executive-producer",
  companyName: "Adzuna Broad Job Board - Executive Producer",
  websiteUrl: "https://www.adzuna.com",
  careersUrl: "https://api.adzuna.com/v1/api/jobs/us/search/1?title_only=executive%20producer&what_and=remote",
  atsProvider: "html",
  atsBoardToken: "",
  industryBucket: "Broad job board",
  remoteLikelihood: 80,
  notes: "",
  status: "active",
  lastSuccessfulScan: "",
};
const adzunaJobs = normalizeAdzunaPayload({
  count: 2,
  results: [
    {
      id: "111",
      title: "Executive <strong>Producer</strong>",
      company: { display_name: "Jackson Dawson" },
      location: { display_name: "Dearborn, Wayne County" },
      category: { label: "Creative & Design Jobs" },
      salary_min: 89375.71,
      salary_max: 89375.71,
      salary_is_predicted: "1",
      contract_time: "full_time",
      description: "Lead experiential production, vendor coordination, and cross-functional stakeholder delivery for remote campaigns.",
      redirect_url: "https://www.adzuna.com/land/ad/111",
    },
    {
      id: "222",
      title: "Senior Producer",
      company: { display_name: "Urban1" },
      location: { display_name: "Remote, US" },
      salary_min: 155000,
      salary_max: 175000,
      salary_is_predicted: "0",
      contract_time: "full_time",
      description: "Own remote production workflows and stakeholder management.",
      redirect_url: "https://www.adzuna.com/land/ad/222",
    },
  ],
}, adzunaCompany);
assert.equal(adzunaJobs.length, 2);
assert.equal(adzunaJobs[0].title, "Executive Producer");
assert.equal(adzunaJobs[0].companyName, "Jackson Dawson");
assert.equal(adzunaJobs[0].salaryMin, undefined, "predicted salary must be dropped");
assert.equal(adzunaJobs[1].salaryMin, 155000, "posted salary must be kept");
assert.equal(adzunaJobs[1].remoteType, "remote");
assert.ok(adzunaJobs[0].sourceUrl.includes("adzuna.com/land"));

console.log("Dumpster Fire board registry fixtures passed.");
