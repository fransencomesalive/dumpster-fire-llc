# Spec Review: Phase 1 Decisions

## Contradictions

- `Pursuit` statuses differ across specs. The database model omits `review_complete`, `offer`, `expired`, and `deleted`; the pursuit workflow requires them. Phase 1 should store the broader pursuit workflow states.
- Saved Jobs are described as free and unlimited, but the database model does not define a Saved Job object. Phase 1 should add `saved_jobs` as a separate object from `pursuits`.
- Public specs say cover letters do not exist, while the ported private scan schema still has `job_search_cover_letters`. Public schema must not add cover-letter objects; the legacy private table remains isolated to `/scans`.
- Onboarding Role Track UX lists fewer fields than the Candidate Profile schema requires. Phase 2 onboarding must collect all schema-required Role Track fields before completion.
- Profile status exists on both `candidate_profiles` and `profile_quality`. Treat `candidate_profiles.status` as the operational gate and `profile_quality` as the diagnostic detail.
- `generatedMarkdown` appears as a string on `CandidateProfile` and as a `GeneratedMarkdown` object in the schema brief. Use `candidate_profiles.generated_markdown` for current output and `profile_versions` for generated timestamp/version history.
- Subscription specs mention version restore as Basic vs Advanced, but do not define the boundary. Phase 1 stores versions only; plan enforcement comes later.

## Missing Implementation Details

- Auth provider choice was not explicitly named. Because the repo already uses Supabase and the database model says to use an existing auth user table if present, Phase 1 assumes Supabase Auth with Google, Apple, and Email providers.
- Resume file storage is not specified. Phase 1 stores `file_url` only; storage provider selection remains open.
- Resume parsing provider and parsing quality evaluator are not specified. Phase 1 stores parser outputs and quality, but does not parse files.
- Quality scoring implementation is not specified. Phase 1 stores quality-scored fields; Phase 2 must define deterministic and/or model-assisted scoring.
- Billing provider, renewal periods, failed-payment webhooks, and plan assignment are not specified. Phase 1 stores plans, subscriptions, and usage ledger only.
- Human Path engine methodology has product requirements but no standalone implementation spec. Phase 1 creates storage for contact suggestions only.
- Job ingestion and dedupe for the public app are not specified. Phase 1 stores normalized public jobs without implementing ingestion.

## Phase 1 Adjustments

- Use Supabase Auth as the assumed auth foundation and reference `auth.users(id)` from public tables.
- Add `saved_jobs` so free saves are structurally separate from metered pursuits.
- Add public foundation tables separately from legacy `job_search_*` private scan tables.
- Use broad pursuit statuses from the pursuit workflow spec.
- Keep profile generation pure and service-level: structured aggregate in, markdown object out.
- Do not implement onboarding UI, profile modal UI, matching, Human Path, outreach, subscription enforcement, or public landing redesign in Phase 1.
