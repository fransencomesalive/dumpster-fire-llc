# Public Product Gap Build Plan - 2026-06-26

## Purpose

This plan converts the current product-roadmap audit into an execution map for what is not present in the current standalone site.

Canonical repo:

`/Users/randallfransen/Sites/dumpster-fire-llc`

Do not treat `/scans` as public-product completion. `/scans` is mature private machinery and can inform behavior, but public user workflows must be rebuilt against the public profile, jobs, saved jobs, pursuits, usage, and subscription tables.

## Current Site Snapshot

| Surface | Current state | Product status |
|---|---|---|
| `/` | Public homepage with approved hero/header, market section, Human Path slideshow, product/access sections, and recovered animated grain background. | Public copy surface only. Not the final launch/pricing site. |
| `/onboarding` | Authenticated public profile setup UI with editable forms for all required sections plus optional Leadership Profile. | Core foundation present. Needs quality remediation, production auth polish, file upload, and parsing. |
| `/dashboard` | Profile-complete guard and placeholder destination. | Placeholder only. Public jobs, saved jobs, pursuits, matching, and Human Path dashboard are absent. |
| `/api/public-profile/*` | Supabase bearer-token APIs for bootstrap, profile regeneration, and all profile section reads/writes. | Strong foundation present. |
| `/scans` | Access-code-gated private scan dashboard port. | Legacy active private product machinery. Not public launch UX. |
| `/scans/api/*` | Private scan, contact, apply-copy, tuning, settings, and connector APIs. | Keep isolated. Reuse concepts later, not routes/defaults. |

## Missing Public Product By Roadmap Area

### 1. Auth And Account Entry

Present:

- Supabase bearer-token API boundary.
- Local token storage and email/password-style onboarding helper path.
- Public route guards for no token, incomplete profile, and complete profile.

Missing:

- Google OAuth user flow.
- Apple OAuth user flow.
- Production-grade email login/reset flow.
- Auth-aware public nav and signed-in account menu.
- Post-auth redirects that return users to intended onboarding/dashboard state.
- Account/settings page for auth, subscription, and basic profile/account controls.

Build when:

- Before public beta expansion beyond manual/local token flow.

### 2. Onboarding Completion Quality

Present:

- All required public profile sections exist in APIs and UI.
- Binary complete/incomplete profile quality engine exists.
- Section readiness/status UI exists.
- Structured markdown generation and profile version draft support exist.

Missing:

- Quality scoring UI decision and implementation.
- Remediation guidance for weak fields.
- Better section-specific empty states and examples.
- Resume file upload provider.
- Resume parsing provider.
- Parser quality feedback tied to actual upload results.
- Clear "profile complete" finish screen and next-step handoff.
- User-facing version history around generated profile updates.

Build when:

- First. Public downstream workflows should not run on weak or incomplete profiles.

### 3. Profile Management

Present:

- Section APIs can support edits.
- Structured profile and generated markdown are modeled.
- Profile versions table exists.

Missing:

- Full-screen `Edit Career Profile` modal.
- Left-nav profile editor covering all onboarding-created sections.
- Autosave inside the modal.
- Role Track add, edit, duplicate, archive, delete.
- Proof Library add, edit, archive, delete.
- Resume/proof attachment management.
- Work history add/edit after onboarding.
- Generated markdown regeneration after edits.
- Version-history list and restore behavior.
- No profile export. Export belongs to pursued jobs/pursuit history.

Build when:

- After onboarding quality is stable. Users should never need to repeat onboarding to maintain the profile.

### 4. Public Jobs And Saved Jobs

Present:

- Public `jobs` and `saved_jobs` tables exist.
- Private `/scans` has mature connector/source behavior that can inform normalization and dedupe.

Missing:

- Public job ingestion or search service.
- Public job list/search UI.
- Public job detail view.
- Save/unsave job route.
- Saved Jobs dashboard section.
- Job-source dedupe and stale-role policy for public tables.
- Company watchlist integration into public discovery.
- Public source-health display.

Build when:

- After profile management is underway, because saved jobs need a complete user profile to become useful pursuits.

### 5. Public Matching Engine

Present:

- Matching specification exists.
- Private `/scans` matcher exists as reference.
- Public profile has the required structured inputs.

Missing:

- Public role-fit evaluation service.
- Public match result model or storage strategy.
- Match label output without numeric score.
- Role Track recommendation.
- Resume recommendation.
- Proof object recommendation.
- Risks and explanations.
- Hard exclusions for salary, remote preference, blacklist, avoid industries, and company rules.
- Fixture tests that evaluate public profile + public job inputs.

Build when:

- After public jobs can be saved/read and before Pursue is enabled.

### 6. Pursuit Workflow

Present:

- `pursuits` table exists with public profile and job relationships.
- Product specs define Saved Job vs Pursuit and state flow.
- Private Apply Wizard/Human Path UI exists as reference only.

Missing:

- Convert Saved Job to Pursuit action.
- Pursuit creation route.
- Pursuit review screen.
- Applying As override.
- Resume/proof recommendation acceptance or override rules.
- Pursuit board/list with statuses.
- Tracking actions for outreach sent, applied, responded, interviewing, offer, rejected, expired.
- Notes and follow-up metadata.
- Expiration prompts without automatic deletion.
- Pursuit state tests.

Build when:

- After matching can produce review-ready recommendations.

### 7. Human Path Engine

Present:

- Public `contact_suggestions` table exists.
- Product spec defines hiring manager, functional leader, recruiter, and optional executive sponsor.
- Private `/scans/api/contacts` exists as behavior reference.

Missing:

- Public Human Path provider boundary.
- Public contact discovery route.
- Usage ledger check before generation.
- Contact ranking by company context.
- Confidence and reasoning output.
- Result caching per pursuit.
- Regeneration policy.
- Contact selection UI.
- Limit-reached state.
- Provider error/manual guidance states.

Build when:

- After Pursuit review exists. Human Path consumes metered value and should be tied to a pursuit.

### 8. Outreach Generation

Present:

- Public `outreach_messages` and `saved_message_feedback` tables exist.
- Public Communication Style, Writing Samples, and Outreach Rules profile sections exist.
- Private `/scans/api/apply-copy` exists as behavior reference.

Missing:

- Public outreach generation service.
- Contact-specific message generation.
- Usage ledger check per generated message.
- Outreach version/history storage.
- Approve/reject feedback UI.
- Rejection-reason capture.
- Save approved message flow.
- No-contact routing note.
- Tone/proof/contact-specific fixture tests.

Build when:

- After Human Path contact selection exists.

### 9. Subscription And Usage Enforcement

Present:

- `subscription_plans`, `user_subscriptions`, and `usage_ledger` tables exist.
- Tester, Basic, and Pro plan rows are seeded.
- Subscription enforcement spec exists.

Missing:

- Billing provider decision.
- Checkout/customer portal integration.
- Subscription webhook handling.
- Plan assignment and renewal logic.
- Human Path limit enforcement.
- Outreach limit enforcement.
- Pursued Jobs export gate.
- Upgrade prompts.
- Failed-payment states.
- Account/billing UI.

Build when:

- Before self-serve public launch and before Human Path/outreach limits matter commercially.

### 10. Public Launch Site And Pricing

Present:

- Current public homepage exists with approved recovery sections.
- Root metadata exists.

Missing:

- Final launch landing page once product routes are real.
- Pricing page.
- Auth-aware public nav.
- Product screenshots/cards from the locked design direction.
- Public claims audited against actually live workflows.
- No platform/agent/vendor/scaffold leakage check before deploy.

Build when:

- After profile, dashboard, saved jobs, pursuit, Human Path, outreach, and subscription promises are at least honestly represented in the app.

## Recommended Build Sequence

### Phase A - Stabilize Public Profile Completion

Goal:

Users can create a complete profile with guidance that makes weak questionnaire input obvious and recoverable, while the product itself uses a strict pass/fail completion gate.

Deliverables:

- Preserve questionnaire/ingest guidance such as Weak, Good, and Strong where it helps users improve answers.
- Preserve binary operational status: `complete` or `incomplete`.
- Block Scan when the profile is incomplete; because Scan is blocked, Matching, Saved Jobs, Pursuits, Human Path, Outreach, and Pursued Jobs Export are also blocked.
- Add the gate justification: "Without the full picture, outreach won't be good. And if outreach isn't good, your chances drop. Finish your profile."
- Add remediation guidance for missing or weak required fields.
- Add onboarding finish state and complete-profile handoff.
- Add resume upload storage decision and upload seam, even if parsing remains manual in the first pass.
- Add parser-provider decision or a temporary "paste parsed resume" beta path explicitly labeled as beta.

Validation:

- Existing public profile tests.
- New fixture for weak-field remediation display.
- Route screenshots for `/onboarding` complete and incomplete states.

### Phase B - Build `Edit Career Profile`

Goal:

Users maintain the profile without re-entering onboarding.

Deliverables:

- Done: full-screen profile modal shell.
- Done: reuse section contracts from onboarding.
- Done: Role Track add, edit, duplicate, and archive through replacement/archive semantics.
- Remaining: Proof Library archive/delete label cleanup and relationship management.
- Remaining: debounced autosave or an explicit product decision to keep manual section saves.
- Remaining: profile regeneration action/status after structured edits.
- Remaining: version-history list and restore behavior.
- Remaining: version and last-updated metadata in the editor header.
- Done: do not add profile export.

Naming:

- `Role Track` is the maintained profile narrative, such as Executive Producer or Product Manager.
- `Applying As` is the pursuit-level label for the selected Role Track/narrative used for a specific job.
- Pursued Jobs Export should include the job pursued, Applying As Role Track/narrative, message sent, recipient, pursuit status, and timestamps.

Validation:

- Section API tests remain green.
- Profile regeneration tests cover post-edit version increment.
- Modal screenshot checks desktop/mobile.

### Phase C - Build Public Jobs And Saved Jobs

Goal:

Users can browse their own scan results and save unlimited jobs for "pursue later" without consuming paid usage.

Deliverables:

- Done: user-scoped jobs repository/service for scan results.
- Done: dashboard Jobs list and Saved Jobs panel.
- Done: save/unsave routes.
- Done: scan button uses the user's current profile search requirements/constraints as the default scan parameters.
- Done: new scans merge with unsaved and unactioned jobs from prior scans so results are not lost.
- Done: saving a job means "pursue later" only; it does not create a pursuit record.
- Done: v1 job card fields: title, company, location/remote, source, posting URL, first seen, last seen, save button, and scan context.
- Current provider seam: `/api/jobs/scan` scans the normalized public `jobs` table; external/public connector ingestion is not wired yet.
- Remaining: job detail route/view.
- Remaining: apply the `job_scan_results` migration to Supabase.
- Remaining: connector-backed public scan ingestion and explicit stale/expired pruning once source providers report closed jobs.

Validation:

- Public jobs fixture tests.
- Saved Jobs owner-scope tests.
- Dashboard screenshot for empty, saved, and unsaved states.

### Phase D - Build Public Matching

Goal:

Every job can receive a useful fit evaluation from the complete public profile.

Deliverables:

- Public match evaluation service.
- Match label, no visible numeric score.
- Recommended Role Track, resume, proof object.
- Risks and why/why-not matched explanations.
- Hard exclusion explanation display.
- Matching fixtures for strong, potential, weak, and excluded roles.

Validation:

- Matching fixture test suite.
- Public dashboard/job-card screenshots.
- Guard that incomplete profiles cannot generate match recommendations.

### Phase E - Build Pursuits

Goal:

Saved Jobs become intentional pursuits with review and tracking.

Deliverables:

- Pursue action from Saved Job/job detail.
- Pursuit review screen.
- Role Track override.
- Resume/proof recommendation acceptance.
- Pursuit board/list states.
- Tracking actions and notes.
- Expiration prompt behavior.

Validation:

- Pursuit state machine tests.
- Incomplete-profile block tests.
- Screenshots for Saved, Review, Outreach Ready, Applied, and Expired states.

### Phase F - Build Human Path

Goal:

For a pursuit, identify relevant people and preserve the reasoning.

Deliverables:

- Human Path provider boundary.
- Generate Human Path route.
- Usage ledger preflight and consumption.
- Contact suggestion persistence.
- Confidence/reasoning/link fields.
- Contact selection UI.
- Cached result display and regenerate policy.
- Limit-reached and provider-error states.

Validation:

- Provider mock tests.
- Usage ledger tests.
- Screenshots for loading, results, sparse results, limit reached, and error states.

### Phase G - Build Outreach

Goal:

Generate contact-specific outreach from the selected profile, job, proof, and contact context.

Deliverables:

- Public outreach service.
- Message generation route.
- Per-contact usage ledger consumption.
- Message history/version list.
- Approve/reject feedback controls.
- No-contact routing note.
- Save approved message path.

Validation:

- Tone/proof/contact specificity fixtures.
- Usage ledger tests.
- Screenshots for generated, approved, rejected, and no-contact states.

### Phase H - Build Subscription Enforcement

Goal:

Meter value-producing actions without blocking search, saved jobs, or profile editing.

Deliverables:

- Billing provider integration.
- Subscription webhook route.
- Plan lookup service.
- Human Path and outreach limit checks.
- Export gate.
- Upgrade prompt components.
- Account billing section.

Validation:

- Plan matrix tests.
- Webhook fixture tests.
- Limit state screenshots.

### Phase I - Final Public Site

Goal:

Make the public site sell only what the product actually supports.

Deliverables:

- Final landing page.
- Pricing page.
- Auth-aware nav.
- Approved product screenshots/cards from the chosen design direction.
- Public copy audit against live routes and feature gates.
- Deployment-domain smoke test.

Validation:

- `npm run build`.
- Public route screenshot set.
- Public-surface copy scan for private `/scans`, Lab26-era, provider, agent, and not-built claims.

## Open Decisions That Block Parts Of The Plan

- Google OAuth setup.
- Apple OAuth setup.
- Resume storage provider and retention rules.
- Resume parsing provider.
- Billing provider and webhook model.
- Human Path search/provider strategy.
- Which design-system direction to lock and port.
- Whether public beta supports email/password alone before OAuth is polished.

## Immediate Next Work

1. Keep approved homepage copy stable.
2. Add the quality-remediation UI spec and implementation for `/onboarding`.
3. Add a small public-route copy guard that prevents accidental public claims for not-built workflows.
4. Start the `Edit Career Profile` modal only after quality-remediation behavior is clear.
