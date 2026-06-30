import type { PublicProfileRepositoryRequest } from "../../public-profile/repository";
import type { JobSource, SourceProvider } from "./types";

// A configured scan source plus the scan-control fields the public app owns.
export type JobSourceRecord = JobSource & {
  status: "active" | "paused";
  workdayVariants: string[];
};

type JobSourceRow = {
  id: string;
  company_name: string;
  website_url: string | null;
  careers_url: string | null;
  ats_provider: SourceProvider;
  ats_board_token: string | null;
  status: "active" | "paused";
  workday_variants: string[] | null;
};

function qs(params: Record<string, string>) {
  return `?${new URLSearchParams(params).toString()}`;
}

function mapJobSource(row: JobSourceRow): JobSourceRecord {
  return {
    id: row.id,
    companyName: row.company_name,
    websiteUrl: row.website_url ?? "",
    careersUrl: row.careers_url ?? "",
    atsProvider: row.ats_provider,
    atsBoardToken: row.ats_board_token ?? "",
    status: row.status,
    workdayVariants: row.workday_variants ?? [],
  };
}

export async function loadActiveJobSources(
  request: PublicProfileRepositoryRequest,
): Promise<JobSourceRecord[]> {
  const rows = await request<JobSourceRow[]>("job_sources", {
    query: qs({
      status: "eq.active",
      select: "id,company_name,website_url,careers_url,ats_provider,ats_board_token,status,workday_variants",
      order: "company_name.asc",
    }),
  });
  return rows.map(mapJobSource);
}

export async function markJobSourceScanned(
  request: PublicProfileRepositoryRequest,
  sourceId: string,
  options: { at: string; error?: string },
): Promise<void> {
  await request("job_sources", {
    method: "PATCH",
    query: qs({ id: `eq.${sourceId}` }),
    body: {
      last_scanned_at: options.at,
      last_error: options.error ?? null,
      updated_at: options.at,
    },
  });
}
