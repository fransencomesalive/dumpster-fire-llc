# Generator Redesign — Implementation Plan

Date: 2026-06-26
Status: **APPROVED DESIGN, NOT YET IMPLEMENTED.** Build-ready.
Design source (canonical): `docs/generator-and-inputs-design-2026-06-26.md`.
Companion: `docs/onboarding-redesign-spec-2026-06-26.md` (§1-§3 field/copy mechanics still valid;
§4-§5 superseded by the generator design doc for input architecture).

Goal: rebuild the profile inputs into the lean, generator-aligned ~7-section architecture, make
profile.md powerful via a Claude voice-fingerprint pre-pass, and build the outreach generator.

Build order follows the project rule: **data model first → services/API → UI → AI features.**

## KICK OFF NEXT SESSION HERE → Phase A1 (types.ts refactor)

First concrete action, zero ambiguity: edit `lib/public-profile/types.ts` to the new shapes in
A1 below. Everything else cascades from the types. Before editing, re-run the Session Start
Protocol (`git status`, read this plan + the two design docs).

## Phase A — Data model / schema (UI-independent)

- [x] **A1. `lib/public-profile/types.ts`** — DONE 2026-06-27 (types-only; A2–A5 cascade pending,
  so `tsc`/`build` intentionally red until then). OD1 resolved (Randall): `phrasesToAvoid` dropped;
  replaced by `avoidTags[]` (anti-pattern tone tags, e.g. "LinkedIn malarky", "Corporate Jargon",
  "Biz Formal") + `avoidNote` (≤25-word free text). Voice fields modeled as a `VoicePersonality`
  record (q1Value, q4Opinion, toneTags, avoidTags, avoidNote) rather than loose profile columns.
  - Remove `workAuthorization`, `availability` from `CandidateProfileRecord`. (Comp min/preferred
    already exist — keep.)
  - Remove `WorkHistoryItem` and its references.
  - Replace `ProjectProof` → **`WorkExample`**: `{ id, profileId, title, oneHitter, link?, context,
    createdAt, updatedAt }`. Drop all other legacy proof fields.
  - Rewrite `WritingSample`: replace `sampleType: like|hate` with **`bucket: sounds_like_me |
    want_to_sound | never_sound`**; add `tags: string[]`; keep `text` (≤120 words, enforced in
    validation); drop required `whyItWorksOrFails` (optional or removed).
  - Add **Fit Signals**: `{ goodSignals: string[], poorFitSignals: string[] }` (soft scoring).
  - Add **Voice & Personality** profile fields: `q1Value`, `q4Opinion`, `toneTags: string[]`.
  - Collapse `CommunicationStyleSettings` into `toneTags` + writing samples (decide: drop the
    table, or keep only `phrasesToAvoid` if still wanted — see Open Decisions).
  - Trim `QualitySection`: drop `operating_style`, `communication_style`, `ai_misreadings`,
    `why_people_hire_me` (replaced by Q1/Q4); move `decision_style` → Fit Signals.
- [x] **A2. `lib/public-profile/sections.ts`** — DONE 2026-06-27. sections.ts compiles clean (0 tsc
  errors in-file); downstream (B1 repository/section-service, B3 markdown, B4 quality, A5 fixtures/
  tests, B2 dead routes) still red as planned. New section plumbing: FitSignals (new), WorkExamples
  (was ProofLibrary), VoicePersonality (was CommunicationStyle); WorkHistory section removed; Writing
  Samples now bucket+tags; Identity dropped workAuth/availability; Skills use relatedWorkExampleIds.
  - update validation, allowlists, mappers, and the
  `CandidateProfileAggregate` for every A1 change.
- [x] **A3. `lib/public-profile/onboarding.ts`** — DONE 2026-06-27. Manifest keys now: identitySearch,
  fitSignals, roleTracks, resumes, workExamples, skills, voicePersonality, outreachRules,
  leadershipProfile. Fit Signals is its own data section/route (parenthetical-under-Identity is a UI
  grouping for D). New route paths: fit-signals, work-examples, voice-personality (B2 will add/rename
  the actual route handlers). fitSignals + leadershipProfile required:false; rest required:true
  (B4 owns final completion rules). onboarding.ts compiles clean; consumers (D2 UI, B1) still red.
  - rewrite the manifest to the ~7 sections:
  Identity & Search (+Fit Signals), Role Tracks, Resumes, Work Examples, Skills,
  Voice & Personality, Outreach Rules, Leadership (optional).
- [x] **A4. Migration** in `supabase/migrations/` — DONE (written) 2026-06-27:
  `20260627000100_generator_redesign_profile_schema.sql`. **NOT VERIFIED against a DB** (live-data
  status unknown per Randall; do not run blind). To verify: review SQL, then `supabase db reset`
  (or run against a dev DB) and confirm no errors. OD2 resolved → drop now (defensive if-exists
  guards; preserves mappable rows). Covers: drop work_auth/availability; drop work_history (+joins);
  project_proofs→work_examples (+ skill_work_examples, renamed index/policy); add fit_signals;
  communication_style_settings→voice_personality (recreated); writing_samples sample_type→bucket
  (backfilled like→sounds_like_me / hate→never_sound) + tags, drop why_it_works_or_fails; trim
  quality_scored_text_fields section check to outreach_rules|leadership_profile.
- [~] **A5. Fixtures + tests** — PARTIAL 2026-06-27. `scripts/fixtures/public-profile.ts` rewritten to
  the new aggregate (fitSignals, workExamples, voicePersonality, bucket/tags samples; dropped
  workHistory/projects/communicationStyle/workAuth/availability) and compiles clean. The `scripts/
  test-*` scripts are **B-coupled** — they import `section-service` (`updateLoaded*SectionForUser`)
  and assert profile-quality reasons, so they can't go green until B1/B2/B4. **Rewrite each test
  alongside its phase**: test-public-profile-sections + -service + -repository + -api with B1/B2,
  test-public-profile-generation with B3, quality assertions with B4. Until then they stay red by
  design. Fixtures are the shared A-layer artifact and are done.

## Phase B — Services / API
- [x] B1. `section-service.ts` + `repository.ts` for the new shapes. DONE 2026-06-27; both compile
  clean (0 in-file tsc errors). Removed WorkHistory + ProofLibrary + CommunicationStyle service/
  repo functions; added FitSignals, WorkExamples, VoicePersonality (read/update/persist + row
  mappers + load queries). work_examples uses hard-delete (migration dropped archived_at);
  skill_work_examples join; voice_personality + fit_signals singleton upserts; writing_samples
  bucket/tags; identity persist drops work_auth/availability. Remaining red in `api.ts` (route
  wiring) is **B2**, not B1.
- [x] B2. Routes — DONE 2026-06-27. `api.ts` handler/option/result wiring updated (0 in-file tsc
  errors). Created routes: `work-examples`, `voice-personality`, `fit-signals`. Deleted:
  `proof-library`, `communication-style`, `work-history`, and the 4 dead narrative routes
  (`why-people-hire-me`, `operating-style`, `decision-style`, `ai-misreadings`). The generic
  QualityNarrative handler/service fns are retained (still valid for outreach_rules/leadership_profile,
  used by tests) but no route mounts them anymore. NOTE: stale `.next/types/validator.ts` errors
  reference deleted routes — they regenerate on next build (`.next` is gitignored). Remaining red:
  profile-markdown (B3), profile-quality (B4), OnboardingClient (D2), tests (with their phases).
- [x] B3. `profile-markdown.ts` — DONE 2026-06-27 (0 in-file tsc errors). New structure: **Voice
  Profile slot** (raw voice inputs now; C injects the distilled fingerprint here) → Substance
  (Identity & Search, Fit Signals, Role Tracks, Resumes, Skills, Work Examples one-hitters) →
  Outreach → **Guardrails** (per-track + per-skill do-not-overclaim, never-sound samples) → Profile
  Quality. Dropped work auth/availability, Work History, Projects, the 4 narrative sections, and
  Communication Settings; writing samples now bucketed.
- [ ] B4. `profile-quality.ts` — update binary complete/incomplete rules for the new required set.

## Phase C — Claude voice-fingerprint pre-pass
- [ ] C1. Provision Anthropic API key in env (Randall has it ready).
- [ ] C2. Add Anthropic SDK + `lib/public-profile/voice-fingerprint.ts`: input Q1/Q4/samples/tags →
  output compact Voice Profile (tone description + do/don't + 1-2 exemplar lines). Use the
  `claude-api` reference for model id + call shape; default to the latest Claude model.
- [ ] C3. Wire into profile save → regenerate markdown with the fingerprint at the top.
- [ ] C4. Fixtures/tests for the pre-pass (mock the model in tests).

## Phase D — Onboarding UI (GATED on design direction)
- [ ] D0. Resolve design direction for the lean IA (prior design build was rejected — needs an
  approved design source before any UI edit; see Design Authority in AGENTS.md).
- [ ] D1. Persistent header + sign-in card/button (onboarding-redesign-spec §2).
- [ ] D2. Rebuild the ~7 sections to the new IA, incl. Voice & Personality (Q1/Q4 + 3-bucket
  samples + word counter + tone tags) and Work Examples (4 fields + one-hitter).
- [ ] D3. Catalogue wiring: NA locations (GeoNames), industries (LinkedIn V2), skills (Lightcast).

## Phase E — Outreach generator
- [ ] E1. Generator route: profile.md + job + contact → message; model selects one relevant
  Work Example one-hitter (+ link), obeys Voice Profile + per-track/per-skill do-not-overclaim +
  never-sound-like-this. User can delete the inserted example.

## Open decisions to confirm before/within the relevant phase
- OD1 (A1): Does `CommunicationStyleSettings` fully dissolve into tone tags + samples, or keep
  `phrasesToAvoid` as one explicit field?
- OD2 (A4): RESOLVED 2026-06-27 (Randall) — drop removed columns/tables now (defensive guards).
- OD3 (D0): The onboarding design direction (the still-unresolved rejected-build question).
- OD4 (tone tags): final set is `punchy, warm, funny, blunt, no-fluff, specific, casual, brief`
  unless changed.

## Sequencing notes
- Phases A→B→C are the spine and are mostly UI-independent; they can proceed before D0 is
  resolved. D (UI) is the one blocked on design direction. E depends on B3 + C.
- Slice 1 (terminology/beta/proof copy) already shipped: commit `65037d8`.
