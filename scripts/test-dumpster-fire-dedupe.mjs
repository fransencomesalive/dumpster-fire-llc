import assert from "node:assert/strict";
import { duplicateKeyForMatch, selectUniqueConnectorJobs } from "../app/scans/dedupe.ts";

assert.equal(
  duplicateKeyForMatch({ companyName: "Jerry.ai", title: "Senior Creative Producer, Growth" }),
  duplicateKeyForMatch({ companyName: "Jerry", title: "Senior Creative Producer Growth" })
);

const jobs = [
  {
    companyId: "company-jerry",
    externalJobId: "ashby-1",
    sourceProvider: "ashby",
    sourceUrl: "https://jobs.ashbyhq.com/Jerry.ai/08ebec97-d6e2-4dfd-8e7a-bea4c11c5929",
    applyUrl: "https://jobs.ashbyhq.com/Jerry.ai/08ebec97-d6e2-4dfd-8e7a-bea4c11c5929",
    title: "Senior Creative Producer, Growth",
    companyName: "Jerry.ai",
    location: "Remote",
    remoteType: "remote",
    employmentType: "full-time",
    department: "",
    salaryText: "",
    descriptionText: "",
    rawPayload: {},
  },
  {
    companyId: "generated-broad-himalayas",
    externalJobId: "himalayas-1",
    sourceProvider: "html",
    sourceUrl: "https://himalayas.app/companies/jerry/jobs/senior-creative-producer-growth",
    applyUrl: "https://himalayas.app/companies/jerry/jobs/senior-creative-producer-growth",
    title: "Senior Creative Producer Growth",
    companyName: "Jerry",
    location: "Remote",
    remoteType: "remote",
    employmentType: "full-time",
    department: "",
    salaryText: "",
    descriptionText: "",
    rawPayload: {},
  },
];

const selected = selectUniqueConnectorJobs(jobs);
assert.equal(selected.selectedJobs.length, 1);
assert.equal(selected.duplicateJobs.length, 1);
assert.equal(selected.duplicateJobs[0].duplicateOfExternalJobId, "ashby-1");

console.log("dumpster-fire dedupe: all assertions passed");
