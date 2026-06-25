import type { NormalizedConnectorJob } from "./connectors";
import type { Job } from "./types";

export type DuplicateClusterKeyInput = {
  companyName: string;
  title: string;
};

export type ConnectorDuplicateSelection = {
  selectedJobs: NormalizedConnectorJob[];
  duplicateJobs: Array<{
    job: NormalizedConnectorJob;
    duplicateKey: string;
    duplicateOfExternalJobId: string;
  }>;
};

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeCompanyName(value: string) {
  return normalizeKey(value)
    .replace(/\b(inc|llc|ltd|co|corp|corporation|company|group|ai)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTitle(value: string) {
  return normalizeKey(value)
    .replace(/\b(remote|hybrid|onsite|on site|contract|full time|part time|temporary|temp)\b/g, " ")
    .replace(/\b(i|ii|iii|iv|v)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function duplicateKeyForMatch(input: DuplicateClusterKeyInput) {
  return [
    normalizeCompanyName(input.companyName),
    normalizeTitle(input.title),
  ].filter(Boolean).join("|");
}

export function duplicateKeyForJob(job: Pick<Job, "companyName" | "title">) {
  return duplicateKeyForMatch(job);
}

export function duplicateKeyForConnectorJob(job: Pick<NormalizedConnectorJob, "companyName" | "title">) {
  return duplicateKeyForMatch(job);
}

export function selectUniqueConnectorJobs(
  jobs: NormalizedConnectorJob[],
  reservedDuplicateKeys = new Set<string>()
): ConnectorDuplicateSelection {
  const selectedJobs: NormalizedConnectorJob[] = [];
  const duplicateJobs: ConnectorDuplicateSelection["duplicateJobs"] = [];
  const selectedByKey = new Map<string, NormalizedConnectorJob>();

  for (const job of jobs) {
    const duplicateKey = duplicateKeyForConnectorJob(job);
    const selected = selectedByKey.get(duplicateKey);

    if (selected) {
      duplicateJobs.push({
        job,
        duplicateKey,
        duplicateOfExternalJobId: selected.externalJobId,
      });
      continue;
    }

    if (reservedDuplicateKeys.has(duplicateKey)) {
      duplicateJobs.push({
        job,
        duplicateKey,
        duplicateOfExternalJobId: "previous-source-selection",
      });
      continue;
    }

    selectedByKey.set(duplicateKey, job);
    selectedJobs.push(job);
  }

  return { selectedJobs, duplicateJobs };
}
