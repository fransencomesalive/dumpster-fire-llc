import type { PublicProfileRepositoryRequest } from "../repository";
import type {
  CreatePursuitInput,
  Pursuit,
  PursuitEvent,
  PursuitTransitionResult,
  PursuitUsageEvent,
} from "./types";
import { createPursuit } from "./state-machine";

type PursuitRow = {
  id: string;
  user_id: string;
  profile_id: string;
  job_id: string;
  selected_role_track_id: string | null;
  selected_resume_id: string | null;
  selected_work_example_id: string | null;
  status: Pursuit["status"];
  fit_summary: string | null;
  risks: string[];
  recommended_work_example_ids: string[];
  outreach_angle: string | null;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
};

function qs(params: Record<string, string>) {
  return `?${new URLSearchParams(params).toString()}`;
}

function first<T>(rows: T[]) {
  return rows[0];
}

function defined<T>(value: T | null | undefined) {
  return value === null || value === undefined ? undefined : value;
}

function mapPursuit(row: PursuitRow): Pursuit {
  return {
    id: row.id,
    userId: row.user_id,
    profileId: row.profile_id,
    jobId: row.job_id,
    selectedRoleTrackId: defined(row.selected_role_track_id),
    selectedResumeId: defined(row.selected_resume_id),
    selectedWorkExampleId: defined(row.selected_work_example_id),
    status: row.status,
    fitSummary: defined(row.fit_summary),
    risks: row.risks,
    recommendedWorkExampleIds: row.recommended_work_example_ids,
    outreachAngle: defined(row.outreach_angle),
    lastActivityAt: row.last_activity_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function pursuitRowBody(pursuit: Pursuit) {
  return {
    id: pursuit.id,
    user_id: pursuit.userId,
    profile_id: pursuit.profileId,
    job_id: pursuit.jobId,
    selected_role_track_id: pursuit.selectedRoleTrackId ?? null,
    selected_resume_id: pursuit.selectedResumeId ?? null,
    selected_work_example_id: pursuit.selectedWorkExampleId ?? null,
    status: pursuit.status,
    fit_summary: pursuit.fitSummary ?? null,
    risks: pursuit.risks,
    recommended_work_example_ids: pursuit.recommendedWorkExampleIds,
    outreach_angle: pursuit.outreachAngle ?? null,
    last_activity_at: pursuit.lastActivityAt,
    created_at: pursuit.createdAt,
    updated_at: pursuit.updatedAt,
  };
}

function pursuitUpdateBody(pursuit: Pursuit) {
  const body = pursuitRowBody(pursuit) as Record<string, unknown>;
  delete body.id;
  delete body.user_id;
  delete body.profile_id;
  delete body.job_id;
  delete body.created_at;
  return body;
}

function pursuitEventBody(event: PursuitEvent) {
  return {
    pursuit_id: event.pursuitId,
    user_id: event.userId,
    event_type: event.eventType,
    from_status: event.fromStatus ?? null,
    to_status: event.toStatus ?? null,
    usage_type: event.usageType ?? null,
    payload: event.payload,
    created_at: event.createdAt,
  };
}

function usageEventBody(event: PursuitUsageEvent) {
  return {
    user_id: event.userId,
    usage_type: event.usageType,
    quantity: event.quantity,
    related_job_id: event.relatedJobId ?? null,
    related_pursuit_id: event.relatedPursuitId ?? null,
    created_at: event.createdAt,
  };
}

export async function loadPursuitByIdForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  pursuitId: string,
): Promise<Pursuit | undefined> {
  const rows = await request<PursuitRow[]>("pursuits", {
    query: qs({
      id: `eq.${pursuitId}`,
      user_id: `eq.${userId}`,
      select: "id,user_id,profile_id,job_id,selected_role_track_id,selected_resume_id,selected_work_example_id,status,fit_summary,risks,recommended_work_example_ids,outreach_angle,last_activity_at,created_at,updated_at",
      limit: "1",
    }),
  });
  const row = first(rows);
  return row ? mapPursuit(row) : undefined;
}

export async function createPursuitForJob(
  request: PublicProfileRepositoryRequest,
  input: CreatePursuitInput,
): Promise<PursuitTransitionResult> {
  const result = createPursuit(input);
  if (result.ok === false) return result;
  await persistPursuitTransition(request, result, { insertPursuit: true });
  return result;
}

export async function persistPursuitTransition(
  request: PublicProfileRepositoryRequest,
  result: Extract<PursuitTransitionResult, { ok: true }>,
  options: { insertPursuit?: boolean } = {},
) {
  if (options.insertPursuit) {
    await request("pursuits", {
      method: "POST",
      query: "?on_conflict=user_id,job_id",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: pursuitRowBody(result.pursuit),
    });
  } else {
    await request("pursuits", {
      method: "PATCH",
      query: qs({ id: `eq.${result.pursuit.id}`, user_id: `eq.${result.pursuit.userId}` }),
      body: pursuitUpdateBody(result.pursuit),
    });
  }

  await request("pursuit_events", {
    method: "POST",
    body: pursuitEventBody(result.event),
  });

  if (result.usageEvents.length > 0) {
    await request("usage_ledger", {
      method: "POST",
      body: result.usageEvents.map(usageEventBody),
    });
  }
}
