import type {
  Pursuit,
  PursuitTrackingAction,
  PursuitTrackingEvent,
  PursuitTrackingSource,
} from "./types";

export const PURSUIT_TRACKING_ACTIONS = [
  "outreach_sent",
  "applied_online",
  "response_received",
  "interviewing",
  "not_moving_forward",
  "never_heard_back",
] as const satisfies readonly PursuitTrackingAction[];

export type PursuitTrackingState = Record<PursuitTrackingAction, boolean>;
export type PursuitBucket = "saved_for_later" | "applied";

export type PlanPursuitTrackingChangesInput = {
  pursuit: Pursuit;
  currentEvents: PursuitTrackingEvent[];
  requested: Partial<PursuitTrackingState>;
  source: PursuitTrackingSource;
  idempotencyKey: string;
  occurredAt: string;
  createdAt?: string;
  outreachMessageId?: string;
  contactSuggestionId?: string;
  messageSnapshot?: string;
  recipientNameSnapshot?: string;
  recipientTitleSnapshot?: string;
  recipientLinkedinUrlSnapshot?: string;
};

export type PursuitTrackingPlanResult =
  | {
      ok: true;
      pursuit: Pursuit;
      events: PursuitTrackingEvent[];
      state: PursuitTrackingState;
    }
  | { ok: false; issues: string[] };

export function emptyPursuitTrackingState(): PursuitTrackingState {
  return {
    outreach_sent: false,
    applied_online: false,
    response_received: false,
    interviewing: false,
    not_moving_forward: false,
    never_heard_back: false,
  };
}

export function derivePursuitTrackingState(events: PursuitTrackingEvent[]): PursuitTrackingState {
  const state = emptyPursuitTrackingState();
  const chronologicalEvents = [...events].sort((left, right) => {
    const occurrenceOrder = left.occurredAt.localeCompare(right.occurredAt);
    if (occurrenceOrder !== 0) return occurrenceOrder;
    return left.createdAt.localeCompare(right.createdAt);
  });

  for (const event of chronologicalEvents) {
    state[event.action] = event.checked;
  }

  return state;
}

export function pursuitBucket(pursuit: Pick<Pursuit, "trackingStartedAt">): PursuitBucket {
  return pursuit.trackingStartedAt ? "applied" : "saved_for_later";
}

export function planPursuitTrackingChanges(
  input: PlanPursuitTrackingChangesInput,
): PursuitTrackingPlanResult {
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey) {
    return { ok: false, issues: ["A tracking idempotency key is required."] };
  }

  if (input.source === "message_copy") {
    const requestedActions = PURSUIT_TRACKING_ACTIONS.filter(
      (action) => input.requested[action] !== undefined,
    );
    if (
      !input.outreachMessageId
      || requestedActions.length !== 1
      || requestedActions[0] !== "outreach_sent"
      || input.requested.outreach_sent !== true
    ) {
      return {
        ok: false,
        issues: ["Message-copy tracking must check outreach sent for one saved message."],
      };
    }
  }

  const currentState = derivePursuitTrackingState(input.currentEvents);
  const existingKeys = new Set(input.currentEvents.map((event) => event.idempotencyKey));
  const copiedMessageAlreadyRecorded = input.source === "message_copy"
    && input.currentEvents.some((event) => (
      event.source === "message_copy"
      && event.action === "outreach_sent"
      && event.checked
      && event.outreachMessageId === input.outreachMessageId
    ));
  const createdAt = input.createdAt ?? input.occurredAt;
  const events: PursuitTrackingEvent[] = [];

  for (const action of PURSUIT_TRACKING_ACTIONS) {
    const checked = input.requested[action];
    if (checked === undefined) continue;

    const actionIdempotencyKey = `${idempotencyKey}:${action}`;
    if (existingKeys.has(actionIdempotencyKey)) continue;

    const recordsAnotherCopiedMessage = input.source === "message_copy"
      && action === "outreach_sent"
      && checked;
    if (recordsAnotherCopiedMessage && copiedMessageAlreadyRecorded) continue;
    if (checked === currentState[action] && !recordsAnotherCopiedMessage) continue;

    const event: PursuitTrackingEvent = {
      pursuitId: input.pursuit.id,
      userId: input.pursuit.userId,
      action,
      checked,
      source: input.source,
      idempotencyKey: actionIdempotencyKey,
      occurredAt: input.occurredAt,
      createdAt,
    };
    if (input.outreachMessageId) event.outreachMessageId = input.outreachMessageId;
    if (input.contactSuggestionId) event.contactSuggestionId = input.contactSuggestionId;
    if (input.messageSnapshot) event.messageSnapshot = input.messageSnapshot;
    if (input.recipientNameSnapshot) event.recipientNameSnapshot = input.recipientNameSnapshot;
    if (input.recipientTitleSnapshot) event.recipientTitleSnapshot = input.recipientTitleSnapshot;
    if (input.recipientLinkedinUrlSnapshot) {
      event.recipientLinkedinUrlSnapshot = input.recipientLinkedinUrlSnapshot;
    }
    events.push(event);
  }

  const state = derivePursuitTrackingState([...input.currentEvents, ...events]);
  const startsTracking = !input.pursuit.trackingStartedAt && events.some((event) => event.checked);
  const hasChanges = events.length > 0;

  return {
    ok: true,
    pursuit: {
      ...input.pursuit,
      ...(startsTracking ? { trackingStartedAt: input.occurredAt } : {}),
      ...(hasChanges ? { lastActivityAt: input.occurredAt, updatedAt: input.occurredAt } : {}),
    },
    events,
    state,
  };
}
