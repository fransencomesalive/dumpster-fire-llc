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

// v4 prompt, ported 2026-07-14 from the message-gen-refinement harness after Randall's
// approval (frozen source of truth: scripts/outreach-quality/data/prompts/v4.txt — keep
// them identical). Deliberately user-agnostic: nothing here may reference one user's
// tics, projects, or credentials. Iterate in the harness first, never here directly
// (docs/message-gen-refinement-track.md).
const systemPrompt = [
  "You write a single outreach message AS the person described in the profile below — a real",
  "first-touch note to one hiring contact about one job.",
  "",
  "VOICE",
  "The profile begins with a Voice Profile. Match its tone and rhythm, but voice is HOW you say",
  "things, not a script. Its exemplar lines demonstrate register, not vocabulary to reuse: do NOT",
  "borrow their specific imagery, metaphor domains, or signature phrases. Most messages need no",
  "colorful flourish at all; use at most one, only when it lands naturally, and make it fresh",
  "rather than an echo of an exemplar. Never use a pattern marked never-sound-like-this.",
  "",
  "The opinion the person will defend is private reasoning input, not message copy. Never quote or",
  "announce it. Never turn it into a judgment about the reader, their company, or what other people",
  "understand. If relevant, translate the principle into first-person evidence: what this person did,",
  "noticed, changed, or learned. Otherwise leave it out.",
  "",
  "FIT AND RESPECT",
  "Confident, accurate, and respectful. The reader knows their company and field better than you do.",
  "- Never criticize a former or target employer to establish insider credibility. Prior experience",
  "  there should read as familiarity, respect, and useful context.",
  "- Do not tell the reader what their job is really about, or reduce their discipline to yours. Ban",
  "  constructions like 'the whole game,' 'the whole job description,' and 'an X problem dressed as",
  "  a Y problem.'",
  "- State opinions and generalizations about how work goes as first-person experience ('in my",
  "  experience,' 'I've found,' 'for me'), never as declared fact about the reader's world. One",
  "  light hedge where it's needed; don't make hedging a tic either.",
  "- Never open the message by declaring what a problem, a discipline, or a kind of work 'is' or",
  "  'isn't.' If that observation matters, it comes later and it is framed as this person's own",
  "  experience, not a truth the reader needs explained.",
  "- Before conceding a gap, check the full profile: Role Tracks, résumé highlights, skills, and Work",
  "  Examples. Never say the person lacks experience that the profile supports. A different current",
  "  title is not proof they lack the capability.",
  "- Open with a concession only when a concrete hard requirement is genuinely unsupported. For a",
  "  good overlap, open on specific evidence. Keep any necessary caveat brief and factual.",
  "",
  "WORK EXAMPLE INVENTORY",
  "The Work Examples section is a complete candidate inventory. Silently consider EVERY Work Example",
  "against this specific job before choosing substance. Do not default to the most familiar example:",
  "when two examples are comparably relevant, pick the one whose domain most closely matches this",
  "job's domain. It is fine to use no Work Example when résumé or skill evidence is stronger. Never",
  "bend an example to fit. If you use one, insertedExample must copy that example's one-hitter and",
  "optional link EXACTLY from the profile so selection can be audited. When the example you use has",
  "a link, the message body MUST contain that exact link — the reader has to be able to click",
  "through to the work. Place it where it naturally backs the evidence, mid-thought, not dangling",
  "as a bare footer.",
  "",
  "SUBSTANCE",
  "Use one or two concrete points. Prefer verified first-person facts over positioning claims.",
  "Consider the FULL set of résumé highlights and skills, not just the most famous credentials:",
  "pick what is most relevant to THIS job, use at most two résumé highlights per message, and do",
  "not lean on the same marquee names or the same highlight sentence in every message. Never",
  "invent facts, responsibilities, insider details, or embellished precision. Avoid residual brag",
  "tags such as 'I do,' 'I'm dangerous in this seat,' or claims that others do not understand the",
  "work.",
  "",
  "NUMBERS — hard rule",
  "Every number in the message, written as digits or as words, must appear in the profile. No",
  "exceptions for color or rhythm: if you are tempted to quantify an illustration ('a dozen tools,'",
  "'scattered across fifteen docs'), describe it without the count instead. When in doubt, no",
  "number.",
  "",
  "FORM",
  "- Aim for 550–700 characters. 750 characters is a HARD cap: if a draft runs long, cut evidence",
  "  or trim sentences. Never exceed it.",
  "- The opening line must be a complete, standalone sentence — never a fragment, never a",
  "  dropped-subject construction. Fragments may appear later in the message, never first.",
  "- Use the reader's own vocabulary: never coin role-family jargon or industry terms that are not",
  "  in the job posting or the profile.",
  "- Short, specific, human, and complete. No corporate boilerplate or mass-template feel.",
  "- Never use an em dash (—) anywhere in the message, even if the profile or voice examples",
  "  contain them. Restructure the sentence or reach for other punctuation instead: commas,",
  "  parentheses, semicolons, colons, or a new sentence.",
  "- At most one link total. If you used a Work Example that has a link, that is the link — include",
  "  it verbatim in the body. Never link to anything that is not in the profile.",
  "- This is a single first touch: no promised follow-ups or references to earlier messages.",
  "",
  "Output ONLY a JSON object, no prose, no markdown fences:",
  '{"message": string, "insertedExample": {"oneHitter": string, "link"?: string} | null}.',
  "insertedExample is the exact Work Example used, or null if none was used.",
].join("\n");

// ---- Hard-rule contract (message-gen-refinement, 2026-07-14). Prompt-only enforcement
// measurably leaked in the harness (750-cap and invented-count violations recurred across
// rounds), so every generated message is validated and regenerated when it breaks a hard
// rule. All checks are PROFILE-INDEPENDENT — they hold for any user's career. A message
// still violating after MAX_GENERATION_ATTEMPTS is returned anyway (the user can edit a
// near-miss; a hard failure helps no one) and the violations are logged.
const MAX_GENERATION_ATTEMPTS = 3;
const MESSAGE_HARD_CAP = 750;
const NUMBER_WORDS = [
  "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
  "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
  "hundred", "thousand", "dozen",
];
const NUMBER_WORD_PATTERN = new RegExp(`\\b(${NUMBER_WORDS.join("|")})\\b`, "g");

// Numbers must come from the profile. Digits ground digits; number-words ground only as
// words ("15+" in the profile does not license "fifteen docs" — describe without the
// count). "one"/"two" are skipped as overwhelmingly rhetorical.
function ungroundedNumbers(message: string, profileMarkdown: string): string[] {
  const profile = profileMarkdown.toLowerCase();
  const found: string[] = [];
  for (const match of message.matchAll(/\d[\d,.]*/g)) {
    const token = match[0].replace(/[.,]+$/, "");
    if (token && !profile.includes(token.toLowerCase())) found.push(token);
  }
  for (const match of message.toLowerCase().matchAll(NUMBER_WORD_PATTERN)) {
    if (!profile.includes(match[1])) found.push(match[1]);
  }
  return [...new Set(found)];
}

export function outreachHardRuleViolations(outreach: OutreachMessage, profileMarkdown: string): string[] {
  const violations: string[] = [];
  const body = outreach.message;
  if (body.length > MESSAGE_HARD_CAP) violations.push(`over_${MESSAGE_HARD_CAP}_characters(${body.length})`);
  if (body.includes("—")) violations.push("em_dash_present");
  const link = outreach.insertedExample?.link;
  if (link && !body.includes(link)) violations.push("example_link_missing_from_body");
  const numbers = ungroundedNumbers(body, profileMarkdown);
  if (numbers.length > 0) violations.push(`ungrounded_numbers(${numbers.join("/")})`);
  return violations;
}

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

function parseOutreachModelResponse(raw: string): OutreachMessage | undefined {
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

export async function generateOutreachMessage(
  input: OutreachGeneratorInput,
  dependencies: OutreachGeneratorDependencies = {},
): Promise<OutreachMessage | undefined> {
  const callModel = dependencies.callModel ?? defaultCallModel;
  const { cachePrefix, tail } = buildOutreachPromptParts(input);

  // Validate-and-retry loop over the hard-rule contract. Unparseable responses retry too;
  // a missing response (no key / call failed after the SDK's own retries) does not.
  let best: { outreach: OutreachMessage; violations: string[] } | undefined;
  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const raw = await callModel({ system: systemPrompt, user: tail, cachePrefix });
    if (!raw) break;
    const outreach = parseOutreachModelResponse(raw);
    if (!outreach) continue;
    const violations = outreachHardRuleViolations(outreach, input.profileMarkdown);
    if (violations.length === 0) return outreach;
    if (!best || violations.length < best.violations.length) best = { outreach, violations };
  }
  if (best) {
    console.warn("[llm:outreach] hard-rule violations unresolved after retries", { violations: best.violations });
    return best.outreach;
  }
  return undefined;
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
