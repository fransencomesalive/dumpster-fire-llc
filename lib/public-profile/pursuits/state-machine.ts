import type {
  CompleteReviewInput,
  CreatePursuitInput,
  Pursuit,
  PursuitEvent,
  PursuitEventType,
  PursuitStatus,
  PursuitTransitionResult,
  PursuitUsageEvent,
  PursuitUsageType,
} from "./types";

const TERMINAL_STATUSES = new Set<PursuitStatus>(["deleted"]);

const NEXT_STATUS_BY_EVENT: Partial<Record<PursuitEventType, PursuitStatus>> = {
  review_completed: "review_complete",
  human_path_generated: "human_path_generated",
  contacts_selected: "outreach_ready",
  outreach_generated: "outreach_ready",
  outreach_sent: "outreach_sent",
  applied: "applied",
  responded: "responded",
  interviewing: "interviewing",
  offer: "offer",
  rejected: "rejected",
  expired: "expired",
  deleted: "deleted",
};

const ALLOWED_FROM: Record<PursuitEventType, PursuitStatus[]> = {
  created: [],
  review_completed: ["saved", "discovered", "review_complete"],
  human_path_generated: ["review_complete", "human_path_generated"],
  contacts_selected: ["human_path_generated", "outreach_ready"],
  outreach_generated: ["outreach_ready"],
  outreach_sent: ["outreach_ready", "outreach_sent"],
  applied: ["outreach_ready", "outreach_sent", "applied"],
  responded: ["outreach_sent", "applied", "responded"],
  interviewing: ["responded", "interviewing"],
  offer: ["interviewing", "offer"],
  rejected: ["outreach_sent", "applied", "responded", "interviewing", "offer", "rejected"],
  expired: ["saved", "review_complete", "human_path_generated", "outreach_ready", "outreach_sent", "applied", "responded", "interviewing", "offer", "rejected", "expired"],
  deleted: ["saved", "review_complete", "human_path_generated", "outreach_ready", "outreach_sent", "applied", "responded", "interviewing", "offer", "rejected", "expired"],
  note_added: ["saved", "review_complete", "human_path_generated", "outreach_ready", "outreach_sent", "applied", "responded", "interviewing", "offer", "rejected", "expired"],
};

function unique(values: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(trimmed);
  }
  return output;
}

function usageEvent(
  pursuit: Pursuit,
  usageType: PursuitUsageType,
  createdAt: string,
  quantity = 1,
): PursuitUsageEvent {
  return {
    userId: pursuit.userId,
    profileId: pursuit.profileId,
    usageType,
    quantity,
    relatedJobId: pursuit.jobId,
    relatedPursuitId: pursuit.id,
    createdAt,
  };
}

function eventFor(
  pursuit: Pursuit,
  eventType: PursuitEventType,
  fromStatus: PursuitStatus | undefined,
  toStatus: PursuitStatus | undefined,
  createdAt: string,
  payload: Record<string, unknown> = {},
  usageType?: PursuitUsageType,
): PursuitEvent {
  return {
    pursuitId: pursuit.id,
    userId: pursuit.userId,
    eventType,
    fromStatus,
    toStatus,
    usageType,
    payload,
    createdAt,
  };
}

export function createPursuit(input: CreatePursuitInput): PursuitTransitionResult {
  const pursuit: Pursuit = {
    id: input.id,
    userId: input.userId,
    profileId: input.profileId,
    jobId: input.jobId,
    status: "saved",
    fitSummary: input.fitSummary,
    risks: unique(input.risks ?? []),
    recommendedWorkExampleIds: unique(input.recommendedWorkExampleIds ?? []),
    outreachAngle: input.outreachAngle,
    lastActivityAt: input.now,
    createdAt: input.now,
    updatedAt: input.now,
  };
  return {
    ok: true,
    pursuit,
    event: eventFor(pursuit, "created", undefined, "saved", input.now, {}, "pursuit"),
    usageEvents: [usageEvent(pursuit, "pursuit", input.now)],
  };
}

export function completeReview(
  pursuit: Pursuit,
  input: CompleteReviewInput,
  now: string,
): PursuitTransitionResult {
  return transitionPursuit(pursuit, "review_completed", now, {
    selectedRoleTrackId: input.selectedRoleTrackId,
    selectedResumeId: input.selectedResumeId,
    selectedWorkExampleId: input.selectedWorkExampleId,
    fitSummary: input.fitSummary,
    risks: input.risks,
    recommendedWorkExampleIds: input.recommendedWorkExampleIds,
    outreachAngle: input.outreachAngle,
  });
}

export function transitionPursuit(
  pursuit: Pursuit,
  eventType: PursuitEventType,
  now: string,
  payload: Record<string, unknown> = {},
): PursuitTransitionResult {
  if (TERMINAL_STATUSES.has(pursuit.status)) {
    return { ok: false, issues: [`Cannot transition a ${pursuit.status} pursuit.`] };
  }

  const allowed = ALLOWED_FROM[eventType] ?? [];
  if (!allowed.includes(pursuit.status)) {
    return { ok: false, issues: [`Cannot apply ${eventType} from ${pursuit.status}.`] };
  }

  const nextStatus = NEXT_STATUS_BY_EVENT[eventType] ?? pursuit.status;
  const next: Pursuit = {
    ...pursuit,
    status: nextStatus,
    selectedRoleTrackId: typeof payload.selectedRoleTrackId === "string" ? payload.selectedRoleTrackId : pursuit.selectedRoleTrackId,
    selectedResumeId: typeof payload.selectedResumeId === "string" ? payload.selectedResumeId : pursuit.selectedResumeId,
    selectedWorkExampleId: typeof payload.selectedWorkExampleId === "string" ? payload.selectedWorkExampleId : pursuit.selectedWorkExampleId,
    fitSummary: typeof payload.fitSummary === "string" ? payload.fitSummary : pursuit.fitSummary,
    risks: Array.isArray(payload.risks) ? unique(payload.risks.filter((risk): risk is string => typeof risk === "string")) : pursuit.risks,
    recommendedWorkExampleIds: Array.isArray(payload.recommendedWorkExampleIds)
      ? unique(payload.recommendedWorkExampleIds.filter((id): id is string => typeof id === "string"))
      : pursuit.recommendedWorkExampleIds,
    outreachAngle: typeof payload.outreachAngle === "string" ? payload.outreachAngle : pursuit.outreachAngle,
    lastActivityAt: now,
    updatedAt: now,
  };
  const usageType = eventType === "human_path_generated"
    ? "human_path"
    : eventType === "outreach_generated"
      ? "outreach_message"
      : undefined;
  const quantity = eventType === "outreach_generated" && typeof payload.messageCount === "number"
    ? Math.max(1, Math.round(payload.messageCount))
    : 1;
  const usageEvents = usageType ? [usageEvent(next, usageType, now, quantity)] : [];

  return {
    ok: true,
    pursuit: next,
    event: eventFor(next, eventType, pursuit.status, next.status, now, payload, usageType),
    usageEvents,
  };
}

export function expireInactivePursuit(
  pursuit: Pursuit,
  now: string,
  inactiveDays = 90,
): PursuitTransitionResult {
  const lastActivity = Date.parse(pursuit.lastActivityAt);
  const current = Date.parse(now);
  if (!Number.isFinite(lastActivity) || !Number.isFinite(current)) {
    return { ok: false, issues: ["Cannot evaluate expiration without readable timestamps."] };
  }

  const inactiveMs = current - lastActivity;
  if (inactiveMs < inactiveDays * 86_400_000) {
    return { ok: false, issues: [`Pursuit has not been inactive for ${inactiveDays} days.`] };
  }

  return transitionPursuit(pursuit, "expired", now, { inactiveDays });
}
