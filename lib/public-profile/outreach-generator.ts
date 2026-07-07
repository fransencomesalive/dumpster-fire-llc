import type { CandidateProfileAggregate } from "./types";

// Outreach generator (Phase E). Input: profile.md (leads with the distilled
// Voice Profile) + one job + one contact. Output: one short outreach message
// that sounds like the user, leads with matching substance, weaves in at most
// one relevant Work Example one-hitter (+ link), and obeys the guardrails. The
// model call is injected so it can be mocked in tests and skipped gracefully
// when no ANTHROPIC_API_KEY is provisioned.

export type OutreachJob = {
  title: string;
  company: string;
  description: string;
};

export type OutreachContact = {
  name?: string;
  role: string;
  seniority?: string;
};

export type OutreachGeneratorInput = {
  profileMarkdown: string;
  job: OutreachJob;
  contact: OutreachContact;
};

// The one Work Example the model wove in, surfaced so the UI can let the user
// delete the inserted example from the draft.
export type OutreachInsertedExample = {
  oneHitter: string;
  link?: string;
};

export type OutreachMessage = {
  message: string;
  insertedExample: OutreachInsertedExample | null;
};

export type OutreachModelCall = (args: {
  system: string;
  user: string;
  // The per-user-stable profile.md prefix, kept separate so the model call can cache it.
  // When present it is sent as a cached content block ahead of `user`.
  cachePrefix?: string;
}) => Promise<string | undefined>;

export type OutreachGeneratorDependencies = {
  callModel?: OutreachModelCall;
};

const systemPrompt = [
  "You write outreach messages AS the person described in the profile below.",
  "The profile is a markdown document that begins with a Voice Profile — a",
  '"write like this" fingerprint. Obey it: match their tone, do/don\'t lists,',
  "and never use any pattern marked as never-sound-like-this. Respect every",
  "do-not-overclaim line under Guardrails and per Role Track / per Skill.",
  "",
  "Write ONE short outreach message to the given contact about the given job.",
  "Lead with the strongest matching substance. Draw concrete proof from the",
  "profile — any of: a Work Example (weave in its one-hitter, and its link if",
  "present), a Skill with its evidence, or a Resume highlight (a specific stat or",
  "company). Use only genuinely relevant proof — one or two points is usually",
  "plenty. Do not invent facts not in the profile.",
  "",
  "Output ONLY a JSON object, no prose, no markdown fences:",
  '{"message": string, "insertedExample": {"oneHitter": string, "link"?: string} | null}.',
  "insertedExample is the Work Example you used, or null if you used none.",
].join("\n");

// Split the outreach prompt into the per-user-stable profile.md (cacheable across every
// message the user generates) and the per-message job + contact tail. Keeping them apart
// lets the model call cache the profile prefix so a burst of outreach pays cache-read
// rates on it — no message reuse, every message still freshly generated.
export function buildOutreachPromptParts(input: OutreachGeneratorInput) {
  const contactLine = [
    input.contact.name ? `Name: ${input.contact.name}` : undefined,
    `Role: ${input.contact.role}`,
    input.contact.seniority ? `Seniority: ${input.contact.seniority}` : undefined,
  ].filter(Boolean).join("\n");
  const cachePrefix = [
    "## Profile",
    input.profileMarkdown.trim(),
  ].join("\n");
  const tail = [
    "## Job",
    `Title: ${input.job.title}`,
    `Company: ${input.job.company}`,
    "Description:",
    input.job.description.trim(),
    "",
    "## Contact",
    contactLine,
  ].join("\n");
  return { cachePrefix, tail };
}

export function buildOutreachUserPrompt(input: OutreachGeneratorInput) {
  const { cachePrefix, tail } = buildOutreachPromptParts(input);
  return `${cachePrefix}\n\n${tail}`;
}

function extractJsonObject(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return undefined;
  return trimmed.slice(start, end + 1);
}

function parseInsertedExample(value: unknown): OutreachInsertedExample | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const oneHitter = typeof record.oneHitter === "string" ? record.oneHitter.trim() : "";
  if (!oneHitter) return null;
  const link = typeof record.link === "string" && record.link.trim() ? record.link.trim() : undefined;
  return link ? { oneHitter, link } : { oneHitter };
}

const defaultCallModel: OutreachModelCall = async ({ system, user, cachePrefix }) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.info("[llm:outreach] skipped: no ANTHROPIC_API_KEY");
    return undefined;
  }
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1 });
    // Cache the profile.md prefix (system + profile are contiguous in the prompt prefix,
    // so one breakpoint on the profile block caches both). Job/contact follow uncached.
    // Note: Opus 4.8 only caches a >=4096-token prefix; smaller profiles silently no-op.
    const content = cachePrefix
      ? [
          { type: "text" as const, text: cachePrefix, cache_control: { type: "ephemeral" as const } },
          { type: "text" as const, text: user },
        ]
      : user;
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content }],
    });
    const textBlock = response.content.find((block) => block.type === "text");
    return textBlock && "text" in textBlock ? textBlock.text : undefined;
  } catch (error) {
    const err = error as { name?: string; status?: number; message?: string };
    console.error("[llm:outreach] call failed", { name: err?.name, status: err?.status, message: err?.message });
    return undefined;
  }
};

export async function generateOutreachMessage(
  input: OutreachGeneratorInput,
  dependencies: OutreachGeneratorDependencies = {},
): Promise<OutreachMessage | undefined> {
  const callModel = dependencies.callModel ?? defaultCallModel;
  const { cachePrefix, tail } = buildOutreachPromptParts(input);
  const raw = await callModel({ system: systemPrompt, user: tail, cachePrefix });
  if (!raw) return undefined;
  const jsonText = extractJsonObject(raw);
  if (!jsonText) return undefined;
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    if (typeof parsed.message !== "string" || !parsed.message.trim()) return undefined;
    return {
      message: parsed.message.trim(),
      insertedExample: parseInsertedExample(parsed.insertedExample),
    };
  } catch {
    return undefined;
  }
}

export type OutreachRequestIssue = { field: string; message: string };

export type ParseOutreachRequestResult =
  | { ok: true; value: { job: OutreachJob; contact: OutreachContact } }
  | { ok: false; issues: OutreachRequestIssue[] };

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(value: unknown) {
  const cleaned = cleanString(value);
  return cleaned ? cleaned : undefined;
}

export function parseOutreachRequest(input: unknown): ParseOutreachRequestResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, issues: [{ field: "body", message: "Expected an outreach request JSON object." }] };
  }
  const source = input as Record<string, unknown>;
  const jobSource = (source.job && typeof source.job === "object" ? source.job : {}) as Record<string, unknown>;
  const contactSource = (source.contact && typeof source.contact === "object" ? source.contact : {}) as Record<string, unknown>;
  const issues: OutreachRequestIssue[] = [];

  const title = cleanString(jobSource.title);
  const company = cleanString(jobSource.company);
  const description = cleanString(jobSource.description);
  const role = cleanString(contactSource.role);

  if (!title) issues.push({ field: "job.title", message: "job.title is required." });
  if (!company) issues.push({ field: "job.company", message: "job.company is required." });
  if (!description) issues.push({ field: "job.description", message: "job.description is required." });
  if (!role) issues.push({ field: "contact.role", message: "contact.role is required." });

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    value: {
      job: { title, company, description },
      contact: {
        name: optionalString(contactSource.name),
        role,
        seniority: optionalString(contactSource.seniority),
      },
    },
  };
}

export type OutreachGenerationResult =
  | { status: "not_found"; userId: string }
  | { status: "profile_incomplete"; userId: string }
  | { status: "model_unavailable"; userId: string }
  | { status: "generated"; userId: string; outreach: OutreachMessage };

export type OutreachServiceDependencies = {
  loadAggregate: (userId: string) => Promise<CandidateProfileAggregate | undefined>;
  callModel?: OutreachModelCall;
};

export async function generateOutreachMessageForUser(
  dependencies: OutreachServiceDependencies,
  userId: string,
  request: { job: OutreachJob; contact: OutreachContact },
): Promise<OutreachGenerationResult> {
  const aggregate = await dependencies.loadAggregate(userId);
  if (!aggregate) return { status: "not_found", userId };

  const profileMarkdown = aggregate.profile.generatedMarkdown?.trim();
  if (!profileMarkdown) return { status: "profile_incomplete", userId };

  const outreach = await generateOutreachMessage(
    { profileMarkdown, job: request.job, contact: request.contact },
    { callModel: dependencies.callModel },
  );
  if (!outreach) return { status: "model_unavailable", userId };

  return { status: "generated", userId, outreach };
}
