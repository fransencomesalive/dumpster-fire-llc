import type { MatchLabel } from "../public-profile/matching/types";

export type PublicJobMatchSummary = {
  score: number;
  label: MatchLabel;
  // Distinctive profile signals that matched this posting — used to highlight terms in the
  // responsibilities / required-experience lists.
  signals: string[];
};

export type PublicJobRecord = {
  id: string;
  source: string;
  sourceUrl: string;
  companyName: string;
  title: string;
  location?: string;
  remoteType?: string;
  employmentType?: string;
  compensationText?: string;
  description: string;
  postedAt?: string;
  scrapedAt: string;
  firstSeenAt: string;
  lastSeenAt: string;
  saved: boolean;
  // Parsed from the posting at source-scan time (heuristic). Empty when the posting had no
  // recognizable section headings.
  responsibilities: string[];
  requiredExperience: string[];
  // Set when jobs are returned to a user (read/scan): the profile-driven match score + label used
  // to rank and annotate results. Absent on bare records (e.g. ingestion mapping).
  match?: PublicJobMatchSummary;
};

export type PublicJobsSummary = {
  totalJobs: number;
  savedJobs: number;
  lastScanAt?: string;
  scanParameters: string[];
};

export type PublicJobSearchSettings = {
  remotePreference: string;
  salaryFloor?: number;
  targetTitleCount: number;
  avoidedCompanyCount: number;
};

export type PublicJobsResponse = {
  jobs: PublicJobRecord[];
  summary: PublicJobsSummary;
  searchSettings?: PublicJobSearchSettings;
};

export type PublicJobsScanResponse = PublicJobsResponse & {
  scan: {
    scannedAt: string;
    matchedJobs: number;
    mergedResults: number;
    providerMode: "normalized_public_jobs";
  };
};
