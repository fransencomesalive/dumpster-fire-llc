# Current State

## 2026-06-24 - Mid-century design system (in progress)

Building a mid-century-mod reskin of the `/scans` dashboard as a synced Claude Design system, in `design-system/` (repo root, never ships).

**RESUME HERE (next step):** Compose the **full scan-page mock** — assemble the section header + panels + a stack of match cards into the real page layout (in `design-system/`), screenshot at mobile + desktop, sync to Claude Design. *Then* port the finalized tokens + component CSS into the live `app/scans/scans.module.css` and verify the gated page. (Decide first: keep building any remaining surfaces, or go straight to the page mock.)

State:
- Foundations (color, type, texture) + components (match card, panel, login, badges, forms) all built, screenshotted mobile+desktop, and synced to the "Dumpster Fire Design System" project on claude.ai/design. Committed + pushed (`edac2c3`).
- Component class names mirror `app/scans/DashboardClient.tsx` so CSS ports back ~1:1.
- Full design context, locked conventions, and gotchas live in Claude auto-memory: `project_dumpster_fire_design_system.md`.
- Workspace is additive/isolated; the in-progress `/scans` public migration in the working tree is untouched and still uncommitted.

## 2026-06-23 - Resume Uploads onboarding form

Expanded the live onboarding shell to cover the next required structured section.

Implemented:
- `/onboarding` now loads Resume Uploads alongside Identity/Search and Role Tracks after bootstrap.
- Added authenticated Resume Uploads add/edit/remove/save UI in `app/onboarding/OnboardingClient.tsx`.
- Added parser quality, parsed text, strengths/gaps/use/avoid/parsing issue fields.
- Added Role Track attachment checkboxes that use active Role Track IDs.
- Documented that actual file upload plumbing remains blocked on the storage/provider decision; the current form stores the parsed resume record.

Validated:
- `npx tsc --noEmit --incremental false`

Next:
- Add Work History review/editing to the onboarding shell.

## 2026-06-23 - Deployment env and Role Tracks onboarding

Continued the public onboarding implementation after the live Supabase bootstrap path was verified.

Implemented:
- Synced required Supabase runtime variables into Vercel for Production, Preview, and Development without printing secret values.
- Verified Vercel now lists the public Supabase variables as encrypted project env vars.
- Deployed the current app to Vercel production.
- Expanded `/onboarding` to load both Identity/Search and Role Tracks after bootstrap.
- Added authenticated Role Tracks add/edit/remove/save UI in `app/onboarding/OnboardingClient.tsx`.
- Added repeatable Role Track editor layout styles in `app/onboarding/onboarding.module.css`.
- Added reload/sign-out controls for the live onboarding session.

Validated:
- `npx tsc --noEmit --incremental false`
- `npm run build`
- `npm run lint`
- Production smoke test with a temporary Supabase user: `GET /onboarding`, `POST /api/public-profile/bootstrap`, and `GET /api/public-profile/role-tracks`; user cleanup returned `200`.

Next:
- Add Resume Uploads to the editable onboarding shell.
- Run the full validation chain after the next onboarding slice.

## 2026-06-23 - Supabase config and onboarding shell

Started both post-autosave tracks: Supabase migration setup and onboarding UI shell.

Implemented:
- Initialized Supabase CLI metadata in `supabase/config.toml`.
- Disabled empty seed loading in local Supabase config.
- Added authenticated candidate profile bootstrap endpoint at `app/api/public-profile/bootstrap/route.ts`.
- Added public profile onboarding section manifest in `lib/public-profile/onboarding.ts`.
- Added browser-safe public profile API request helper in `lib/public-profile/client.ts`.
- Added `/onboarding` route shell in `app/onboarding/page.tsx`.
- Added first editable onboarding client form for Identity/Search in `app/onboarding/OnboardingClient.tsx`.
- Added onboarding route styles in `app/onboarding/onboarding.module.css`.
- Added public home link to `/onboarding` in `app/page.tsx`.
- Fixed `createPublicProfileRepositoryRequest` so empty successful PostgREST responses do not throw JSON parse errors.

Supabase status:
- Linked the repo to Supabase project `job-search` / `ngftlvlslhjsyjcbuuwv`.
- Applied `supabase/migrations/20260623000100_public_foundation_schema.sql` to the remote project.
- Fixed the migration before applying by quoting the Postgres keyword column `"current_role"` in `work_history_items`.
- Verified the migration is recorded remotely with `supabase migration list`.
- Retrieved Supabase anon/service keys through the CLI and populated local `.env.local` without printing secrets.
- Set local `SUPABASE_AUTH_EMAIL_ENABLED=true`.
- Verified live Supabase Auth with a temporary email/password user and deleted the user afterward.
- Verified live local public API path with a temporary Supabase user: `POST /api/public-profile/bootstrap` then `GET /api/public-profile/identity-search`, followed by user cleanup.

Next manual setup:
- Add required Supabase env vars to the deployment.
- Continue editable onboarding forms beyond Identity/Search.

## 2026-06-23 - Leadership Profile autosave route

Completed the optional Leadership Profile section-level profile autosave endpoint.

Implemented:
- `LeadershipProfileSection` modeling, parsing, normalization, and aggregate application in `lib/public-profile/sections.ts`.
- Leadership Profile read/update orchestration in `lib/public-profile/section-service.ts`.
- `persistLeadershipProfileSection` in `lib/public-profile/repository.ts`.
- `handleLeadershipProfileSectionGetRequest` and `handleLeadershipProfileSectionPatchRequest` in `lib/public-profile/api.ts`.
- `app/api/public-profile/leadership-profile/route.ts` exposes authenticated `GET` and `PATCH` endpoints.
- Fixture-backed coverage in `scripts/test-public-profile-sections.mjs`, `scripts/test-public-profile-repository.mjs`, and `scripts/test-public-profile-api.mjs`.

Behavior:
- `GET /api/public-profile/leadership-profile` returns the visibility toggle, optional leadership quality fields, and profile quality summary.
- `PATCH /api/public-profile/leadership-profile` accepts full `visible` plus `fields` replacement and returns the normalized saved section plus profile quality summary.
- Leadership Profile remains optional and does not block binary profile completion.
- Leadership longform fields are allowed under `leadership_profile` without making them required.

## 2026-06-23 - Outreach Rules autosave route

Completed the Outreach Rules section-level profile autosave endpoint.

Implemented:
- `OutreachRulesSection` modeling, parsing, normalization, Role Track relationship validation, and aggregate application in `lib/public-profile/sections.ts`.
- Outreach Rules read/update orchestration in `lib/public-profile/section-service.ts`.
- `persistOutreachRulesSection` in `lib/public-profile/repository.ts`.
- `handleOutreachRulesSectionGetRequest` and `handleOutreachRulesSectionPatchRequest` in `lib/public-profile/api.ts`.
- `app/api/public-profile/outreach-rules/route.ts` exposes authenticated `GET` and `PATCH` endpoints.
- Fixture-backed coverage in `scripts/test-public-profile-sections.mjs`, `scripts/test-public-profile-repository.mjs`, and `scripts/test-public-profile-api.mjs`.

Behavior:
- `GET /api/public-profile/outreach-rules` returns global/follow-up/link-selection settings, contact-approach quality fields, Role Track-specific rules, and profile quality summary.
- `PATCH /api/public-profile/outreach-rules` accepts full `settings`, `fields`, and `roleTrackSpecificRules` replacement and returns the normalized saved section plus profile quality summary.
- Role Track-specific rules validate `roleTrackId` against active Role Tracks before persistence.
- Missing outreach settings or weak/missing contact approach fields re-evaluate the whole profile to `incomplete`.

## 2026-06-23 - Writing Samples autosave route

Completed the Writing Samples section-level profile autosave endpoint.

Implemented:
- `WritingSamplesSection` modeling, parsing, normalization, and aggregate application in `lib/public-profile/sections.ts`.
- Writing Samples read/update orchestration in `lib/public-profile/section-service.ts`.
- `persistWritingSamplesSection` in `lib/public-profile/repository.ts`.
- `handleWritingSamplesSectionGetRequest` and `handleWritingSamplesSectionPatchRequest` in `lib/public-profile/api.ts`.
- `app/api/public-profile/writing-samples/route.ts` exposes authenticated `GET` and `PATCH` endpoints.
- Fixture-backed coverage in `scripts/test-public-profile-sections.mjs`, `scripts/test-public-profile-repository.mjs`, and `scripts/test-public-profile-api.mjs`.

Behavior:
- `GET /api/public-profile/writing-samples` returns normalized liked/hated writing samples plus profile quality summary.
- `PATCH /api/public-profile/writing-samples` accepts a full `writingSamples` array replacement and returns the normalized saved section plus profile quality summary.
- Missing liked or hated samples re-evaluate the whole profile to `incomplete`.

## 2026-06-23 - Communication Style and AI Misreadings autosave routes

Completed the next profile autosave slice after the first narrative routes.

Implemented:
- `CommunicationStyleSection` modeling, parsing, normalization, and aggregate application in `lib/public-profile/sections.ts`.
- Communication Style read/update orchestration in `lib/public-profile/section-service.ts`.
- `persistCommunicationStyleSection` in `lib/public-profile/repository.ts`.
- `handleCommunicationStyleSectionGetRequest` and `handleCommunicationStyleSectionPatchRequest` in `lib/public-profile/api.ts`.
- `app/api/public-profile/communication-style/route.ts` exposes authenticated `GET` and `PATCH` endpoints.
- `app/api/public-profile/ai-misreadings/route.ts` reuses the quality-scored narrative handler for authenticated `GET` and `PATCH` endpoints.
- Fixture-backed coverage in `scripts/test-public-profile-sections.mjs`, `scripts/test-public-profile-repository.mjs`, and `scripts/test-public-profile-api.mjs`.

Behavior:
- `GET /api/public-profile/communication-style` returns settings, voice quality-scored fields, and profile quality summary.
- `PATCH /api/public-profile/communication-style` accepts full `settings` plus `fields` replacement and returns the normalized saved section plus profile quality summary.
- `GET /api/public-profile/ai-misreadings` and `PATCH /api/public-profile/ai-misreadings` reuse the full-section quality-scored narrative replacement behavior.
- Communication settings and quality-scored text updates re-evaluate binary profile completion.

## 2026-06-23 - Quality-scored narrative autosave routes

Completed shared quality-scored narrative autosave support for the first three narrative onboarding sections.

Implemented:
- `QualityNarrativeSection` modeling, parsing, normalization, and aggregate application in `lib/public-profile/sections.ts`.
- Required quality-field truth is exported from `lib/public-profile/profile-quality.ts` and reused by narrative validation.
- Quality-scored narrative read/update orchestration in `lib/public-profile/section-service.ts`.
- `persistQualityNarrativeSection` in `lib/public-profile/repository.ts`.
- `handleQualityNarrativeSectionGetRequest` and `handleQualityNarrativeSectionPatchRequest` in `lib/public-profile/api.ts`.
- `app/api/public-profile/why-people-hire-me/route.ts`, `app/api/public-profile/operating-style/route.ts`, and `app/api/public-profile/decision-style/route.ts` expose authenticated `GET` and `PATCH` endpoints.
- Fixture-backed coverage in `scripts/test-public-profile-sections.mjs`, `scripts/test-public-profile-repository.mjs`, and `scripts/test-public-profile-api.mjs`.

Behavior:
- `GET /api/public-profile/why-people-hire-me`, `GET /api/public-profile/operating-style`, and `GET /api/public-profile/decision-style` return the normalized narrative section plus profile quality summary.
- `PATCH` on those routes accepts a full `fields` array replacement for that section and returns the normalized saved section plus profile quality summary.
- Payload field keys are validated against the required quality-field map for the requested section.
- Blank required values or `weak` quality re-evaluate the whole profile to `incomplete`.
- Persistence replaces only the targeted `quality_scored_text_fields` section, then upserts `profile_quality`.

Validated:
- `node scripts/test-public-auth-session.mjs && node scripts/test-public-profile-api.mjs && node scripts/test-public-profile-sections.mjs && node scripts/test-public-profile-service.mjs && node scripts/test-public-profile-repository.mjs && node scripts/test-public-profile-generation.mjs && node scripts/test-public-profile-quality.mjs && node scripts/test-public-profile-markdown.mjs && npx tsc --noEmit --incremental false`

## 2026-06-23 - Skills Inventory autosave route

Completed the sixth section-level profile autosave endpoint.

Implemented:
- `SkillsInventorySection` modeling, parsing, normalization, relationship validation, and aggregate application in `lib/public-profile/sections.ts`.
- Skills Inventory read/update orchestration in `lib/public-profile/section-service.ts`.
- `persistSkillsInventorySection` in `lib/public-profile/repository.ts`.
- `handleSkillsInventorySectionGetRequest` and `handleSkillsInventorySectionPatchRequest` in `lib/public-profile/api.ts`.
- `app/api/public-profile/skills/route.ts` exposes authenticated `GET` and `PATCH` endpoints.
- Fixture-backed Skills Inventory coverage in `scripts/test-public-profile-sections.mjs`, `scripts/test-public-profile-repository.mjs`, and `scripts/test-public-profile-api.mjs`.

Route contract:
- `GET /api/public-profile/skills` returns normalized Skills Inventory plus profile quality summary.
- `PATCH /api/public-profile/skills` accepts a full `skills` array replacement and returns the normalized saved section plus profile quality summary.
- Both endpoints require `Authorization: Bearer <supabase-access-token>`.
- Invalid payloads return `400`.
- Missing profile returns `404`.
- Missing/invalid auth returns `401`.
- Missing server config returns `503`.

Important behavior:
- PATCH validates `relatedProjectIds` against active proof objects and `relatedWorkHistoryIds` against active work history items before persistence.
- Repository persistence upserts active skills, deletes omitted skills because the launch schema has no `archived_at` column for `skill_profiles`, rewrites skill-to-proof and skill-to-work-history joins, and upserts `profile_quality`.
- PATCH does not regenerate markdown or create a profile version.

## 2026-06-23 - Proof Library autosave route

Completed the fifth section-level profile autosave endpoint.

Implemented:
- `ProofLibrarySection` modeling, parsing, normalization, and aggregate application in `lib/public-profile/sections.ts`.
- Proof Library read/update orchestration in `lib/public-profile/section-service.ts`.
- `persistProofLibrarySection` in `lib/public-profile/repository.ts`.
- `handleProofLibrarySectionGetRequest` and `handleProofLibrarySectionPatchRequest` in `lib/public-profile/api.ts`.
- `app/api/public-profile/proof-library/route.ts` exposes authenticated `GET` and `PATCH` endpoints.
- Fixture-backed Proof Library coverage in `scripts/test-public-profile-sections.mjs`, `scripts/test-public-profile-repository.mjs`, and `scripts/test-public-profile-api.mjs`.

Route contract:
- `GET /api/public-profile/proof-library` returns normalized Proof Library projects plus profile quality summary.
- `PATCH /api/public-profile/proof-library` accepts a full `projects` array replacement and returns the normalized saved section plus profile quality summary.
- Both endpoints require `Authorization: Bearer <supabase-access-token>`.
- Invalid payloads return `400`.
- Missing profile returns `404`.
- Missing/invalid auth returns `401`.
- Missing server config returns `503`.

Important behavior:
- PATCH persists `project_proofs` only; launch schema intentionally does not attach proof objects directly to Role Tracks.
- Repository persistence upserts active proof objects, archives omitted active proof objects, and upserts `profile_quality`.
- PATCH does not regenerate markdown or create a profile version.

## 2026-06-23 - Work History autosave route

Completed the fourth section-level profile autosave endpoint.

Implemented:
- `WorkHistorySection` modeling, parsing, normalization, attachment validation, and aggregate application in `lib/public-profile/sections.ts`.
- Work History read/update orchestration in `lib/public-profile/section-service.ts`.
- `persistWorkHistorySection` in `lib/public-profile/repository.ts`.
- `handleWorkHistorySectionGetRequest` and `handleWorkHistorySectionPatchRequest` in `lib/public-profile/api.ts`.
- `app/api/public-profile/work-history/route.ts` exposes authenticated `GET` and `PATCH` endpoints.
- Fixture-backed Work History coverage in `scripts/test-public-profile-sections.mjs`, `scripts/test-public-profile-repository.mjs`, and `scripts/test-public-profile-api.mjs`.

Route contract:
- `GET /api/public-profile/work-history` returns normalized Work History plus profile quality summary.
- `PATCH /api/public-profile/work-history` accepts a full `workHistory` array replacement and returns the normalized saved section plus profile quality summary.
- Both endpoints require `Authorization: Bearer <supabase-access-token>`.
- Invalid payloads return `400`.
- Missing profile returns `404`.
- Missing/invalid auth returns `401`.
- Missing server config returns `503`.

Important behavior:
- PATCH validates `associatedResumeIds` against active resumes before persistence.
- Repository persistence upserts active work history rows, deletes omitted work history rows because the launch schema has no `archived_at` column for `work_history_items`, rewrites current work-history-to-resume associations, and upserts `profile_quality`.
- PATCH does not regenerate markdown or create a profile version.

## 2026-06-23 - Resume Uploads autosave route

Completed the third section-level profile autosave endpoint.

Implemented:
- `ResumeUploadsSection` modeling, parsing, normalization, attachment validation, and aggregate application in `lib/public-profile/sections.ts`.
- Resume Uploads read/update orchestration in `lib/public-profile/section-service.ts`.
- `persistResumeUploadsSection` in `lib/public-profile/repository.ts`.
- `handleResumeUploadsSectionGetRequest` and `handleResumeUploadsSectionPatchRequest` in `lib/public-profile/api.ts`.
- `app/api/public-profile/resumes/route.ts` exposes authenticated `GET` and `PATCH` endpoints.
- Fixture-backed Resume Uploads coverage in `scripts/test-public-profile-sections.mjs`, `scripts/test-public-profile-repository.mjs`, and `scripts/test-public-profile-api.mjs`.

Route contract:
- `GET /api/public-profile/resumes` returns normalized Resume Uploads plus profile quality summary.
- `PATCH /api/public-profile/resumes` accepts a full `resumes` array replacement and returns the normalized saved section plus profile quality summary.
- Both endpoints require `Authorization: Bearer <supabase-access-token>`.
- Invalid payloads return `400`.
- Missing profile returns `404`.
- Missing/invalid auth returns `401`.
- Missing server config returns `503`.

Important behavior:
- PATCH validates `associatedRoleTrackIds` against active Role Tracks before persistence.
- Repository persistence upserts active resumes, archives omitted active resumes, rewrites current resume-to-role-track associations for active resumes, and upserts `profile_quality`.
- PATCH does not regenerate markdown or create a profile version.

## 2026-06-23 - Role Tracks autosave route

Completed the second section-level profile autosave endpoint.

Implemented:
- `RoleTracksSection` modeling, parsing, normalization, and aggregate application in `lib/public-profile/sections.ts`.
- Role Tracks read/update orchestration in `lib/public-profile/section-service.ts`.
- `persistRoleTracksSection` in `lib/public-profile/repository.ts`.
- `handleRoleTracksSectionGetRequest` and `handleRoleTracksSectionPatchRequest` in `lib/public-profile/api.ts`.
- `app/api/public-profile/role-tracks/route.ts` exposes authenticated `GET` and `PATCH` endpoints.
- Fixture-backed Role Tracks coverage in `scripts/test-public-profile-sections.mjs`, `scripts/test-public-profile-repository.mjs`, and `scripts/test-public-profile-api.mjs`.

Route contract:
- `GET /api/public-profile/role-tracks` returns normalized Role Tracks plus profile quality summary.
- `PATCH /api/public-profile/role-tracks` accepts a full `roleTracks` array replacement and returns the normalized saved section plus profile quality summary.
- Both endpoints require `Authorization: Bearer <supabase-access-token>`.
- Invalid payloads return `400`.
- Missing profile returns `404`.
- Missing/invalid auth returns `401`.
- Missing server config returns `503`.

Important behavior:
- PATCH uses full-section replacement semantics in the service result.
- Repository persistence upserts active Role Tracks, archives omitted active tracks, rewrites current resume associations for active tracks, and upserts `profile_quality`.
- PATCH does not regenerate markdown or create a profile version.

## 2026-06-23 - Shared public profile fixture

Added `scripts/fixtures/public-profile.ts` with a complete candidate profile aggregate factory and shared required quality-field helper.

Purpose:
- Stop duplicating large complete-profile objects across section tests.
- Provide a stable local seed shape for Role Tracks, Resume, Proof Library, and future section service tests.
- Keep fixture data out of production code while staying typechecked with the repo.

## 2026-06-23 - Identity/Search autosave route

Completed the first section-level profile autosave endpoint.

Implemented:
- `persistIdentitySearchSection` in `lib/public-profile/repository.ts` writes `candidate_profiles`, upserts `candidate_profile_preferences`, and upserts `profile_quality`.
- `handleIdentitySearchSectionGetRequest` and `handleIdentitySearchSectionPatchRequest` in `lib/public-profile/api.ts`.
- `app/api/public-profile/identity-search/route.ts` exposes authenticated `GET` and `PATCH` endpoints for the first onboarding section.
- `scripts/test-public-profile-repository.mjs` now verifies Identity/Search persistence write order, snake_case row shape, and upsert headers.
- `scripts/test-public-profile-api.mjs` now verifies Identity/Search found, missing, validation-error, and updated HTTP paths.

Route contract:
- `GET /api/public-profile/identity-search` returns the normalized Identity/Search section plus profile quality summary.
- `PATCH /api/public-profile/identity-search` accepts partial section updates and returns the normalized saved section plus profile quality summary.
- Both endpoints require `Authorization: Bearer <supabase-access-token>`.
- Invalid payloads return `400`.
- Missing profile returns `404`.
- Missing/invalid auth returns `401`.
- Missing server config returns `503`.

Important behavior:
- PATCH does not regenerate markdown or create a profile version. It updates structured profile data and profile quality only.
- Clearing required Identity/Search fields is allowed and transitions the profile to `incomplete`.
- Generated markdown remains internal to the explicit regeneration path.

## 2026-06-23 - Identity/Search section service boundary

Started the section-level profile editing layer without adding UI.

Implemented:
- `lib/public-profile/sections.ts` defines the Identity/Search section view model, patch parser, normalization rules, and in-memory aggregate application.
- `lib/public-profile/section-service.ts` wraps section parsing, aggregate loading, completion re-evaluation, and persistence delegation.
- `scripts/test-public-profile-sections.mjs` covers invalid payloads, enum validation, string/list normalization, clearing required fields into incomplete status, missing profiles, and persistence orchestration.

Important behavior:
- Required identity fields can be cleared, and clearing them transitions profile quality back to `incomplete`.
- Optional identity fields can be cleared with empty strings or null-like values.
- Employment type and remote preference values are enum-validated before service persistence.
- This is service-level only; repository persistence and authenticated GET/PATCH endpoints are the next backend step.

## 2026-06-23 - Authenticated profile regeneration route

Continued Phase 1 by adding the first public profile API route boundary.

Implemented:
- `lib/public-auth/session.ts` validates Supabase Auth bearer tokens through the Supabase Auth `/auth/v1/user` endpoint.
- `lib/public-profile/api.ts` maps auth, repository config, and profile regeneration outcomes into HTTP responses.
- `app/api/public-profile/regenerate/route.ts` exposes the authenticated `POST` route for profile regeneration.
- `scripts/test-public-auth-session.mjs` covers auth config, missing token, invalid token, and authenticated token paths.
- `scripts/test-public-profile-api.mjs` covers auth config errors, unauthorized requests, repository config errors, missing profiles, incomplete profiles, and successful regeneration.

Route contract:
- Request: `POST /api/public-profile/regenerate` with `Authorization: Bearer <supabase-access-token>`.
- Success: `200` with profile ID, complete status, version, and generated timestamp.
- Incomplete profile: `409` with incomplete reasons and weak fields; no generation is persisted.
- Missing profile: `404`.
- Missing/invalid auth: `401`.
- Missing server config: `503`.

Important boundary:
- The route does not return generated markdown. Markdown remains internal and export-gated by future subscription enforcement.

## 2026-06-23 - Phase 1 TODO and regeneration service boundary

Continued the public app foundation pass from the unified `dumpster-fire-llc` repo.

Implemented:
- `docs/project-todo.md` as the operational task list derived from the roadmap and product epics.
- `lib/public-profile/service.ts` as the framework-neutral public profile regeneration service boundary.
- `scripts/test-public-profile-service.mjs` and `scripts/test-public-profile-service.ts` covering complete, incomplete, and missing-profile regeneration paths.

Important behavior:
- Complete profiles regenerate markdown, increment version history, and persist through the repository seam.
- Incomplete profiles return diagnostic `ProfileQuality` and do not persist a generated profile version.
- Missing profiles return `not_found` without attempting persistence.
- No Next.js route was added because the authenticated public user ID strategy still needs to be explicit.

Validation:
- `node scripts/test-public-profile-service.mjs`
- `node scripts/test-public-profile-repository.mjs`
- `node scripts/test-public-profile-generation.mjs`
- `node scripts/test-public-profile-quality.mjs`
- `node scripts/test-public-profile-markdown.mjs`
- `npx tsc --noEmit --incremental false`
- `npm run build`
- `npm run lint`

Known validation note:
- `npm run lint` passes with five warnings in ported legacy `/scans` files. No Phase 1 public profile files produce lint warnings.

## 2026-06-23 - Public repo unified

Unified the public Dumpster Fire LLC source of truth into the deployment-connected repo:

`/Users/randallfransen/Sites/dumpster-fire-llc`

This repo owns the GitHub remote, Vercel project linkage, public app foundation, schema docs, migrations, scripts, and `/scans` private dashboard port. The temporary duplicate folder `thejobmarketisadumpsterfire.com` is no longer the active source of truth.

## 2026-06-23 - Profile completion engine

Continued Phase 1 with the planned pure TypeScript profile completion engine.

Implemented:
- `lib/public-profile/profile-quality.ts` evaluates a `CandidateProfileAggregate` into `ProfileQuality`.
- `lib/public-profile/profile-generation.ts` evaluates quality, mirrors `candidate_profiles.status`, regenerates markdown, creates a profile-version draft, and returns snake_case persistence rows for future Supabase writes.
- `lib/public-profile/repository.ts` maps public Supabase rows into `CandidateProfileAggregate`, loads aggregate data by user ID through an injectable REST request function, and persists generation rows back to `candidate_profiles`, `profile_quality`, and `profile_versions`.
- `scripts/test-public-profile-quality.mjs` covers complete profiles, weak required quality fields, broken Role Track/resume relationships, weak resume parsing, and missing liked/hated writing samples.
- `scripts/test-public-profile-generation.mjs` covers complete and incomplete regeneration paths plus persistence-row shape.
- `scripts/test-public-profile-repository.mjs` covers row mapping, persistence write order, upsert headers, and aggregate loading through a fake repository request.

Important behavior:
- `candidate_profiles.status` remains the operational gate; generated `ProfileQuality` is diagnostic detail.
- Profile completion is binary: any missing required launch field or weak required quality-scored answer returns `incomplete`.
- Required quality-scored sections use the field keys from `docs/candidate-profile-schema.md`.
- Every regeneration increments or accepts an explicit profile version and produces a matching `profile_versions` insert draft.
- Public profile repository code is service-level only; no public profile UI has been started.

## 2026-06-23 - Session sync and next steps

Completed a full end-of-session sync for the public build.

Added missing ingested source docs:
- `docs/public-product-build-epics.md`
- `docs/database-data-model-spec.md`
- `docs/onboarding-ux-spec.md`
- `docs/pursuit-workflow-spec.md`

Added `docs/next-session.md` as the restart handoff for the next work session.

Recommended next implementation task:
- Continue Phase 1 by wiring profile-quality evaluation into the profile persistence/generation path before any UI work.

## 2026-06-23 - Phase 1 foundation started

Started Phase 1 only after reviewing the source specs.

Implemented:
- `docs/spec-review-phase-1.md` with contradictions, missing implementation details, and Phase 1 adjustments.
- Public foundation migration `supabase/migrations/20260623000100_public_foundation_schema.sql`.
- Auth configuration contract in `lib/public-auth/config.ts`, assuming Supabase Auth for Google, Apple, and Email.
- Public profile TypeScript contracts in `lib/public-profile/types.ts`.
- Structured profile to generated markdown service in `lib/public-profile/profile-markdown.ts`.
- Focused markdown generation fixture `scripts/test-public-profile-markdown.mjs`.

Important boundaries:
- Full OAuth/login UI was not implemented because provider setup and credentials are external.
- Resume parsing, quality scoring, onboarding UI, profile management UI, matching, Human Path, outreach generation, subscription enforcement, and landing-page redesign remain outside Phase 1 work completed here.
- Public schema intentionally avoids cover-letter objects even though the legacy private `/scans` schema still contains old private cover-letter storage.

## 2026-06-23 - Implementation roadmap ingested

Added the public Implementation Roadmap and Dependency Map as `docs/implementation-roadmap.md`. This is reference documentation only; no product implementation was started.

Key decisions captured:
- Build foundation before UI, workflows before outreach, and matching only after profile data exists.
- Phase 1 is auth, database objects, and profile generation.
- Phase 2 is onboarding and profile completion enforcement.
- Phase 3 is profile management.
- Phase 4 is matching and hard exclusions.
- Phase 5 is saved jobs and pursuits.
- Phase 6 is Human Path, identified as the moat.
- Phase 7 is outreach and usage metering.
- Phase 8 is subscription enforcement and upgrade states.
- Phase 9 is public landing/pricing/auth routing.
- Launch scope requires auth, profile creation/editing, matching, pursuits, contacts, outreach, subscriptions, and landing page.

## 2026-06-23 - Subscription enforcement matrix ingested

Added the public Subscription Enforcement Matrix as `docs/subscription-enforcement-matrix.md`. This is reference documentation only; no billing or metering implementation was started.

Key decisions captured:
- Do not meter search, browsing, profile viewing, saved jobs, or dashboard usage.
- Meter Human Path generation, outreach generation, and profile export.
- Human Path usage is consumed only when Generate Human Path is clicked.
- Outreach usage is consumed per generated message for selected contacts.
- Profile export is Pro-only.
- Upgrade prompts should be benefit-led and avoid fake urgency, countdowns, hidden limits, and dark patterns.
- Failed billing freezes generation/export actions but preserves login, search, saved jobs, dashboard, and profile editing.

## 2026-06-23 - Matching engine spec ingested

Added the public Matching Engine specification as `docs/matching-engine-spec.md`. This is reference documentation only; no product implementation was started.

Key decisions captured:
- Matching optimizes for quality pursuits, not application volume.
- Users see match buckets, not numeric scores.
- Hard exclusions stay visible with clear explanatory messaging.
- The engine recommends exactly one Role Track and one resume; user override always wins.
- Project recommendations are capability-driven, not title-driven.
- Every job should include specific risks and transparent why-matched / why-not-matched reasons.
- Posting freshness and Easy Apply affect prioritization but do not disqualify roles.
- Incomplete profiles block pursuit generation; weak profile sections reduce confidence.

## 2026-06-23 - Profile management modal spec ingested

Added the public Profile Management modal specification as `docs/profile-management-modal-spec.md`. This is reference documentation only; no product implementation was started.

Key decisions captured:
- Onboarding creates the profile; Profile Management maintains it.
- The editor is a full-screen modal with left section navigation and right-side editor content.
- Users edit structured fields only; generated markdown regenerates automatically.
- Profile status, last updated, version, export action, and quality issues remain visible.
- Every edit autosaves; no Save button.
- Regeneration is debounced and triggered by meaningful profile changes, not every keystroke.
- Future hooks are reserved for interview prep, company research, response tracking, outreach performance, and profile analytics, but not built for launch.

## 2026-06-23 - Candidate profile schema ingested

Added the public Candidate Profile schema brief as `docs/candidate-profile-schema.md`. This is reference documentation only; no product implementation was started.

Key decisions captured:
- Candidate Profile status is binary: `incomplete` or `complete`.
- Incomplete profiles block pursuit generation, outreach generation, contact research, role fit messaging, and proof selection.
- Structured profile data is the source of truth; markdown is generated internally and export-gated.
- Projects are capability-driven proof objects, not title-bound proof objects.
- Resume parsing generates work history; users correct parsed work history instead of entering it from scratch.
- Launch schema excludes cover letters, deep company research, interview prep, generic chat coaching, speaking engagements, and side-project categories.

## 2026-06-23 - Public site provisioned

Provisioned the standalone public-site repository for `www.thejobmarketisadumpsterfire.com`.

- Public root `/` is a minimal holding page until the source markdowns are ingested and the landing page is designed.
- Private scan workflow is ported to `/scans` from the working Dumpster Fire implementation.
- Match tuning remains available at `/scans/admin/tuning`.
- Scan APIs are retargeted under `/scans/api/*`.
- Access is code-gated by default through `DUMPSTER_FIRE_ACCESS_CODE` and `DUMPSTER_FIRE_SESSION_SECRET`; production fails closed if either value is missing.
- Supabase schema and migrations are copied into `supabase/`.
- Focused Dumpster Fire scripts and fixtures are copied into `scripts/` and retargeted to `app/scans`.

Validation:
- `npx tsc --noEmit`
- `node scripts/test-dumpster-fire-salary.mjs`
- `node scripts/test-dumpster-fire-scan-log-display.mjs`
- `npm run build`
- Local screenshot pass for `/` and `/scans` at desktop/mobile sizes

Follow-up:
- Ingest source markdowns for the public landing page and positioning.
- Define public profile route shape and privacy boundaries before exposing profile data.
- Decide deployment project/env ownership before connecting production Supabase or scheduled scans.
