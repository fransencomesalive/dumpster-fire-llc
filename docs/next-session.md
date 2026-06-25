# Next Session Handoff

## Status

The standalone public repo has been provisioned and Phase 1 foundation work has started.

Current repo:

`/Users/randallfransen/Sites/dumpster-fire-llc`

Current branch:

`main`

## What Changed This Session

- Added the full public product spec stack under `docs/`.
- Reviewed contradictions and missing implementation details in `docs/spec-review-phase-1.md`.
- Added public foundation database schema in `supabase/migrations/20260623000100_public_foundation_schema.sql`.
- Added public auth configuration contract in `lib/public-auth/config.ts`.
- Added public profile TypeScript contracts in `lib/public-profile/types.ts`.
- Added structured profile to markdown generation in `lib/public-profile/profile-markdown.ts`.
- Added focused fixture coverage in `scripts/test-public-profile-markdown.mjs`.
- Added the pure TypeScript profile completion engine in `lib/public-profile/profile-quality.ts`.
- Added the profile generation/persistence planner in `lib/public-profile/profile-generation.ts`.
- Added the public profile repository mapper/persistence seam in `lib/public-profile/repository.ts`.
- Added the public profile regeneration service boundary in `lib/public-profile/service.ts`.
- Added Supabase bearer-token session validation in `lib/public-auth/session.ts`.
- Added the public profile API handler in `lib/public-profile/api.ts`.
- Added the authenticated regeneration route at `app/api/public-profile/regenerate/route.ts`.
- Added Identity/Search section modeling in `lib/public-profile/sections.ts`.
- Added Identity/Search update orchestration in `lib/public-profile/section-service.ts`.
- Added Identity/Search persistence in `lib/public-profile/repository.ts`.
- Added authenticated Identity/Search `GET` and `PATCH` endpoints at `app/api/public-profile/identity-search/route.ts`.
- Added Role Tracks section modeling, persistence, and authenticated `GET`/`PATCH` endpoints at `app/api/public-profile/role-tracks/route.ts`.
- Added Resume Uploads section modeling, persistence, attachment validation, and authenticated `GET`/`PATCH` endpoints at `app/api/public-profile/resumes/route.ts`.
- Added Work History section modeling, persistence, attachment validation, and authenticated `GET`/`PATCH` endpoints at `app/api/public-profile/work-history/route.ts`.
- Added Proof Library section modeling, persistence, and authenticated `GET`/`PATCH` endpoints at `app/api/public-profile/proof-library/route.ts`.
- Added Skills Inventory section modeling, persistence, relationship validation, and authenticated `GET`/`PATCH` endpoints at `app/api/public-profile/skills/route.ts`.
- Added shared quality-scored narrative section modeling, persistence, and authenticated `GET`/`PATCH` endpoints for Why People Hire Me, Operating Style, and Decision Style.
- Added Communication Style section modeling, persistence, and authenticated `GET`/`PATCH` endpoint at `app/api/public-profile/communication-style/route.ts`.
- Added AI Misreadings authenticated `GET`/`PATCH` endpoint at `app/api/public-profile/ai-misreadings/route.ts`.
- Added Writing Samples section modeling, persistence, and authenticated `GET`/`PATCH` endpoint at `app/api/public-profile/writing-samples/route.ts`.
- Added Outreach Rules section modeling, persistence, Role Track validation, and authenticated `GET`/`PATCH` endpoint at `app/api/public-profile/outreach-rules/route.ts`.
- Added optional Leadership Profile section modeling, persistence, and authenticated `GET`/`PATCH` endpoint at `app/api/public-profile/leadership-profile/route.ts`.
- Initialized Supabase CLI config in `supabase/config.toml`, linked project `ngftlvlslhjsyjcbuuwv`, and applied the public foundation migration.
- Added authenticated public profile bootstrap endpoint.
- Added `/onboarding` shell route, section manifest, browser-safe public profile API request helper, and first editable Identity/Search autosave form.
- Synced public Supabase runtime env vars into Vercel for Production, Preview, and Development.
- Expanded `/onboarding` with authenticated Role Tracks load, add, edit, remove, and save.
- Deployed to Vercel production and verified `/onboarding`, `bootstrap`, and `role-tracks` against live Supabase with a temporary user that was deleted afterward.
- Expanded `/onboarding` with authenticated Resume Uploads load, add, edit, remove, save, and Role Track attachment controls.
- Hardened onboarding-generated Role Track and Resume IDs so fallbacks are UUID-shaped for Supabase UUID columns.
- Verified the actual public domain `https://thejobmarketisadumpsterfire.com` after promotion: onboarding returns `200`, unauthenticated profile API returns `401`, and temporary-user Role Track plus Resume attachment smoke test returns `200`.
- Expanded `/onboarding` with authenticated Work History load, add, edit, remove, save, and Resume attachment controls.
- Deployed Work History to production and verified Role Track → Resume → Work History attachment against the public domain with a temporary user that was deleted afterward.
- Verified live Supabase Auth and live local `bootstrap` + `identity-search` API calls with temporary users that were deleted afterward.
- Added reusable complete-profile fixtures in `scripts/fixtures/public-profile.ts`.
- Added the operational roadmap TODO in `docs/project-todo.md`.
- Added focused profile-quality fixture coverage in `scripts/test-public-profile-quality.mjs`.
- Added profile generation fixture coverage in `scripts/test-public-profile-generation.mjs`.
- Added profile repository fixture coverage in `scripts/test-public-profile-repository.mjs`.
- Added profile service fixture coverage in `scripts/test-public-profile-service.mjs`.
- Added auth session and profile API fixture coverage in `scripts/test-public-auth-session.mjs` and `scripts/test-public-profile-api.mjs`.
- Added Identity/Search section fixture coverage in `scripts/test-public-profile-sections.mjs`.
- Expanded repository and API fixture coverage for Identity/Search autosave.
- Expanded section, repository, and API fixture coverage for Role Tracks autosave.
- Expanded section, repository, and API fixture coverage for Resume Uploads autosave.
- Expanded section, repository, and API fixture coverage for Work History autosave.
- Expanded section, repository, and API fixture coverage for Proof Library autosave.
- Expanded section, repository, and API fixture coverage for Skills Inventory autosave.
- Expanded section, repository, and API fixture coverage for quality-scored narrative autosave.
- Expanded section, repository, and API fixture coverage for Communication Style and AI Misreadings autosave.
- Expanded section, repository, and API fixture coverage for Writing Samples autosave.
- Expanded section, repository, and API fixture coverage for Outreach Rules autosave.
- Expanded section, repository, and API fixture coverage for Leadership Profile autosave.
- Unified the public app/schema/docs work into the deployment-connected `dumpster-fire-llc` repo.
- Updated `docs/architecture.md` and `docs/current-state.md`.

## Validation Run

- `node scripts/test-public-profile-service.mjs`
- `node scripts/test-public-profile-api.mjs`
- `node scripts/test-public-auth-session.mjs`
- `node scripts/test-public-profile-sections.mjs`
- `node scripts/test-public-profile-markdown.mjs`
- `node scripts/test-public-profile-quality.mjs`
- `node scripts/test-public-profile-generation.mjs`
- `node scripts/test-public-profile-repository.mjs`
- `npx tsc --noEmit --incremental false`
- `npm run build`
- `npm run lint`

Known validation note:

`npm run lint` passes with five warnings in ported legacy `/scans` files. These warnings predate the public Phase 1 work and were not changed.

## Spec Decisions To Preserve

- Build order matters: database/model first, UI second, advanced functionality third.
- Supabase Auth is the Phase 1 assumption for Google, Apple, and Email.
- Server-side public profile API requests use Supabase Auth bearer tokens for the first route boundary.
- Public launch tables are separate from legacy private `job_search_*` scan tables.
- Candidate Profile status is binary: `incomplete` or `complete`.
- Incomplete profiles block pursuit generation, outreach generation, contact research, role fit messaging, and proof selection.
- Saved Jobs are free/unlimited and separate from Pursuits.
- A Pursuit is the monetized unit of action.
- Search and saved jobs are not metered.
- Human Path and outreach generation are metered.
- Public schema must not introduce cover-letter objects.
- Markdown is generated from structured data and is never the editable source.
- If a newer incomplete Vercel deployment takes aliases, promote the known-good deployment before smoke testing; route checks should use `https://thejobmarketisadumpsterfire.com`, not only immutable deployment URLs.

## Next Implementation Step

Continue Phase 1. Recommended next task:

**Continue editable onboarding forms with Proof Library.**

This should stay service/API-level before UI:

- Use the repository seam in `lib/public-profile/repository.ts`.
- Use the section seam in `lib/public-profile/sections.ts` and `lib/public-profile/section-service.ts`.
- Keep Supabase bearer-token auth for route boundaries.
- Reuse `scripts/fixtures/public-profile.ts` instead of duplicating large complete-profile objects.
- Convert Proof Library into an authenticated editable autosave form.
- Preserve downstream validation by keeping proof object IDs UUID-shaped for later skills relationships.
- Preserve binary `complete` / `incomplete` profile transitions after updates.
- Keep onboarding/profile UI out of scope until section autosave endpoints exist.

## Not Next Yet

Do not start these until their dependencies exist:

- Onboarding UI
- Profile management modal UI
- Public dashboard redesign
- Matching engine UI
- Human Path generation
- Outreach generation
- Billing enforcement UI
- Landing-page redesign

## External Decisions Still Needed

- Supabase project ownership and whether to create a fresh public project or reuse existing infrastructure.
- OAuth provider setup details for Google and Apple.
- Resume file storage provider and retention rules.
- Resume parsing provider.
- Quality scoring approach.
- Billing provider and subscription webhook model.
- Human Path search/provider strategy.
