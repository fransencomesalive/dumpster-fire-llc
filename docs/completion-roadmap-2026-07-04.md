# Completion Roadmap — Full Project Audit (2026-07-04)

Audit scope requested by Randall: (1) broken OAuth/sign-in + broken onboarding buttons,
(2) design to-dos + custom-domain/Vercel mismatch, (3) PhredBot QA relay integration.
This doc is the single ordered path to a complete, launchable app. It supersedes the
"Near-Term (scheduled)" ordering in `docs/project-todo.md` (which remains the detailed
task ledger).

---

## Root-cause finding: the three reported breakages are one chain

1. `www.thejobmarketisadumpsterfire.com` is attached to the **Lab26** Vercel project
   (verified 2026-07-04: `x-matched-path: /dumpster-fire`, ~9-day-old edge cache; all real
   routes 404). The **apex** domain now serves the current app (verified: `/onboarding`
   200, `/api/qa-report` responds; content identical to `dumpster-fire-llc.vercel.app`).
2. Supabase Auth `uri_allow_list` contained ONLY the apex domain + localhost. Anyone using
   the app at `dumpster-fire-llc.vercel.app` (the only fully-working host) who clicked
   "Continue with Google" got bounced to the Site URL fallback — which was serving Lab26.
   OAuth therefore *appeared* broken; the provider itself is configured correctly
   (Google enabled, authorize hop 302s to accounts.google.com with a real client_id).
3. With no session establishable, `/onboarding` still renders the ENTIRE editable form,
   but every Save handler starts with `if (!accessToken) return;` — buttons silently
   no-op. That is the "broken onboarding buttons" report. The buttons are fine; the
   session was never there.

Additional auth gaps found (not previously documented anywhere):

- **There is no sign-up UI at all.** The auth panel offers email/password *sign-in* and
  Google only. Email/password works solely for accounts created by hand in Supabase.
  Google OAuth is the only self-serve account-creation path.
- **No custom SMTP** (`smtp_host` unset). Supabase's built-in mailer is rate-limited to a
  handful of emails/hour and unsuitable for real users. If email/password signup is ever
  wanted, custom SMTP is a prerequisite (signups require confirmation;
  `mailer_autoconfirm=false`).
- `docs/onboarding-broken-areas-2026-07-04.md` referenced in session memory was never
  written; this doc replaces it.

## Fixed during this audit (2026-07-04)

- **Supabase `uri_allow_list` updated via Management API** (same token/path used for
  migrations) — now includes apex, www, and `dumpster-fire-llc.vercel.app` (root +
  `/onboarding` each), plus the two localhost entries. Verified by reading the config
  back. Google sign-in from the vercel.app host will now return to the vercel.app host.
- Site URL left as `https://thejobmarketisadumpsterfire.com` (correct now that apex
  serves this app).

NOT VERIFIED yet: a real end-to-end Google sign-in from a browser on
`dumpster-fire-llc.vercel.app` and on the apex domain. Verification = click "Continue
with Google" on `/onboarding`, complete auth, land back on `/onboarding` signed in, and
confirm section Save buttons persist (message "… saved.").

---

## Phase 0 — Unbreak the launch surface (auth + domain) — DO FIRST

1. [x] Supabase redirect allowlist fix (done, above).
2. [x] **Domain cleanup — DONE 2026-07-04 (Randall + Claude).** Randall removed the www
   domain from Lab26 and added it to `dumpster-fire-llc`. Final layout is **www-primary**
   (Vercel's recommended shape, inverse of the original plan): www serves the app, apex
   308-redirects to www (path-preserving). Verified live: www `/` and `/onboarding` 200
   with content identical to `dumpster-fire-llc.vercel.app`, zero Lab26 headers, QA
   proxy fail-soft responding on www. Supabase `site_url` updated to
   `https://www.thejobmarketisadumpsterfire.com` via Management API (both hosts remain
   in the allowlist). Zero Lab26 anything remains.
   Note: no Vercel CLI/token exists in the working environment; add a `VERCEL_TOKEN` to
   `.env.local` if agents should handle Vercel directly in future.
3. [ ] End-to-end Google sign-in verification on apex + vercel.app — Randall tests after
   the domain cleanup (steps in NOT VERIFIED above).
4. [ ] **Account creation: DECIDED 2026-07-04 — build email sign-up with custom SMTP**
   (the missing sign-up UI was never a deliberate choice). Plan:
   1. Provider recommendation: **Resend** (simplest setup, generous free tier ~3k
      emails/mo, first-class Supabase SMTP integration; Postmark/SES are fine
      alternatives if deliverability or cost profiles change).
   2. Randall: create the Resend account, add + verify the domain
      `thejobmarketisadumpsterfire.com` (DNS records go wherever the domain's DNS is
      hosted), create an SMTP API key, provide it env-only.
   3. Claude: apply SMTP config to Supabase via the Management API
      (`smtp_host smtp.resend.com`, port 465, sender e.g.
      `no-reply@thejobmarketisadumpsterfire.com`) — no dashboard needed.
   4. Claude: customize the confirmation-email template to brand voice (no
      corporate-speak), then build the sign-up UI — design-gated: needs Randall's
      design direction for the auth panel (sign-in vs create-account states).
   5. Verify: real signup → confirmation email → confirmed session → Save buttons work.
5. [x] **DONE 2026-07-05 (prod `153dbd4`).** Signed-out `/onboarding` now renders the
   login card ONLY — the editable form no longer mounts, so there are no silently-dead
   Save buttons. Built against the approved `onboarding-signed-out` DS card. Verified
   signed-out at desktop + emulated-390 mobile (no overflow).

## Phase 1 — PhredBot / QA relay go-live

State today: widget + `/api/qa-report` proxy are deployed and fail soft in prod
(verified live: apex POST → 503 `qa_agent_unconfigured`, app unaffected). Relay exists at
`~/Sites/dumpster-fire-relay`, is not running, has NO git repo, no Telegram wiring.
Detailed steps live in `docs/project-todo.md` ("QA feedback relay — end-to-end go-live");
sequence:

1. [ ] Deploy the relay — **RECOMMENDED HOST: Railway (decided 2026-07-04).** Why: the
   relay needs an always-on process (Telegram webhook + REST API), a public HTTPS URL,
   and Postgres. Railway gives GitHub-connected auto-deploy from the new
   `dumpster-fire-relay` repo, detects the Dockerfile, one-click Postgres that injects
   `DATABASE_URL`, dashboard env vars, and an automatic HTTPS domain — near-zero ops.
   Fly is CLI-heavy (flyctl + fly.toml), its machines default to auto-stop (bad for
   webhooks), and it no longer offers managed Postgres. Steps:
   1. Randall: railway.app → New Project → Deploy from GitHub repo →
      `fransencomesalive/dumpster-fire-relay`; add a Postgres service in the same
      project.
   2. Env vars on the relay service: `HOST=0.0.0.0`, `PUBLIC_BASE_URL=<the Railway
      domain>`, `DATABASE_URL` (referenced from the Postgres service), plus the values
      from the local relay `.env`.
   3. Run `npm run db:prepare` once against the Railway `DATABASE_URL` (JSON file store
      loses tickets on redeploy — Postgres is required for durability).
2. [ ] Randall: create `@TheJobMarketIsADumpsterPhredBot` via BotFather; `npm run
   telegram:handoff` walks through it; set the bot token in the relay `.env`.
3. [ ] Randall: message the bot once, then `npm run telegram:admins -- --write true` and
   `npm run telegram:setup` (needs `PUBLIC_BASE_URL` live).
4. [ ] Set `QA_AGENT_URL` in Vercel (prod + preview), redeploy, submit real feedback from
   production, confirm ticket via relay `GET /api/tickets` + Telegram notification.
5. [x] Give the relay a git home — DONE 2026-07-04: private repo
   `fransencomesalive/dumpster-fire-relay`, initial commit `b2ef159` pushed to `main`;
   verified `.env` and `data/*.json` are untracked.
6. [ ] Optional: `GITHUB_TOKEN` in relay `.env` so approved tickets open issues on
   `fransencomesalive/dumpster-fire-llc`.

## Phase 2 — Security hygiene (before invites go out)

1. [ ] Rotate all previously exposed credentials (see `docs/project-todo.md` "Rotate
   exposed credentials"): Supabase service_role + anon keys, DB password,
   `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_ACCESS_TOKEN`. Update Vercel envs +
   `.env.local` + redeploy.
   **Randall (2026-07-04): this gets its own dedicated session** with a full, specific,
   step-by-step plan written first (every key: where it's minted, every place it's
   consumed, verification after each swap) so nothing is missed or broken mid-rotation.

## Phase 3 — Design-gated UI (the bulk of remaining product work)

Everything here needs an approved design source first (AGENTS.md Design Authority,
`docs/design-state.md`). Suggested order by user-value:

1. [ ] Contact-selection UI (Human Path backend is live; this was the 06-30 "NEXT SESSION
   START HERE" and remains the highest-value unbuilt surface).
2. [ ] Pursuit dashboard/list/detail UI (backend + read APIs done).
3. [ ] Outreach generation + review workflow UI (backend done).
4. [ ] Subscription upgrade states (limit reached, export locked).
5. [~] **Onboarding auth surface BUILT + DEPLOYED 2026-07-05 (prod `153dbd4`).** The
   `docs/design-pass-notes-onboarding-auth-2026-07-04.md` requirements are now shipped:
   login-only signed-out state, account panel on top (email + teal plan chip + styled
   access-code, no Reload), persistent right-column **sections rail**
   (`design-system/components/onboarding-sections-rail.html`, approved 2026-07-05, synced
   to Claude Design) replacing the "Current blockers" text + bottom section list,
   save-blocked review panel (only after a blocked save), Profile Readiness card removed,
   and the persistent header extracted into shared `app/components/SiteHeader.tsx` (used by
   `/` + `/onboarding`). New `GET /api/account/plan` feeds the email/plan chip.
   **Still open:** (a) signed-in state not yet visually verified live — needs a real
   Supabase session, ties to Phase 0 item 3 (Google sign-in end-to-end test);
   (b) onboarding quality/remediation UI (weak-field guidance) is a separate later pass;
   (c) email sign-up "Create account" button intentionally omitted until the SMTP sign-up
   flow (Phase 0 item 4) exists — no dead buttons.
6. [ ] Homepage design fixes (in progress per launch-state memory) + Human Path slideshow
   (blocked on design source).
7. [ ] Final landing + pricing pages (Good/Gooder/Goodest — pricing structure language,
   never beta/rollout).

## Phase 4 — Decision-blocked (Randall decisions required)

1. [ ] Billing provider + checkout/portal/webhooks (Stripe is the obvious candidate;
   backend enforcement matrix already built).
2. [ ] Resume file storage provider + retention; resume parsing provider.
3. [ ] Custom SMTP provider if email/password signup is wanted (Phase 0.4 Option B).
4. [ ] Apple OAuth (optional; Google is live).

## Phase 5 — Small unblocked backend (fill-in work)

1. [~] Phase 9 verify item: audit that no public surface leaks scaffold/agent/provider
   copy. **Reassigned 2026-07-05 (Randall) to the pre-launch Codex QA audit — tracked in
   `docs/pre-launch-qa-audit.md` item 1. Do not run inline.**
2. [x] **Profile regeneration — DONE 2026-07-06 (lazy, invisible, migration-free).**
   Staleness = `profile.updatedAt > profile.markdownGeneratedAt` (no migration/new column;
   all 11 `persist*Section` fns bump `candidate_profiles.updated_at`, and regeneration sets
   `updated_at` == `markdown_generated_at` == `generatedAt`). Only outreach consumes the
   compiled `profile.md` (matching uses structured data), so the lazy-regen is at the one
   consumer. Shipped in `lib/public-profile/api.ts`: exported `isProfileStale(profile)`;
   `regenerateProfile` option on `PublicProfilePursuitsHandlerOptions`; and a guard in
   `handlePublicProfilePursuitOutreachRequest` (after the `!profileMarkdown` guard) that
   regenerates via `options.regenerateProfile ?? regeneratePublicProfileForUser` when stale
   and feeds the fresh markdown into generation — invisible to the user, cost paid once only
   when needed. Tests: `scripts/test-public-profile-regeneration.{ts,mjs}`
   (`npm run test:public-regeneration`) — unit `isProfileStale` + outreach integration
   (regen fires when stale, skipped when fresh). tsc/lint/build green; full api suite passes.
3. [~] Outreach version pruning / message reuse — **TESTED 2026-07-06; DECISION PENDING
   RANDALL.** Cost-model harness `scripts/analyze-outreach-reuse-savings.mjs` (real Opus 4.8
   pricing: $5/1M in, $25/1M out). Findings: one outreach generation costs **~$0.03**
   (small single call; input dominated by profile.md). Message reuse saves only
   **~$0.05–$0.96 / user / month** even at 60 msgs/mo and a 60% hit rate — negligible, and it
   ships near-duplicate content (fails the "significant savings" bar). **Recommendation:
   do NOT build message reuse; keep generating fresh.** The real, safe lever is
   **prompt-caching the profile.md prefix** (identical across all of a user's outreach; the
   generator currently uses NO caching — `lib/public-profile/outreach-generator.ts:114`):
   saves ~48–54% of input cost with every message still freshly generated, no stale content.
   **DECIDED 2026-07-06 (Randall): drop reuse.** Reuse was never built (nothing to remove).
   Implemented the paired lever — prompt-caching the profile.md prefix in
   `lib/public-profile/outreach-generator.ts`: `buildOutreachPromptParts` splits the prompt
   into the per-user-stable profile.md (sent as a `cache_control: ephemeral` block) and the
   per-message job+contact tail; `OutreachModelCall` gained `cachePrefix`. Caveat noted in
   code: Opus 4.8 only caches a >=4096-token prefix, so small profiles silently no-op
   (harmless). Test: `scripts/test-public-profile-outreach.mjs` asserts profile.md lands in
   the cached prefix and the tail carries job/contact. tsc/lint/build green; api suite passes.
   Analysis harness kept at `scripts/analyze-outreach-reuse-savings.mjs`.
3b. [~] **Outreach message quality — proof from all three sources (Randall 2026-07-06).**
   Randall: a message to a hiring manager should be able to quote a Work Example, a Skill
   (+ evidence), AND a résumé stat/company — all three are core material. Audit found the
   system prompt only knew Work Examples, and profile.md's Résumés section carried curated
   strengths but NOT the actual stats/companies. Fixes (backend, DONE + validated):
   - New `Resume.highlights` (curated stat/company bullets) threaded through type →
     `ResumeRow`/map/persist → section item + read + **optional** parse (absent → `[]`) →
     rendered in profile.md Résumés as "Highlights (stats / companies you can quote)".
     Migration `supabase/migrations/20260706000100_resume_highlights.sql` (additive column).
   - Outreach system prompt rewritten: draw proof from any of Work Example / Skill+evidence /
     Résumé highlight (was "select AT MOST ONE Work Example").
   - Removed the internal **Profile Quality** section from profile.md (QA metadata should
     not reach outreach/matching).
   - Tests: markdown (highlights render + Profile Quality gone), sections (highlights
     round-trip + default), outreach/repository/api regressions. tsc/lint/build green.
   **GATED NEXT STEPS (start here next session):**
   (a) **Apply the migration to prod** (Randall/prod-gated) — trivial additive column; local
       throwaway-Postgres validation NOT yet run (offered). Record in `supabase_migrations`
       after apply.
   (b) **Onboarding capture UI for `highlights` is DESIGN-GATED** — the column can store +
       the model can use highlights, but there's no onboarding field to ENTER them yet, so
       the feature is dormant until a scoped design pass adds the input to the Résumés section.
4. [x] **Pursued Jobs Export backend — DONE 2026-07-05.** `GET
   /api/public-profile/pursuits/export` (route + `handlePublicProfilePursuedJobsExportRequest`
   in `lib/public-profile/api.ts`). Pro/premium-gated via the existing
   `enforceSubscriptionFeature(…, "pursued_jobs_export")`; returns the spec record per pursuit
   (Applying-As Role Track + narrative, sent outreach message(s), recipient/contact, status,
   timestamps) as JSON or `?format=csv`; records one `profile_export` `usage_ledger` row via
   `recordProfileExportUsage`. Data API only — no UI, no "Export Locked" copy (the gate returns
   a structured `locked` result for the still-design-gated upgrade UI, Phase 3 item 4). Tests:
   `scripts/test-public-profile-export.{ts,mjs}` (`npm run test:public-export`). tsc/lint/build
   green.
   - **Follow-up flagged (not fixed, out of scope):** `lib/public-profile/subscription/rules.ts`
     grants `pursuedJobsExport` to `tester` + `premium` but NOT `pro`, while
     `docs/subscription-enforcement-matrix.md` says Pro = yes. Reconcile before billing wiring.

---

## Definition of done for "app complete"

Custom domain (www + apex) serves the app; a stranger can sign in with Google, redeem an
access code, complete onboarding, run a scan, pick a discovered contact, generate + review
outreach, and file feedback through PhredBot that reaches Randall on Telegram — with
billing or the access-code tier structure enforcing limits, and no exposed credentials.
