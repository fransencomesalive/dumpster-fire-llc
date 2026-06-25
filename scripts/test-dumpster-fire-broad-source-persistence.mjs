import assert from "node:assert/strict";
import { connectedSearchSources } from "../app/scans/search-sources.ts";

// These invariants are load-bearing for the broad-source scan fix:
//   - ensureSourceCompaniesPersisted() only upserts ids prefixed `generated-broad-`, so it must
//     never collide with a real, user-managed company (or it could overwrite one).
//   - DashboardClient hides `generated-broad-` ids from the Watchlist, so a real company must
//     never carry that prefix (or it would silently vanish from the list).
// If the id scheme ever changes, this test fails loudly instead of breaking the scan in prod.

const GENERATED_PREFIX = "generated-broad-";

const profile = {
  targetTitles: ["executive producer", "creative operations"],
  positiveKeywords: [],
  negativeKeywords: [],
  targetIndustries: [],
  compensationFloor: 0,
  freelanceRateFloor: 0,
  remoteOnly: true,
  doNotApplyCompanies: [],
  approvedLoginEmail: "",
};

// A real, persisted watchlist company, minted the way createCompany does (`company-<slug>-<ts>`).
const realCompany = {
  id: `company-acme-${Date.now()}`,
  companyName: "Acme Studio",
  websiteUrl: "https://acme.example.com",
  careersUrl: "https://boards.greenhouse.io/acme",
  atsProvider: "greenhouse",
  atsBoardToken: "acme",
  industryBucket: "creative agency",
  remoteLikelihood: 90,
  notes: "real watchlist company",
  status: "active",
  lastSuccessfulScan: "",
};

const { sources } = connectedSearchSources([realCompany], profile);

// 1. Generated broad sources are actually produced (Adzuna needs env keys, but several providers
//    do not), and every one of them carries the prefix the fix relies on.
const generated = sources.filter((source) => source.company.id.startsWith(GENERATED_PREFIX));
assert.ok(generated.length > 0, "expected connectedSearchSources to produce generated broad sources");
for (const source of generated) {
  assert.equal(source.sourceKind, "broad_job_board", `${source.company.id} should be a broad_job_board`);
}

// 2. The real company is present and is NEVER caught by the generated-broad- prefix.
const real = sources.find((source) => source.company.id === realCompany.id);
assert.ok(real, "expected the real watchlist company to remain a scan source");
assert.ok(!realCompany.id.startsWith(GENERATED_PREFIX), "real company id must not use the generated prefix");

// 3. The Watchlist hide filter keeps exactly the real, user-managed companies.
const watchlist = sources
  .map((source) => source.company)
  .filter((company) => !company.id.startsWith(GENERATED_PREFIX));
assert.deepEqual(
  watchlist.map((company) => company.id),
  [realCompany.id],
  "Watchlist filter must keep real companies and drop every generated broad source"
);

console.log(`Dumpster Fire broad-source persistence tests passed (${generated.length} generated sources guarded).`);
