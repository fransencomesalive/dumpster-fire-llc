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
};

export type PublicJobsSummary = {
  totalJobs: number;
  savedJobs: number;
  lastScanAt?: string;
  scanParameters: string[];
};

export type PublicJobsResponse = {
  jobs: PublicJobRecord[];
  summary: PublicJobsSummary;
};

export type PublicJobsScanResponse = PublicJobsResponse & {
  scan: {
    scannedAt: string;
    matchedJobs: number;
    mergedResults: number;
    providerMode: "normalized_public_jobs";
  };
};
