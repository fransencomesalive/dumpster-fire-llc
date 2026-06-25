import { getApplyModeOption } from "./apply-modes";
import type { ApplyCopyDraft, ApplyMode, ContactSuggestion, Job } from "./types";

function problemRead(job: Job) {
  const title = job.title.toLowerCase();
  const fullText = `${job.title} ${job.department} ${job.descriptionText}`.toLowerCase();
  if (/\b(programmatic|paid media|media strategy|performance marketing|paid social|sem|display)\b/.test(fullText)) {
    return `This reads less like a media-channel title and more like an operating problem around programmatic quality, client performance, handoffs, and clean delivery.`;
  }
  if (/\bai|workflow|automation|enablement|internal tools?\b/i.test(fullText)) {
    return `This reads less like ${job.title} and more like a team trying to turn workflow ambition into something people can actually run.`;
  }
  if (/\bproducer|production|creative|campaign|brand|studio\b/.test(title)) {
    return `This reads less like a generic production seat and more like a creative-quality-versus-delivery-reality problem.`;
  }
  if (/\bprogram|operations|delivery|pmo\b/.test(title)) {
    return `This reads less like ${job.title} and more like a messy-middle ownership problem.`;
  }
  return `This reads less like ${job.title} and more like an operating problem underneath the title.`;
}

function teamPain(job: Job) {
  const fullText = `${job.title} ${job.department} ${job.descriptionText}`.toLowerCase();
  if (/\b(programmatic|paid media|media strategy|performance marketing|paid social|sem|display)\b/.test(fullText)) {
    return "The team likely needs a cleaner operating model around media strategy, cross-functional handoffs, client expectations, and delivery quality.";
  }
  if (/\bai|workflow|automation|enablement|internal tools?\b/i.test(fullText)) {
    return "The team likely needs AI/workflow ambition translated into ownership, review paths, source-of-truth behavior, and usable delivery systems.";
  }
  return "The team likely needs ownership through ambiguity, handoffs, stakeholder pressure, and delivery reality.";
}

export function buildFallbackApplyCopy({
  job,
  contacts,
  applicationMode,
}: {
  job: Job;
  contacts: ContactSuggestion[];
  applicationMode: ApplyMode;
}): ApplyCopyDraft {
  const mode = getApplyModeOption(applicationMode);
  const messageTargets = contacts.length > 0
    ? contacts
    : [{
        id: "no-contact",
        name: "No-contact outreach",
        title: "",
        companyName: job.companyName,
        linkedinUrl: "",
        contactType: "unknown" as const,
        relevanceReason: "",
        roleConnection: "",
        currentCompanyEvidence: "",
        evidenceUrl: "",
        confidenceScore: 0,
        outreachFitRating: 3 as const,
        riskNotes: [],
        verified: false,
        jobId: job.id,
      }];
  const generatedMessages = messageTargets.map((contact) => {
    const firstName = contact.name.trim().split(/\s+/)[0] || "there";
    const opener = contacts.length > 0 ? `Hi ${firstName}, ` : "";
    const read = problemRead(job);
    const pain = teamPain(job);
    const recipientType: NonNullable<ApplyCopyDraft["generatedMessages"][number]["recipientType"]> = contacts.length === 0 ? "no_contact" : contact.contactType === "recruiter" || contact.contactType === "talent_partner" ? "recruiter" : contact.confidenceScore < 55 ? "executive_sponsor" : "functional_leader";
    const proofObjectUsed = applicationMode === "ai_workflow_product_ops" ? "Phred" : "Main portfolio";
    const proofLink = proofObjectUsed === "Main portfolio" ? "https://www.randallfransen.com" : "https://lab26.randallfransen.com/phred";
    const bridge = applicationMode === "ai_workflow_product_ops"
      ? "I’ve built operating systems for AI-assisted work where tools, decisions, approvals, and human review had to stay connected."
      : "I’m usually useful where strategy, stakeholders, vendors, approvals, and delivery pressure need to become a working system.";

    return {
      contactId: contact.id,
      contactName: contact.name,
      messageText: `${opener}${read} ${bridge} Relevant work: ${proofLink}. ${contacts.length > 0 ? "Worth a look if this sits near your team." : "If there is a better hiring contact for this, a quick steer would help."}`,
      messageType: "linkedin_message" as const,
      recipientType,
      resumeTrack: mode.label,
      proofObjectUsed,
      notes: JSON.stringify({
        role_problem_read: read,
        likely_team_pain: pain,
        recipient_type: recipientType,
        best_resume_track: mode.label,
        best_proof_object: proofObjectUsed,
        why_this_proof_fits: `${proofObjectUsed} is the safest available proof object for ${mode.label}.`,
        message_angle: "Problem-first fallback note.",
      }),
    };
  });
  const resumeNotesText = [`Position resume using ${mode.label} mode`, ...job.resumeTailoringNotes].join("\n");

  return {
    applicationMode,
    generatedMessages,
    coverLetterText: "",
    resumeNotesText,
    source: "fallback",
  };
}
