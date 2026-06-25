import { loadEnvConfig } from "@next/env";
import { getDashboardState, updateCompany, type CompanyUpdate } from "../app/scans/store";
import type { Company } from "../app/scans/types";

const confirmationPhrase = "PAUSE PLACEHOLDER SOURCES";

loadEnvConfig(process.cwd());

function hasPlaceholderValue(value: string) {
  return value.toLowerCase().includes("example.com");
}

function placeholderReasons(company: Company) {
  const reasons: string[] = [];

  if (hasPlaceholderValue(company.websiteUrl)) reasons.push("placeholder website URL");
  if (hasPlaceholderValue(company.careersUrl)) reasons.push("placeholder careers URL");
  if (hasPlaceholderValue(company.atsBoardToken)) reasons.push("placeholder ATS board token");

  return reasons;
}

function companyToUpdate(company: Company, status: Company["status"]): CompanyUpdate {
  return {
    companyName: company.companyName,
    websiteUrl: company.websiteUrl,
    careersUrl: company.careersUrl,
    atsProvider: company.atsProvider,
    atsBoardToken: company.atsBoardToken,
    industryBucket: company.industryBucket,
    remoteLikelihood: company.remoteLikelihood,
    notes: company.notes,
    status,
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const confirmIndex = process.argv.indexOf("--confirm");
  const confirmation = confirmIndex >= 0 ? process.argv[confirmIndex + 1] : "";
  const dashboard = await getDashboardState();
  const candidates = dashboard.companies
    .filter((company) => company.status === "active")
    .map((company) => ({
      company,
      reasons: placeholderReasons(company),
    }))
    .filter((candidate) => candidate.reasons.length > 0);

  if (!apply) {
    console.log(JSON.stringify({
      mode: "dry_run",
      persistence: dashboard.persistence,
      activeCompanies: dashboard.companies.filter((company) => company.status === "active").length,
      pauseCount: candidates.length,
      candidates: candidates.map(({ company, reasons }) => ({
        id: company.id,
        companyName: company.companyName,
        provider: company.atsProvider,
        websiteUrl: company.websiteUrl,
        careersUrl: company.careersUrl,
        reasons,
      })),
      applyCommand: `node scripts/run-dumpster-fire-source-hygiene-cleanup.mjs --apply --confirm "${confirmationPhrase}"`,
    }, null, 2));
    return;
  }

  if (confirmation !== confirmationPhrase) {
    console.log(JSON.stringify({
      mode: "blocked",
      error: "Exact confirmation phrase required.",
      requiredConfirmation: confirmationPhrase,
      pauseCount: candidates.length,
    }, null, 2));
    process.exitCode = 1;
    return;
  }

  const paused: Array<{ id: string; companyName: string; reasons: string[] }> = [];

  for (const { company, reasons } of candidates) {
    await updateCompany(company.id, companyToUpdate(company, "paused"));
    paused.push({ id: company.id, companyName: company.companyName, reasons });
  }

  console.log(JSON.stringify({
    mode: "applied",
    persistence: dashboard.persistence,
    pausedCount: paused.length,
    paused,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
