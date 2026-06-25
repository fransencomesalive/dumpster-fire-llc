import OpenAI from "openai";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildFallbackApplyCopy } from "../../apply-copy";
import { getApplyModeOption, recommendApplyMode } from "../../apply-modes";
import { getJobSearchAuthState } from "../../auth";
import { selectRelevantExamples, type DossierProofObject, type ParsedDossier } from "../../dossier-parser";
import { humanizeMatcherReasons } from "../../review-feedback";
import { getCandidateDossier, getDashboardState } from "../../store";
import type { ApplyCopyDraft, ApplyMode, ApplyWizardSubmission, ContactSuggestion, Job } from "../../types";

const applyModes = new Set<ApplyMode>(["executive_producer", "program_director", "ai_workflow_product_ops"]);
const fallbackProofObjects: DossierProofObject[] = [
  {
    name: "Phred",
    link: "https://lab26.randallfransen.com/phred",
    bestFor: ["AI workflow", "agent orchestration", "program operations", "workflow systems", "AI enablement", "internal tools", "delivery governance", "project memory"],
    avoidFor: ["pure event production", "traditional brand producer", "paid media buying"],
  },
  {
    name: "RECON",
    link: "https://recon.mettlecycling.com/",
    bestFor: ["product thinking", "location-aware systems", "route intelligence", "emergency coordination", "community utility", "outdoor/cycling/mobility", "real-world decision support"],
    avoidFor: ["generic creative production", "pure program management", "enterprise PMO"],
  },
  {
    name: "Main portfolio",
    link: "https://www.randallfransen.com",
    bestFor: ["creative production", "executive producer", "brand", "campaign", "content", "launch", "agency", "studio", "experiential-adjacent"],
    avoidFor: [],
  },
];

async function requireApplyCopyAuth() {
  const authState = getJobSearchAuthState(await cookies());
  if (!authState.authenticated) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  return null;
}

function cleanText(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const cleaned = value.trim();
  return cleaned || fallback;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function recipientTypeForContact(contact?: ContactSuggestion): NonNullable<ApplyCopyDraft["generatedMessages"][number]["recipientType"]> {
  if (!contact) return "no_contact";
  const roleConnection = contact.roleConnection.toLowerCase();
  if (roleConnection.startsWith("hiring manager") || contact.contactType === "hiring_manager") return "hiring_manager";
  if (contact.contactType === "recruiter" || contact.contactType === "talent_partner" || roleConnection.startsWith("recruiter")) return "recruiter";
  if (roleConnection.startsWith("long shot") || contact.confidenceScore < 55) return "executive_sponsor";
  return "functional_leader";
}

function proofObjectScore(proofObject: DossierProofObject, jobText: string, selectedModeLabel: string) {
  const normalizedJobText = normalize(`${jobText} ${selectedModeLabel}`);
  const bestHits = proofObject.bestFor.filter((term) => normalizedJobText.includes(normalize(term))).length;
  const avoidHits = proofObject.avoidFor.filter((term) => normalizedJobText.includes(normalize(term))).length;
  const modeBonus = selectedModeLabel.toLowerCase().includes("ai") && proofObject.name.toLowerCase() === "phred" ? 4 : 0;
  const productionBonus = selectedModeLabel.toLowerCase().includes("executive") && proofObject.name.toLowerCase().includes("portfolio") ? 2 : 0;
  return bestHits * 3 + modeBonus + productionBonus - avoidHits * 4;
}

function selectProofObject(dossier: ParsedDossier | null, job: Job, selectedModeLabel: string) {
  const proofObjects = dossier?.proofObjects?.length ? dossier.proofObjects : fallbackProofObjects;
  const jobText = [
    job.title,
    job.department,
    job.descriptionText,
    job.fitSummary,
    job.outreachAngle,
    ...job.whyItMatches,
    ...job.riskFlags,
  ].join(" ");
  return [...proofObjects]
    .sort((a, b) => proofObjectScore(b, jobText, selectedModeLabel) - proofObjectScore(a, jobText, selectedModeLabel))[0] ?? fallbackProofObjects[2];
}

function approvedMessageExamples(actions: ApplyWizardSubmission[]) {
  return actions
    .flatMap((action) => action.generatedMessages.map((message) => ({
      message: message.messageText,
      job_title: "",
      company: "",
      recipient_type: message.recipientType ?? "no_contact",
      resume_track: message.resumeTrack ?? action.applicationMode,
      proof_object_used: message.proofObjectUsed ?? "",
      approved: message.approved === true,
      notes: message.notes ?? "",
    })))
    .filter((message) => message.approved)
    .slice(0, 5);
}

function parseGeneratedDraft(value: unknown, fallback: ApplyCopyDraft, contacts: ContactSuggestion[]): ApplyCopyDraft {
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;
  const messages = Array.isArray(record.generatedMessages) ? record.generatedMessages : [];
  const fallbackTargets = contacts.length > 0
    ? contacts.map((contact) => ({ id: contact.id, name: contact.name }))
    : [{ id: "no-contact", name: "No-contact outreach" }];
  const generatedMessages = fallbackTargets.map((contact, index) => {
    const fallbackMessage = fallback.generatedMessages.find((message) => message.contactId === contact.id) ?? fallback.generatedMessages[index];
    const rawMessage = messages.find((message) => (
      message &&
      typeof message === "object" &&
      "contactId" in message &&
      message.contactId === contact.id
    )) ?? messages[index];
    const messageText = rawMessage && typeof rawMessage === "object" && "messageText" in rawMessage
      ? cleanText(rawMessage.messageText, fallbackMessage?.messageText ?? "")
      : fallbackMessage?.messageText ?? "";
    const raw = rawMessage && typeof rawMessage === "object" ? rawMessage as Record<string, unknown> : {};
    const recipientType = typeof raw.recipientType === "string"
      ? raw.recipientType
      : typeof raw.recipient_type === "string"
        ? raw.recipient_type
        : fallbackMessage?.recipientType;
    const resumeTrack = typeof raw.best_resume_track === "string"
      ? raw.best_resume_track
      : typeof raw.resumeTrack === "string"
        ? raw.resumeTrack
        : fallbackMessage?.resumeTrack;
    const proofObjectUsed = typeof raw.best_proof_object === "string"
      ? raw.best_proof_object
      : typeof raw.proofObjectUsed === "string"
        ? raw.proofObjectUsed
        : fallbackMessage?.proofObjectUsed;
    const outreachPlan = raw.outreachPlan && typeof raw.outreachPlan === "object"
      ? raw.outreachPlan as Record<string, unknown>
      : {
          role_problem_read: raw.role_problem_read,
          likely_team_pain: raw.likely_team_pain,
          recipient_type: recipientType,
          best_resume_track: resumeTrack,
          best_proof_object: proofObjectUsed,
          why_this_proof_fits: raw.why_this_proof_fits,
          message_angle: raw.message_angle,
        };

    return {
      contactId: contact.id,
      contactName: contact.name,
      messageText,
      messageType: "linkedin_message" as const,
      recipientType: recipientType as ApplyCopyDraft["generatedMessages"][number]["recipientType"],
      resumeTrack,
      proofObjectUsed,
      notes: JSON.stringify(outreachPlan),
    };
  });

  return {
    ...fallback,
    generatedMessages,
    coverLetterText: cleanText(record.coverLetterText, fallback.coverLetterText),
    resumeNotesText: cleanText(record.resumeNotesText, fallback.resumeNotesText),
    source: "generated",
  };
}

function dossierCandidateContext(dossier: ParsedDossier, job: Job, selectedModeLabel: string, actions: ApplyWizardSubmission[]) {
  const track = dossier.tracks.find((item) => item.label.toLowerCase() === selectedModeLabel.toLowerCase()) ?? dossier.tracks[0];
  const jobText = [
    job.title,
    job.descriptionText.slice(0, 5000),
    ...humanizeMatcherReasons(job.whyItMatches),
  ].join(" ");
  const relevantExamples = selectRelevantExamples(dossier.examples, jobText, track?.label ?? "", 2);

  return {
    positioning: dossier.positioning,
    links: dossier.links,
    voice: dossier.voice,
    writingInstructions: dossier.rules,
    bannedPhrases: dossier.banned,
    writingSamples: dossier.samples.slice(0, 3).map((sample) => ({ context: sample.context, text: sample.text.trim().slice(0, 900) })),
    approvedMessages: approvedMessageExamples(actions),
    operatingStyle: dossier.operatingStyle ?? "",
    decisionStyle: dossier.decisionStyle ?? [],
    communicationPosture: dossier.communicationPosture ?? [],
    aiMisreads: dossier.aiMisreads ?? [],
    hireReasons: dossier.hireReasons ?? [],
    proofObjects: dossier.proofObjects?.length ? dossier.proofObjects : fallbackProofObjects,
    track: track ? { label: track.label, frame: track.frame, proofPoints: track.proofPoints } : null,
    relevantWorkExamples: relevantExamples.map((example) => ({
      name: example.name,
      role: example.role,
      story: example.story,
      metrics: example.metrics.slice(0, 3),
      link: example.link,
    })),
    outreachStrategy: dossier.strategy,
    doNotContact: dossier.constraints.find((line) => line.toLowerCase().startsWith("do not contact")) ?? "",
  };
}

function buildPrompt({
  job,
  contacts,
  applicationMode,
  dossier,
  actions,
  validationFeedback,
}: {
  job: Job;
  contacts: ContactSuggestion[];
  applicationMode: ApplyMode;
  dossier: ParsedDossier | null;
  actions: ApplyWizardSubmission[];
  validationFeedback?: string;
}) {
  const selectedMode = getApplyModeOption(applicationMode);
  const recommendation = recommendApplyMode(job);
  const proofObject = selectProofObject(dossier, job, selectedMode.label);
  const legacyWritingInstructions = [
    "Use Randall's established voice: direct, senior, specific, grounded, and human.",
    "Sound like a capable person making a useful professional connection, not a cover-letter generator.",
    "No corporate puffery, no generic enthusiasm, no 'I am confident I will add immediate value', no 'extensive experience' padding.",
    "Avoid overclaiming. If there is uncertainty, name it plainly.",
    "Prefer short sentences and concrete fit signals from the job.",
    "Do not mention crypto/web3/AI unless the role or fit evidence makes it directly relevant.",
    "Do not use em dashes, gimmicky hooks, or salesy phrasing.",
    "Outreach messages should feel like Randall wrote them after reading the posting, not like a mass template.",
  ];
  const candidateContext = dossier
    ? dossierCandidateContext(dossier, job, selectedMode.label, actions)
    : {
        publicPortfolio: "www.randallfransen.com",
        positioning: "Senior operator across agency, tech, crypto/web3, AI, brand, launch, and content work; useful where creative quality and operational sanity both have to survive.",
        voice: "Direct, senior, human, specific, lightly wry when appropriate. Avoid corporate fluff, overclaiming, desperation, and fake enthusiasm.",
        writingInstructions: legacyWritingInstructions,
        bannedPhrases: ["em dash", "excited", "passionate", "strong fit", "uniquely positions", "would love to connect"],
        operatingStyle: "Look for the operational problem under the posting before naming qualifications.",
        decisionStyle: ["What is actually broken?", "Why does this role exist?", "What proof object shows the problem is familiar?"],
        communicationPosture: ["useful", "direct", "senior", "human", "not needy"],
        proofObjects: fallbackProofObjects,
        approvedMessages: [],
        publicVersionRequirement: "For public users, replace this object with the user's stored dossier before generating outreach.",
      };

  return {
    selectedMode: {
      label: selectedMode.label,
      proofFrame: selectedMode.proofFrame,
      outreachFrame: selectedMode.outreachFrame,
    },
    modeRecommendation: recommendation.summary,
    validationFeedback: validationFeedback ?? "",
    candidateContext,
    requiredInternalStructure: {
      role_problem_read: "The actual problem underneath the job description.",
      likely_team_pain: "The mess this team is probably dealing with.",
      recipient_type: "hiring_manager | functional_leader | recruiter | executive_sponsor | no_contact",
      best_resume_track: "Executive Producer | Program Director | AI Workflow / Product Ops | other",
      best_proof_object: proofObject.name,
      why_this_proof_fits: "Why this proof object maps to the role problem.",
      message_angle: "The note's point of view before writing.",
    },
    selectedProofObject: proofObject,
    job: {
      id: job.id,
      title: job.title,
      companyName: job.companyName,
      department: job.department,
      location: job.location,
      fitSummary: job.fitSummary,
      whyItMatches: humanizeMatcherReasons(job.whyItMatches),
      riskFlags: humanizeMatcherReasons(job.riskFlags),
      outreachAngle: job.outreachAngle,
      resumeTailoringNotes: job.resumeTailoringNotes,
      descriptionText: job.descriptionText.slice(0, 5000),
    },
    contacts: contacts.length > 0
      ? contacts.map((contact) => ({
          id: contact.id,
          name: contact.name,
          title: contact.title,
          contactType: contact.contactType,
          relevanceReason: contact.relevanceReason,
          roleConnection: contact.roleConnection,
          recipientType: recipientTypeForContact(contact),
        }))
      : [],
    requiredOutput: {
      generatedMessages: contacts.length > 0
        ? contacts.map((contact) => ({
            contactId: contact.id,
            contactName: contact.name,
            recipientType: recipientTypeForContact(contact),
            messageText: `One short outreach draft, 55-95 words, in the provided candidate voice. Open with a greeting that uses the contact's first name, for example "Hi ${contact.name.trim().split(/\s+/)[0] || "there"},". Use clear, correct, natural grammar. Reference one concrete detail specific to this role. No corporate filler, no generic enthusiasm, no restating their title back to them.`,
          }))
        : [{
            contactId: "no-contact",
            contactName: "No-contact outreach",
            recipientType: "no_contact",
            messageText: "One short outreach draft, 55-95 words, in the provided candidate voice. Do not include a greeting. Reference the role and ask for routing to the correct hiring contact. Use clear, correct, natural grammar. No corporate filler and no generic enthusiasm.",
          }],
      perMessageRequiredFields: ["role_problem_read", "likely_team_pain", "recipientType", "best_resume_track", "best_proof_object", "why_this_proof_fits", "message_angle", "messageText"],
      resumeNotesText: "Line-separated resume tailoring notes, 3-6 lines.",
    },
  };
}

function allowedNumberTokens(prompt: ReturnType<typeof buildPrompt>) {
  return JSON.stringify(prompt).match(/\$?\d[\d,.]*(?:%|mm|k|m)?/gi) ?? [];
}

function validateDraft(draft: ApplyCopyDraft, prompt: ReturnType<typeof buildPrompt>) {
  const banned = new Set([
    ...(Array.isArray(prompt.candidateContext.bannedPhrases) ? prompt.candidateContext.bannedPhrases : []),
    "excited",
    "passionate",
    "strong fit",
    "would love",
    "uniquely positions",
    "reaching out because",
    "future-proof",
    "please direct me",
  ].map((phrase) => phrase.toLowerCase()));
  const allowedNumbers = new Set(allowedNumberTokens(prompt).map((token) => token.toLowerCase()));
  const failures: string[] = [];

  for (const message of draft.generatedMessages) {
    const text = message.messageText.trim();
    const normalized = text.toLowerCase();
    const notes = (() => {
      if (!message.notes) return {};
      try {
        return JSON.parse(message.notes) as Record<string, unknown>;
      } catch {
        return {};
      }
    })();
    const problemRead = typeof notes.role_problem_read === "string" ? notes.role_problem_read : "";
    const proofObject = message.proofObjectUsed || String(notes.best_proof_object ?? "");
    const selectedProof = prompt.candidateContext.proofObjects?.find((item: DossierProofObject) => item.name === proofObject);
    const hasProofLink = selectedProof?.link ? text.includes(selectedProof.link) : true;
    const numberTokens = text.match(/\$?\d[\d,.]*(?:%|mm|k|m)?/gi) ?? [];

    for (const phrase of banned) {
      if (phrase && normalized.includes(phrase)) failures.push(`${message.contactName}: banned/generic phrase "${phrase}"`);
    }
    if (text.includes("—")) failures.push(`${message.contactName}: em dash`);
    if (/^(hi\s+\w+,?\s*)?(i saw|i noticed|i am writing|i'm writing|i wanted|i’m reaching|i am reaching|i believe|i'm excited|i am excited)\b/i.test(text)) {
      failures.push(`${message.contactName}: generic candidate opener`);
    }
    if (/\bRandall Fransen\b|\bRandall\b|\bhe might\b|\bhe can\b|\bhis background\b|\bhis work\b/i.test(text)) {
      failures.push(`${message.contactName}: third-person candidate posture`);
    }
    if (proofObject && selectedProof?.link && !hasProofLink) failures.push(`${message.contactName}: proof object used without link`);
    if (numberTokens.some((token) => !allowedNumbers.has(token.toLowerCase()))) failures.push(`${message.contactName}: possible invented metric`);
    if (wordCount(text) > 115) failures.push(`${message.contactName}: too long`);
    if (problemRead.length < 24) failures.push(`${message.contactName}: missing concrete role problem read`);
    if (/\bdear hiring manager\b/i.test(text) || /\bplease accept my application\b/i.test(text)) failures.push(`${message.contactName}: cover-letter posture`);
  }

  const score = (categoryFailures: string[]) => Math.max(1, Math.min(5, 5 - categoryFailures.length));
  return {
    voice_score: score(failures.filter((item) => /banned|em dash|generic/.test(item))),
    specificity_score: score(failures.filter((item) => /problem read|opener/.test(item))),
    proof_score: score(failures.filter((item) => /proof|metric/.test(item))),
    candidate_posture_score: score(failures.filter((item) => /candidate|cover-letter|banned/.test(item))),
    recipient_fit_score: score(failures.filter((item) => /problem read/.test(item))),
    regenerate: failures.length > 0,
    reason: failures.join("; "),
  };
}

export async function POST(request: Request) {
  const authError = await requireApplyCopyAuth();
  if (authError) return authError;

  const body = await request.json().catch(() => null) as { jobId?: unknown; applicationMode?: unknown; selectedContactIds?: unknown } | null;

  if (!body || typeof body.jobId !== "string") {
    return NextResponse.json({ error: "Expected jobId." }, { status: 400 });
  }

  const applicationMode = applyModes.has(body.applicationMode as ApplyMode)
    ? body.applicationMode as ApplyMode
    : "executive_producer";
  const selectedContactIds = Array.isArray(body.selectedContactIds)
    ? body.selectedContactIds.filter((id): id is string => typeof id === "string")
    : [];
  const [dashboard, dossier] = await Promise.all([getDashboardState(), getCandidateDossier()]);
  const job = dashboard.jobs.find((item) => item.id === body.jobId);

  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const jobContacts = dashboard.contactSuggestions.filter((contact) => contact.jobId === job.id);
  const contacts = selectedContactIds.length > 0
    ? jobContacts.filter((contact) => selectedContactIds.includes(contact.id))
    : [];
  const fallback = buildFallbackApplyCopy({ job, contacts, applicationMode });
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ draft: fallback, source: "fallback", reason: "copy_api_not_configured" });
  }

  try {
    const client = new OpenAI({ apiKey });
    let validationFeedback = "";
    let finalDraft = fallback;
    let finalScore: ReturnType<typeof validateDraft> | null = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const prompt = buildPrompt({
        job,
        contacts,
        applicationMode,
        dossier: dossier?.parsed ?? null,
        actions: dashboard.applicationActions,
        validationFeedback,
      });
      const completion = await client.chat.completions.create({
        model: process.env.JOB_SEARCH_COPY_MODEL ?? "gpt-4.1-mini",
        temperature: 0.4,
        max_completion_tokens: 2200,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "You draft application outreach for one private dumpster-fire dashboard. Return valid JSON only.",
              "For every generated message, first create the required internal structure: role_problem_read, likely_team_pain, recipientType, best_resume_track, best_proof_object, why_this_proof_fits, message_angle.",
              "Then write the message from that structure. The message should start with the operational read, not interest.",
              "Write as Randall in first person. Never refer to Randall by name, as 'he', or as a represented third-party candidate.",
              "Preserve contact IDs. Write in clear, natural, grammatically correct English that a sharp senior operator would actually send.",
              "If contacts are provided, each outreach message must open by greeting the contact by their first name, then immediately move to the operational read.",
              "If no contacts are provided, write one no-contact routing note with no greeting.",
              "Recipient strategy: hiring managers get the problem read and proof; functional leaders get team pain/operating model; recruiters get clearer role fit and link; executive sponsors get strategic brevity; no-contact asks for routing without pretending relationship.",
              "Do not invent employment history, metrics, names, credentials, or relationships.",
              "Follow approvedMessages, writingInstructions, writingSamples, operatingStyle, decisionStyle, and communicationPosture over generic business-writing habits.",
              "Never use any phrase from candidateContext.bannedPhrases. Do not use em dashes.",
              "Use one proof object unless there is a strong reason for two. If you use a proof object, include its link.",
              "Use only proof points and metrics provided in candidateContext.",
              "Do not sound like a cover letter. Do not optimize for professional. Optimize for specific, credible, useful, and hard to confuse with 100 other candidates.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify(prompt),
          },
        ],
      });
      const content = completion.choices[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(content) as unknown;
      const draft = parseGeneratedDraft(parsed, fallback, contacts);
      const validation = validateDraft(draft, prompt);
      finalDraft = draft;
      finalScore = validation;
      if (!validation.regenerate) break;
      validationFeedback = `Regenerate because deterministic QA failed: ${validation.reason}`;
    }

    if (finalScore?.regenerate) {
      const fallbackPrompt = buildPrompt({ job, contacts, applicationMode, dossier: dossier?.parsed ?? null, actions: dashboard.applicationActions });
      finalDraft = {
        ...fallback,
        generatedMessages: fallback.generatedMessages.map((message) => ({
          ...message,
          notes: message.notes || JSON.stringify({
            role_problem_read: "Fallback problem-first draft generated because model output failed QA.",
            likely_team_pain: "Unknown; use the job posting and manually refine before sending.",
            recipient_type: message.recipientType ?? "no_contact",
            best_resume_track: message.resumeTrack ?? getApplyModeOption(applicationMode).label,
            best_proof_object: message.proofObjectUsed ?? selectProofObject(dossier?.parsed ?? null, job, getApplyModeOption(applicationMode).label).name,
            why_this_proof_fits: "Deterministic fallback selected the safest available proof frame.",
            message_angle: "Problem-first routing note.",
          }),
        })),
      };
      finalScore = validateDraft(finalDraft, fallbackPrompt);
    }

    return NextResponse.json({ draft: finalDraft, source: finalDraft.source, quality: finalScore });
  } catch (error) {
    console.error("Apply copy generation failed", error);
    return NextResponse.json({ draft: fallback, source: "fallback", reason: "copy_generation_failed" });
  }
}
