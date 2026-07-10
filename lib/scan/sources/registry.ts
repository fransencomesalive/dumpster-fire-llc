import type { PublicProfileRepositoryRequest } from "../../public-profile/repository";
import type { ResolvedBoard } from "./board-registry";
import type { JobSource, SourceProvider } from "./types";

// A configured scan source plus the scan-control fields the public app owns.
export type JobSourceRecord = JobSource & {
  status: "active" | "paused";
  workdayVariants: string[];
};

// A user-owned board (private per user, Randall 2026-07-10) — includes the scan bookkeeping
// the per-user scan needs for least-recently-scanned rotation.
export type UserJobSourceRecord = JobSourceRecord & {
  lastScannedAt: string | null;
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
  last_scanned_at?: string | null;
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

const USER_SOURCE_SELECT = "id,company_name,website_url,careers_url,ats_provider,ats_board_token,status,workday_variants,last_scanned_at";

function mapUserJobSource(row: JobSourceRow): UserJobSourceRecord {
  return {
    ...mapJobSource(row),
    lastScannedAt: row.last_scanned_at ?? null,
  };
}

// The user's private boards, in the order the sidebar lists them.
export async function loadUserJobSources(
  request: PublicProfileRepositoryRequest,
  userId: string,
): Promise<UserJobSourceRecord[]> {
  const rows = await request<JobSourceRow[]>("job_sources", {
    query: qs({
      owner_user_id: `eq.${userId}`,
      status: "eq.active",
      select: USER_SOURCE_SELECT,
      order: "created_at.asc",
    }),
  });
  return rows.map(mapUserJobSource);
}

// Idempotent add: the same user re-adding the same board returns the existing row instead
// of tripping the owner-scoped unique index.
export async function insertUserJobSource(
  request: PublicProfileRepositoryRequest,
  userId: string,
  board: ResolvedBoard,
  now: string,
): Promise<UserJobSourceRecord> {
  const existing = await request<JobSourceRow[]>("job_sources", {
    query: qs({
      owner_user_id: `eq.${userId}`,
      ats_provider: `eq.${board.provider}`,
      ats_board_token: `eq.${board.atsBoardToken}`,
      careers_url: `eq.${board.careersUrl}`,
      select: USER_SOURCE_SELECT,
      limit: "1",
    }),
  });
  if (existing.length > 0) return mapUserJobSource(existing[0]);

  const inserted = await request<JobSourceRow[]>("job_sources", {
    method: "POST",
    query: `?select=${USER_SOURCE_SELECT}`,
    headers: { Prefer: "return=representation" },
    body: {
      owner_user_id: userId,
      company_name: board.companySlug,
      website_url: "",
      careers_url: board.careersUrl,
      ats_provider: board.provider,
      ats_board_token: board.atsBoardToken,
      status: "active",
      updated_at: now,
    },
  });
  const row = inserted[0];
  if (!row) throw new Error("Board insert came back empty.");
  return mapUserJobSource(row);
}

// Owner-guarded delete — a user can only remove their own boards, never global sources.
export async function deleteUserJobSource(
  request: PublicProfileRepositoryRequest,
  userId: string,
  sourceId: string,
): Promise<void> {
  await request("job_sources", {
    method: "DELETE",
    query: qs({ id: `eq.${sourceId}`, owner_user_id: `eq.${userId}` }),
  });
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
