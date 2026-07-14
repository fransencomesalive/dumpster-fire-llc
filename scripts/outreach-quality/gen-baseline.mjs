// Baseline outreach corpus. Reproduces the EXACT production prompt from
// lib/public-profile/outreach-generator.ts (systemPrompt + buildOutreachPromptParts)
// so the corpus reflects what ships today. Self-contained: reads profile.md +
// scan-jobs.json from this dir, calls Anthropic directly, writes baseline.md.
//
// A `PROMPT_VARIANT` env selects which system prompt to use ("baseline" | "v2" | "v3"
// | "v3-link") so later A/B runs reuse the same harness without editing prod code.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import Anthropic from "/Users/randallfransen/Sites/dumpster-fire-llc/node_modules/@anthropic-ai/sdk/index.mjs";
import {
  matchInsertedWorkExample,
  verifyFrozenWorkExampleAudit,
  workExampleKey,
} from "./work-example-audit.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = "/Users/randallfransen/Sites/dumpster-fire-llc";
const env = Object.fromEntries(
  readFileSync(resolve(repo, ".env.local"), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }),
);
const apiKey = env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error("no ANTHROPIC_API_KEY"); process.exit(1); }

const evidenceManifest = JSON.parse(readFileSync(resolve(here, "evidence-manifest.json"), "utf8"));
const evidenceFiles = ["profile.md", "work-examples.json", "work-example-audit.json", "outreach-messages.json", "scan-jobs.json"];
const evidenceContents = Object.fromEntries(evidenceFiles.map((name) => [name, readFileSync(resolve(here, name), "utf8")]));
for (const [name, contents] of Object.entries(evidenceContents)) {
  const actualHash = createHash("sha256").update(contents).digest("hex");
  if (evidenceManifest.files?.[name] !== actualHash) {
    throw new Error(`Evidence scratch set is incomplete or mixed at ${name}. Run pull-evidence.mjs again.`);
  }
}
const profileMarkdown = evidenceContents["profile.md"];
const workExampleAudit = JSON.parse(evidenceContents["work-example-audit.json"]);
const structuredWorkExamples = JSON.parse(evidenceContents["work-examples.json"]);
const compiledWorkExamples = verifyFrozenWorkExampleAudit(workExampleAudit, structuredWorkExamples, profileMarkdown);
const allJobs = JSON.parse(evidenceContents["scan-jobs.json"]);

// ---- EXACT copy of production systemPrompt (outreach-generator.ts) ----
const baselineSystem = [
  "You write outreach messages AS the person described in the profile below.",
  "The profile is a markdown document that begins with a Voice Profile — a",
  '"write like this" fingerprint. Obey it: match their tone, do/don\'t lists,',
  "and never use any pattern marked as never-sound-like-this.",
  "",
  "House rules for every message:",
  "- Keep it short, specific, and human — never corporate boilerplate, never a mass-template feel.",
  "- Include at most one link, and only when it directly backs up the point being made.",
  "- This is a single first touch: no promised follow-ups, no references to earlier messages.",
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

// ---- v2: implements the six fix levers (see docs/outreach-message-quality-session-2026-07-13.md §5).
// Keeps the good structure; adds stance/humility, Q4-as-thinking-signal, fragment rules,
// hero-example cap, tic demotion, and a ban on invented specifics.
const v2System = [
  "You write a single outreach message AS the person described in the profile below — a real",
  "first-touch note to one hiring contact about one job.",
  "",
  "VOICE",
  "The profile begins with a Voice Profile — a \"write like this\" fingerprint. Match its tone and",
  "rhythm, but voice is HOW you say things, not a script. Its exemplar lines (e.g. the nautical /",
  "absurdist bits) show flavor: reach for that flavor at most once, only when it lands naturally,",
  "never as a required opener and never as a per-message tic. Never use any pattern marked",
  "never-sound-like-this.",
  "",
  "The opinion the person \"will defend\" is a window into how they THINK — not a line to quote.",
  "If it's genuinely relevant to the role, let it inform your reasoning and extrapolate it into the",
  "subject matter. Never quote it verbatim, never end the message on it, and never announce it",
  "(no \"opinion I'll defend:\", no \"here's a take:\"). It is not a brag or a mic-drop.",
  "",
  "STANCE — the thing most first drafts get wrong",
  "Confident, not superior. You are writing to a peer who knows their own field better than you do.",
  "- Do NOT tell the reader what their job, role, or field is \"really about,\" or what \"the whole",
  "  game\" is. No lecturing, no redefining their discipline as the thing you happen to have built.",
  "- Lead with what YOU actually did and where it overlaps; let the relevance speak. Draw the",
  "  connection, don't declare the verdict.",
  "- Be honest about fit. If the overlap is thin, say so plainly and early — a specific, graceful",
  "  concession reads as self-aware and human, and beats forcing a stretch. Do not manufacture",
  "  insider familiarity (\"I know how the sausage gets made there\"); claim only what the profile",
  "  actually supports.",
  "",
  "SUBSTANCE",
  "Lead with the strongest GENUINELY-relevant overlap. Draw concrete proof from the profile: a Work",
  "Example (weave its one-hitter, and its link if present), a Skill with its evidence, or a Résumé",
  "highlight (a specific stat or company). One or two points is plenty. Do NOT force the same hero",
  "example into every job — if it isn't genuinely relevant to THIS role, use a better-matched",
  "highlight or lead with honest positioning instead. Never invent facts, numbers, or specifics not",
  "in the profile (no made-up counts, no embellished precision).",
  "",
  "FORM",
  "- Short, specific, human. Never corporate boilerplate, never a mass-template feel.",
  "- Complete, natural sentences. Contractions and a mid-thought entry are fine WHEN they follow a",
  "  real anchoring thought — do not open on a dropped-subject fragment (\"Was Production Lead for…\").",
  "- Include at most one link, and only when it directly backs up the point being made.",
  "- This is a single first touch: no promised follow-ups, no references to earlier messages.",
  "",
  "Output ONLY a JSON object, no prose, no markdown fences:",
  '{"message": string, "insertedExample": {"oneHitter": string, "link"?: string} | null}.',
  "insertedExample is the Work Example you used, or null if you used none.",
].join("\n");

// ---- v3: responds to Randall's v2 review and makes complete Work Example consideration
// explicit. All examples are already present in profile.md; this variant addresses selection,
// accurate résumé retrieval, respectful familiarity, Q4 judgment leakage, and length.
const v3System = [
  "You write a single outreach message AS the person described in the profile below — a real",
  "first-touch note to one hiring contact about one job.",
  "",
  "VOICE",
  "The profile begins with a Voice Profile. Match its tone and rhythm, but voice is HOW you say",
  "things, not a script. Use at most one colorful turn of phrase, only when it lands naturally.",
  "Never repeat nautical or absurdist language as a template. Never use a pattern marked",
  "never-sound-like-this.",
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
  "- Do not tell the reader what their job is really about, what the whole job is, or reduce their",
  "  discipline to yours. Ban constructions like 'the whole game,' 'the whole job description,' and",
  "  'a coordination problem dressed as a product problem.'",
  "- Before conceding a gap, check the full profile: Role Tracks, résumé highlights, skills, and Work",
  "  Examples. Never say the person lacks experience that the profile supports. A different current",
  "  title is not proof they lack the capability.",
  "- Open with a concession only when a concrete hard requirement is genuinely unsupported. For a",
  "  good overlap, open on specific evidence. Keep any necessary caveat brief and factual.",
  "",
  "WORK EXAMPLE INVENTORY",
  "The Work Examples section is a complete candidate inventory. Silently consider EVERY Work Example",
  "against this specific job before choosing substance. Do not default to the most AI-flavored or most",
  "familiar example. Pick the example whose actual title, one-hitter, and context best match this role.",
  "It is fine to use no Work Example when résumé or skill evidence is stronger. Never bend an example",
  "to fit. If you use one, insertedExample must copy that example's one-hitter and optional link EXACTLY",
  "from the profile so selection can be audited.",
  "",
  "SUBSTANCE",
  "Use one or two concrete points. Prefer verified first-person facts over positioning claims. Never",
  "invent facts, numbers, document counts, responsibilities, insider details, or embellished precision.",
  "Avoid residual brag tags such as 'I do,' 'I'm dangerous in this seat,' or claims that others do not",
  "understand the work.",
  "",
  "FORM",
  "- Aim for 550–700 characters and never exceed 750 characters.",
  "- Short, specific, human, and complete. No corporate boilerplate or mass-template feel.",
  "- No dropped-subject cold opens. Contractions are fine after a complete anchoring thought.",
  "- Include at most one link, only when it directly supports the selected evidence.",
  "- This is a single first touch: no promised follow-ups or references to earlier messages.",
  "",
  "Output ONLY a JSON object, no prose, no markdown fences:",
  '{"message": string, "insertedExample": {"oneHitter": string, "link"?: string} | null}.',
  "insertedExample is the exact Work Example used, or null if none was used.",
].join("\n");

// ---- v3-link: v3 + ONE lever — the #1 issue from Randall's v3/matrix review (2026-07-14).
// The model copied each used example's link into insertedExample metadata (as told) but never
// wrote it into the message body, so the reader could never click through to the work. This
// variant makes the body link a hard requirement whenever a Work Example is used. Isolated on
// purpose: the full v4 (selection bias, persona length, Q4 leak) waits on the matrix review.
const v3LinkSystem = v3System
  .replace(
    "from the profile so selection can be audited.",
    [
      "from the profile so selection can be audited. When the example you use has a link, the message",
      "body MUST contain that exact link — the reader has to be able to click through to the work.",
      "Place it where it naturally backs the evidence, mid-thought, not dangling as a bare footer.",
    ].join("\n"),
  )
  .replace(
    "- Include at most one link, only when it directly supports the selected evidence.",
    "- At most one link total. If you used a Work Example that has a link, that is the link — include\n  it verbatim in the body. Never link to anything that is not in the profile.",
  );
if (!v3LinkSystem.includes("MUST contain that exact link") || !v3LinkSystem.includes("that is the link")) {
  throw new Error("v3-link lever failed to apply — v3 anchor text changed");
}

const systemByVariant = { baseline: baselineSystem, v2: v2System, v3: v3System, "v3-link": v3LinkSystem };
const variant = process.env.PROMPT_VARIANT || "baseline";
const system = systemByVariant[variant];
if (!system) { console.error(`unknown PROMPT_VARIANT ${variant}`); process.exit(1); }

// ---- EXACT copy of buildOutreachPromptParts (outreach-generator.ts) ----
function buildParts({ job, contact }) {
  const contactLine = [
    contact.name ? `Name: ${contact.name}` : undefined,
    `Role: ${contact.role}`,
    contact.seniority ? `Seniority: ${contact.seniority}` : undefined,
  ].filter(Boolean).join("\n");
  const cachePrefix = ["## Profile", profileMarkdown.trim()].join("\n");
  const tail = [
    "## Job", `Title: ${job.title}`, `Company: ${job.company}`, "Description:", job.description.trim(),
    "", "## Contact", contactLine,
  ].join("\n");
  return { cachePrefix, tail };
}

// The sampled jobs (indices into scan-jobs.json, chosen for fit-level variety) plus a
// synthesized contact for each (production supplies a discovered contact; here we use a
// plausible hiring-manager role so the message has a recipient). `fit` is my sampled
// assessment of how well Randall actually matches — it frames the review, not the prompt.
const picks = [
  { i: 34, fit: "good",    contact: { role: "Head of Product Program Management", seniority: "Director" } },
  { i: 15, fit: "good",    contact: { role: "Director, Technical Program Management", seniority: "Director" } },
  { i: 53, fit: "good",    contact: { role: "Director of Operations", seniority: "Director" } },
  { i: 44, fit: "medium",  contact: { role: "VP, Business Operations", seniority: "VP" } },
  { i: 7,  fit: "medium",  contact: { role: "Head of Luxe Supply", seniority: "Director" } },
  { i: 59, fit: "medium",  contact: { role: "Director, Trust & Safety", seniority: "Director" } },
  { i: 50, fit: "stretch", contact: { role: "VP Product, Infrastructure", seniority: "VP" } },
  { i: 36, fit: "stretch", contact: { role: "Creative Director", seniority: "Director" } },
  { i: 12, fit: "poor",    contact: { role: "Sales Director, Enterprise", seniority: "Director" } },
  { i: 2,  fit: "poor",    contact: { role: "Engineering Manager", seniority: "Manager" } },
];

// Per-version metadata: human label + changelog notes. Keep in step with systemByVariant.
const variantMeta = {
  baseline: {
    label: "Baseline — production prompt",
    changeNotes: ["Exact current production system prompt, verbatim. Reference point — no changes."],
  },
  v2: {
    label: "v2 — six levers",
    changeNotes: [
      "Q4 opinion reframed as a thinking-signal, never quoted or used as a mic-drop; label stripped.",
      "Anti-authority stance: don't redefine the reader's field or declare 'the whole game'.",
      "Fragment rule: complete sentences; no dropped-subject cold opens.",
      "Hero-example cap: don't force P.H.R.E.D. into every job.",
      "Nautical exemplars demoted to at-most-once flavor, not a required opener.",
      "Ban invented specifics (fabricated counts, presumed insider vibes).",
    ],
  },
  v3: {
    label: "v3 — complete evidence, respectful fit",
    changeNotes: [
      "Requires verified parity between structured Work Examples and the frozen generation profile before any model call.",
      "Silently considers every Work Example and selects by job relevance instead of defaulting to P.H.R.E.D.",
      "Checks résumé, skill, Role Track, and Work Example evidence before conceding a capability gap.",
      "Turns prior-employer familiarity into respectful credibility, never criticism.",
      "Translates Q4 into first-person evidence only; no judgments about the reader, company, or other people.",
      "Reserves concession openers for unsupported hard requirements and strengthens anti-authority language.",
      "Uses exact inserted-example metadata for auditability and reins messages to 750 characters maximum.",
    ],
  },  "v3-link": {
    label: "v3-link — example link must reach the body",
    changeNotes: [
      "Single lever on top of v3 (kept isolated; full v4 waits on the 28-cell matrix review).",
      "When a Work Example is used and has a link, the message body MUST contain that exact link so the reader can click through to the work.",
      "Link placement guidance: mid-thought where it backs the evidence, never a bare footer.",
      "One-link cap kept; the used example's link takes the slot; never link outside the profile.",
      "New auto-metric exampleLinkMissing: flags any message whose used example has a link the body omits (checked against the matched compiled example, not just returned metadata).",
    ],
  },
};

// ---- Auto-metric detectors. Heuristic/regex — a trend signal for the review console,
// not ground truth. Tunable later. Each returns a small number or 0/1.
// exampleLinkMissing is exact, not heuristic: 1 when the used Work Example has a link the
// body omits. Checked against the matched compiled example (falls back to returned
// metadata) so a model that drops the link from insertedExample can't dodge the flag.
function computeMetrics(message, exampleLink) {
  const m = message || "";
  const head = m.slice(0, 90);
  const tail = m.slice(-140);
  const nautical = (m.match(/capsiz|choppy|ahoy|foil\b|sail|steer|\bboat\b|waters|mid-stride|overboard|anchor/gi) || []).length;
  return {
    nauticalTic: nautical,
    heroPresent: /P\.?H\.?R\.?E\.?D\.?|Project Hub for Retrieval/i.test(m) ? 1 : 0,
    inventedNumber: /\b(\w+teen|twelve|twenty|thirty|forty|fifty|ten|nine|eight|seven|six|five|four|three|\d+)\s+(?:disconnected\s+|different\s+|orphaned\s+)?docs?\b/i.test(m) ? 1 : 0,
    concessionOpener: /straight up|i'?ll be straight|i'?ll be honest|let me be honest|up ?front|to be honest|not going to pretend/i.test(head) ? 1 : 0,
    tellsWhatTheyWant: /^\W*you'?re (?:looking|hunting|after|chasing)|^\W*you want|^\W*you need/i.test(head) ? 1 : 0,
    q4BragTag: /\bI do\.|I'?m not one of them|don'?t (?:quite )?(?:understand|know what)/i.test(tail) ? 1 : 0,
    exampleLinkMissing: exampleLink ? (m.includes(exampleLink) ? 0 : 1) : 0,
    length: m.length,
  };
}

function extractJson(raw) {
  const t = raw.trim();
  const s = t.startsWith("{") ? t : t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1);
  try { return JSON.parse(s); } catch { return null; }
}

const dataDir = resolve(here, "data");
const promptsDir = resolve(dataDir, "prompts");
const inputsDir = resolve(dataDir, "inputs");
for (const d of [dataDir, promptsDir, inputsDir]) mkdirSync(d, { recursive: true });

const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 });
const out = [`# Outreach corpus (variant: ${variant})`, `Generated ${new Date().toISOString()}`, ""];
const messages = [];
let generationFailures = 0;
let selectionAuditFailures = 0;

for (const pick of picks) {
  const j = allJobs[pick.i];
  const job = { title: j.title, company: j.company_name, description: j.description };
  const { cachePrefix, tail } = buildParts({ job, contact: pick.contact });
  const content = [
    { type: "text", text: cachePrefix, cache_control: { type: "ephemeral" } },
    { type: "text", text: tail },
  ];
  process.stdout.write(`generating: ${job.company} — ${job.title} ... `);
  let msg = "(FAILED)";
  let inserted = null;
  try {
    const resp = await client.messages.create({ model: "claude-opus-4-8", max_tokens: 1024, system, messages: [{ role: "user", content }] });
    const textBlock = resp.content.find((b) => b.type === "text");
    const parsed = textBlock ? extractJson(textBlock.text) : null;
    if (typeof parsed?.message !== "string" || !parsed.message.trim()) {
      throw new Error("model returned no parseable message");
    }
    msg = parsed.message.trim();
    inserted = parsed.insertedExample ?? null;
    console.log(`ok (${msg.length} chars)`);
  } catch (e) {
    generationFailures += 1;
    console.log(`ERROR ${e.message}`);
  }

  const selectedWorkExample = matchInsertedWorkExample(inserted, compiledWorkExamples);
  const workExampleSelection = selectedWorkExample
    ? { key: workExampleKey(selectedWorkExample), title: selectedWorkExample.title }
    : inserted
      ? { key: null, title: null, unmatched: true }
      : null;
  if (inserted && !selectedWorkExample) selectionAuditFailures += 1;

  messages.push({
    jobId: j.id,
    company: job.company,
    title: job.title,
    sourceUrl: j.source_url || null,
    location: j.location || null,
    remoteType: j.remote_type || null,
    fit: pick.fit,
    contactRole: pick.contact.role,
    contactSeniority: pick.contact.seniority || null,
    message: msg,
    insertedExample: inserted,
    workExampleSelection,
    metrics: computeMetrics(msg, selectedWorkExample?.link || inserted?.link || null),
  });

  out.push(
    `## ${job.company} — ${job.title}`,
    `**Contact:** ${pick.contact.role}  ·  **Fit:** ${pick.fit}  ·  **Length:** ${msg.length} chars`,
    "", msg, "",
    inserted ? `_inserted example: ${inserted.oneHitter}${inserted.link ? " — " + inserted.link : ""}_` : "_inserted example: none_",
    "", "---", "",
  );
}

if (generationFailures > 0) {
  throw new Error(`Corpus generation failed for ${generationFailures}/${picks.length} jobs; no version artifacts were written.`);
}
if (selectionAuditFailures > 0) {
  throw new Error(`Work Example selection audit failed for ${selectionAuditFailures}/${picks.length} jobs; no version artifacts were written.`);
}

// Human-readable scratch copy (gitignored).
writeFileSync(resolve(here, `baseline-${variant}.md`), out.join("\n"));

// Frozen, committed version artifacts.
const generatedAt = new Date().toISOString();
writeFileSync(resolve(dataDir, `corpus-${variant}.json`), JSON.stringify({
  versionId: variant,
  generatedAt,
  model: "claude-opus-4-8",
  workExampleInventory: workExampleAudit,
  messages,
}, null, 2));
writeFileSync(resolve(promptsDir, `${variant}.txt`), system);
writeFileSync(resolve(inputsDir, `${variant}-profile.md`), profileMarkdown);
writeFileSync(resolve(inputsDir, `${variant}-work-examples.json`), JSON.stringify(workExampleAudit, null, 2));
const feedbackPath = resolve(dataDir, `feedback-${variant}.json`);
if (!existsSync(feedbackPath)) {
  writeFileSync(feedbackPath, JSON.stringify({ versionId: variant, items: {} }, null, 2));
}

// Upsert the version registry (preserve createdAt on re-runs; refresh changelog).
const versionsPath = resolve(dataDir, "versions.json");
let versions = [];
try { versions = JSON.parse(readFileSync(versionsPath, "utf8")); } catch { versions = []; }
const meta = variantMeta[variant] || { label: variant, changeNotes: [] };
const existing = versions.find((v) => v.id === variant);
if (existing) {
  existing.label = meta.label;
  existing.changeNotes = meta.changeNotes;
  existing.regeneratedAt = generatedAt;
} else {
  versions.push({ id: variant, label: meta.label, createdAt: generatedAt, changeNotes: meta.changeNotes });
}
writeFileSync(versionsPath, JSON.stringify(versions, null, 2));
const selectionCounts = new Map(workExampleAudit.entries.map((entry) => [entry.key, { title: entry.title, count: 0 }]));
let unmatchedSelections = 0;
for (const message of messages) {
  if (message.workExampleSelection?.key && selectionCounts.has(message.workExampleSelection.key)) {
    selectionCounts.get(message.workExampleSelection.key).count += 1;
  } else if (message.workExampleSelection?.unmatched) {
    unmatchedSelections += 1;
  }
}
console.log("\nWork Example selection spread:");
Array.from(selectionCounts.entries()).forEach(([key, value], index) => console.log(`- example ${index + 1} (${key}): ${value.count}`));
console.log(`- no Work Example: ${messages.filter((message) => !message.insertedExample).length}`);
if (unmatchedSelections > 0) console.log(`- unmatched insertedExample: ${unmatchedSelections}`);
const linkMisses = messages.filter((message) => message.metrics.exampleLinkMissing === 1).length;
console.log(`- example link missing from body: ${linkMisses}/${messages.filter((message) => message.insertedExample).length} example-bearing messages`);
console.log(`\nwrote data/corpus-${variant}.json + froze prompt/profile/Work Example audit + updated versions.json`);
