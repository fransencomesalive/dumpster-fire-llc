// Baseline outreach corpus. Reproduces the EXACT production prompt from
// lib/public-profile/outreach-generator.ts (systemPrompt + buildOutreachPromptParts)
// so the corpus reflects what ships today. Self-contained: reads profile.md +
// scan-jobs.json from this dir, calls Anthropic directly, writes baseline.md.
//
// A `PROMPT_VARIANT` env selects which system prompt to use ("baseline" | "v2")
// so later A/B runs reuse the same harness without editing prod code.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "/Users/randallfransen/Sites/dumpster-fire-llc/node_modules/@anthropic-ai/sdk/index.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = "/Users/randallfransen/Sites/dumpster-fire-llc";
const env = Object.fromEntries(
  readFileSync(resolve(repo, ".env.local"), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }),
);
const apiKey = env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error("no ANTHROPIC_API_KEY"); process.exit(1); }

const profileMarkdown = readFileSync(resolve(here, "profile.md"), "utf8");
const allJobs = JSON.parse(readFileSync(resolve(here, "scan-jobs.json"), "utf8"));

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

const systemByVariant = { baseline: baselineSystem, v2: v2System };
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
};

// ---- Auto-metric detectors. Heuristic/regex — a trend signal for the review console,
// not ground truth. Tunable later. Each returns a small number or 0/1.
function computeMetrics(message) {
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
    if (parsed?.message) { msg = parsed.message.trim(); inserted = parsed.insertedExample ?? null; }
    console.log(`ok (${msg.length} chars)`);
  } catch (e) { console.log(`ERROR ${e.message}`); }

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
    metrics: computeMetrics(msg),
  });

  out.push(
    `## ${job.company} — ${job.title}`,
    `**Contact:** ${pick.contact.role}  ·  **Fit:** ${pick.fit}  ·  **Length:** ${msg.length} chars`,
    "", msg, "",
    inserted ? `_inserted example: ${inserted.oneHitter}${inserted.link ? " — " + inserted.link : ""}_` : "_inserted example: none_",
    "", "---", "",
  );
}

// Human-readable scratch copy (gitignored).
writeFileSync(resolve(here, `baseline-${variant}.md`), out.join("\n"));

// Frozen, committed version artifacts.
const generatedAt = new Date().toISOString();
writeFileSync(resolve(dataDir, `corpus-${variant}.json`), JSON.stringify({ versionId: variant, generatedAt, model: "claude-opus-4-8", messages }, null, 2));
writeFileSync(resolve(promptsDir, `${variant}.txt`), system);
writeFileSync(resolve(inputsDir, `${variant}-profile.md`), profileMarkdown);

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
console.log(`\nwrote data/corpus-${variant}.json + froze prompt/profile + updated versions.json`);
