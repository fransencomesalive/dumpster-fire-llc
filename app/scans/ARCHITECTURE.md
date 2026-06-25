# Dumpster Fire Architecture

## Original brief objective
Dumpster Fire is intended to be a private job-intelligence system for Randall's search, not a generic job-board scraper. Its core job is to compare real postings against Randall's actual experience, constraints, target modes, and stated wants/avoids, then return only roles worth human attention.

The app should search two source arrays through one normalized flow:

1. Connected broad job boards/sources searched by Randall's candidate criteria.
2. Targeted company career-page sources Randall adds so roles posted only on company sites do not fall through.

Targeted company sources are supplemental coverage, not the market. OpenAI, Anthropic, or any other watchlist company must not dominate results just because their ATS has many postings.

## Randall search context
The private build is for Randall Fransen. The 2026-06-09 profile-evidence pass used Randall's two June 2026 resume PDFs plus `app/scans/job_search_context_for_codex.md` to derive structured matching signals. Keep raw resume artifacts out of durable app storage by default; code and database rows should store derived signals, evidence summaries, and source references rather than full private resume text unless Randall explicitly chooses otherwise.

Known derived context currently present in repo code:

- Applying-as modes: `Executive Producer` and `Program Director`.
- Executive Producer frame: senior production leadership, creative quality control, budgets, timelines, vendors, stakeholders, and complex launch delivery.
- Program Director frame: program leadership, operating models, stakeholder alignment, workflow systems, AI-enabled operations, and cross-functional execution.
- Target title examples: director/head of production, executive/senior producer, creative/design program manager, creative/studio operations, AI enablement.
- Positive-fit signals: production leadership, creative operations, studio operations, cross-functional work, campaign/brand/content operations, design systems, post production.
- Constraints: remote-only, compensation floor around `$150k`, freelance floor around `$125/hr`, do-not-apply company list.
- Non-target signals include engineering-only, scrum/agile ceremony, sales/account/customer-success/HR/finance operations, performance marketing, social media management, junior/coordinator work, and generic support/technical lanes.

Do not reduce this context to title keywords. A correct matcher needs structured evidence from Randall's actual job history and the ChatGPT-provided search context: responsibilities, accomplishments, seniority, domains, role examples, anti-examples, location constraints, and explicit definitions of what counts as a good fit versus stretch versus not-for-me.

## Current state
This first pass is a standalone architecture prototype. It uses an access-code gate and a Supabase-ready server adapter with local server-memory fallback so the dashboard, information hierarchy, scoring vocabulary, and morning workflow can be evaluated before public profiles and scheduled scans are expanded.

## Product stance
- Private first: job data, contacts, notes, and outreach drafts should never be public.
- Deterministic first: connector results should normalize and score before any AI analysis runs.
- Morning workflow first: the dashboard should reduce friction, not become a second job.
- Mettle-informed UI: dark operational surface, teal and amber signal colors, restrained typography, code-rendered graphics, no heavy bitmap dependency.
- Claude polish ready: product data, scoring vocabulary, and layout sections are separated from CSS so visual refinement can happen without changing behavior.

## Route-local files
- `types.ts`: public domain contracts that can map cleanly to Supabase tables later.
- `data.ts`: static representative fixtures for dashboard design and workflow testing.
- `connectors.ts`: connector plans, raw-job normalizers, and fetch-preview diff builders for Greenhouse, Lever, Ashby, iCIMS, Workday, Magnit DirectSource, and generic HTML.
- `scoring.ts`: deterministic scoring skeleton for future connector ingestion.
- `store.ts`: server-side persistence adapter; uses Supabase REST when env vars exist and falls back to server memory otherwise.
- `api/dashboard/route.ts`: API for dashboard state, job status updates, and simulated scans.
- `api/connectors/route.ts`: API for safe connector previews; it does not fetch live listings.
- `api/scheduled-scan/route.ts`: preview-only scheduled scan endpoint; respects scan settings and writes no jobs.
- `api/digest-preview/route.ts`: no-send digest email scaffolding endpoint; composes counts, top roles, and optional scan summaries for future email work.
- `api/profile/route.ts`: API for editing search profile configuration.
- `api/company/route.ts`: API for editing company watchlist records.
- `api/settings/route.ts`: API for editing Overview scan and digest settings.
- `page.tsx`: server entrypoint that passes initial state into the client dashboard.
- `DashboardClient.tsx`: interactive dashboard, Apply modal, Overview modal, Configuration modal, Company modal, Job modal, queue status actions, live Scan summaries, and Previous Applications filters.
- `scans.module.css`: visual treatment only.
- `opengraph-image.tsx`: share surface.

## Future production architecture
1. Auth: approved-email login with server-only checks.
2. Database: Supabase Postgres tables for profile, companies, jobs, contacts, scan logs, outreach drafts, and settings.
3. Connectors: Greenhouse, Lever, Ashby, iCIMS, Workday, Magnit DirectSource/WillHire-style boards, then generic HTML fallback.
4. Ingestion: normalize, dedupe, upsert, mark missing roles closed instead of deleting.
5. Relevance gate: filter normalized source floods against the private search profile before preview/write.
6. Scoring: run deterministic scoring on every relevant normalized job.
7. AI: summarize fit and generate outreach only for plausible roles.
8. Digest: send daily top actions and closed-role notes by email.
9. Admin: edit target titles, keywords, compensation floors, do-not-apply companies, scan cadence, and approved login email.

## Apply wizard branch
The Apply button launches a guided workflow rather than acting as a simple outbound link.

Current wizard screens:
1. Job review: fit, salary, risks, remote read, strategy, and selected application mode.
2. Contact identification: vetted contact suggestions with confidence and outreach-fit ratings.
3. Action workspace: tailored LinkedIn messages, application note, profile links, and resume notes.
4. Application tracking: checklist of completed/manual actions before moving the job into pipeline state.

This workflow is intentionally copy/paste-driven. It must not automate LinkedIn messaging, account-bound job board actions, or mass applications.

Implemented persistence:
- `POST /scans/api/dashboard` with `action: "saveApplyWizard"` saves completed checklist actions, generated outreach messages, cover letter text, and resume notes through the persistence adapter.
- `POST /scans/api/apply-copy` generates Apply Wizard copy server-side from the stored job/contact data, selected application mode, and private candidate context. If `OPENAI_API_KEY` is missing or generation fails, it returns deterministic template copy instead of blocking the workflow.
- Supabase writes target `job_search_application_actions`, `job_search_outreach_messages`, and `job_search_cover_letters`.
- Memory fallback stores submissions in `applicationActions`.
- Generated text sections include copy buttons that use the browser clipboard API.
- Previous Applications is derived from saved wizard sessions only. Direct queue status changes such as Save/Skip do not create application history.
- Each saved wizard submission includes `sessionId` and `savedAt`; Supabase mirrors the session ID in `wizard_session_id` across action, outreach, and cover-letter rows for exact reconstruction.
- Apply Wizard uses an application mode to tune outreach and application copy. Search can return roles for multiple possible modes, and Apply recommends the strongest mode per job while letting the user override it. Randall's initial modes are Executive Producer and Program Director, sourced from the dedicated personality briefs and shared between client scoring and server copy generation.
- Supabase contact rows now back contact suggestions when present, and outreach message writes preserve `contact_id` for persisted contacts.
- Outreach generation must use the candidate's stored writing instructions, not generic application-copy defaults. Randall's private build uses a direct, senior, specific, grounded writing profile; the public version must replace that with each user's onboarding/profile writing style before generating messages.

## Supabase setup
1. Apply `supabase/migrations/20260604183000_job_search_schema.sql` with the Supabase CLI after linking the project, or run `supabase/job-search-schema.sql` in the Supabase SQL editor.
2. Add server env vars:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `JOB_SEARCH_PROFILE_ID` optional, defaults to `default`
   - `OPENAI_API_KEY` optional, enables Apply Wizard tailored copy generation
   - `JOB_SEARCH_COPY_MODEL` optional, defaults to `gpt-4.1-mini`
3. Restart the dev server so the server-side adapter can read env vars.

Do not expose the service-role key or model API key to client components.

## Auth setup
The route stays open in local development until all three auth env vars are present:

- `JOB_SEARCH_APPROVED_EMAIL`
- `JOB_SEARCH_ACCESS_CODE`
- `JOB_SEARCH_SESSION_SECRET`

Once those are set, `/scans` shows a login screen and `/scans/api/dashboard` rejects unauthenticated requests. The session is stored in an HTTP-only cookie scoped to `/scans`.

Do not store real private job/contact data until both Supabase env vars and auth env vars are configured.

## Editing branch
Configuration edit is wired first because it controls search behavior without changing job-source ingestion.

Implemented:
- `PATCH /scans/api/profile` updates target titles, compensation floor, freelance floor, remote-only, and do-not-apply companies.
- Supabase writes target `job_search_profiles`; memory fallback updates `searchProfile`.
- `POST /scans/api/company` creates watchlist companies with source/careers fields for future connectors.
- `PATCH /scans/api/company` updates company name, website, careers URL, ATS provider, board token, industry bucket, remote likelihood, notes, and status.
- Supabase writes target `job_search_companies`; memory fallback updates `companies`.
- `POST /scans/api/connectors` returns a dry-run connector plan by default. With `action: "fetchPreview"`, it fetches JSON-provider public endpoints, normalizes rows, and returns new/existing/missing diffs without writing. With `action: "applyFetchPreview"`, it re-fetches, normalizes, scores, inserts new jobs, updates existing jobs, and writes a scan log. Source-missing jobs are not auto-archived; Today's Best Matches persist until the user moves or skips them. HTML live parsing remains blocked until scoped.
- `applyFetchPreview` requires `confirmCompanyName` to exactly match the company name before it performs the outbound source fetch or any database writes.
- `previewPayload` and `applyPayload` accept pasted provider JSON for manual ingestion testing. `applyPayload` uses the same exact company-name confirmation gate before writes.
- HTML fallback uses JSON-LD `JobPosting` parsing before heuristic job-link extraction. `batchPlan` previews source readiness for active companies without fetching listings or writing jobs.
- `batchFetchPreview` fetches active company sources and returns per-company summary counts/errors without writing jobs.
- Connector plans warn/block on placeholder `example.com` source data so fixture companies do not look production-ready.
- Generated broad sources should include only scan-clean defaults. Keep blocked/flaky broad sources documented in `SOURCE_INVENTORY.md` instead of returning them from `generatedBroadSources()`; the clean 2026-06-09 baseline is 14 sources, 14 ready, 0 blocked, 0 errors.
- `batchApplyFetchPreview` requires the exact phrase `APPLY ACTIVE SOURCES`; it applies ready active sources, skips blocked sources, and returns per-company write counts.
- Connector apply paths batch-upsert matcher decision evidence into `job_search_match_decisions` for both included and filtered-out roles. Decision rows carry the rules version, score, bucket, role family, confidence, positives, risks, evidence, source/external job identity, and linked job ID when a normalized job is persisted.
- Duplicate clustering uses normalized company/title keys from `dedupe.ts`. Relevance filtering removes duplicate included roles before ranking, records duplicates as filtered-out decisions, and batch apply shares a cross-source duplicate-key set so the same role from multiple boards does not create multiple active matches.
- Match feedback is stored separately in `job_search_match_feedback`; ratings below 4 stars require only a short reason. Learning summaries should join feedback to persisted decision evidence after enough scans, not rerun expensive semantic analysis per result.
- `POST /scans/api/scheduled-scan` runs preview-only connector summaries when scheduled scans are enabled; it returns `writesEnabled: false` and does not mutate jobs or scan logs.
- `POST /scans/api/digest-preview` composes backend digest email scaffolding and always returns `emailEnabled: false` and `writesEnabled: false`; the active UI opens a non-sending “Schedule Daily Digest Email” modal for frequency/time preferences until sending is connected.
- Manual batch Scan is one user action and should create one aggregate scan-log row, not one row per source. Per-source connector apply helpers can suppress scan-log writes; `batchScanApply` writes the aggregate row after all sources finish. Dashboard Scan History groups legacy per-source rows completed in the same short window so historical batches do not look like separate user scans.
- Scanned job posts are read-only in the dashboard. The app can Save, destructively Skip/delete, Apply, mark statuses through the existing dashboard actions, and preserve Apply Wizard notes, but it should not expose freeform editing for source job content, fit summaries, risk flags, outreach angles, or resume notes on scraped posts.
- The dashboard sidebar surfaces active source coverage plus the active matching config source/rules version so reviews can tell whether they are looking at compiled-profile output or fallback/private matcher output.
- `PATCH /scans/api/settings` updates scan enabled, scan cadence, digest enabled, digest cadence, digest time, and max roles per scan.
- Supabase writes target `job_search_settings`; memory fallback updates `settings`.
- Overview edit is intentionally limited to scan/digest settings until real scheduled scans and company-list management are scoped.

## Public-port consideration
The current model is single-user by design, but the type boundaries anticipate a public version where each user can load a resume and profile URL into a private `UserSearchProfile`. For public use, every table should be scoped by `user_id`, resume/profile inputs should be private, and generated outreach should be stored separately from normalized job records.

Public onboarding should ingest a user resume/profile brief plus explicit wants/avoids to construct the dumpster-fire profile that Randall is currently shaping manually. `profile-compiler.ts` provides the first deterministic, no-token compiler: it turns resume/profile text and preferences into a `UserSearchProfile`, a portable `MatchingRuleConfig`, confidence, missing-input prompts, and evidence. The compiler should run before any optional LLM enrichment, and low-confidence output should ask the user for missing target titles, industries, compensation constraints, or accomplishment details instead of silently producing weak matches.

The standardized public onboarding intake should stay short: target role titles/applying-as tracks, non-negotiable constraints, strong responsibility/proof evidence, structurally wrong adjacent roles, and preferred industries/team contexts/writing style. Compiled profiles must emit role-track evidence in `MatchingRuleConfig.resumeRoleSignals.roleTracks`; title families and authority words alone are not enough to produce trusted matches.

For Randall's private build, `node scripts/run-dumpster-fire-apply-randall-profile.mjs` reapplies the curated compiled profile to Supabase without storing raw resume text. Use it if diagnostics fall back to `fallback_private` or after compiler changes that affect profile evidence.

`POST /scans/api/onboarding-profile` is the first backend seam for this public path. It sanitizes and caps resume/profile text, runs the deterministic compiler, supports a no-write `preview` action and a durable `apply` action, stores compiled output in `job_search_compiled_profiles`, applies the compiled `UserSearchProfile` to `job_search_profiles`, and does not store raw resume text by default. The table stores input summary, confidence, missing inputs, compiled search profile JSON, matching config JSON, and evidence JSON.

The Configuration UI exposes this seam through a review/apply modal: users paste resume/profile context, add explicit wants/avoids/constraints, preview compiled signals and missing-input prompts, then apply the compiled profile only after review. Error messages should stay direct and human-readable because this is a trust-building workflow; missing input, unsupported actions, invalid profile saves, and feedback failures should explain what the user can do next.

Scan paths load the latest applied compiled matcher config after validating its shape. Connector preview/apply, batch Scan, scheduled scan preview, digest preview, job scoring, and decision evidence all receive the same `MatchingRuleConfig`, falling back to Randall's private config only when no valid applied config exists. This keeps public scans cheap and deterministic while allowing each user profile to carry different title-family rules, role-track evidence, hard exclusions, and authority signals.

Tuning is an internal operator workflow, not a candidate-facing ML dashboard. The interaction plan lives in `TUNING_PLAN.md`: suggestions are grouped into profile-scoped exclusions, title-family changes, positive signals, negative signals, and threshold presets. Hard exclusions only mean “wrong for this profile/search context,” not “bad role.” V1 controls should use approve/reject/edit and limited low/medium/high strength where weighting matters; raw percent sliders are intentionally avoided. No tuning change should become active without a preview-impact step and a new matcher config version.

`/scans/admin/tuning` is the first implementation of that workflow. It is auth-gated, read-only, and intentionally hidden from candidate navigation. The report builder in `tuning-report.ts` combines match feedback, scan logs, current matcher metadata, persisted decision evidence, and the learning checkpoint. If the threshold is not met, it shows counts and guardrails only. When ready, it can emit grouped suggestions, but V1 still does not apply changes.

If a resume is thin, generic, or missing enough metrics/accomplishments to build reliable context, the product should prompt the user for missing accomplishment details and may recommend rewriting the resume before the app can produce accurate matches. Future LLM use should be reserved for profile enrichment, title-family expansion, and accomplishment extraction when deterministic confidence is low; every scan should continue using the cheap compiled matcher config.

Application modes should become first-class public-user profile data. During onboarding, the app should propose 1–4 “applying as” modes from resume/profile evidence, each with target titles, proof points, tone, positioning, scoring signals, weak-fit signals, and examples of when to use it. Users must be able to manually add, rename, edit, pause, or delete modes later. For Randall's private build, the first two modes are Executive Producer and Program Director, and their scoring/message behavior should stay wired to the dedicated personality briefs plus known Randall context unless replaced by a stronger written profile brief.

## Source ingestion strategy
Dumpster Fire has two source arrays that feed the same normalized matcher/tuning flow:

1. Connected broad job boards/sources searched by the user's compiled criteria.
2. Targeted company career-page sources added by the user/candidate so roles posted only on those companies' own sites do not fall through the cracks.

Company Watchlist records store target-company career source details:
- `websiteUrl`: company home/profile URL for context and placeholder detection.
- `careersUrl`: public careers page URL, required for HTML fallback.
- `atsProvider`: `greenhouse`, `lever`, `ashby`, `icims`, `workday`, `magnit`, or `html`.
- `atsBoardToken`: board slug/token required for supported ATS public APIs.

For the private build, Randall can paste a curated company list into the Company Watchlist and update source fields manually. The import flow accepts JSON, CSV with headers, or one-company-per-line text and can infer provider/token from common Greenhouse, Lever, and Ashby URLs. For the public version, new users should have connected broad source inputs plus an empty target-company watchlist/import flow that lets them add company rows one at a time or paste a CSV/list. Do not ship seeded private companies as public defaults.

Initial real-source classification:
- Anthropic: Greenhouse board token `anthropic`.
- Block: Greenhouse board token `block`; filtered careers URL remains useful as the user-facing source URL.
- OpenAI: Ashby board token `openai`; direct careers page may block simple server fetches, so use Ashby public posting API.
- Publicis Groupe referral board: iCIMS iframe HTML; parse cautiously from public job cards.
- SRAM: custom careers HTML; parse `.job-listing-item` cards through HTML fallback until a more direct job feed is found.

Next source classification:
- Workday / `myworkdayjobs.com`: first-class Workday provider is implemented. Autodesk confirms the public CXS endpoint pattern: `/wday/cxs/{tenant}/{site}/jobs`, posted with `{ appliedFacets, limit, offset, searchText }`; company import infers `workday` plus `{tenant}/{site}` from compatible careers URLs.
- Magnit DirectSource / WillHire boards: scoped HTML parser is implemented for `directsource.magnitglobal.com/us/{program}/jobs`. The general Magnit board exists at `/us/magnitds/jobs`, and client-specific boards such as Apple and Coinbase expose parseable job cards and apply URLs without account automation.
- Company Watchlist rows are target-company source configurations, not the full job-search universe and not result buckets. Broad connected job-board results and target-company career-page results should merge into the same normalized matcher/tuning flow and unified Today's Best Matches list.
- Public-facing watchlist UI should use plain language such as “job board URL” and “job board type.” Do not show per-card “ready to scan” or “test scan” language, because watchlist rows feed the unified main Scan action instead of acting as separate scan controls. Keep provider names and board identifiers as implementation details or advanced fields where possible.
- Workday previews use `limit: 20`; Autodesk's public CXS endpoint rejects `limit: 100`.
- TalentNet communities: treat tenant boards such as `magnit-airbnb.talentnet.community` separately from DirectSource. The public config exposes `apiBase` and the SPA calls `/api/community/jobs/search`, but the exact unauthenticated request shape still needs a narrow proof before a provider is added.
- Welcome to the Jungle: the provided app root redirects to login. Do not scrape it until there are specific public company/job URLs or authorized API access.
- Levels.fyi, Blockchain Headhunter, Paradigm, and WorkWithUs: classify individually before implementation. Default to JSON-LD/HTML fallback only when pages expose public job cards without auth or anti-automation barriers.
- Magnit aggregation answer: no single all-tech board for Airbnb/Apple/Coinbase is confirmed yet. The closest broad board is Magnit Direct Sourcing at `/us/magnitds/jobs`, while Apple and Coinbase are separate program boards and Airbnb appears to use a TalentNet tenant.

## Security notes
- Keep all API keys in environment variables.
- Never expose service-role database keys to client components.
- Do not store LinkedIn credentials.
- LinkedIn OAuth may be useful for sign-in/basic profile context, but the product should not depend on open LinkedIn dumpster-fire/profile scraping APIs. Treat LinkedIn job/profile enrichment as user-provided/public-profile context or future partner-gated access, not a default connector.
- Do not scrape login-only job boards or profiles.
- Do not automate applications.
