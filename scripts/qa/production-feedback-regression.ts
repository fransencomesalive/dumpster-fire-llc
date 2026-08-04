import assert from "node:assert/strict";
import {
  createPublicProfileRepositoryRequest,
  getPublicProfileRepositoryConfig,
  loadCandidateProfileAggregate,
} from "../../lib/public-profile/repository";
import { evaluateMatch } from "../../lib/public-profile/matching/engine";
import { assessLocationEligibility } from "../../lib/public-profile/matching/location-eligibility";
import type { MatchJob } from "../../lib/public-profile/matching/types";
import { rankOutreachWorkExamples } from "../../lib/public-profile/outreach-evidence";
import { outreachHardRuleViolations } from "../../lib/public-profile/outreach-generator";

type ScanFeedbackRow = {
  id: string;
  user_id: string;
  reason_codes: string[];
  note: string | null;
  match_score: number;
  match_label: string;
  profile_version: number;
  job_snapshot: MatchJob;
  match_details: {
    categoryFits?: Array<{ category?: string; score?: number }>;
  };
  updated_at: string;
};

type MessageFeedbackRow = {
  id: string;
  user_id: string;
  outreach_message_id: string;
  reason_codes: string[];
  notes: string | null;
  message_snapshot: string;
  generation_context: Record<string, unknown>;
  updated_at: string;
};

type JobRow = {
  id: string;
  title: string;
  company_name: string;
  description: string;
  responsibilities: string[] | null;
  required_experience: string[] | null;
};

type PursuitRow = { id: string };
type MessageRow = {
  id: string;
  message: string;
  selected_work_example_id: string | null;
  created_at: string;
};

function generationPayload(context: Record<string, unknown>) {
  const nested = context.generation;
  return nested && typeof nested === "object"
    ? nested as Record<string, unknown>
    : context;
}

function nestedRecord(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

async function main() {
  assert.equal(
    process.env.CONFIRM_PRODUCTION_FEEDBACK_READ,
    "1",
    "Set CONFIRM_PRODUCTION_FEEDBACK_READ=1 for the read-only production feedback audit.",
  );
  const config = getPublicProfileRepositoryConfig();
  assert.ok(config, "Production Supabase configuration is required.");
  const request = createPublicProfileRepositoryRequest(config);
  const profiles = new Map<string, Awaited<ReturnType<typeof loadCandidateProfileAggregate>>>();
  const profileFor = async (userId: string) => {
    if (!profiles.has(userId)) profiles.set(userId, await loadCandidateProfileAggregate(request, userId));
    const aggregate = profiles.get(userId);
    assert.ok(aggregate, `Profile missing for feedback user ${userId}`);
    return aggregate;
  };

  const scanRows = await request<ScanFeedbackRow[]>("job_match_feedback", {
    query: "?select=id,user_id,reason_codes,note,match_score,match_label,profile_version,job_snapshot,match_details,updated_at&order=updated_at.desc",
  });
  const scanAudit = [];
  for (const row of scanRows) {
    const aggregate = await profileFor(row.user_id);
    const current = evaluateMatch({ profile: aggregate, job: row.job_snapshot, evaluatedAt: row.updated_at });
    const eligibility = assessLocationEligibility(aggregate.profile.location, row.job_snapshot.location);
    const note = row.note ?? "";

    if (/china|australia|new zealand|argentina|romania/i.test(note)) {
      assert.equal(eligibility.status, "conflict", `Location comment not addressed for ${row.job_snapshot.title}`);
      assert.equal(current.label, "Probably Not Worth Your Time");
    }
    if (/it\s*\/\s*engineering/i.test(note) || /Enterprise Technology/i.test(row.job_snapshot.title)) {
      assert.equal(current.label, "Probably Not Worth Your Time", "Enterprise Technology specialization still overrated");
    }
    if (/experience is a much thinner match/i.test(note)) {
      const categoryFits = row.match_details.categoryFits ?? [];
      const evidenceScores = categoryFits
        .filter((fit) => fit.category === "resume" || fit.category === "work_example")
        .map((fit) => fit.score ?? 0);
      assert.ok(Math.max(...evidenceScores, 0) < 0.6, "Historical thin-evidence feedback no longer reproduces");
      assert.ok(current.internalScore <= 59, "Thin stretch evidence still reaches Potential Match");
    }
    if (row.reason_codes.includes("wrong_role_title") && /Sales Operations/i.test(row.job_snapshot.title)) {
      assert.equal(current.label, "Probably Not Worth Your Time", "Sales Operations still rides a broad operations lane");
    }

    scanAudit.push({
      feedbackId: row.id,
      job: `${row.job_snapshot.title} at ${row.job_snapshot.companyName}`,
      comment: row.note,
      prior: `${row.match_score} ${row.match_label}`,
      current: `${current.internalScore} ${current.label}`,
      locationEligibility: eligibility.status,
    });
  }

  const messageRows = await request<MessageFeedbackRow[]>("saved_message_feedback", {
    query: "?select=id,user_id,outreach_message_id,reason_codes,notes,message_snapshot,generation_context,updated_at&order=updated_at.desc",
  });
  const messageAudit = [];
  for (const row of messageRows) {
    const aggregate = await profileFor(row.user_id);
    const generation = generationPayload(row.generation_context);
    const jobContext = nestedRecord(generation.job);
    const selection = nestedRecord(generation.selection);
    const selectedRoleTrack = nestedRecord(selection.roleTrack);
    const jobId = asString(jobContext.id);
    const jobRows = jobId
      ? await request<JobRow[]>("jobs", { query: `?id=eq.${jobId}&select=id,title,company_name,description,responsibilities,required_experience&limit=1` })
      : [];
    const jobRow = jobRows[0];
    assert.ok(jobRow, `Stored outreach job missing for feedback ${row.id}`);

    const pursuitRows = await request<PursuitRow[]>("pursuits", {
      query: `?user_id=eq.${row.user_id}&select=id`,
    });
    const pursuitIds = pursuitRows.map((pursuit) => pursuit.id);
    const historyRows = pursuitIds.length > 0
      ? await request<MessageRow[]>("outreach_messages", {
          query: `?pursuit_id=in.(${pursuitIds.join(",")})&select=id,message,selected_work_example_id,created_at&order=created_at.desc&limit=20`,
        })
      : [];
    const history = historyRows
      .filter((message) => message.id !== row.outreach_message_id)
      .slice(0, 5)
      .map((message) => ({
        message: message.message,
        selectedWorkExampleId: message.selected_work_example_id ?? undefined,
      }));
    const job = {
      title: jobRow.title,
      company: jobRow.company_name,
      description: jobRow.description,
      responsibilities: jobRow.responsibilities ?? [],
      requiredExperience: jobRow.required_experience ?? [],
    };
    const decision = rankOutreachWorkExamples({
      aggregate,
      job,
      selectedRoleTrackId: asString(selectedRoleTrack.id),
      history,
    });
    assert.equal(decision.consideredCount, aggregate.workExamples.length);

    const violations = outreachHardRuleViolations(
      { message: row.message_snapshot, insertedExample: null },
      aggregate.profile.generatedMarkdown,
      { job, contact: { role: "Hiring contact" }, evidenceDecision: decision, recentMessages: history.map((entry) => entry.message) },
    );
    if (/trifecta|repeating the same/i.test(row.notes ?? "")) {
      assert.ok(
        violations.includes("repeated_recent_evidence") || violations.some((violation) => violation.startsWith("logistics_mentioned")),
        "Repeated-evidence outreach comment is not rejected by current hard rules",
      );
    }
    if (/AI work examples/i.test(row.notes ?? "")) {
      assert.ok(
        decision.selected,
        `AI-related outreach has no selected Work Example: ${JSON.stringify(decision.candidates.map((candidate) => ({
          title: candidate.workExample.title,
          score: candidate.relevanceScore,
          signals: candidate.matchedSignals,
        })))}`,
      );
      assert.ok(decision.matchedSignals.some((signal) => /\bAI\b/i.test(signal)), "Selected Work Example does not carry the AI signal");
    }

    messageAudit.push({
      feedbackId: row.id,
      job: `${job.title} at ${job.company}`,
      comment: row.notes,
      selectedWorkExample: decision.selected?.title ?? null,
      matchedSignals: decision.matchedSignals,
      hardRuleViolations: violations,
    });
  }

  console.log(JSON.stringify({ scanFeedback: scanAudit, outreachFeedback: messageAudit }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
