import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getJobSearchAuthState } from "../../auth";
import { getDashboardState, runManualScan, saveApplyWizardSubmission, saveMatchFeedback, updateJobStatus } from "../../store";
import type { ApplyWizardSubmission, JobStatus } from "../../types";

const jobStatuses = new Set<JobStatus>([
  "new",
  "reviewed",
  "saved",
  "applied",
  "messaged",
  "skipped",
  "archived",
]);

async function requireDashboardAuth() {
  const authState = getJobSearchAuthState(await cookies());
  if (!authState.authenticated) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  return null;
}

export async function GET() {
  const authError = await requireDashboardAuth();
  if (authError) return authError;

  return NextResponse.json(await getDashboardState());
}

export async function PATCH(request: Request) {
  const authError = await requireDashboardAuth();
  if (authError) return authError;

  const body = await request.json().catch(() => null) as { jobId?: unknown; status?: unknown } | null;

  if (!body || typeof body.jobId !== "string" || typeof body.status !== "string") {
    return NextResponse.json({ error: "Expected jobId and status." }, { status: 400 });
  }

  if (!jobStatuses.has(body.status as JobStatus)) {
    return NextResponse.json({ error: "Unsupported job status." }, { status: 400 });
  }

  try {
    return NextResponse.json(await updateJobStatus(body.jobId, body.status as JobStatus));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update job." },
      { status: 404 }
    );
  }
}

export async function POST(request: Request) {
  const authError = await requireDashboardAuth();
  if (authError) return authError;

  const body = await request.json().catch(() => ({})) as { action?: unknown; submission?: unknown; feedback?: unknown };

  if (body.action === "scan") {
    return NextResponse.json(await runManualScan());
  }

  if (body.action === "saveApplyWizard") {
    const submission = body.submission as (Partial<ApplyWizardSubmission> & { applicationPersonality?: unknown }) | null;

    if (!submission || typeof submission.jobId !== "string") {
      return NextResponse.json({ error: "Expected apply wizard submission." }, { status: 400 });
    }

    const savedAt = typeof submission.savedAt === "string" ? submission.savedAt : new Date().toISOString();

    return NextResponse.json(await saveApplyWizardSubmission({
      sessionId: typeof submission.sessionId === "string" ? submission.sessionId : crypto.randomUUID(),
      savedAt,
      jobId: submission.jobId,
      applicationMode: submission.applicationMode === "ai_workflow_product_ops"
        ? "ai_workflow_product_ops"
        : submission.applicationMode === "program_director" || submission.applicationPersonality === "program_director"
          ? "program_director"
          : "executive_producer",
      selectedContactIds: Array.isArray(submission.selectedContactIds) ? submission.selectedContactIds.filter((id): id is string => typeof id === "string") : [],
      completedActions: Array.isArray(submission.completedActions) ? submission.completedActions.filter((action): action is string => typeof action === "string") : [],
      generatedMessages: Array.isArray(submission.generatedMessages) ? submission.generatedMessages.filter((message) => (
        message &&
        typeof message === "object" &&
        "contactId" in message &&
        "contactName" in message &&
        "messageText" in message &&
        typeof message.contactId === "string" &&
        typeof message.contactName === "string" &&
        typeof message.messageText === "string"
      )).map((message) => ({
        contactId: message.contactId,
        contactName: message.contactName,
        messageText: message.messageText,
        messageType: "linkedin_message",
        recipientType: message.recipientType,
        resumeTrack: message.resumeTrack,
        proofObjectUsed: message.proofObjectUsed,
        approved: message.approved === true,
        rejectedReason: typeof message.rejectedReason === "string" ? message.rejectedReason : undefined,
        notes: typeof message.notes === "string" ? message.notes : undefined,
      })) : [],
      coverLetterText: typeof submission.coverLetterText === "string" ? submission.coverLetterText : "",
      resumeNotesText: typeof submission.resumeNotesText === "string" ? submission.resumeNotesText : "",
      notes: typeof submission.notes === "string" ? submission.notes : undefined,
    }));
  }

  if (body.action === "saveMatchFeedback") {
    const feedback = body.feedback as { jobId?: unknown; rating?: unknown; reason?: unknown; matchVersion?: unknown } | null;

    if (
      !feedback ||
      typeof feedback.jobId !== "string" ||
      typeof feedback.rating !== "number" ||
      ![1, 2, 3, 4, 5].includes(feedback.rating) ||
      typeof feedback.reason !== "string" ||
      typeof feedback.matchVersion !== "string"
    ) {
      return NextResponse.json({
        error: "Could not save match feedback.",
        detail: "Send jobId, a 1–5 rating, reason text, and matchVersion. Ratings below 4 should include what felt off.",
      }, { status: 400 });
    }

    return NextResponse.json(await saveMatchFeedback({
      jobId: feedback.jobId,
      rating: feedback.rating as 1 | 2 | 3 | 4 | 5,
      reason: feedback.reason.slice(0, 200),
      matchVersion: feedback.matchVersion,
    }));
  }

  return NextResponse.json({
    error: "Unsupported dashboard action.",
    detail: "Use scan, saveApplyWizard, or saveMatchFeedback.",
  }, { status: 400 });
}
