# Phase D — Implementation Handoff (next session)

Date: 2026-06-28
Prepared by: Claude session (design pass)

## Where we are

**Phase D design pass is COMPLETE.** The four new onboarding controls for the redesigned
**Voice & Personality** and **Identity & Search** sections are designed, reviewed with Randall,
and live as cards in the **Onboarding** group of the Claude Design project
("Dumpster Fire Design System", projectId `3af2f1ea-428c-49b3-8b02-c066ec0c7452`):

1. `components/onboarding-tone-chips.html` — Lean into / steer clear chips + 25-word avoid note
2. `components/onboarding-writing-samples.html` — 3 buckets (sounds like me ≥1 / want to / never ≥1),
   1 snippet + optional 2nd only on "sounds like me", 120-word limit + tomato overflow, no sample tags
3. `components/onboarding-pickers.html` — skills/industries (multi) + location (single) type-ahead,
   custom entries everywhere, **teal = saved** tokens
4. `components/onboarding-q1-q4.html` — "In your own words": Q1 + Q4 required, 120-word limit each

All built on the live DS `tokens.css`/`base.css`, verified at 320–1440, no em dashes, helper-next-to-
title, teal = on/saved. **These four cards are the approved design source for implementation.**

**Backend is ready:** generator-redesign spine (Phases A–E) done + tested; A4 migration validated;
D3 catalogue backend (`lib/public-profile/catalogues/*`, `/api/catalogues/{skills,industries,locations}`,
`searchSkills/Industries/Locations`) merged to main + pushed (commit `dc3015c`).

## Next task — START HERE

**Rebuild `app/onboarding/OnboardingClient.tsx` to the new ~7-section IA**, wiring in the four
approved controls + the catalogue routes. This is the one file still red in `tsc` (it uses the old
section shapes). This is app code — a distinct, design-approved implementation effort.

Likely files: `app/onboarding/OnboardingClient.tsx`, `app/onboarding/onboarding.module.css`,
plus read/confirm `lib/public-profile/sections.ts`, `types.ts`, `section-service.ts`.

Build order suggestion: Voice & Personality section (tone chips → writing samples → Q1/Q4),
then Identity & Search pickers wiring to `/api/catalogues/*`. Match the DS cards exactly.

### Carryover requirements (don't lose these)
- **Add a 120-word server-side cap for `q1Value` / `q4Opinion`** in `lib/public-profile/sections.ts`
  (currently uncapped; `countWords` only guards `avoidNote`=25 and writing samples=120). The Q1/Q4
  card shows a "120-word limit" so the server must enforce it. See `docs/phase-d-d0-control-decisions-2026-06-27.md`.
- **Skills picker rides a 58-record SEED** catalogue. Before the skills picker is production-real,
  run a registered Lightcast Open Skills export through
  `scripts/generate-public-profile-skills-catalogue.mjs --input <file>`.
- **ANTHROPIC_API_KEY** still pending from Randall (env only) for voice fingerprint + outreach;
  both degrade gracefully until set.

## Reference docs
- Design decisions (authoritative for the controls): `docs/phase-d-d0-control-decisions-2026-06-27.md`
- Design state / DS rules: `docs/design-state.md`
- Operating protocol: `docs/project-operating-state.md`, `AGENTS.md`

## Design workflow note
DF UI is reviewed on the Claude Design canvas, not local screenshots. To push/update a card:
add `@dsCard group="Onboarding"` (first line) + relative CSS paths, append the card to a local
copy of `_ds_manifest.json`, then one `finalize_plan` + `write_files` pushing both (the app's
self-check does NOT auto-add the card — the manifest edit is required).

## Open housekeeping
- Two docs committed with this handoff: this file + `phase-d-d0-control-decisions-2026-06-27.md`.
- Design cards live only in the Claude Design project (not the git repo) — that's by design.
