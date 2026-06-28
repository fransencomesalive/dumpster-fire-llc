# Phase D / D0 — New Onboarding Control Decisions

Date: 2026-06-27
Decided with: Randall (collaborative design session, this conversation)
Status: **Design direction locked for the four new controls.** Visual mockups and any
`OnboardingClient.tsx` edits are NOT yet authorized — Design Authority still requires an
approved visual source per control before code (see "Next" at the bottom).

Scope: this doc records the *behavioral/structural* design of the genuinely-new onboarding
controls that have no existing primitive. It does not authorize layout/CSS work on its own.
Backend field shapes referenced here are already implemented (generator-redesign spine A–E).

---

## 1. Voice & Personality section — flow

Five legacy sections collapse into one. **Order = Option B, "inspiration first, original
input second"** (Randall). The priming/inspiration material sits above the blank fields the
user must fill in their own voice, and the section reads as an effort ramp:
tap chips → paste samples you've already written → compose fresh Q1/Q4 answers.

```
Voice & Personality
──────────────────────────────────
  Tone chips      (Lean into / Steer clear)     ← inspiration  (lightest)
  Writing samples (3 bucket fields)             ← inspiration
──────────────────────────────────
  Q1: What are you the person for?   [short answer]   ← original input
  Q4: A take you'll defend?          [short answer]   ← original input
```

Backend requiredness (from `profile-quality.ts`): `voicePersonality` required; `q1Value`
required; `q4Opinion` required; `toneTags` ≥1 required.

**Q1/Q4 word limit (added 2026-06-28):** both fields show a "120-word limit" note + tomato
overflow, matching the writing-sample compose treatment (Randall: keep consistent with the
other text inputs). ⚠️ Backend currently has NO cap on `q1Value`/`q4Opinion` (countWords only
guards `avoidNote`=25 and writing samples=120). **Phase D implementation must add a 120-word
server-side cap for `q1Value`/`q4Opinion`** in `sections.ts`, or the UI limit is cosmetic.

## 2. Tone-tag chips

Two groups of tap-to-toggle chips, custom chips allowed in both via a "+ your own" input.

- **Lean into** (`toneTags`) — **≥1 required.** Preset set:
  `punchy · warm · no-fluff · blunt · funny · specific · casual · brief`.
- **Steer clear** (`avoidTags`) — optional. Preset anti-patterns:
  `corporate jargon · biz-formal · LinkedIn malarky`.
- **"Anything else to avoid?"** (`avoidNote`) — optional free text, **≤25 words**
  (server cap `avoidNoteWordCap = 25`). Kept because it catches the one specific thing
  chips can't, cheaply.

Interaction: tap a preset to toggle on/off; "+ your own" mints a custom chip in that group.
Selected-chip visual (inked-fill vs outline+check) and mobile wrapping → defer to mockup.

## 3. Writing-sample buckets

Three labeled bucket **fields**; each field holds **snippets** (the individual examples).

| Field | Required | Snippets |
|---|---|---|
| Sounds like me | **≥1 required** | 1 by default; optional "+ add one more", **cap 2** |
| Want to sound like | optional | 1 |
| Never sound like | **≥1 required** | 1 |

Backend: `writingSamples.soundsLikeMe` and `writingSamples.neverSound` each require ≥1 with
text (`profile-quality.ts:178-179`); per-snippet cap `writingSampleWordCap = 120` words.

- Snippet = a single textarea + a static "120-word limit" note. **No running counter while
  under the limit.** On overflow, flag in **tomato** (the over-limit note/text turns tomato;
  server rejects on save). Documented fallback if the tomato flag is janky in build: a live
  **`9/120`** counter that turns tomato past the cap.
- **No tags on samples.** (Originally the model carries `tags` per snippet; dropped from the
  UI as redundant with the section-level tone chips. Column left unused.)

Rationale for the lean version (require 1, optional 2nd only on "Sounds like me"): for LLM
voice-matching, value is steep then flat — 0→1 is huge, 1→2 is a modest real gain only for
"sounds like me" (separates consistent voice from a one-off), 2→3 marginal, and 1 "never
sound" example is ~as good as 3. Forcing 3 per field is the "looks like homework" problem.

## 4. Type-ahead catalogue pickers (Identity & Search)

One reusable type-ahead component, two modes, consuming the merged `/api/catalogues/*` routes
(`searchSkills/Industries/Locations`, session-gated, `Cache-Control: no-store`).

| Field | Type | Mode | Catalogue |
|---|---|---|---|
| `location` | `string` | single-select (fills field) | GeoNames cities15000 (US/CA/MX) |
| `targetIndustries` | `string[]` | multi-select (chips) | LinkedIn Industry Taxonomy V2 (434) |
| `skills` | `SkillProfile[]` | multi-select (chips) | Lightcast Open Skills (⚠️ 58 **seed** records) |

Behavior: debounced (~200ms) query → dropdown of `label` results → full keyboard nav
(↑/↓/enter/esc) + click. Single mode fills + shows the chosen value; multi mode adds a
removable `✕` chip and clears the input.

- **Off-catalogue custom entries: ALLOWED everywhere** (Randall). Catalogue matches show
  first; an "Add '___'" row appears when typed text has no exact match. Reason: skills is a
  thin 58-record seed, so catalogue-only would block most real users immediately.
- Dropdown/chip/loading visuals → defer to mockup.

⚠️ Follow-up (not blocking): run a registered Lightcast Open Skills export through
`scripts/generate-public-profile-skills-catalogue.mjs --input <file>` to replace the 58-record
seed before the skills picker is considered production-complete.

---

## Next (still gated)

The collaborative control design (the path Randall chose over "derive from existing DS cards")
is done. Per AGENTS.md Design Authority, before any `OnboardingClient.tsx` / CSS edit:
1. Produce a visual source per control (mockup screenshotted at 320/375/390/1280/1440),
   mapped to the existing onboarding token layer + the closest DS card
   (`forms.html`, `badges.html`, `panel.html`, `copy-generation.html`).
2. Get Randall's explicit approval of that visual source.
3. Only then rebuild `OnboardingClient.tsx` to the new ~7-section IA.

`OnboardingClient.tsx` remains the one file red in `tsc` until that rebuild (it still uses the
old section shapes). No design primitives may be invented without sign-off.
