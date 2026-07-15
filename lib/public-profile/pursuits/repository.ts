import type { PublicProfileRepositoryRequest } from "../repository";
import type {
  CreatePursuitInput,
  GeneratedOutreachDraft,
  HumanPathContact,
  HumanPathContactSuggestion,
  OutreachMessageRecord,
  OutreachRecipientType,
  Pursuit,
  PursuitEvent,
  PursuitEventType,
  PursuitStatus,
  PursuitTransitionResult,
  PursuitUsageEvent,
  PursuitUsageType,
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

type OutreachMessageRow = {
  id: string;
  pursuit_id: string;
  contact_suggestion_id: string | null;
  recipient_type: OutreachRecipientType;
  channel: string;
  message: string;
  previous_message: string | null;
  regeneration_count: 0 | 1;
  status: OutreachMessageRecord["status"];
  rejection_reason: string | null;
  selected_role_track_id: string | null;
  selected_resume_id: string | null;
  selected_work_example_id: string | null;
  created_at: string;
  updated_at: string;
};

type PursuitEventRow = {
  id: string;
  pursuit_id: string;
  user_id: string;
  event_type: PursuitEventType;
  from_status: PursuitStatus | null;
  to_status: PursuitStatus | null;
  usage_type: PursuitUsageType | null;
  payload: Record<string, unknown>;
  created_at: string;
};

type ContactSuggestionRow = {
  id: string;
  name: string;
  title: string;
  company_name: string;
  linkedin_url: string | null;
  email: string | null;
  contact_type: HumanPathContact["contactType"];
  confidence: HumanPathContact["confidence"];
  relevance_reason: string;
  role_connection: string;
  verification_notes: string[];
  selected_for_outreach: boolean;
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

function contactSuggestionBody(pursuit: Pursuit, contact: HumanPathContact, updatedAt: string) {
  return {
    pursuit_id: pursuit.id,
    job_id: pursuit.jobId,
    name: contact.name,
    title: contact.title,
    company_name: contact.companyName,
    linkedin_url: contact.linkedinUrl ?? null,
    email: contact.email ?? null,
    contact_type: contact.contactType,
    confidence: contact.confidence,
    relevance_reason: contact.relevanceReason,
    role_connection: contact.roleConnection,
    verification_notes: contact.verificationNotes,
    updated_at: updatedAt,
  };
}

function outreachMessageBody(pursuit: Pursuit, draft: GeneratedOutreachDraft) {
  return {
    pursuit_id: pursuit.id,
    contact_suggestion_id: draft.contactSuggestionId,
    recipient_type: draft.recipientType,
    message: draft.message,
    previous_message: null,
    regeneration_count: 0,
    selected_resume_id: draft.selectedResumeId ?? null,
    selected_role_track_id: draft.selectedRoleTrackId ?? null,
    selected_work_example_id: draft.selectedWorkExampleId ?? null,
    status: "draft",
    created_at: draft.createdAt,
    updated_at: draft.createdAt,
  };
}

function mapContactSuggestion(row: ContactSuggestionRow): HumanPathContactSuggestion {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    companyName: row.company_name,
    linkedinUrl: defined(row.linkedin_url),
    email: defined(row.email),
    contactType: row.contact_type,
    confidence: row.confidence,
    relevanceReason: row.relevance_reason,
    roleConnection: row.role_connection,
    verificationNotes: row.verification_notes,
    selectedForOutreach: row.selected_for_outreach,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

// Pursuits are unique per (user, job); used to answer duplicate creates with the
// existing pursuit instead of letting the insert collide.
export async function loadPursuitByJobForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  jobId: string,
): Promise<Pursuit | undefined> {
  const rows = await request<PursuitRow[]>("pursuits", {
    query: qs({
      job_id: `eq.${jobId}`,
      user_id: `eq.${userId}`,
      select: "id,user_id,profile_id,job_id,selected_role_track_id,selected_resume_id,selected_work_example_id,status,fit_summary,risks,recommended_work_example_ids,outreach_angle,last_activity_at,created_at,updated_at",
      limit: "1",
    }),
  });
  const row = first(rows);
  return row ? mapPursuit(row) : undefined;
}

export async function loadContactSuggestionsForPursuit(
  request: PublicProfileRepositoryRequest,
  pursuitId: string,
): Promise<HumanPathContactSuggestion[]> {
  const rows = await request<ContactSuggestionRow[]>("contact_suggestions", {
    query: qs({
      pursuit_id: `eq.${pursuitId}`,
      select: "id,name,title,company_name,linkedin_url,email,contact_type,confidence,relevance_reason,role_connection,verification_notes,selected_for_outreach,created_at,updated_at",
      order: "created_at.asc",
    }),
  });
  return rows.map(mapContactSuggestion);
}

function mapOutreachMessage(row: OutreachMessageRow): OutreachMessageRecord {
  return {
    id: row.id,
    pursuitId: row.pursuit_id,
    contactSuggestionId: defined(row.contact_suggestion_id),
    recipientType: row.recipient_type,
    channel: row.channel,
    message: row.message,
    previousMessage: defined(row.previous_message),
    regenerationCount: row.regeneration_count,
    status: row.status,
    rejectionReason: defined(row.rejection_reason),
    selectedRoleTrackId: defined(row.selected_role_track_id),
    selectedResumeId: defined(row.selected_resume_id),
    selectedWorkExampleId: defined(row.selected_work_example_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPursuitEvent(row: PursuitEventRow): PursuitEvent {
  return {
    id: row.id,
    pursuitId: row.pursuit_id,
    userId: row.user_id,
    eventType: row.event_type,
    fromStatus: defined(row.from_status),
    toStatus: defined(row.to_status),
    usageType: defined(row.usage_type),
    payload: row.payload,
    createdAt: row.created_at,
  };
}

export async function loadPursuitsForUser(
  request: PublicProfileRepositoryRequest,
  userId: string,
  options: { status?: PursuitStatus; includeDeleted?: boolean } = {},
): Promise<Pursuit[]> {
  const query: Record<string, string> = {
    user_id: `eq.${userId}`,
    select: "id,user_id,profile_id,job_id,selected_role_track_id,selected_resume_id,selected_work_example_id,status,fit_summary,risks,recommended_work_example_ids,outreach_angle,last_activity_at,created_at,updated_at",
    order: "last_activity_at.desc",
  };
  if (options.status) {
    query.status = `eq.${options.status}`;
  } else if (!options.includeDeleted) {
    query.status = "neq.deleted";
  }
  const rows = await request<PursuitRow[]>("pursuits", { query: qs(query) });
  return rows.map(mapPursuit);
}

export async function loadOutreachMessagesForPursuit(
  request: PublicProfileRepositoryRequest,
  pursuitId: string,
): Promise<OutreachMessageRecord[]> {
  const rows = await request<OutreachMessageRow[]>("outreach_messages", {
    query: qs({
      pursuit_id: `eq.${pursuitId}`,
      select: "id,pursuit_id,contact_suggestion_id,recipient_type,channel,message,previous_message,regeneration_count,status,rejection_reason,selected_role_track_id,selected_resume_id,selected_work_example_id,created_at,updated_at",
      order: "created_at.asc",
    }),
  });
  return rows.map(mapOutreachMessage);
}

export async function loadOutreachMessageById(
  request: PublicProfileRepositoryRequest,
  messageId: string,
): Promise<OutreachMessageRecord | undefined> {
  const rows = await request<OutreachMessageRow[]>("outreach_messages", {
    query: qs({
      id: `eq.${messageId}`,
      select: "id,pursuit_id,contact_suggestion_id,recipient_type,channel,message,previous_message,regeneration_count,status,rejection_reason,selected_role_track_id,selected_resume_id,selected_work_example_id,created_at,updated_at",
      limit: "1",
    }),
  });
  const row = first(rows);
  return row ? mapOutreachMessage(row) : undefined;
}

export async function updateOutreachMessage(
  request: PublicProfileRepositoryRequest,
  message: OutreachMessageRecord,
): Promise<void> {
  await request("outreach_messages", {
    method: "PATCH",
    query: qs({ id: `eq.${message.id}` }),
    body: {
      message: message.message,
      status: message.status,
      rejection_reason: message.rejectionReason ?? null,
      updated_at: message.updatedAt,
    },
  });
}

export async function persistOutreachRegeneration(
  request: PublicProfileRepositoryRequest,
  result: Extract<PursuitTransitionResult, { ok: true }>,
  input: {
    messageId: string;
    previousMessage: string;
    message: string;
    updatedAt: string;
  },
): Promise<OutreachMessageRecord | undefined> {
  const rows = await request<OutreachMessageRow[]>("outreach_messages", {
    method: "PATCH",
    query: qs({
      id: `eq.${input.messageId}`,
      pursuit_id: `eq.${result.pursuit.id}`,
      regeneration_count: "eq.0",
      select: "id,pursuit_id,contact_suggestion_id,recipient_type,channel,message,previous_message,regeneration_count,status,rejection_reason,selected_role_track_id,selected_resume_id,selected_work_example_id,created_at,updated_at",
    }),
    headers: { Prefer: "return=representation" },
    body: {
      message: input.message,
      previous_message: input.previousMessage,
      regeneration_count: 1,
      status: "draft",
      rejection_reason: null,
      updated_at: input.updatedAt,
    },
  });
  const row = first(rows);
  if (!row) return undefined;

  await persistPursuitTransition(request, result);
  return mapOutreachMessage(row);
}

export async function loadPursuitEventsForPursuit(
  request: PublicProfileRepositoryRequest,
  pursuitId: string,
): Promise<PursuitEvent[]> {
  const rows = await request<PursuitEventRow[]>("pursuit_events", {
    query: qs({
      pursuit_id: `eq.${pursuitId}`,
      select: "id,pursuit_id,user_id,event_type,from_status,to_status,usage_type,payload,created_at",
      order: "created_at.asc",
    }),
  });
  return rows.map(mapPursuitEvent);
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

export async function recordProfileExportUsage(
  request: PublicProfileRepositoryRequest,
  input: { userId: string; createdAt: string; quantity?: number },
) {
  await request("usage_ledger", {
    method: "POST",
    body: {
      user_id: input.userId,
      usage_type: "profile_export",
      quantity: input.quantity ?? 1,
      related_job_id: null,
      related_pursuit_id: null,
      created_at: input.createdAt,
    },
  });
}

export async function persistContactSelection(
  request: PublicProfileRepositoryRequest,
  result: Extract<PursuitTransitionResult, { ok: true }>,
  contactIds: string[],
) {
  await persistPursuitTransition(request, result);

  await request("contact_suggestions", {
    method: "PATCH",
    query: qs({ pursuit_id: `eq.${result.pursuit.id}` }),
    body: {
      selected_for_outreach: false,
      updated_at: result.pursuit.updatedAt,
    },
  });

  await request("contact_suggestions", {
    method: "PATCH",
    query: qs({
      pursuit_id: `eq.${result.pursuit.id}`,
      id: `in.(${contactIds.join(",")})`,
    }),
    body: {
      selected_for_outreach: true,
      updated_at: result.pursuit.updatedAt,
    },
  });
}

export async function persistHumanPathGeneration(
  request: PublicProfileRepositoryRequest,
  result: Extract<PursuitTransitionResult, { ok: true }>,
  contacts: HumanPathContact[],
) {
  await persistPursuitTransition(request, result);

  await request("contact_suggestions", {
    method: "DELETE",
    query: qs({ pursuit_id: `eq.${result.pursuit.id}` }),
  });

  if (contacts.length > 0) {
    await request("contact_suggestions", {
      method: "POST",
      body: contacts.map((contact) => contactSuggestionBody(result.pursuit, contact, result.pursuit.updatedAt)),
    });
  }
}

export async function persistOutreachGeneration(
  request: PublicProfileRepositoryRequest,
  result: Extract<PursuitTransitionResult, { ok: true }>,
  drafts: GeneratedOutreachDraft[],
) {
  await persistPursuitTransition(request, result);

  if (drafts.length > 0) {
    await request("outreach_messages", {
      method: "POST",
      body: drafts.map((draft) => outreachMessageBody(result.pursuit, draft)),
    });
  }
}
