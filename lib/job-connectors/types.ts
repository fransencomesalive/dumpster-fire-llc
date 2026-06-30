// Neutral, app-owned job-connector types. This module is intentionally independent of the legacy
// `app/scans` data model so the public product can ingest jobs without depending on the legacy
// system. The shapes mirror the legacy connector contracts so the parsing/normalization logic
// ports over verbatim.

export type SourceProvider = "greenhouse" | "lever" | "ashby" | "icims" | "workday" | "magnit" | "html";

export type RemoteType = "remote" | "hybrid" | "onsite" | "unclear";

export type EmploymentType = "full-time" | "contract" | "freelance";

// A connector source to fetch from. Equivalent to the fields of the legacy `Company` record that
// the connectors actually read.
export type JobSource = {
  id: string;
  companyName: string;
  websiteUrl: string;
  careersUrl: string;
  atsProvider: SourceProvider;
  atsBoardToken: string;
};

export type NormalizedConnectorJob = {
  companyId: string;
  externalJobId: string;
  sourceProvider: SourceProvider;
  sourceUrl: string;
  applyUrl: string;
  title: string;
  companyName: string;
  location: string;
  remoteType: RemoteType;
  employmentType: EmploymentType;
  department: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryText: string;
  descriptionText: string;
  rawPayload: unknown;
};

export type ConnectorPlan = {
  companyId: string;
  companyName: string;
  provider: SourceProvider;
  requestLabel: string;
  endpointUrl: string;
  canPreview: boolean;
  requiredFields: string[];
  normalizationFields: string[];
  guardrails: string[];
  warnings: string[];
};
