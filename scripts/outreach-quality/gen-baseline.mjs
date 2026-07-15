// Outreach corpus generator. `baseline` reproduces the ORIGINAL production prompt
// (pre-refinement); production ported `v4` + the hard-rule contract on 2026-07-14, so
// prod now matches the v4 entry here (data/prompts/v4.txt is the frozen source of
// truth — keep outreach-generator.ts identical to it). Self-contained: reads
// profile.md + scan-jobs.json from this dir, calls Anthropic directly.
//
// A `PROMPT_VARIANT` env selects which system prompt to use ("baseline" | "v2" | "v3"
// | "v3-link" | "v3-nodash") so later A/B runs reuse the same harness without editing prod code.
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

// ---- v3-nodash: v3-link + a platform-wide punctuation rule (Randall, 2026-07-14): no
// generated message may EVER contain an em dash. Measured before this variant: 10/10 v3-link
// messages had them (~2 each) while the profile itself barely uses them — model habit, not
// voice. Use alternate punctuation or restructure instead.
const v3NoDashSystem = v3LinkSystem.replace(
  "- This is a single first touch: no promised follow-ups or references to earlier messages.",
  [
    "- This is a single first touch: no promised follow-ups or references to earlier messages.",
    "- Never use an em dash (—) anywhere in the message, even if the profile or voice examples",
    "  contain them. Restructure the sentence or reach for other punctuation instead: commas,",
    "  parentheses, semicolons, colons, or a new sentence.",
  ].join("\n"),
);
if (!v3NoDashSystem.includes("Never use an em dash")) {
  throw new Error("v3-nodash lever failed to apply — v3-link anchor text changed");
}

// ---- v4: Randall's b2 review notes (2026-07-14) + the queued levers, written as a complete
// prompt and DE-PERSONALIZED — this is the production-port candidate, so nothing in it may
// reference one user's tics, projects, or credentials (the v3 line about "nautical" language
// was Randall-specific and is generalized here). New in v4:
//   1. Opinions/generalizations get a first-person hedge, stated as experience not fact
//      (b2 note: "the real headache with AI-assisted work isn't..." read too direct).
//   2. Opening line must be a complete standalone sentence; no coined jargon the job posting
//      doesn't use (b2 note: "Growth creative" isn't a thing; fragments never open).
//   3. Résumé-highlight variety: consider the FULL highlight set, don't lean on the same
//      marquee names every message (b2 note: same Nike/AKQA/Swift sentence recurring).
//   4. Invented-quantity ban tightened: numbers only if the profile states them, including
//      rhetorical counts (the "scattering across forty docs" tic hit 3/12 in b2).
//   5. 750 becomes an explicit HARD cap with cut-don't-exceed guidance (one 785 leak in b2).
//   6. Work Example spread: when two are comparably relevant, prefer the domain match over
//      the most familiar one (P.H.R.E.D. took 7 of 9 selections in b2 — stated generically).
const v4System = [
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

// ---- v5: the two blocker levers (Randall, 2026-07-14) + example-title fidelity, meant to
// run against the REVISED register-only fingerprint (voice-fingerprint.ts, same day):
//   1. Register rule broadened from exemplar lines to ALL writing samples in the profile —
//      the raw samples below the fingerprint still carry the user's signature imagery.
//   2. No-admission default (Blocker 2): never apologize for / acknowledge / disclaim thin
//      or missing experience; thin evidence = shorter plainer message, not a confession.
//      Only a concrete stated hard requirement gets one brief factual flag, never as the
//      opener. Replaces v4's "open with a concession when unsupported" allowance.
//   3. Work Examples must be referred to by their actual profile titles (v4's OpenAI cell
//      invented the name "Project OS" for P.H.R.E.D.).
const v5System = v4System
  .replace(
    "Its exemplar lines demonstrate register, not vocabulary to reuse: do NOT\nborrow their specific imagery, metaphor domains, or signature phrases.",
    "Its exemplar lines and ANY writing samples elsewhere in the profile demonstrate register,\nnot vocabulary to reuse: do NOT borrow their specific imagery, metaphor domains, signature\nphrases, or subject matter.",
  )
  .replace(
    [
      "- Before conceding a gap, check the full profile: Role Tracks, résumé highlights, skills, and Work",
      "  Examples. Never say the person lacks experience that the profile supports. A different current",
      "  title is not proof they lack the capability.",
      "- Open with a concession only when a concrete hard requirement is genuinely unsupported. For a",
      "  good overlap, open on specific evidence. Keep any necessary caveat brief and factual.",
    ].join("\n"),
    [
      "- Default to NO admission. Never apologize for, acknowledge, or disclaim missing or thin",
      "  experience, and never manufacture a caveat to seem balanced. If the evidence for this job is",
      "  limited, write a shorter, plainer message built on the single strongest point instead of",
      "  confessing what is absent. Never say the person lacks experience the profile supports; a",
      "  different current title is not proof they lack the capability.",
      "- The ONLY exception: the job states a concrete hard requirement (location, license or",
      "  credential, clearance, language fluency) the profile clearly cannot meet. Flag it in one",
      "  brief, factual sentence, never as an apology and never in the opening line.",
    ].join("\n"),
  )
  .replace(
    "bend an example to fit. If you use one, insertedExample must copy that example's one-hitter and",
    "bend an example to fit. Refer to the example by its actual title from the profile; never rename\nor rebrand it. If you use one, insertedExample must copy that example's one-hitter and",
  );
for (const marker of ["ANY writing samples elsewhere", "Default to NO admission", "never rename"]) {
  if (!v5System.includes(marker)) throw new Error(`v5 lever failed to apply (missing: ${marker}) — v4 anchor text changed`);
}

// ---- v6: Randall's v5 review notes (2026-07-14 evening).
//   1. The declarative opener survived THREE prompt attempts (v4 draft, v4, v5 all opened the
//      Coinbase cell with "The problem with AI-assisted work is/isn't...") → promoted to a
//      hard rule: the opening sentence must be anchored in the first person; plus stronger
//      prompt wording and an explicit ban on opening with the job title as a bare label
//      (the Figma fragment opener).
//   2. NEW STANDING RULE: never discuss, volunteer, or claim logistics (location, remote,
//      hybrid, in-office, relocation, availability) in outreach. Location removed from the
//      hard-requirement exception; the Anthropic events cell fabricated "can be in-office as
//      needed". Hard-rule detector added.
//   3. Example format matching: an events job wants the physical-event example (Mozilla
//      tradeshow), not AirCover/ZKP digital launches.
//   4. The closing line's intent must be unambiguous (Ramp cell: "I'd like to help pull them
//      off." hovered between statement and ask, leaving the reader to guess the goal). This
//      is a clarity rule, NOT "every close must be a question" — statements and questions
//      are both fine when they read cleanly as what they are.
const v6System = v5System
  .replace(
    [
      "- Never open the message by declaring what a problem, a discipline, or a kind of work 'is' or",
      "  'isn't.' If that observation matters, it comes later and it is framed as this person's own",
      "  experience, not a truth the reader needs explained.",
    ].join("\n"),
    [
      "- Anchor the opening sentence in the first person: it must contain I, I've, I'm, I'd, my, or",
      "  me. Never open by declaring what a problem, a discipline, or a kind of work 'is' or 'isn't'",
      "  — even when the job description itself names the problem, frame it through this person's",
      "  own experience ('I've spent years fixing exactly this'), never as a truth the reader needs",
      "  explained.",
      "- Never open on the job title as a bare label, or any other fragment. The opening line is a",
      "  complete sentence with a subject and a verb.",
    ].join("\n"),
  )
  .replace(
    [
      "- The ONLY exception: the job states a concrete hard requirement (location, license or",
      "  credential, clearance, language fluency) the profile clearly cannot meet. Flag it in one",
      "  brief, factual sentence, never as an apology and never in the opening line.",
    ].join("\n"),
    [
      "- The ONLY exception: the job states a concrete hard requirement (license or credential,",
      "  clearance, language fluency) the profile clearly cannot meet. Flag it in one brief,",
      "  factual sentence, never as an apology and never in the opening line.",
      "- Never discuss, volunteer, or make claims about logistics: location, remote, hybrid,",
      "  in-office, relocation, time zones, or availability. Outreach sells the fit; logistics",
      "  belong to later conversations and are never yours to concede or promise.",
    ].join("\n"),
  )
  .replace(
    "when two examples are comparably relevant, pick the one whose domain most closely matches this\njob's domain.",
    "when two examples are comparably relevant, pick the one whose domain AND format most closely\nmatch this job: an events role wants the physical-event example over a digital launch; a\nwebsite role wants the website example.",
  )
  .replace(
    "- This is a single first touch: no promised follow-ups or references to earlier messages.",
    [
      "- The closing line's intent must be unambiguous. An ask reads and is punctuated as a direct",
      "  question; a statement reads cleanly as a statement. Never end on a line that hovers between",
      "  the two and leaves the reader guessing what you want. Make the ask specific to this job or",
      "  the evidence you led with — never a generic stock closer ('Worth a conversation?', 'Happy",
      "  to talk.', 'Worth a chat?').",
      "- This is a single first touch: no promised follow-ups or references to earlier messages.",
    ].join("\n"),
  );
for (const marker of ["Anchor the opening sentence", "Never discuss, volunteer, or make claims about logistics", "domain AND format", "intent must be unambiguous"]) {
  if (!v6System.includes(marker)) throw new Error(`v6 lever failed to apply (missing: ${marker.slice(0, 40)}) — v5 anchor text changed`);
}

// ---- v7: full-text rewrite responding to the v6 regression (avg 5.09; four cells rated 1s).
// Runs against the SECOND fingerprint revision (qualities-not-devices — v6's regression traced
// to the fingerprint prescribing "use fragments"/"easy confidence"/"open cold", which beat the
// prompt's rules every roll). New here: rules outrank voice; fragment cap (one per message);
// company-familiarity openers preferred over cold posting-line references; prose-quality bar
// (no sentence-final prepositions, no close word repetition, no same-shape sentence stacks);
// domain anti-fabrication (the events cell invented show-calling experience); negativity ban
// (the Airbnb cell called the job a "grind"); respectful prior-employment phrasing; 500–650
// target + "a dozen" named in NUMBERS to cut retry pressure (quality-blind retries were
// selecting sloppy-but-compliant rolls).
const v7System = [
  "You write a single outreach message AS the person described in the profile below — a real",
  "first-touch note to one hiring contact about one job.",
  "",
  "VOICE",
  "The profile begins with a Voice Profile. Match how it FEELS — its rhythm, warmth, humor, and",
  "confidence — but these rules outrank it: if voice guidance ever conflicts with a rule below",
  "(confidence vs. hedging, device habits vs. grammar), the rule wins. Exemplar lines and any",
  "writing samples elsewhere in the profile demonstrate register, not vocabulary to reuse: do",
  "NOT borrow their specific imagery, metaphor domains, signature phrases, or subject matter.",
  "Most messages need no colorful flourish at all; use at most one, only when it lands",
  "naturally, and make it fresh rather than an echo of an exemplar. Never use a pattern marked",
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
  "  there should read as familiarity, respect, and useful context — 'Having worked at X, Y is",
  "  familiar ground,' never 'I already did that there' or any phrasing that shrugs the company off.",
  "- Never characterize the reader's company, team, or the job itself negatively: no 'grind,' no",
  "  implying dysfunction, confusion, or lack of authority. Direct is not negative.",
  "- Do not tell the reader what their job is really about, or reduce their discipline to yours. Ban",
  "  constructions like 'the whole game,' 'the whole job description,' and 'an X problem dressed as",
  "  a Y problem.'",
  "- State every opinion and generalization about how work goes as first-person experience — attach",
  "  a marker like 'in my experience,' 'I've found,' or 'for me' — never as declared fact about the",
  "  reader's world. This rule outranks the Voice Profile's confidence. One light hedge where",
  "  needed; don't make hedging a tic either.",
  "- Default to NO admission. Never apologize for, acknowledge, or disclaim missing or thin",
  "  experience, and never manufacture a caveat to seem balanced. If the evidence for this job is",
  "  limited, write a shorter, plainer message built on the single strongest point instead of",
  "  confessing what is absent. Never say the person lacks experience the profile supports.",
  "- When the role's core craft is not this person's, do not contrast them against the title ('I'm",
  "  a producer, not a copywriter') and do not confess the distance ('I'll be straight...'). Pitch",
  "  the adjacent seat they would actually fill: name the real capability the role needs that they",
  "  DO bring, and let the reader map the fit.",
  "- The ONLY exception: the job states a concrete hard requirement (license or credential,",
  "  clearance, language fluency) the profile clearly cannot meet. Flag it in one brief,",
  "  factual sentence, never as an apology and never in the opening line.",
  "- Never discuss, volunteer, or make claims about logistics: location, remote, hybrid,",
  "  in-office, relocation, time zones, or availability. Outreach sells the fit; logistics",
  "  belong to later conversations and are never yours to concede or promise.",
  "",
  "WORK EXAMPLE INVENTORY",
  "The Work Examples section is a complete candidate inventory. Silently consider EVERY Work Example",
  "against this specific job before choosing substance. Do not default to the most familiar example:",
  "when two examples are comparably relevant, pick the one whose domain AND format most closely",
  "match this job (an events role wants the physical-event example over a digital launch; a website",
  "role wants the website example). It is fine to use no Work Example when résumé or skill evidence",
  "is stronger. Never bend an example to fit. Refer to the example by its actual title from the",
  "profile; never rename or rebrand it. If you use one, insertedExample must copy that example's",
  "one-hitter and optional link EXACTLY from the profile so selection can be audited. When the",
  "example you use has a link, the message body MUST contain that exact link — the reader has to",
  "be able to click through to the work. Place it where it naturally backs the evidence,",
  "mid-thought, not dangling as a bare footer.",
  "",
  "SUBSTANCE",
  "Use one or two concrete points. Prefer verified first-person facts over positioning claims.",
  "Consider the FULL set of résumé highlights and skills, not just the most famous credentials:",
  "pick what is most relevant to THIS job, use at most two résumé highlights per message, and do",
  "not lean on the same marquee names or the same highlight sentence in every message. Never",
  "invent facts, responsibilities, insider details, or embellished precision — and never",
  "manufacture domain experience: no skills, duties, or scenes the profile does not contain.",
  "Evidence keeps its actual format: never re-describe a digital launch as a live event, stage",
  "work, or any other medium the profile does not state, and never claim craft vocabulary",
  "(run-of-show, show-calling, cue sheets) for work the profile does not describe that way. If",
  "the job's core domain is not evidenced in the profile, do not fake it; build the shorter,",
  "honest message on what is real. Avoid residual brag tags such as 'I do,' 'I'm dangerous in",
  "this seat,' or claims that others do not understand the work.",
  "",
  "NUMBERS — hard rule",
  "Every number in the message, written as digits or as words, must appear in the profile. No",
  "exceptions for color or rhythm — no 'a dozen tools,' no 'scattered across fifteen docs,' no",
  "quantified illustrations of any kind unless the profile states that number. When in doubt,",
  "no number.",
  "",
  "FORM",
  "- Aim for 500–650 characters. 750 characters is a HARD cap: if a draft runs long, cut evidence",
  "  or trim sentences. Never exceed it.",
  "- The opening line is a complete sentence, anchored in the first person (it contains I, I've,",
  "  I'm, I'd, my, or me). When the person has direct experience with this company, prefer opening",
  "  there ('I did a contract tour at Airbnb, so the Services org is familiar ground'). Never open",
  "  by declaring what a problem or discipline 'is' or 'isn't,' never on the job title as a bare",
  "  label, and never by cold-referencing a deep line from the posting as if the reader has it",
  "  memorized.",
  "- At most ONE deliberate sentence fragment in the whole message, used only for emphasis that",
  "  genuinely lands. This cap holds regardless of what the Voice Profile encourages. Every other",
  "  sentence is complete, correctly punctuated, and grammatical.",
  "- Prose quality bar: never end a sentence with a preposition; never repeat a distinctive word",
  "  in close succession; vary sentence shape — never stack same-pattern sentences ('I did X. I",
  "  did Y. I also did Z.'); no invented shorthand or slang the reader may not parse.",
  "- Use the reader's own vocabulary: never coin role-family jargon or industry terms that are not",
  "  in the job posting or the profile.",
  "- Short, specific, human. No corporate boilerplate or mass-template feel.",
  "- Never use an em dash (—) anywhere in the message, even if the profile or voice examples",
  "  contain them. Restructure the sentence or reach for other punctuation instead: commas,",
  "  parentheses, semicolons, colons, or a new sentence.",
  "- At most one link total. If you used a Work Example that has a link, that is the link — include",
  "  it verbatim in the body. Never link to anything that is not in the profile.",
  "- The closing line's intent must be unambiguous: an ask reads and is punctuated as a direct",
  "  question; a statement reads cleanly as a statement. Make the ask specific to this job or the",
  "  evidence you led with, so no two messages close alike.",
  "- This is a single first touch: no promised follow-ups or references to earlier messages.",
  "",
  "Output ONLY a JSON object, no prose, no markdown fences:",
  '{"message": string, "insertedExample": {"oneHitter": string, "link"?: string} | null}.',
  "insertedExample is the exact Work Example used, or null if none was used.",
].join("\n");

// ---- v8: Randall's b3 notes (avg 6.81, 10/12 at 7–8 — recovered from v6). Three fixes:
//   1. Bare ultra-short asks read desperate ("Can we talk?"); the ask carries its
//      job-specific referent in the SAME sentence, and the conditional close shape is
//      offered ("If you're looking for X, we should chat.").
//   2. Same-shape stacking is now a HARD rule (3+ consecutive sentences opening with "I
//      <verb>" auto-retry) — the Discord cell rated 3s was a 5-attempt retry survivor;
//      prose advice alone can't guard retry survivors, detectors can.
//   3. Awkward-phrasing note (Figma "because most of what I do is exactly this"): covered
//      by the stack detector + a read-aloud line; one-off phrasing stays review territory.
const v8System = v7System
  .replace(
    [
      "- The closing line's intent must be unambiguous: an ask reads and is punctuated as a direct",
      "  question; a statement reads cleanly as a statement. Make the ask specific to this job or the",
      "  evidence you led with, so no two messages close alike.",
    ].join("\n"),
    [
      "- The closing line's intent must be unambiguous: an ask reads and is punctuated as a direct",
      "  question; a statement reads cleanly as a statement. The ask names this job or the evidence",
      "  you led with IN THE SAME SENTENCE — a bare 'Can we talk?' reads desperate. A conditional",
      "  close also works: 'If you're looking for <the specific thing>, we should chat.'",
    ].join("\n"),
  )
  .replace(
    "- Prose quality bar: never end a sentence with a preposition; never repeat a distinctive word",
    "- Read the draft as the hiring manager would; rewrite any phrase that lands awkwardly out loud",
    // (second .replace argument continues below via chained replace)
  )
  .replace(
    "- Read the draft as the hiring manager would; rewrite any phrase that lands awkwardly out loud",
    [
      "- Never stack sentences of the same shape: three or more consecutive sentences opening with",
      "  'I <verb>' reads like a list, not a person. Vary openings and fold facts into subordinate",
      "  clauses.",
      "- Prose quality bar: read each phrase as the hiring manager would and rewrite anything that",
      "  lands awkwardly out loud; never end a sentence with a preposition; never repeat a distinctive word",
    ].join("\n"),
  );
for (const marker of ["reads desperate", "we should chat", "three or more consecutive sentences opening with"]) {
  if (!v8System.includes(marker)) throw new Error(`v8 lever failed to apply (missing: ${marker.slice(0, 30)})`);
}

const systemByVariant = {
  baseline: baselineSystem,
  v2: v2System,
  v3: v3System,
  "v3-link": v3LinkSystem,
  "v3-nodash": v3NoDashSystem,
  // Same prompt as v3-nodash, regenerated on job batch 2 — a distinct corpus id keeps the
  // judged batch-1 corpus frozen instead of overwriting it.
  "v3-nodash-b2": v3NoDashSystem,
  v4: v4System,
  v5: v5System,
  v6: v6System,
  v7: v7System,
  // Same prompt as v7, generated on job batch 3 — distinct corpus id keeps the judged
  // batch-2 v7 frozen (see picksByBatch).
  "v7-b3": v7System,
  v8: v8System,
};
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

// The sampled jobs plus a synthesized contact for each (production supplies a discovered
// contact; here we use a plausible hiring-manager role so the message has a recipient).
// `fit` is my sampled assessment of how well Randall actually matches — it frames the
// review, not the prompt.
//
// Batch 2 (Randall, 2026-07-14). Batch 1 (10 jobs picked by INDEX into the 2026-07-13
// evidence pull) generated baseline/v2/v3/v3-link/v3-nodash — those corpora are frozen in
// data/ and stay judged against their own inputs. Randall's batch-2 sampling rules:
// real company variety (9 companies, max 2 per company), NO jobs gated on a language
// fluency he doesn't have, no jobs he'd never apply to (poor-fit padding dropped), and
// picks are keyed by stable job id so an evidence repull can't silently shift them.
const picksByBatch = {
  b2: [
    { id: "b8eb2807-feb5-409b-9656-4af069ccd18e", fit: "good",    contact: { role: "Director, Technical Program Management", seniority: "Director" } }, // Coinbase — TPM, Knowledge Systems
    { id: "d7dd72e8-a446-40c8-b85d-14f24d0c1dcc", fit: "good",    contact: { role: "VP, Customer Experience", seniority: "VP" } },                      // Coinbase — Staff TPM, CX Agent Experience
    { id: "d4191b2b-1445-48cb-bed2-6c9e6935c69e", fit: "good",    contact: { role: "Executive Creative Director", seniority: "Director" } },            // Figma — Brand Producer
    { id: "692f2659-5c5a-46bb-b01a-3fa10e6af8c0", fit: "good",    contact: { role: "Director, Business Operations", seniority: "Director" } },          // Airbnb — Sr Programs & BizOps Lead, Airbnb Services
    { id: "3f012bc3-2cc3-4e69-bce6-64155faa6740", fit: "medium",  contact: { role: "Head of Product Operations", seniority: "Director" } },             // Notion — Product Operations Manager
    { id: "979c2330-d8e2-4845-8f4d-eea81446cf13", fit: "medium",  contact: { role: "VP, Marketing", seniority: "VP" } },                                // OpenAI — Creative Director, Growth
    { id: "a01690f2-7ecd-4314-befa-fe7487e4d636", fit: "medium",  contact: { role: "Head of Events Marketing", seniority: "Director" } },               // Anthropic — Marketing Events Producer
    { id: "cd5ba679-04b1-427d-9610-eadbc024c045", fit: "medium",  contact: { role: "Director, Strategy & Operations", seniority: "Director" } },        // Discord — Strategy & Ops Mgr, Consumer Revenue
    { id: "eb3447c7-405d-4faa-92cb-4248fdab2198", fit: "medium",  contact: { role: "Director, Professional Services", seniority: "Director" } },        // GitLab — Professional Services Program Manager
    { id: "546f97cc-a0fa-4dbb-ae23-0c1b62c3f739", fit: "stretch", contact: { role: "Head of Brand", seniority: "Director" } },                          // Ramp — Viral Creative Producer
    { id: "e4c50ff6-661f-4dcd-a13c-30821b842df1", fit: "stretch", contact: { role: "Executive Creative Director", seniority: "Director" } },            // Anthropic — Head of Copy, Creative Studio
    { id: "7328fb15-4c42-4f6a-b419-daa7470140a8", fit: "stretch", contact: { role: "Chief Product Officer", seniority: "C-level" } },                   // Databricks — Chief of Staff, to the CPO
  ],
  // Batch 3 (Randall, 2026-07-14: keep growing sample size + variation). Four companies
  // batch 2 never touched (Spotify, Stripe, Dropbox, Robinhood), fresh roles elsewhere;
  // same standing sampling rules: id-keyed, ≤2 per company, no language gates, no
  // never-apply padding. The Stripe events role deliberately re-tests the events axis
  // (fabricate↔confess) on a fresh cell.
  b3: [
    { id: "79702602-2e0d-40b8-b5e0-5bc571a4173a", fit: "good",    contact: { role: "Executive Producer, Studios", seniority: "Director" } },            // Spotify — Producer, The Journal
    { id: "1ea6c478-b7e0-4c78-b22a-769761a4bbb0", fit: "good",    contact: { role: "Head of GTM Operations", seniority: "Director" } },                 // Stripe — GTM Operations Process Architect
    { id: "d557cef6-4162-4c9e-88e8-9a03ce1892cc", fit: "good",    contact: { role: "Head of Internal Communications", seniority: "Director" } },        // Anthropic — Internal Content Producer
    { id: "1b142fad-a25f-4648-b65e-835a4631874c", fit: "good",    contact: { role: "Director, Process Strategy", seniority: "Director" } },             // Airbnb — Process Strategy & Optimization Manager
    { id: "9f701545-298c-49a3-a3c1-7d53fb7a2f1f", fit: "medium",  contact: { role: "Director, Editorial Product", seniority: "Director" } },            // Spotify — PM, Editorial Product Integration
    { id: "230b1490-d5ee-47b5-b8f7-98a38a718647", fit: "medium",  contact: { role: "Director, Customer Experience", seniority: "Director" } },          // Figma — Voice of the Customer Program Manager
    { id: "c8c5ca0d-d1b0-4bac-9ab1-e72f357d46bb", fit: "medium",  contact: { role: "Head of Human Data Operations", seniority: "Director" } },          // OpenAI — Program Manager, Human Data
    { id: "e0282190-d318-406d-ba6c-300be02d58d8", fit: "medium",  contact: { role: "VP, Business Development", seniority: "VP" } },                     // Robinhood — Sr Partnerships Manager, Crypto
    { id: "d67f53b5-2025-4bf7-8636-9a2d917d5c2a", fit: "medium",  contact: { role: "Director, Governance Risk & Compliance", seniority: "Director" } }, // Dropbox — Sr GRC Program Manager
    { id: "419f08b4-5bdf-4867-8eaa-314ed5912e9e", fit: "stretch", contact: { role: "Head of Global Events", seniority: "Director" } },                  // Stripe — Corporate Events Manager, Expo
    { id: "b5b1d15c-8bdb-4d92-9e37-4a899547cccc", fit: "stretch", contact: { role: "Executive Creative Director", seniority: "Director" } },            // Robinhood — Associate Creative Director, Copy
    { id: "0787f091-0007-4aee-89ae-52adc49bf06c", fit: "stretch", contact: { role: "Director, Legal Operations", seniority: "Director" } },             // Discord — Legal Vendor Program Manager
  ],
};
const batchByVariant = { "v7-b3": "b3", v8: "b3" };
const picks = picksByBatch[batchByVariant[process.env.PROMPT_VARIANT] || "b2"];

// Freshness guard (2026-07-14): the platform scan upserts live postings but never removes
// delisted ones (~17% of the pool was dead when discovered, served as HTTP 200 by the
// boards). Warn loudly when a picked job was not seen by the most recent scan. Warning,
// not abort: existing frozen batches contain rows that have since gone stale, and a dead
// job is still a valid prompt-quality fixture — but new batches must be picked fresh.
{
  // Compare each pick against its OWN company's newest scrape so a lagging board doesn't
  // false-positive every job on it.
  const newestByCompany = {};
  for (const job of allJobs) {
    if (!newestByCompany[job.company_name] || job.scraped_at > newestByCompany[job.company_name]) {
      newestByCompany[job.company_name] = job.scraped_at;
    }
  }
  for (const pick of picks) {
    const job = allJobs.find((candidate) => candidate.id === pick.id);
    if (job && job.scraped_at.slice(0, 10) < (newestByCompany[job.company_name] || "").slice(0, 10)) {
      console.warn(`WARNING: picked job ${job.company_name} — ${job.title} last seen by the scan on ${job.scraped_at.slice(0, 10)} (board scanned ${newestByCompany[job.company_name].slice(0, 10)}); likely delisted.`);
    }
  }
}

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
  "v3-nodash": {
    label: "v3-nodash — em dashes banned platform-wide",
    changeNotes: [
      "Single lever on top of v3-link. Standing platform rule (Randall, 2026-07-14): no generated message may ever contain an em dash.",
      "Prompt now bans the em dash outright, even where profile or voice examples contain them; restructure or use commas, parentheses, semicolons, colons, or a new sentence.",
      "Before this variant: 10/10 v3-link messages contained em dashes (~2 each) while the profile itself has almost none — model habit, not voice.",
      "New auto-metric emDash: exact count of em dashes per message body.",
    ],
  },
  "v3-nodash-b2": {
    label: "v3-nodash · job batch 2 — fresh variety",
    changeNotes: [
      "Same prompt as v3-nodash; regenerated on a NEW 12-job batch (Randall, 2026-07-14: batch 1 was Airbnb-heavy with language-gated non-starters, wasting review effort).",
      "Batch-2 sampling rules: 9 companies with max 2 per company; no jobs gated on a language fluency Randall doesn't have; no poor-fit padding he'd never apply to; fit spread 4 good / 5 medium / 3 stretch.",
      "Evidence pull is now company-balanced (full board per company) instead of a flat recency-200 that four big boards crowded; picks are keyed by stable job id.",
      "New jobs have no prior-version history in the console; judge them fresh.",
    ],
  },
  v4: {
    label: "v4 — feedback implemented, generalized for any career",
    changeNotes: [
      "Implements Randall's b2 review notes: opinions/generalizations hedged as first-person experience, never declared fact (Coinbase Knowledge Systems note).",
      "Opening line must be a complete standalone sentence; fragments allowed later, never first; no coined jargon absent from the posting/profile (OpenAI 'Growth creative' note).",
      "Résumé-highlight variety: consider the full highlight set, don't repeat the same marquee names/sentence every message (Airbnb note).",
      "Invented-quantity ban tightened: numbers only if the profile states them, including rhetorical counts (doc-count tic hit 3/12 in b2).",
      "750 is now an explicit HARD cap with cut-don't-exceed guidance (one 785 leak in b2).",
      "Work Example spread: prefer the domain match over the most familiar example when relevance ties.",
      "DE-PERSONALIZED for production: no references to any specific user's tics, projects, or credentials (v3's 'nautical' line generalized). This is the production-port candidate.",
      "Pre-review revision (same day): first draft leaked 3 invented counts, kept a declared-fact opener, and echoed the fingerprint's imagery in 8/12 messages once the user-specific ban was generalized. Sharpened: exemplars demonstrate register not vocabulary (most messages need no flourish); NUMBERS promoted to a standalone hard rule (every number must appear in the profile); never open by declaring what a problem/discipline 'is/isn't'; at most two résumé highlights per message.",
    ],
  },
  v5: {
    label: "v5 — blocker fixes: register-only fingerprint + no-admission default",
    changeNotes: [
      "Runs against the REVISED voice-fingerprint pre-pass (register-only: describes HOW the person writes, never their imagery/phrases; neutral-subject exemplars). Randall blocker: one user's quirks must never template their messages.",
      "Register rule broadened from exemplar lines to ALL writing samples in the profile (the raw samples still carry signature imagery).",
      "No-admission default (Randall blocker): never apologize for, acknowledge, or disclaim thin/missing experience; thin evidence means a shorter, plainer message, not a confession. Only a stated concrete hard requirement (location/license/clearance/fluency) gets one brief factual flag, never as the opener.",
      "Work Examples must be referred to by their actual profile titles (v4 invented 'Project OS' for P.H.R.E.D.).",
    ],
  },
  v6: {
    label: "v6 — v5 review notes: first-person opener (hard), no logistics talk (hard)",
    changeNotes: [
      "Opening sentence must be first-person-anchored — now a HARD rule with auto-retry (the declarative 'The problem with X is...' opener survived three prompt-wording attempts on the same Coinbase cell; humility rated 1).",
      "Never open on the job title as a bare label or any fragment (Figma cell opened 'Brand Producer for the Brand Studio team, and...').",
      "STANDING RULE (Randall): never discuss, volunteer, or claim logistics — location, remote, hybrid, in-office, relocation, availability. Location removed from the hard-requirement exception; new hard-rule detector (the Anthropic events cell fabricated 'can be in-office as needed').",
      "Example selection matches format as well as domain: an events job wants the physical-event example (Mozilla tradeshow), not digital launches (AirCover/ZKP).",
      "The closing line's intent must be unambiguous: an ask reads as a direct question, a statement as a statement (Randall clarified: the Ramp cell was a grammar/clarity defect that left the goal unclear, not a make-everything-a-question rule).",
      "Closers must be specific to the job or the evidence ('Worth a conversation?' converged on 11/12 messages in the first v6 roll). Randall: these are NOT banned terms — the defect is the near-identical repetition across messages, which users would read as lazy output or poor LLM guidance; specificity is the fix because a job-specific ask can't repeat.",
      "Not rule-addressed: the 'lean on people' diction miss in the Figma cell — one-off word choice, flagged for review only.",
    ],
  },
  v7: {
    label: "v7 — regression fix: rules outrank voice, prose-quality bar, no fabricated domains",
    changeNotes: [
      "Responds to the v6 regression (avg 5.09, four cells rated 1s). Root causes found: the register-only fingerprint PRESCRIBED devices ('use fragments,' 'easy confidence,' 'open cold') that beat the prompt's rules every roll, and quality-blind retries (10/12) selected sloppy-but-compliant rolls.",
      "Fingerprint pre-pass revised a second time: describes voice QUALITIES only, never grammatical/rhetorical devices; Randall's profile regenerated with it.",
      "Rules outrank the Voice Profile — stated explicitly, including that hedging beats voice confidence ('in my experience' markers required on opinions; skipped twice before because the old fingerprint said to state opinions with easy confidence).",
      "Fragment cap: at most ONE deliberate fragment per message regardless of voice guidance; everything else complete and correctly punctuated (fragments were 'way too over indexed').",
      "Prose-quality bar: no sentence-final prepositions, no close word repetition, no same-shape sentence stacks ('I did X. I did Y.'), no invented shorthand ('a rep').",
      "Never manufacture domain experience — no skills, duties, or scenes the profile doesn't contain (the events cell invented show-calling/live-event claims); thin domain = shorter honest message.",
      "Never characterize the reader's company or the job negatively (the Airbnb cell called the work a 'grind' and implied lack of authority). Direct is not negative.",
      "Prior employment phrased respectfully ('Having worked at X, Y is familiar ground'), never dismissively ('I already did that there'). Company-familiarity openers preferred over cold posting-line references.",
      "Length target now 500–650 (750 stays the hard cap) and 'a dozen' named in NUMBERS — both to cut the retry pressure that was trading prose quality for compliance.",
    ],
  },
  "v7-b3": {
    label: "v7 · job batch 3 — new companies, wider variation",
    changeNotes: [
      "Same v7 prompt, generated on a NEW 12-job batch (Randall: keep growing sample size and variation).",
      "Four companies batch 2 never touched: Spotify (Producer, The Journal; Editorial Product PM), Stripe (GTM Ops Process Architect; Corporate Events Manager), Dropbox (Sr GRC Program Manager), Robinhood (Crypto Partnerships; ACD Copy) — plus fresh roles at Anthropic, Figma, OpenAI, Airbnb, Discord.",
      "Standing sampling rules held: id-keyed picks, max 2 per company, no language gates, no never-apply padding; fit spread 4 good / 5 medium / 3 stretch.",
      "The Stripe Corporate Events cell deliberately re-tests the events axis (fabricate-vs-confess) on a fresh job.",
      "New jobs have no prior-version history in the console; judge fresh.",
    ],
  },
  v8: {
    label: "v8 — b3 notes: specific-referent closers, same-shape stacking now a hard rule",
    changeNotes: [
      "Runs on job batch 3 so the console shows before/after against the v7-b3 cells Randall just rated (avg 6.81, 10/12 at 7–8).",
      "Closers carry their job-specific referent in the same sentence — a bare 'Can we talk?' reads desperate (Spotify Editorial cell). Conditional shape offered: 'If you're looking for X, we should chat.'",
      "Same-shape sentence stacking ('I did this. I did that.') promoted to a HARD rule with auto-retry — the Discord cell rated 3s was a 5-attempt retry survivor; prose advice can't guard retry survivors, detectors can.",
      "Prose bar now leads with a read-aloud test (Figma cell's 'because most of what I do is exactly this' was rated awkward).",
    ],
  },
};

// ---- Hard-rule contract (2026-07-14). Prompt-only enforcement proved unreliable (750-cap
// leaks and invented counts recurred across rounds), so hard rules are validated after each
// generation and violating cells are regenerated up to MAX_GEN_ATTEMPTS. These checks are
// deliberately PROFILE-INDEPENDENT — they must hold for any user's career, not just this
// profile — which is the enforcement production will need. Final violations are kept
// visible (not hidden) so the console still shows how often the prompt needed rescuing.
const NUMBER_WORDS = [
  "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
  "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
  "hundred", "thousand", "dozen",
];
// Numbers must come from the profile. Digits ground digits; number-words ground only as
// words ("15+" in the profile does not license "fifteen docs" — describe without the count).
// "one"/"two" are skipped as overwhelmingly rhetorical.
function ungroundedNumbers(message, profile) {
  const prof = profile.toLowerCase();
  const found = [];
  for (const m of message.matchAll(/\d[\d,.]*/g)) {
    const tok = m[0].replace(/[.,]+$/, "");
    if (tok && !prof.includes(tok.toLowerCase())) found.push(tok);
  }
  for (const m of message.toLowerCase().matchAll(new RegExp(`\\b(${NUMBER_WORDS.join("|")})\\b`, "g"))) {
    // Word-boundary check on the profile side too — a bare includes() let "often"
    // ground "ten" and "fourth" ground "four" (caught 2026-07-14: "ten disconnected
    // docs" passed while a legitimate "four" flagged).
    if (!new RegExp(`\\b${m[1]}\\b`).test(prof)) found.push(m[1]);
  }
  return [...new Set(found)];
}

// The opening sentence must be first-person-anchored (v6; declarative openers survived
// three prompt-wording attempts). Logistics talk is banned outright (Randall, 2026-07-14:
// never discuss or volunteer in-office/remote requirements in outreach).
function openingSentence(message) {
  const trimmed = message.trim();
  const end = trimmed.search(/[.!?]/);
  return end === -1 ? trimmed : trimmed.slice(0, end + 1);
}
const FIRST_PERSON_PATTERN = /\b(i|i've|i'm|i'd|i'll|my|me|mine)\b/i;
const LOGISTICS_PATTERN = /\bremote\b|\bhybrid\b|on-?site\b|in-?office\b|in the office\b|relocat|time ?zones?\b|anchor days\b|based in\b/i;
// No-admission is a standing rule (Randall): apology/disclaimer framings are hard
// violations, not style notes — v7's first roll reopened two messages with
// "I'll be straight: ... not my lane."
const ADMISSION_PATTERN = /i'?ll be (straight|honest)|be straight about|to be (perfectly |fully )?honest|i('?ll| will)? ?admit|i won'?t pretend|not going to pretend|full disclosure|(isn'?t|is not|not) (really )?my lane|outside my lane|a step outside|i'?m an? \w+, not an? \w+|i'?d bring less|rather.{0,20}than oversell|less of on paper/i;

// Three or more consecutive sentences opening "I <word>" — the "I did this. I did that."
// list-shape Randall rated 3s (v8). Retry survivors dodge prose advice; they can't dodge
// a detector.
function sameShapeStack(message) {
  const sentences = message.trim().split(/(?<=[.!?])\s+/);
  let run = 0;
  for (const sentence of sentences) {
    if (/^I('\w+)? \w/.test(sentence.trim())) {
      run += 1;
      if (run >= 3) return true;
    } else {
      run = 0;
    }
  }
  return false;
}

function hardRuleViolations(message, exampleLink) {
  const violations = [];
  if (message.length > 750) violations.push(`over_750_characters(${message.length})`);
  if ((message.match(/—/g) || []).length > 0) violations.push("em_dash_present");
  if (exampleLink && !message.includes(exampleLink)) violations.push("example_link_missing_from_body");
  if (!FIRST_PERSON_PATTERN.test(openingSentence(message))) violations.push("opening_missing_first_person");
  const logistics = message.match(LOGISTICS_PATTERN);
  if (logistics) violations.push(`logistics_mentioned(${logistics[0].trim()})`);
  const admission = message.match(ADMISSION_PATTERN);
  if (admission) violations.push(`admission_present(${admission[0].trim().slice(0, 30)})`);
  if (sameShapeStack(message)) violations.push("same_shape_sentence_stack");
  const numbers = ungroundedNumbers(message, profileMarkdown);
  if (numbers.length) violations.push(`ungrounded_numbers(${numbers.join("/")})`);
  return violations;
}

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
    emDash: (m.match(/—/g) || []).length,
    ungroundedNumber: ungroundedNumbers(m, profileMarkdown).length,
    openerNoFirstPerson: FIRST_PERSON_PATTERN.test(openingSentence(m)) ? 0 : 1,
    logisticsMention: LOGISTICS_PATTERN.test(m) ? 1 : 0,
    admissionPresent: ADMISSION_PATTERN.test(m) ? 1 : 0,
    sameShapeStack: sameShapeStack(m) ? 1 : 0,
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
  const j = allJobs.find((job) => job.id === pick.id);
  if (!j) throw new Error(`Picked job ${pick.id} is not in scan-jobs.json — rerun pull-evidence.mjs or fix the pick.`);
  const job = { title: j.title, company: j.company_name, description: j.description };
  const { cachePrefix, tail } = buildParts({ job, contact: pick.contact });
  const content = [
    { type: "text", text: cachePrefix, cache_control: { type: "ephemeral" } },
    { type: "text", text: tail },
  ];
  process.stdout.write(`generating: ${job.company} — ${job.title} ... `);
  const MAX_GEN_ATTEMPTS = Number(process.env.MAX_GEN_ATTEMPTS || 3);
  let msg = "(FAILED)";
  let inserted = null;
  let attempts = 0;
  let violations = [];
  let failed = true;
  for (let attempt = 1; attempt <= MAX_GEN_ATTEMPTS; attempt += 1) {
    attempts = attempt;
    try {
      const resp = await client.messages.create({ model: "claude-opus-4-8", max_tokens: 1024, system, messages: [{ role: "user", content }] });
      const textBlock = resp.content.find((b) => b.type === "text");
      const parsed = textBlock ? extractJson(textBlock.text) : null;
      if (typeof parsed?.message !== "string" || !parsed.message.trim()) {
        throw new Error("model returned no parseable message");
      }
      msg = parsed.message.trim();
      inserted = parsed.insertedExample ?? null;
      failed = false;
      const candidateSelected = matchInsertedWorkExample(inserted, compiledWorkExamples);
      violations = hardRuleViolations(msg, candidateSelected?.link || inserted?.link || null);
      if (violations.length === 0) {
        console.log(`ok (${msg.length} chars${attempt > 1 ? `, attempt ${attempt}` : ""})`);
        break;
      }
      if (attempt < MAX_GEN_ATTEMPTS) {
        process.stdout.write(`retry [${violations.join(", ")}] ... `);
      } else {
        console.log(`ok WITH VIOLATIONS [${violations.join(", ")}] (${msg.length} chars, ${attempt} attempts)`);
      }
    } catch (e) {
      if (attempt < MAX_GEN_ATTEMPTS) {
        process.stdout.write(`retry [${e.message}] ... `);
      } else if (failed) {
        generationFailures += 1;
        console.log(`ERROR ${e.message}`);
      } else {
        console.log(`ok WITH VIOLATIONS [${violations.join(", ")}] (kept attempt ${attempts - 1} result; final attempt: ${e.message})`);
      }
    }
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
    generationAttempts: attempts,
    hardRuleViolations: violations,
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
const emDashTotal = messages.reduce((a, message) => a + message.metrics.emDash, 0);
console.log(`- em dashes: ${emDashTotal} total in ${messages.filter((message) => message.metrics.emDash > 0).length} messages`);
const retried = messages.filter((message) => message.generationAttempts > 1).length;
const unresolved = messages.filter((message) => message.hardRuleViolations.length > 0);
console.log(`- hard-rule retries: ${retried} message(s) needed regeneration`);
console.log(`- unresolved hard-rule violations: ${unresolved.length}${unresolved.length ? " — " + unresolved.map((message) => `${message.company} [${message.hardRuleViolations.join(", ")}]`).join("; ") : ""}`);
console.log(`\nwrote data/corpus-${variant}.json + froze prompt/profile/Work Example audit + updated versions.json`);
