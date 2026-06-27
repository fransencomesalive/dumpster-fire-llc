# Generator & Inputs Design — making profile.md powerful

Date: 2026-06-26
Status: **DRAFT FOR REFINEMENT WITH RANDALL.** Not approved, nothing implemented.
Purpose: turn the raw profile.md dump into a generation-ready document, and decide exactly how
voice/tone inputs (writing samples + narrative questions) are captured.

This is the crux of the product: the outreach generator is only as good as profile.md, and
profile.md is only as good as the inputs and how they are structured.

## The core reframe

Every input serves one of two axes. Be explicit about which:

- **Substance** — what the user has done and can credibly claim: Role Tracks, resumes, work
  examples, skills, why-people-hire-me, decision/operating style, outreach rules.
- **Voice** — how the user sounds: communication style, writing samples, and (the unlock) the
  *manner* in which they answer everything else.

The current build treats these as separate data and dumps both, flat, into profile.md. Two
moves make it powerful:

1. **Capture voice as a byproduct of substance.** If users answer substance questions *in their
   own casual voice*, every answer is simultaneously a substance input and a voice sample. We
   stop making "tell us your tone" a separate chore.
2. **Distill, don't dump.** profile.md should lead with a compact **voice fingerprint** and a
   clean substance section, not a flat transcript of every field.

## Define the output first (or inputs are guesswork)

We cannot judge which inputs matter until the generator's contract is fixed. Proposed contract:

- **Input:** profile.md + a specific job posting + a specific contact (role/seniority).
- **Output:** one short outreach message that (a) is specifically relevant to that job/contact,
  (b) leads with the user's strongest matching substance, (c) sounds like the user wrote it, and
  (d) obeys the user's do-not-overclaim and phrases-to-avoid guardrails.
- **Prompt shape:** system = "write as this person" + voice fingerprint + hard guardrails;
  context = relevant substance slice (not the whole profile) + the job + the contact.

Once this is fixed, every onboarding field must answer: *does it change the message?* If not,
cut it.

## Answers to the four questions

### Q1. How are writing examples shared and saved? Word limit?
Today: paste `text`, pick like/hate + channel, write a required `whyItWorksOrFails`. No limit.

Recommendations:
- **Cap each sample.** Tone is fully present in a short passage; long pastes dilute signal and
  burn tokens. Propose **~120 words / ~700 characters** per sample, with a live counter and a
  hard stop. (Refine the number together.)
- **Add a "mine vs. admired" flag.** The schema's like/hate misses the most important
  distinction: *did the user write this?* Their own writing = authentic voice to imitate.
  Writing they admire = aspirational target. A "hate" sample = anti-pattern to avoid. Three
  buckets beat two: **Sounds like me / Want to sound like this / Never sound like this.**
- **Channel stays** — tone differs by channel (a DM is not a cover email).

### Q2. Do we need their "why I like it" explanation? Can we leverage tone without it?
**We can leverage tone effectively without it.** A model extracts rhythm, vocabulary, sentence
length, formality, and humor directly from the sample text. The text is the signal.

The "why" adds a *secondary* signal (what the user consciously values), but as a required
free-text field it is high-burden and usually low-quality. Recommendation:
- **Make "why" optional**, and when present, replace the open textarea with **2-3 quick tags**
  (e.g. "punchy", "warm", "no fluff", "specific", "funny"). Tags are easy and machine-usable.
- Net: **sample text required; explanation optional and lightweight.**

### Q3. Is it too much to ask for writing samples AND the 6 questions?
**Yes, if they are treated as separate exercises. No, if they overlap.** The fix is to stop
double-charging the user:
- The 6 questions become **voice samples too** if users answer them casually. So we don't need a
  large separate writing-sample exercise on top.
- Proposed load: **answer the questions casually (voice + substance in one)** + **a small,
  capped writing-sample set** (e.g. 1-2 "sounds like me", 1 "never sound like this") +
  **trimmed communication settings** (keep phrases-to-avoid and length; drop redundant sliders
  the model can infer). That is rich without being a marathon.

### Q4. Better questions to elicit tone/style from the answers?
The current 6 are substance-only and dry, so they yield corporate mush. To make answers reveal
voice, ask **opinionated, story-driven, slightly provocative** prompts people answer *with
personality* — which also serves the anti-corporate-speak brand. Candidates to refine together:
- "What's a work story you'd actually tell at dinner?"
- "What kind of work makes you roll your eyes?"
- "Describe a time you were the only one who saw the problem."
- "What's an opinion about your field you'll defend?"
- "What were you the 'unreasonable' one about, in a good way?"
- "What do people thank you for after the project ships?"

Each yields substance *and* a voice sample. We can keep the strongest 1-2 original substance
questions and replace the dry ones with these. (The original six are recorded in
`docs/onboarding-redesign-spec-2026-06-26.md` §5.)

## profile.md, restructured to be powerful

Stop emitting a flat transcript. Target structure:

1. **Voice fingerprint (top, compact).** A short distilled directive: tone, do/don't phrases,
   length, 1-2 short exemplar lines in the user's own words. Optionally produced by a
   pre-pass that summarizes samples + casual answers into a tight "write like this" block.
2. **Substance, sliced and labeled.** Role Tracks, work examples, skills, why-people-hire-me —
   tagged so the generator can pull only the slice relevant to a given job.
3. **Hard guardrails.** do-not-overclaim, phrases-to-avoid, never-sound-like-this.

A pre-pass that distills voice into a fingerprint is the single biggest lever for "powerful":
it converts scattered raw fields into one high-signal instruction the generator obeys.

## Stepped process (the build sequence)

- **Step 1 — Fix the generator contract** (output, prompt shape, what a message must do). Above,
  to be ratified.
- **Step 2 — Input taxonomy + field audit.** Tag every onboarding field substance / voice /
  both / cut. Cut anything that does not change the message.
- **Step 3 — Voice capture redesign.** Writing-sample mechanics (cap, three buckets, optional
  tag-based "why"); trim communication settings; instruct casual answers everywhere.
- **Step 4 — Question redesign.** Replace dry substance questions with opinionated prompts that
  double as voice; keep the strongest substance ones.
- **Step 5 — profile.md restructure.** Voice fingerprint pre-pass + sliced substance + guardrails
  in `lib/public-profile/profile-markdown.ts`.
- **Step 6 — Build the generator + prompt.** Implement against the Step 1 contract. Validate each
  retained field by ablation: does removing it change the output? Prune the ones that don't.
- **Step 7 — Quality loop.** Wire profile quality + sample/answer richness into a readiness
  signal; iterate prompts on real outputs.

## Decisions (Randall, 2026-06-26)
- **Spine: ADOPTED** — voice as a byproduct of casual answers + distilled voice fingerprint at
  the top of profile.md is the organizing principle for all 7 steps.
- **O2: RESOLVED — three buckets** on each writing sample: "Sounds like me" / "Want to sound
  like this" / "Never sound like this." (Replaces like/hate.)
- **O3: RESOLVED — optional tags** replace the required free-text "why" (tag set TBD, see O3a).
- **O5: RESOLVED — build the LLM voice-fingerprint pre-pass now** (distillation at save time).
  Implies standing up model wiring as part of this work.

Still open:
- O1: Per-sample word cap number (proposing ~120 words / ~700 chars).
- O3a: The optional tag set (proposing: punchy, warm, no-fluff, specific, funny, blunt).
- O4: Final question set — how many, which originals survive, which new prompts.
- O6: Where the generator/pre-pass runs — new public route vs. extend existing.
- O7: Sequencing vs. the approved onboarding-redesign slices.
- **O8 (NEW): LLM provider/model.** The existing LLM calls live in legacy `/scans` and use
  **OpenAI**. The new voice-fingerprint pre-pass + generator can match OpenAI for consistency, or
  use **Anthropic Claude** (recommended default for new AI features). Needs Randall's call +
  whichever API key/env is provisioned.

## Target onboarding input architecture (Randall: align inputs with the generator, not the legacy page)

The legacy profile setup has **14 sections** — far too much. Final inputs must serve exactly two
jobs: **matching** (rating jobs to the user) and **the outreach generator** (substance + voice).
Audit every current section against that; cut or merge anything else. Provider for AI features:
**Anthropic Claude**.

### Audit of the current 14 sections
| # | Current section | Serves | Disposition |
|---|---|---|---|
| 1 | Identity & Search | Matching | **KEEP, trim** — NA location picker, comp min→preferred, employment dropdown, industries catalogue; drop work auth + availability. |
| 2 | Role Tracks | Matching + outreach angle | **KEEP** — add plain explanation. The lanes + signals + do-not-overclaim. |
| 3 | Resumes | Substance source | **KEEP** — the source of experience and most skills. |
| 4 | Work History | — | **CUT** — pulled from resumes (already decided). |
| 5 | Proof Library | Outreach substance | **KEEP as Work Examples** — text-only portfolio, outreach context. |
| 6 | Skills Inventory | Matching | **KEEP, trim** — autocomplete; lean on resume-parsed skills to avoid duplicate entry. |
| 7 | Why People Hire Me | Substance + voice | **MERGE → Voice & Personality** — becomes opinionated casual questions. |
| 8 | Operating Style | Voice | **MERGE → Voice & Personality.** |
| 9 | Decision Style | Matching (fit/flags) | **RELOCATE → Fit Signals** (with Search/Role Tracks). This is matching substance, not voice — do not lose it. |
| 10 | Communication Style | Voice | **MERGE → Voice & Personality**, trimmed (keep phrases-to-avoid, phrases-that-sound-like-me, length; drop redundant sliders). |
| 11 | Writing Samples | Voice | **MERGE → Voice & Personality** — three buckets + optional tags + word cap. |
| 12 | AI Misreadings | Guardrails | **MERGE → Voice & Personality** guardrails (never-sound-like-this, do-not-overclaim, language that misrepresents). |
| 13 | Outreach Rules | Outreach | **KEEP, trim** — per-persona approach + follow-up + link routing. |
| 14 | Leadership Profile | Optional | **KEEP optional.** |

### Proposed final input set (14 → ~7)
1. **Identity & Search** (matching basics) — incl. **Fit Signals** (relocated Decision Style:
   what makes a role a yes/no, red/green flags) **+ anti-fit** (from cut Q3).
2. **Role Tracks** (credible lanes + targeting + overclaim limits).
3. **Resumes** (experience + skills source).
4. **Work Examples** (text-only outreach portfolio). **Each example carries a punchy one-hitter
   metric/fact + a link.** Generator inserts **one relevant example per message, user-deletable.**
   This is the primary substance-injection mechanism for outreach.
5. **Skills** (trimmed; autocomplete; seeded from resume parse).
6. **Voice & Personality** (the consolidation, replacing 5 legacy sections):
   - Opinionated questions answered **casually** → substance + voice in one.
   - Writing samples → three buckets + optional tags + word cap.
   - Minimal tone settings → phrases-that-sound-like-me, phrases-to-avoid, length.
   - Guardrails → never-sound-like-this, do-not-overclaim, language that misrepresents me.
7. **Outreach Rules** (trimmed) + **Leadership Profile** (optional).

The 5-section personality cluster (7, 8, 10, 11, 12) collapses into **one** Voice & Personality
section. This is the largest single reduction and the one most aligned with the generator.

## Voice & Personality — final input set (examine BEFORE writing the model)

Counting sections hid the real burden. The legacy voice cluster is **~16 free-text prompts** +
settings + samples:
- Why People Hire Me: 6 questions
- Operating Style: 5 questions
- AI Misreadings: 5 questions
- Communication Style: tone, formality, humor, length, greetings, signoffs, phrases-to-avoid,
  phrases-that-sound-like-me
- Writing Samples

That is the thing to cut. Each retained question must earn its place by changing the outreach
message, and should elicit **voice + substance in one** when answered casually.

### LOCKED final Voice & Personality set (Randall, 2026-06-26)
Two questions only:
- **Q1 — Value:** "What do people come to you for — what are you *the person* for?" (message lead.)
- **Q4 — Opinion (KEPT as a real hook):** "What's a take about your field you'll defend?" The
  model may use this as a POV-led intro ingredient, not voice-only. (Worth the risk for a
  differentiated, anti-corporate intro.)

Writing samples (per-sample cap, minimum two):
- Min **1 "Sounds like me"** (≤120 words) + **1 "Never sound like this"** (≤120 words);
  optional "Want to sound like this." Optional tone tags per sample.

Tone tags (replace the abstract length slider — too vague for users):
- User picks from **punchy, warm, no-fluff, blunt, funny, specific, brief, conversational**
  (set TBD). Triple duty: user self-selection + feedback tool + extra model-certainty signal.
  Same tags tag individual writing samples. "brief" carries length.

### CUT (and where their value went)
- **Q2 (proud story) → Work Examples.** Redundant with portfolio. Instead, each Work Example
  carries a **punchy one-hitter metric/fact + a link**; the generator **inserts one relevant
  example per message, user-deletable**. More reliable substance injection than a free story.
- **Q3 (anti-fit) → Fit Signals (matching).** The eye-roll content can't drive an *intro* (it
  assumes the manager/role/culture); its only use is fit-filtering, which is matching, not the
  generator. Anti-fit lives in Fit Signals next to relocated Decision Style.
- **G1 (global guardrail) → CUT.** Redundant with per-Role-Track + per-Skill `doNotOverclaim`
  and "Never sound like this."

### The real ask, before vs after
- Before: ~16 questions + 8 settings + open-ended samples.
- After: **2 questions + 2-3 capped samples + a few tone tags.**

Word cap proposed at **120 words / ~700 chars** per sample (O1, treat as accepted unless changed).

## Build-ready field specs (proposed; refine the few forks)

### Work Examples (replaces ProjectProof; text-only; the outreach-injection mechanism)
Drastically trimmed from the legacy 10-field proof object. Final fields (4):
- `title` — what it is.
- `oneHitter` — the punchy insertable metric/fact ("Cut onboarding time 40% in two quarters").
- `link` (optional) — URL to link in the message.
- `context` — 1-2 lines on what it was, for the model's understanding (not necessarily inserted).

No relevance tagging — **the model decides which example to use from context** (generator gets all
examples + the job and picks the relevant one). Drop everything else from the legacy proof object
(whatThisProves, capabilities, responsibilities/experience supported, industries, bestUsedFor,
avoidUsingFor, metricsResults, caveats, confidence). Generator behavior: per message, the model
selects one relevant example, inserts its `oneHitter` (+ `link`); user can delete it from the draft.

### Fit Signals (relocated Decision Style + anti-fit; soft scoring only, no hard filters)
Consolidates 6 legacy decision-style fields into two soft-signal lists:
- `goodSignals[]` — raise the fit score (green flags).
- `poorFitSignals[]` — lower the fit score (formerly "dealbreakers" + anti-fit eye-roll content).

**No hard filters / no exclusion.** Dealbreakers are reclassified as poor-fit *score
contributors*, not gates. Jobs that trip them **still appear**, rated lower, with the poor-fit
signal shown as context.

**Matching philosophy (Randall, 2026-06-26):** rate every job on a *spectrum* and surface
poor-fit context — do not filter candidates into a sterile bubble of perfect matches. Seeing
what's out there, including companies showing bad signals, is valuable. This is consistent with
the existing homepage guardrail "No hiding weak-fit or excluded roles without explanation."
Lives with Search/Role Tracks. Feeds job rating, never the outreach message.

### Tone tags (final set — pick up to ~3)
`punchy, warm, funny, blunt, no-fluff, specific, casual, brief`. User-facing tone tool + sample
tags + model-certainty signal.

### Voice & Personality fields (stored)
- `q1Value` (text), `q4Opinion` (text).
- `writingSamples[]`: `{ bucket: sounds_like_me | want_to_sound | never_sound, text (≤120 words),
  tags[] }`. Min 1 `sounds_like_me` + 1 `never_sound`.
- `toneTags[]`.

### Voice-fingerprint pre-pass (Claude)
- Trigger: profile save, when voice inputs change.
- Input: `q1Value`, `q4Opinion`, `writingSamples`, `toneTags`.
- Output: a compact **Voice Profile** block — 2-3 sentence tone description + do-list + don't-list
  + 1-2 exemplar lines lifted from `sounds_like_me` samples.
- Stored at the top of `generatedMarkdown` (profile.md). Model: latest Claude (use `claude-api`
  reference at wiring time).

### profile.md target structure
1. **Voice Profile** (the fingerprint).
2. **Substance:** Identity/Search + Fit Signals · Role Tracks · Resume summary · Skills ·
   Work Examples (with one-hitters).
3. **Guardrails:** per-track/per-skill do-not-overclaim · never-sound-like-this.

## Generator contract — for ratification (Step 1)
- **Input:** profile.md + one job posting + one contact (role/seniority).
- **Output:** one short outreach message that is specifically relevant, leads with the strongest
  matching substance, sounds like the user, and obeys do-not-overclaim + phrases-to-avoid.
- **Prompt shape:** system = "write as this person" + voice fingerprint + hard guardrails;
  context = the relevant substance slice + the job + the contact (not the whole profile).
- **Pre-pass:** at profile save, an LLM distills samples + casual answers into the voice
  fingerprint block stored at the top of profile.md.
