# Current State

## 2026-08-04 - JOB-021 and JOB-022: LIVE (Codex)

Randall approved both QA fixes and clarified JOB-022's workflow boundary: saving a resume or any
other onboarding section is persistence only. It must not be interpreted as an attempt to finish
the whole profile. The completion check becomes user-visible only when the final onboarding action
attempts to continue into scanning.

### Implemented behavior

- JOB-022 separates ordinary `section_save` events from a `completion_attempt`. Before a completion
  attempt, unfinished required sections use the existing quiet treatment and read **In progress**.
  Saving Role Track & Resume, Identity & Search, Work Examples, or Skills does not open the global
  review panel. Saving the final Voice & Personality section is the current transition toward
  scanning; if required fields remain unfinished, that action opens the review panel and changes
  the remaining section badges to **Needs work**.
- JOB-021 adds **No preference** to every current Remote Preference editor and the matching domain.
  It is neutral for remote, hybrid, onsite, and unknown job arrangements in both matching paths.
  A database migration extends the existing `candidate_profiles` constraint without rewriting or
  defaulting existing accounts.
- Local design-system cards were updated for both states. Their existing manifest entries remain
  present. Remote Claude Design registration is **NOT VERIFIED** because this Codex session has no
  Claude Design connector.

### Verification

- Browser regression against the real onboarding component, with mocked local APIs and no
  production data access: passed. Initial badges were five **In progress** states; saving a Role
  Track and pasted resume produced one **Complete** plus four **In progress** states and no review
  panel; the final Voice & Personality save produced one **Complete** plus four **Needs work** states
  and opened the review panel.
- Rendered browser checks passed at 320, 375, 390, 1280, and 1440 pixels with no horizontal overflow,
  console errors, or page errors. Screenshots are temporary QA artifacts under
  `/tmp/dumpster-fire-onboarding-qa`.
- The remote-preference migration applied twice to a temporary PostgreSQL database, preserved all
  four existing values, accepted `no_preference`, and rejected an invalid value.
- All 36 fixture suites passed; TypeScript passed; lint had zero errors and the same four
  pre-existing warnings; `npx next build --webpack` passed; `git diff --check` passed. The default
  Turbopack build stalled after its initial compile message and was stopped, so it is not counted as
  passing.

### Production release and verification

Commit `d24b4d1979899cb63d1893dbcdbeaaa838becc0a` is on `origin/main` and live in Vercel
production deployment `dpl_7BuDuMGctNeLJvicyv2oE6QQXVwX`. GitHub Actions run `30941764134`
passed, the canonical production domain returned HTTP 200 from that deployment, and production
migration `20260804000100_remote_preference_no_preference.sql` is applied and recorded.

An authenticated production-browser journey used disposable account
`qa-onboarding-6bc69896-ffa1-4359-84b6-a6938dea8c95@dumpsterfire.test`. The real Identity & Search
API accepted `no_preference` with HTTP 200 and production database readback returned
`no_preference`. Resume save left the review panel closed with one **Complete** and four
**In progress** states. The final completion attempt opened the panel with one **Complete** and
four **Needs work** states. The rendered page had no horizontal overflow or browser errors at 320,
375, 390, 1280, and 1440 pixels. The disposable Auth user, profile, and subscription were deleted;
cleanup queries returned zero rows. The reusable production regression is
`scripts/qa/production-onboarding-review-browser.mjs`.

The first production-QA attempt interacted with the form after its Save control was visible but
before it was enabled. That produced a false persistence failure. Waiting for the deployed form to
finish loading and become interactive corrected the harness; this was not a production JOB-021
defect.

Remote Claude Design registration remains **NOT VERIFIED** because this Codex environment has no
Claude Design connector.

### Telegram JOB-022 investigation and portable QA-agent gap

The Telegram task `c6c4b098-8d19-4bfe-9bb2-ac270034f27d` diagnosed JOB-022 correctly and proposed
the same section-save versus completion-attempt separation now live. It was rejected at review not
because its front-end interpretation conflicted with a back-end solution, but because the dedicated
worker clone was still based on commit `7097285` while the app version in its task packet was
`3504a87`. The review controller checked remote freshness only at approval time. Its available
actions were approve the stale result or reject and remove it; there was no safe refresh-and-rerun
action. Rejecting removed a directionally correct patch instead of preserving and rerunning it on
current `main`.

The portable factory at `/Users/randallfransen/Sites/QA-AGENT` is version `0.1.0` and does not yet
contain the installed relay's `0.2.1` agent execution, workspace-guard, review-controller, database
migration, or lifecycle implementation. Future installations therefore cannot inherit a lifecycle
correction until that subsystem is first upstreamed into the portable factory.

Recommended portable correction: the orchestrator, not the sandboxed coding agent, must fetch and
fast-forward a clean dedicated worker clone before recording `base_commit`; compare the ticket app
version with that base; recheck freshness before presenting review actions; offer **Re-run on latest
main** when stale; archive an immutable patch before cleanup; and reserve **Discard patch** for an
intentional deletion. Generated-install tests must advance a fixture origin, prove stale work cannot
push, prove rerun uses the new base, and prove discard preserves the archive. Applying this is a
separate cross-repository release: update `QA-AGENT`, then reprovision the installed Dumpster Fire
relay while preserving its configuration, data, outbox, identity, and secrets.

Durable product lesson from Randall's correction: a successful section save and a workflow
completion attempt are different events. Section persistence must not surface whole-profile errors
for fields the user has not reached yet.

## 2026-08-04 - Outreach requirement matching and structural diversity correction: LIVE (Codex)

Correction commit `3504a87ba7be2658579553a1321d09b61559997a` is on `origin/main` and live in
Vercel production deployment `dpl_Ho7y9XKsEMSg1K64oca7Fy4TAaPk`. GitHub CI run
`30938464311` passed, Vercel's deployment record reports success, and the canonical production
domain returns HTTP 200 from that deployment.

### Reported production failure and root cause

Randall reported that a Dropbox Program Manager, Workforce Planning message reused the same
attraction opener, career-summary middle, personal-preference close, and AKQA / Swift examples,
while omitting AI. The official posting and the stored production job both contained an explicit
requirement to use automation and AI-enabled tools, but that requirement lived in the structured
`required_experience` array. The outreach adapter, evidence selector, and model prompt passed only
the general description. The selector therefore recorded no matched signals, selected no Work
Example, and told the model not to use one. The old diversity check compared repeated wording but
did not recognize the same rhetorical structure written with different words.

A read-only production audit confirmed this was not stale profile data. The generation request had
loaded the current profile, including all five Work Examples, the AI Specialist Role Track, and the
AI Workflow Design skill. The failure was in the job-to-evidence path after profile loading.

### Corrected behavior

- Outreach now carries and displays the job's structured Responsibilities and Required Experience
  sections through the API adapter, evidence ranking, prompt, and persisted generation diagnostics.
- Every user's complete Work Example inventory remains eligible. Title, description,
  responsibilities, explicit requirements, and the selected Role Track are scored independently;
  Required Experience receives the strongest weight so an explicit supported requirement cannot
  be drowned out by generic description language.
- Compact domain signals such as AI, API, QA, and LLM remain matchable even when they appear inside
  longer profile evidence. This is universal signal handling, not a Dropbox-, user-, or
  industry-specific rule.
- When a selected example supports an explicit requirement, the prompt requires the draft to
  address at least one matched requirement. The hard-rule validator rejects a draft that omits it.
- Diversity validation now rejects repeated rhetorical skeletons in addition to repeated phrases.
  The detector covers the observed attraction-opener, career-sweep, personal-preference or
  familiarity claim, and talk-close pattern without banning any single phrase in isolation.

### Exact-job verification and durable lesson

A non-persisting check loaded the exact production profile, recent outreach history, and stored
Dropbox job, but used a local stub response so private profile data was not resent to an AI provider.
The corrected engine selected R.E.C.O.N.; matched `AI` specifically from Required Experience;
reported that recent-use diversity changed the selection; included the AI requirement in the
prompt; and required the message to address it. The previously generated Dropbox message was
rejected for `matched_requirement_missing`, `repeated_recent_language`, and
`repeated_recent_structure`.

Durable verification lesson from Randall's correction: an outreach relevance or diversity change
is not verified by selector fixtures and deployment alone. Verification must use the reported
profile and exact job record, confirm every structured job section reaches selection and prompting,
and test both factual coverage and rhetorical structure. Lexical variation is not message
diversity. A fresh persisted production model generation was not created because that would alter
the user's pursuit and consume provider usage without separate authorization.

Verification:

- exact production-data, local-stub regression: passed;
- all 35 fixture suites: passed;
- TypeScript: passed;
- lint: zero errors and the same four pre-existing warnings;
- `git diff --check`: passed;
- the default Turbopack build produced no new output and was stopped; the documented
  `npx next build --webpack` fallback passed;
- GitHub CI run `30938464311`: passed;
- Vercel production deployment record: successful;
- canonical production domain: HTTP 200 from `dpl_Ho7y9XKsEMSg1K64oca7Fy4TAaPk`.

## Prior 2026-08-04 release - Outreach relevance, blocked links, and paired scan details

Before the correction above, the combined release was commit
`b7f2c999e5cef2d5229af43e0c90c096a08cd7c3` on `origin/main`, live in Vercel production deployment
`dpl_6AguuiHqmenUVXmJXYtKYuvGSYP8`. The release contained these commits in order:

1. `5e8a91c1666f2fcf72b1dfbd0336b44d800cd8de` - outreach evidence relevance and diversity;
2. `376d128efed6f2c69e370a2e4de5708fc64ee7e7` - indexed fallback for blocked job links;
3. `b7f2c999e5cef2d5229af43e0c90c096a08cd7c3` - synchronized Responsibilities and Required
   Experience expansion on dashboard job cards.

### Outreach evidence behavior

- Every outreach generation and regeneration loads the user's current profile aggregate and recent
  outreach history. Profile edits, including newly added AI skills, work examples, and role tracks,
  are therefore part of later generation requests; no fixed two-example prompt list is used.
- The selector evaluates every work example in the profile. It does not hard-limit candidates to
  the selected or recommended Role Track. Job-description fit carries 60 percent of relevance,
  job-title fit carries 25 percent, and alignment with the pursuit's selected Role Track carries
  15 percent. The track influences ranking without hiding strong cross-track examples.
- A work example's linked skills and skill evidence contribute to that example's signals. Skills
  do not globally attach unrelated examples to a track.
- Only job-relevant examples above the minimum threshold are eligible. Recent use applies a
  bounded diversity penalty among comparably relevant candidates, so variety cannot replace job
  fit. Recent message language is also checked to prevent repeated phrasing across pursuits.
- The selected example ID, relevance score, matched signals, recent-use count, candidate counts,
  and whether diversity affected selection are retained in generation context for auditability.
- This release was deployed and the release checks passed. It did not add a new paid authenticated
  production outreach generation journey, so do not present it as a fresh provider-output audit.

### Blocked job-link recovery

- Normal page retrieval and structured ATS connectors remain first. Only `fetch_failed` and
  `extraction_unavailable` outcomes invoke the indexed fallback; unsafe URLs, unsupported boards,
  and oversized responses do not.
- The fallback uses the existing Anthropic account with Haiku 4.5 web fetch and limited web search.
  It requires the exact supplied URL to be repeated, supporting source URLs, a valid verified
  posting, and substantive content. It never substitutes a similar job.
- The originally pasted URL remains the persisted source URL. The provider's canonical URL is not
  allowed to destabilize the content hash. Provider tokens, web-search fees, duration, outcome,
  and request correlation remain in the existing best-effort usage ledger.
- On the combined deployment, the exact reported URL
  `https://www.indeed.com/viewjob?jk=7f4b9d403820f593` returned HTTP 200 from
  `POST /api/jobs/from-link`, persisted `Sr. Director, Global Content & Product Operations` at
  `iHerb, LLC`, retained the exact Indeed source URL, and stored a 704-character description with
  six responsibilities and six requirements. Cleanup left zero disposable job rows and the Auth
  user readback returned 404.

### Paired scan-card expansion

- Root cause: the grid stretched both outer cards to the taller row height, but each
  `MatchSection` owned independent expansion state. Expanding one list therefore left the other
  list clamped inside a tall empty container.
- `app/dashboard/DashboardClient.tsx` now owns one card-level expansion state and passes it to both
  sections. Clicking either `Show more` reveals both complete lists; clicking either `Show less`
  reclamps both.
- No CSS, copy, or design-system file changed. The approved Dashboard Jobs, Match Card, and Scan
  Page cards already show both columns fully expanded, so the live behavior now matches those
  approved states without a new visual treatment or remote asset-registration task.
- Authenticated production-browser QA loaded the actual deployed bundle with controlled long job
  data at 320, 375, 390, 1280, and 1440 pixels. At every width both lists expanded and collapsed
  together, no horizontal overflow or browser error occurred, and desktop visible border edges
  matched exactly. The disposable Auth account was deleted and its 404 readback was verified.
- The controlled job response isolated this client-side behavior. It was not a fresh production
  Run scan journey and must not replace the separate Production Scan Verification gate.

### Release verification and next starting point

- `npm run typecheck`: passed.
- `npm run lint`: zero errors and the same four pre-existing unused-variable warnings.
- `npm run test:fixtures`: all 35 suites passed.
- `npm run build`: passed. The first sandbox-restricted build stopped after producing no new output;
  the deployment-network rerun compiled successfully in 1.856 seconds and completed every build
  stage.
- `git diff --check`: passed before commit.
- Vercel status for `b7f2c99` completed successfully; production deployment identity was confirmed
  from the canonical domain's response headers.

No implementation work from this release is in flight. Start the next session with `session check`
and wait for Randall to name the next scope. Older outstanding operational items remain outstanding:
the first observed scheduled access-code expiry cron execution, any explicitly documented remote
Claude Design registrations, Phase 4 Markdown export approval, and Next.js 16.2.12 security
maintenance. Do not fold any of them into unrelated work.

## 2026-08-03 - New-account onboarding and entitlement audit (Codex)

A read-only production Supabase audit at approximately 21:50-21:52 UTC found six total Auth users,
three of whom were created during the August 3 America/Denver calendar day. None of the three new
accounts has completed onboarding, saved meaningful onboarding section data server-side, created a
`user_subscriptions` row, or created an `access_code_subscription_grants` row. Therefore none of
today's three signups redeemed DUMPSTERFRIENDS or any other access code.

Account-level state:

- `rich@richardoedwardo.com` - Auth user created at 19:32 UTC. The onboarding bootstrap initialized
  an incomplete candidate profile at 19:36 UTC, but no user-entered section data was saved.
- `kmaroonfoto@gmail.com` - Auth user created at 21:08 UTC. No candidate profile exists, so
  server-side onboarding was not started.
- `ajobateh@gmail.com` - Auth user created at 21:22 UTC. The onboarding bootstrap initialized an
  incomplete candidate profile seconds later, but no user-entered section data was saved.

The initialized profiles contain one automatically satisfied/default requirement and ten remaining
requirements; this is not user-entered progress. Unsaved browser-local onboarding drafts cannot be
observed through the production database. The three active permanent access-code subscriptions
documented below belong to older accounts, not these three August 3 signups.

## 2026-08-03 - Access-code expiry and paid conversion: LIVE (Codex)

Implementation commit `c0664a1` is on `origin/main`. GitHub CI run `30850024380` passed its
complete release check, including the real PostgreSQL migration chain, all 34 fixture suites,
TypeScript, lint with four pre-existing warnings and zero errors, and the production build.
Vercel reports production deployment `dpl_3zkLmaKMcYiX5CtuZeGLovUE2nhi` complete. The canonical
production domain returns HTTP 200.

### What the two red GitHub runs meant

Runs for commits `ec439c1` and `42853cb` failed in the same saved-pursuits migration harness. The
test subscription for its quota scenario was fixed to July 1 through August 1. When CI ran on
August 3, the first use no longer counted in the active test period, so the later assertion received
`pursuit_limit_reached:0:0` instead of the expected `pursuit_limit_reached:1:0`; PostgreSQL exited
with code 3. This was a time-dependent test fixture, not an OG image failure. The fixture now derives
that one scenario's period from the current UTC month. The previously failing harness passes in CI.

### Released behavior

- New access-code grants run for exactly 30 days from redemption.
- One account can receive only one access-code grant. A second code cannot create another 30-day
  window or consume another code use.
- Apply Wizard usage for a timed grant is measured across the stored grant window, not reset at a
  UTC month boundary. Preserved permanent grants and manual entitlements retain their existing UTC
  calendar-month behavior.
- Expiration is checked at the TypeScript and database boundaries. Cached Human Path results remain
  replayable after expiration, while new paid work is blocked.
- An expired timed grant can enter Stripe Checkout and can be replaced by the confirmed Stripe
  webhook snapshot. Active timed grants, permanent grants, and manual entitlements cannot be
  overwritten by Checkout.
- Expired accounts return to the existing paid-plan chooser instead of being treated as active.
- Every active access-code account, including DUMPSTERFRIENDS, is presented as **Full access** and
  **Access code**. The internal `premium` mapping and its real 45-use allowance remain intact; the UI
  no longer calls that grant Roaring or displays $32/month.
- The new `access_code_already_redeemed` database result is an explicit HTTP 409 response rather
  than a misleading 503.

### Production database state

The following migrations were applied in order and are recorded in production:

1. `20260726000100_stripe_billing_backend.sql`
2. `20260803000100_access_code_thirty_day_grant.sql`
3. `20260803000200_access_code_grant_enforcement.sql`
4. `20260803000300_expired_access_code_stripe_conversion.sql`

Read-only production postflight confirmed:

- three `access_code:active` subscriptions, all preserved permanent null-window grants;
- three durable grant-ledger rows, all matching those permanent grants, with zero timed grants;
- DUMPSTERFRIENDS still maps to internal `premium`, `use_count = 3`, `max_uses = 25`;
- `stripe_webhook_events` exists and is readable by the service role, with zero events;
- expiry, redemption, and Stripe snapshot RPCs are visible to the service role;
- the unauthenticated production expiry route returns HTTP 401, which proves `CRON_SECRET` is
  configured and the route is guarded rather than missing configuration.

### Verification boundaries and next starting point

- A destructive 30-day production redemption-expiration-payment journey was not run against the
  three real accounts. The complete lifecycle is verified in CI with PostgreSQL and application
  tests. Production data was read after migration but not modified for QA.
- The authorized cron sweep was not manually invoked during postflight. The unauthenticated route,
  production RPC visibility, migration record, and CI behavior are verified; the scheduled hourly
  invocation remains the first live execution evidence.
- Remote Claude Design registration for the two touched Plan/Billing cards is **NOT VERIFIED** in
  this Codex environment. Local card/live parity and responsive rendering passed at 320, 375, 390,
  1280, and 1440 pixels.
- The Vercel-generated deployment URL returns an existing SSO 302, while the canonical production
  domain is public and returns HTTP 200. No Vercel authentication setting was changed in this task.
- `.env.local` still contains the known stale `SUPABASE_ACCESS_TOKEN`. The freshly authenticated CLI
  session works when that local override is omitted, for example with `env -u SUPABASE_ACCESS_TOKEN`.
  Do not treat the stale file token as valid.

No additional access-code code work is in flight. The next operational checks are the first
scheduled cron execution and remote Claude Design registration, without changing production code.

## Superseded 2026-08-03 handoff - pre-release access-code state

Historical only. Its deployment blocker and next steps were completed by `c0664a1` and the four
production migrations recorded above.

Commit `6aabc13`. **Blocked on one thing: the migration is not applied to production.**
`expire_access_code_subscriptions()` returns 404 from the prod RPC endpoint, confirmed live.

### Correct tier vocabulary (verified in lib/billing/catalog.ts)

Two public tiers only. Good / Gooder / Goodest are **retired — never use them again.**

| Public name | Internal plan code | Price | Stripe lookup key |
| --- | --- | --- | --- |
| Smoldering | `basic` | $22/mo | `dumpster_fire_smoldering_monthly_v1` |
| Roaring | `premium` | $32/mo | `dumpster_fire_roaring_monthly_v1` |

`tester` ($0) is internal-only. `pro` was retired 2026-07-25. Both still exist as rows in
`subscription_plans` but neither is part of the pricing structure. The five `GOODEST-*` access
codes in prod are unused rows whose *names* embed a retired tier; they grant `tester`, which is
the lower grant, so they should be deleted or renamed rather than handed out.

### What the change does

Access-code redemptions granted premium permanently. Three separate causes: the RPC stamped a
calendar-month window, nothing enforced any window for non-stripe sources, and a legacy write path
stamped no window at all.

- `supabase/migrations/20260803000100_access_code_thirty_day_grant.sql` —
  `redeem_access_code_subscription` now stamps `[redemption, redemption + 30 days)` instead of
  `[month start, +1 month)`, so a redeemer on the 30th no longer gets one day. Adds
  `expire_access_code_subscriptions()`, which flips closed grants to `canceled`. Expiry works by
  flipping status rather than teaching every entitlement check about periods: both SQL sites
  (`usage_ledger_quota_before_insert`, `persist_human_path_generation`) and the TypeScript path
  already refuse a non-active status, so one flip closes every path at once.
- `app/api/account/expire-access-codes/route.ts` + `lib/account/expire-access-codes.ts` — hourly
  cron, CRON_SECRET-guarded, same application-level guard as source-scan/refine-postings.
  **Requires `CRON_SECRET` in Vercel or it fails closed with 503.**
- `lib/public-profile/subscription/enforcement.ts` — refuses a closed grant inline so the boundary
  is exact rather than up to an hour late.
- `lib/account/access-codes.ts` — legacy path now stamps the same 30-day window and `source`.
- A null `current_period_end` never expires. That is what keeps the three existing redemptions
  permanent, as Randall approved.

### Verified production state (2026-08-03, service-role reads)

- `DUMPSTERFRIENDS` → plan `premium` (Roaring), `use_count` **reset 12 → 3**, max 25, 22 remaining,
  no expiry. The reset was applied and confirmed.
- 3 `user_subscriptions` rows, all `access_code`, all `active`, all `current_period_end` NULL.
  These are the only three auth users.
- `expire_access_code_subscriptions()` → **404, not applied.**

The 12 → 3 discrepancy was NOT caused by QA scripts (`qa-subscription-flag-on-production.mjs`
seeds `user_subscriptions` directly and asserts the count is unchanged). Cause: the legacy
redemption path increments `use_count` *before* upserting and has no already-entitled guard, so
repeat redemptions by the same person each burned a use. The RPC path added that guard on 07-24,
so it cannot recur.

### Historical blocker for Codex (resolved)

`SUPABASE_ACCESS_TOKEN` in `.env.local` is dead. Verified three ways: Management API
`POST /v1/projects/{ref}/database/query` → 401, `GET /v1/projects` → 401, and
`supabase projects list` (CLI 2.101.0, independent client) → `Unauthorized`. Token parses clean
(44 chars, `sbp_` prefix, no whitespace). `.env.local` was last written **Jul 2**; docs show
Management API applies succeeding through **Jul 20**, so the file is stale relative to what has
been used since.

### Historical next-session starting point (completed)

1. Apply `supabase/migrations/20260803000100_access_code_thirty_day_grant.sql` to production and
   record it in `schema_migrations`.
2. Confirm `CRON_SECRET` is set in Vercel.
3. Verify `expire_access_code_subscriptions()` no longer 404s, then push `6aabc13`.
   **Order matters:** deploying before the migration lands makes the hourly cron 503 and enforces
   the old calendar-month window on new redemptions.
4. Decide what to do with the five `GOODEST-*` codes — delete or rename; they carry a retired tier
   name and grant the lower `tester` plan.

## 2026-08-03 - OG share card gains the divider + tagline (Claude)

Commit `ec439c1` is on `origin/main` and live in production. `https://www.thejobmarketisadumpsterfire.com/og-share.png`
returns HTTP 200 as `image/png` at 205,895 bytes (was 196,373), and the homepage `og:image` tag
resolves to it.

The approved 1200x630 artwork now carries the hero divider (ink rule + centered teal diamond) and
the tagline "A job-search operating system for people who are done feeding the machine." along the
bottom of the frame, centered on the same 92px content margin the mascot sets. Approved by Randall
in Claude Design (project `3af2f1ea-428c-49b3-8b02-c066ec0c7452`, group Sharing). The lockup row is
now `flex:1` above the footer block so mascot + wordmark stay optically centered in the reduced
height; mascot geometry, lockup, and the multiply overprint are unchanged from the approved
2026-07-14/07-15 artwork.

`scripts/render-og.sh` makes `public/og-share.png` reproducible from
`design-system/components/og-share-compose.html`. Chrome is required and next/og cannot substitute:
the wordmark registration uses `mix-blend-mode:multiply`, which Satori does not implement, so a
Satori render collapses the overprint into a flat teal-with-tomato-outline wordmark. Re-run the
script after any edit to the compose source.

**Share copy was not touched.** The `og:title` / `og:description` / description decisions from
2026-07-14 and 2026-07-16 in `app/layout.tsx` are intact, including putting the tagline in
`og:title` because iMessage and most platforms render only image + title + domain.

Process note for the next session: this session began from a checkout roughly 40 commits stale and
most of its early work had to be discarded — including an unapproved OG layout built from
`hero-matchbook` plus invention while an approved source
(`components/og-share-compose.html`) already existed in Claude Design and `public/og-share.png` was
already shipped. **Pull before doing anything, and query the Claude Design project before touching
any visual asset.** The local `design-system/` folder is well behind the project on most cards; only
`og-share-compose.html` is currently a byte-for-byte mirror.

### Next session starting point

1. **Facebook/LinkedIn re-scrape is outstanding (Randall's action, not verified here).** Run
   `https://www.thejobmarketisadumpsterfire.com` through
   https://developers.facebook.com/tools/debug/ and press **Scrape Again**, then LinkedIn's Post
   Inspector. Both cache aggressively and will serve the previous card until forced. Verify the
   divider + tagline appear in the rendered preview.
2. **Launch post is drafted but unpublished.** A LinkedIn post recruiting 10 testers exists only in
   the 2026-08-03 chat transcript, not in the repo. It offers the top subscription tier (now named
   **Roaring**) in exchange for feedback on job matching, message generation, and bugs
   filed through the in-site QA portal, gated on commenting "I AM NOT A ROBOT". If it matters,
   capture it into `docs/` before the transcript is lost.
3. No code work is queued from this session. Verify item 1 first, then pick up from the
   `2026-07-30` entry below.

## 2026-07-30 (night) - Saved results leave scans; custom URL reaches Saved and Applied

Commit `91d03cd` is on `origin/main` and live in Vercel deployment
`dpl_6cd6g6EREmHfnzeAajAYowfPNs82`. Production returns HTTP 200, Vercel completed successfully,
and GitHub's `verify` check passed.

Saved pursuits no longer remain in the dashboard's active scan list. The backend excludes
non-deleted canonical pursuits plus release-window compatibility rows, excludes equivalent
company/title copies, preserves the saved count and last scan timestamp independently, and lets a
deleted canonical pursuit override stale compatibility state. The dashboard Save action now uses
the existing 680ms Skip exit animation, reports `Job posting moved to Saved for later.`, restores
the card on failure, and reloads after Human Path closes.

The exact Ontra URL from the report was tested through the authenticated production browser. It
ingested `Director, Product Operations`, appeared under Saved for later, accepted authenticated
tracking with bucket `applied`, then appeared under Applied. A separate production scan and Save
journey moved the active count from 75 to 74 and stayed removed after reload. Both journeys had
zero console/page errors and deleted every disposable row. The permanent scan harness also passed
with 75 persisted and re-rendered results.

Local verification passed all 34 fixture suites, public-jobs regressions, TypeScript, lint with the
same four pre-existing warnings and zero errors, webpack production build, diff checks, and
rendered checks at 320, 375, 390, 1280, and 1440 pixels with zero horizontal overflow. The default
local Turbopack build stalled silently and was stopped; webpack, GitHub CI, and Vercel all passed.

**Only remaining item:** remote Claude Design `register_assets` for
`design-system/components/dashboard-jobs.html` is not available in this Codex session and remains
NOT VERIFIED. The local card is committed and already listed in `_ds_manifest.json`. A
Claude Design-enabled session should push the exact committed card and manifest, register at
1440 by 900, and read it back without modifying production. Detailed evidence and the exact
next-start procedure are at the top of `docs/next-session.md`.

## 2026-07-30 (evening) - Homepage spacing rhythm, hero height, wordmark registration

Five commits, all live on production and verified against the rendered DOM at 1440 / 1280 / 390 /
320. Deployment `cx95j79c3`, alias `www.thejobmarketisadumpsterfire.com`, HTTP 200.

| Commit | What shipped |
|---|---|
| `56bea07` | Pricing section head left-aligned onto the shared `.publicLandingSectionIntro` |
| `85f19cf` | Whole landing page on one 60px vertical rhythm |
| `92bffca` | Teal wordmark registration + dead mobile hero rule removed + hero height study card |
| `205c639` | Approved hero height study implemented: 994px -> 729px |
| `bda38a1` | `hero-matchbook.html` DS card brought into parity, stale intro copy synced |

### Three root causes worth not rediscovering

**1. The wordmark shipped as ink + tomato for an unknown length of time.**
`.publicLandingWordmark` has always declared `color: var(--c-teal) !important`, so the source read
as correct. A broad theme block also listed `.publicLandingHeroCopy h1`, which matches the same
element at specificity 0-1-1 against the component rule's 0-1-0, both `!important`. Higher
specificity wins, so ink painted over teal. **Reading the component rule could never have found
this**; it took reading `getComputedStyle` on the live page. That selector is now removed with a
comment saying not to re-add it. `site.module.css` has several late theme blocks (~1870-2060) that
re-declare colour with `!important` across broad selector lists; when a colour is right in the file
and wrong on screen, look there first.

**2. The hero copy column was sized by the wordmark.**
`.publicLandingHeroCopy` was `width: fit-content`, and the subhead and intro each carried a
`width: 0; min-width: 100%` trick that removed them from intrinsic sizing. Net effect: the text
measure was exactly however wide "Dumpster Fire" happened to render (569px at 1440), so shrinking
the logo also shrank the body copy. The column is now an explicit 560px, with the rule at 415px
centred, the subhead at 460px, and the intro at 560px. 460px is the *narrowest* measure that still
breaks the subhead to two lines (445 gives three); 560px is the widest that keeps the intro at three
(540 gives four with a 74px runt). Both are boundaries - moving either inward breaks the line count.

**3. Section gaps were stacking from two elements.**
The page ran 104 / 48 / 80 / 112 / 176px between sections. The two worst were sums: the hero's
`padding-bottom` plus the next section's `padding-top`, and the final section's `padding-bottom`
plus the footer's `margin-top`. No single rule looked wrong, which is why it survived. Now
`.publicLandingSection` owns the rhythm alone at `padding: 60px 0 0`, no section has bottom padding,
and the four competing overrides are deleted. 60px is deliberate and is **not** a `--space-*` token
(the scale jumps 48 -> 64).

### Design system

`components/hero-matchbook.html` is now the shipped hero (731px in-card vs 729px live) and
`components/home-hero-height-study.html` records the A/B study. Both registered in Claude Design.
The hero card's intro copy had drifted to an older, longer paragraph that production stopped
shipping; that drift was masking the parity check by rendering five description lines where
production renders three. Synced.

### Next session starting point

No work in flight. One open item, twice raised and still unanswered: **`.publicLandingBand`** (plus
its `.publicLandingGuardrailList`) is dead CSS in `app/site.module.css` - no `.tsx` references
`styles.publicLandingBand`, so nothing can render it. Recommendation is to delete it; awaiting
Randall's yes. Also noted but deliberately left alone: the Human Path carousel panel is centred
while its heading is left-aligned, and the carousel keeps ~150px of empty card on slide 1 because
all five slides share the tallest slide's height (deliberate, keeps the arrows from jumping).

## 2026-07-30 - Privacy copy made truthful, resume spelling normalised

The privacy policy described a product that does not exist. It claimed data may be shared with
"analytics vendors" and that we collect "pages visited" and "feature interactions". Measured on
production: signed out the site sets **no cookies, no localStorage, no sessionStorage, and makes no
third-party requests at all**. Claiming more collection and sharing than actually happens is its own
liability, and it would have made a reviewer assume there were hidden trackers.

Rewritten (`0fad110`) to lead with the point that matters: nobody pays us for your data and your
name is never attached to anything sold. It now names only the three companies that genuinely
process something and what each sees.

| Service | What it actually receives |
|---|---|
| Supabase | profile and account storage |
| Anthropic | profile + job details, to draft outreach |
| Stripe | billing details for paying subscribers, not the profile |

Removed from the disclosure after checking the code rather than assuming:

- **Exa** is not a processor of user data. `buildExaPeopleQuery` builds the query from the JOB
  (employer identities, company, role). The user's profile is never sent. It gets its own section
  saying contact discovery searches public sources using the posting.
- **Vercel** is infrastructure serving the page, not a party data is handed to.
- **Stripe was kept** against the initial instruction, because `stripe.checkout.sessions.create` is
  live and payment processing is the one omission that reads as concealment.

Two judgement calls recorded so they are not silently reversed:

1. An earlier draft asserted Anthropic "does not use them to train its models". **Removed on
   Randall's instruction**: it is a promise about a third party and not ours to make. Do not
   reintroduce it.
2. "We share zero data whatsoever" was requested and **refused as false** - resume text demonstrably
   goes to Anthropic to generate outreach. The accurate claim (zero tracking, zero analytics, zero
   sale) is stronger and verifiable.

Also normalised every accented "resume" to the plain spelling: 132 occurrences across 21 files
covering site copy, design-system cards, shipped `lib` code including the outreach prompts, and the
four test suites that assert on those strings. Deliberately untouched: `scripts/outreach-quality/data/**`
(records of prompt experiments v2-v8 that actually ran) and `docs/**` (historical handoffs).
Rewriting either would falsify a record.

Verified: tsc, lint (0 errors), build, four profile suites pass, zero accented forms in `app/` or
`design-system/`, and the live page confirmed serving the new sections with the stale claims gone.

**Next session starting point.** Nothing is mid-flight; the tree is clean and production is healthy.
Two open items, neither blocking:

1. **Google OAuth and the email confirmation link still need a human pass.** Both leave the app for
   an external consent screen or mailbox. `scripts/qa/production-auth-browser.mjs` covers the part
   that actually broke (that `/auth/callback` exists and Supabase accepts it as a redirect).
2. **Tester tracking is researched, not built.** Recommended order: Sentry first, then PostHog
   session replay gated to the `tester` plan so public visitors keep the zero-storage position and
   no cookie banner is needed. Session replay has no strictly-necessary exemption, so it requires
   explicit opt-in, which is trivial for ten invited testers. Funnels and dashboards were explicitly
   rejected as meaningless at n=10. **If PostHog ships, the privacy copy above becomes wrong and
   needs the same honesty pass.**


## 2026-07-28 (evening) - Global signed-in header, and auth moved into cookies

The account controls (email, Sign out, Plan, Billing, Job scan, Saved Pursuits) lived in a profile
card that existed only on `/onboarding`, so from the dashboard or Saved Pursuits there was no way to
reach Plan, Billing, or Sign out. They now live in one profile-dependent header on every signed-in
page. The grid is the live production header unchanged; only the contents of its two existing slots
differ. The bar is one line at every width from 320 to 1440, with the links collapsing into a
hamburger below 900px rather than wrapping. Implements `design-system/components/header.html` r8,
approved in Claude Design.

Shipped across four commits:

- `a1b8200` the header itself, plus `app/components/useAccountSession.ts` and an `AccountPopup`
  lifted verbatim out of `OnboardingClient` so Plan/Billing open over any page. Deleted the
  onboarding profile card, the Saved Pursuits duplicate shortcuts, and their CSS.
- `03c8d2e` dead CSS that survived inside `@media` blocks.
- `5db4790` the session moved from localStorage into cookies via `@supabase/ssr`, so
  `app/layout.tsx` resolves the real user and the header ships its final contents in the first
  paint. Previously it painted three times.
- `76df994` header offset made uniform, onboarding aligned to the header, Saved Pursuits grain
  restored.

Root causes worth remembering, because each shipped green and broke in production:

- **Job scan never appeared for anyone.** `useAccountSession` called `/api/public-profile/bootstrap`
  with GET; that route exports POST only, so it 405'd, a bare `.catch(() => null)` swallowed it, and
  `profileStatus` stayed `unknown` forever. Both header lookups now report failures.
- **Saved Pursuits lost its layout.** A dead-CSS sweep deleted rules by scanning to the next
  `\n}\n`, but that file writes rules on one line, so removing `.pageActions` ran past its own
  closing brace and took `.savedShell`, `.bucketToggle`, `.topTitle` and `.topLede`.
- **Sign-in broke on deploy.** PKCE sends OAuth and the email confirmation link through the new
  `/auth/callback`, which was not on the Supabase `uri_allow_list`. Patched additively; the prior
  auth config is backed up in the session scratchpad.
- **Header height differed per page.** It was rendered inside `<main class=page>` on onboarding and
  the dashboard, so that container's 72px top padding pushed it down, while Saved Pursuits rendered
  it outside at 12px.

Framework facts confirmed from shipped docs and types, not memory: Next 16 renamed Middleware to
**Proxy** (`proxy.ts` at the repo root); Supabase requires `getClaims()` rather than `getSession()`
in server code; and `@supabase/ssr`'s `setAll` takes a second `headers` argument of no-store
directives that a response setting auth cookies must send.

Verified: tsc, lint (0 errors, 4 pre-existing warnings), production build, all six routes 200 on
production, header 12px offset and 0px misalignment at 1440/1280/900/390/320, one line at every
width, and the deployed CSS bundle checked directly for both added and removed class names.

**VERIFIED on production** by `scripts/qa/production-auth-browser.mjs`, a permanent harness that
signs a disposable user into production, exercises the journey, and deletes the account. Run with
`PRODUCTION_AUTH_QA_CONFIRM=yes node scripts/qa/production-auth-browser.mjs`. Passing run
2026-07-29 against deployment `ba08771`:

- email + password sign-in
- the session is in a `sb-*-auth-token` **cookie**, not only the localStorage mirror
- the **server** renders the signed-in header: fetched with cookies and no JS, the HTML contains
  Saved Pursuits and the account email and does NOT contain the marketing nav
- **no flip**: header text and height identical at first paint and after settle (69px)
- Job scan gating proven in BOTH directions, absent when incomplete and present when complete
- `/api/public-profile/bootstrap` returns 200 for the method the header actually uses
- header offset 12px with no horizontal overflow on `/onboarding`, `/saved-pursuits` and `/`
- `/auth/callback` returns a redirect AND Supabase accepts it as a redirect target, the exact thing
  that broke sign-in on first deploy
- sign out lands on `/` with zero auth cookies left
- a pre-migration localStorage session is adopted into cookies and the legacy key removed, so
  existing accounts are not signed out

The harness found two real bugs that `tsc`, lint and build all passed:

1. **Sign out navigated before the session was cleared.** `window.location.assign("/")` ran without
   awaiting `signOutSupabaseSession()`, so the server rendered the destination with a live cookie
   and the user landed still looking signed in. Fixed in `ba08771`.
2. A shallow `status='complete'` seed is recomputed as incomplete by the quality checker, so the
   disposable-profile seed was extracted to `scripts/qa/lib/seed-complete-profile.mjs` and is now
   shared by both production harnesses.

**Still needs a human**, because both leave the app for an external screen: the Google consent flow
and clicking a real confirmation email. The harness covers the part of each that actually broke,
namely that `/auth/callback` exists and is an allowed Supabase redirect.

**Settled — marketing page speed.** Reading the session cookie in the root layout made every route
Dynamic, so `/` is built per request instead of prerendered. Measured properly on production, 12
samples each: a CDN-cached asset on the same domain has a median TTFB of 268ms (floor 149ms) and the
homepage 394ms (floor 266ms). Per-request rendering therefore costs about **125ms**; most of the
remainder is network distance to the edge and is unavoidable either way.

An earlier revision of this doc claimed "10x faster TTFB" for reverting to static. That was wrong —
it compared the homepage against nothing. The real gap is ~125ms.

Route groups could restore prerendering for `/`, `/legal/*` and `/styleguide`, but the cost is that
a signed-in visitor sees the header resolve on those pages, which is the exact flip this work
removed. **Decision: not doing it.** ~125ms on a page already paying ~270ms of latency does not
justify reintroducing the bug, on pages a signed-in user can still land on. Revisit only if the
marketing page's Core Web Vitals become a measured problem.

The Supabase redirect allowlist state is recorded at
`docs/config-snapshots/supabase-auth-redirects.json` (redirect and provider-toggle fields only,
never keys or credentials), so the `/auth/callback` requirement is not rediscovered the hard way.

Revert points, both pushed: `pre-global-header` (before any of this) and `pre-cookie-auth` (before
the auth change). If OAuth or email confirmation fails, roll the Vercel deployment back rather than
fixing forward, because a broken callback locks users out.


## 2026-07-28 - First-user production scan failure resolved

Larissa Fransen's complete production profile could load the dashboard but clicking Run scan sent
no request and returned her to onboarding. The dashboard load trusted the authoritative Supabase
session while the click handler trusted only the legacy
`dumpster-fire-public-access-token` local-storage mirror. A missing mirror therefore made an
authenticated user appear signed out only at action time.

Code commit `b64b23128c74b547ee0fe7a2091c3d6150feb2ac` makes the live Supabase session authoritative for
the scan action and retains the mirrored token only as a compatibility fallback. Scan API failures
now return safe traceable references. The release also adds focused auth/API regressions and the
permanent `scripts/qa/production-scan-browser.mjs` production test. That harness signs in a
disposable complete user with zero results, removes the legacy mirror, clicks the real Run scan
control, requires one successful request, verifies persisted results after reload, and audits
complete fixture cleanup.

The full release check passed all migration harnesses, all 34 fixture suites, TypeScript, lint with
four pre-existing warnings and zero errors, and the production build. The final production-browser
run on commit `1f0e21a784290503b0590b87de7eea0a96ad0627` sent exactly one
`POST /api/jobs/scan`, returned HTTP 200, persisted and re-rendered 75 matches, recorded no console
or page errors, and left zero disposable account, profile, or result rows. Larissa's named account
was remediated through the same scan service and independently confirmed with 75 active results.

The durable Production Scan Verification rule is in `AGENTS.md`. Its enforcement class is
advisory. It forbids calling the scan path verified based only on fixtures, dry-runs, builds, or
HTTP reachability; verification requires the real authenticated production control, request,
response, persistence, and reload rendering.

Separate known maintenance: `npm audit --omit=dev` reports high-severity production advisories in
Next.js `16.2.10` and the Next.js dependency path through `sharp`. Next.js `16.2.12` is the
available fix path and was intentionally not mixed into the scan bug release.

## 2026-07-27 - Site bug fixes committed for production

Code commit `a54e3ff` contains the approved feedback, Saved Pursuits, Role Track, navigation, and
Human Path bug fixes from the 2026-07-27 site-bug session.

The Human Path failure was an Exa-provider regression, not a shortage of LinkedIn contacts. The
provider migration had removed the posting-backed employer-identity resolver and then rejected all
Haldren and Keller Executive Search profiles as company mismatches. Provider version 13 restores a
narrow deterministic resolver for explicit relationships in the current posting. It keeps the
existing three search lanes, does not add an AI or verification pass, preserves exact-company
behavior for ordinary jobs, rejects unrelated clients, and keeps empty results unmetered. A real
three-search Exa smoke test returned three contacts for the reported posting.

The same release:

- fixes false feedback stale-draft conflicts caused only by equivalent timestamp serialization;
- removes the incorrect exclamation icon from feedback error alerts in production and the design
  system;
- preserves Saved Pursuits state in the temporary compatibility table;
- prevents alternate Role Track titles from leaking into generated outreach;
- adds the approved Dashboard and Run scan actions to Saved Pursuits without auto-running a scan.

The full release gate passed all migration harnesses, all 34 fixture suites, TypeScript, lint with
four pre-existing warnings and zero errors, and a production build. Responsive QA passed at 320,
375, 390, 1280, and 1440 pixels. The local design-system mirrors match production. Claude Design
remote card registration remains unverified because no Claude Design document session was
connected.

## 2026-07-25 - Phase 2C outreach metering cutover live and verified

Phase 2C is implemented and live as
`20260725000100_outreach_metering_removal.sql` plus a billing-enabled application compatibility
update. It does not rewrite the already-applied migration `00600`.

The new migration keeps the existing
`persist_initial_outreach_generation(uuid,uuid,jsonb,text)` signature and service-role boundary.
For new requests it:

- requires the pursuit's immutable `apply_wizard_metered_at` latch;
- keeps pursuit locking, one initial message per contact, and idempotent replay;
- writes `pursuit_debit_added = false` and `outreach_debit_quantity = 0`;
- writes no new `pursuit` or `outreach_message` usage rows;
- records the outreach event with no retail usage type;
- preserves all historical messages, generation requests, and positive debit metadata;
- makes `apply_wizard` the only usage type enforced by the database quota trigger.

When `BILLING_ENABLED=true`, initial outreach and the one allowed regeneration now skip legacy
pursuit/outreach preflight enforcement and create no in-memory legacy usage event. The false path
retains its legacy behavior for deployment compatibility. Deploying the application before the
migration remains compatible with current production: the old same-signature RPC continues to
return its actual legacy debit metadata until the new migration is applied.

The isolated PostgreSQL harness applies the new migration three times and proves historical replay,
zero-debit new writes, multi-contact persistence, idempotent replay, no partial write without the
Apply Wizard latch, Apply Wizard quota enforcement, retired quota removal, and service-only RPC
execution. Focused flag-on API tests prove neither initial outreach nor regeneration loads or
enforces legacy quotas and both produce zero usage events.

The pre-apply `npm run release:check` passed both subscription migration harnesses, the legacy Saved
Pursuits migration harness, all 33 fixture suites, typecheck, lint with four pre-existing warnings
and zero errors, and the production build. Aggregate-only preflight and postflight scripts are
checked in as `scripts/preflight-outreach-metering-removal.sql` and
`scripts/postflight-outreach-metering-removal.sql`.

After a fresh read-only preflight and explicit authorization, the exact migration was applied and
recorded as `outreach_metering_removal`. Its SHA-256 was
`0cc207e57131cb67fd753b0853cd2f7b3599a0237e679e9afbf3f628fbeda1e2`. Aggregate postflight
confirmed one migration-history record, a nonnegative outreach-debit constraint, Apply
Wizard-only quota enforcement, the required Apply Wizard latch, no legacy usage insert in the
outreach RPC, and service-role-only RPC execution. The historical baseline remained five positive
generation requests, eight pursuit rows, eight outreach rows totaling 11, and zero duplicate
contact messages.

The first authenticated Phase 2C production QA attempt reached Human Path and initial outreach,
then regeneration failed before persistence with HTTP 503 because the model's final retry still
produced 873 characters against the 750-character hard limit. This was a stochastic generation
failure, not a metering or database failure. Automatic cleanup succeeded, an aggregate audit found
zero disposable Auth users and profiles, and the postflight remained green.

Randall then explicitly authorized one additional provider-costing retry. It passed:

- Human Path returned 19 contacts and consumed exactly one of 45 Apply Wizard uses;
- cached Human Path replay caused no additional provider call;
- one selected contact produced one initial message and one generation-request row;
- the request stored `pursuit_debit_added = false` and `outreach_debit_quantity = 0`;
- initial outreach and regeneration wrote zero legacy pursuit or outreach ledger rows;
- the outreach events had no retail usage type;
- initial-outreach replay added no request, message, event, or provider call;
- one in-place regeneration succeeded, and a second regeneration was rejected as
  `already_regenerated` without another provider call;
- generated message lengths were 736 and 721 characters;
- automatic cleanup returned Auth users, profiles, subscriptions, pursuits, usage rows, and
  provider telemetry to zero.

The final read-only audit found zero disposable QA Auth users and profiles, one recorded migration,
unchanged historical data, and all Phase 2C schema/RPC invariants intact. Canonical `/` and `/plan`
both return HTTP 200. `BILLING_ENABLED` remains enabled.

## 2026-07-25 - Migration 00600 live; Phase 2B flag-on verification passed

The application bridge to migration `20260724000600` is committed as `b76e7f8`, pushed to
`origin/main`, and deployed successfully by Vercel. GitHub Actions run `30178555166` passed its
release check. After the migration and flag-off postflight, Randall authorized a controlled
production cutover. `BILLING_ENABLED` is now present and true in Vercel production:

- the false path preserves the deployed `PLAN_RULES`, missing-subscription active-basic fallback,
  legacy access-code writes, and legacy Human Path persistence;
- the enabled path loads plan source, Stripe lifecycle fields, database plan entitlements,
  Apply Wizard allowance/usage, and Markdown entitlement from the migrated schema;
- enabled missing subscriptions and invalid Stripe periods fail closed;
- access-code/manual periods derive from the current UTC calendar month;
- enabled access-code redemption uses `redeem_access_code_subscription`;
- enabled Human Path preflights `apply_wizard` usage and uses
  `persist_human_path_generation` as the single atomic contact, pursuit, event, debit, and latch
  commit;
- the RPC mapping preserves structured success, replay, contact, pursuit, usage, limit, inactive,
  missing-subscription, invalid-period, invalid-state, and visibility outcomes;
- provider contact email and request-only reachability objects are not sent to persistence.

Verification passed the Phase 2A migration harness, legacy Saved Pursuits migration harness, 33
fixture suites, typecheck, lint with four pre-existing warnings and zero errors, production build,
and `git diff --check`. Production header checks returned HTTP 200 for `/` and `/plan`. An
unauthenticated access-code redemption returned 401, and the Human Path route returned the expected
404 for a nonexistent pursuit without performing a provider call or database write.

The read-only production query in `scripts/preflight-subscription-billing.sql` directly confirmed
that Phase 1 migrations `20260724000200` through `20260724000500` were applied and recorded, with
only `20260724000600` absent before the approved production apply.

The preflight found three active `premium` subscriptions and one premium access code with 12
recorded uses. On 2026-07-25 Randall classified those three pre-Stripe accounts as internal
`access_code` entitlements, not manual Roaring subscriptions. Migration `00600` and its isolated
harness now encode that decision by backfilling existing non-Stripe `tester` and `premium` rows as
`access_code`; other pre-Stripe plan rows remain `manual`. The focused harness passed three
idempotent applications, including the new legacy premium assertion. The full release check also
passed the Saved Pursuits harness, all 33 fixture suites, typecheck, lint with four pre-existing
warnings and zero errors, and the production build.

After explicit authorization, migration `20260724000600_subscription_billing_two_tier.sql` was
applied through the Supabase Management API and recorded as `subscription_billing_two_tier`.
Aggregate postflight `scripts/postflight-subscription-billing.sql` confirmed:

- Smoldering (`basic`) is $22 with 20 Apply Wizard uses and no Markdown export;
- Roaring (`premium`) is $32 with 45 uses and Markdown export;
- tester is internal with 25 uses; pro is retired from new entitlement;
- all three active premium subscriptions are `access_code`;
- 10 Apply Wizard rows for 10 pursuits and one user were backfilled in the current UTC month;
- all 10 debits have matching pursuit latches, with zero duplicate, non-unit, or unmatched rows;
- the Stripe lifecycle columns and both atomic service RPCs exist;
- anon and authenticated cannot execute the RPCs; service role can;
- migration history records `20260724000600`.

The first flag-on QA attempt failed before authentication or any provider call because the
disposable fixture referenced the removed `candidate_profiles.work_authorization` and
`candidate_profiles.availability` columns. The harness cleaned up to zero, the flag was removed,
and a rollback deployment restored flag-off production. After correcting the fixture, a billing-off
seed-and-cleanup rehearsal passed with zero leftovers. Randall's existing approval covered one
controlled retry.

The retry passed against a disposable confirmed production account:

- the premium `access_code` account read returned `premium`;
- redeeming the shared premium code returned atomic `already_entitled` without changing its use
  count;
- Roaring export entitlement returned `ok`;
- Human Path returned 23 contacts;
- the atomic result reported 1 of 45 used and 44 remaining for the UTC month;
- exactly one Human Path event, one unit `apply_wizard` row, and one pursuit latch committed;
- no legacy `human_path` debit was written;
- replay returned the same contacts from cache with no additional provider event;
- three provider telemetry rows were recorded for the original provider pass;
- the harness deleted its telemetry before deleting the Auth user, and final cleanup was zero for
  Auth users, profiles, subscriptions, pursuits, usage, and provider events.

The post-QA aggregate audit remains at three real premium `access_code` subscriptions and 10
historical Apply Wizard rows, with zero malformed, duplicate, or unmatched rows. `BILLING_ENABLED`
remains present in Production. `/` and `/plan` return HTTP 200 and unauthenticated code redemption
returns 401. The final local release check passed both migration harnesses, all 33 fixture suites,
typecheck, lint with four pre-existing warnings and zero errors, and the production build.

This section records the pre-Phase 2C production state and is superseded by the live Phase 2C
result at the top of this document.

## 2026-07-24 - Smoldering / Roaring Phase 1, Phase 2A, and design handoff

The pricing initiative now has one unified implementation state:

- Codex Phase 1 is committed as `3a3453d` on `origin/main`; a later live preflight on 2026-07-25
  confirmed migrations `20260724000200` through `20260724000500` are applied and recorded in
  production.
- Claude’s five approved pricing/billing cards are committed as `c536002`, registered with Claude
  Design, and mirrored into `design-system/`.
- Codex Phase 2A adds the locally verified, backward-compatible
  `20260724000600_subscription_billing_two_tier.sql` contract and its isolated PostgreSQL harness.
- Phase 2A was later applied and recorded in production on 2026-07-25. The Phase 2B bridge calls
  its new RPCs only when `BILLING_ENABLED` is true; production now runs with the flag enabled after
  authenticated verification.
- No production pricing UI, CSS, public copy, legal copy, Stripe integration, or Markdown export
  backend has been implemented.

Phase 2A establishes the two-tier catalog, conservative subscription-source backfill, Stripe-ready
identity and lifecycle fields, fail-closed missing-subscription behavior, service-only atomic
access-code redemption, one-use-per-pursuit Apply Wizard metering, contacts-only legacy backfill,
service-only atomic Human Path persistence, UTC internal entitlement periods, and Stripe period
enforcement. It deliberately preserves legacy pursuit, Human Path, and outreach behavior for a
flagged application cutover.

The full release check now runs the Phase 2A migration harness. The final local verification passed
three idempotent migration applications, the legacy Saved Pursuits harness, all 32 fixture suites,
typecheck, lint with four pre-existing warnings and zero errors, and the production build.

The exact Phase 2B starting point and remaining production boundaries are in
`docs/next-session.md`.

## 2026-07-24 - Smoldering / Roaring subscription initiative approved (historical kickoff)

The next production initiative is fully specified in
`docs/subscription-billing-production-plan-2026-07-24.md`.

Approved retail contract:

- Smoldering: $22/month for 20 successful new Apply Wizard pursuits per Stripe billing period.
- Roaring: $32/month for 45 successful new Apply Wizard pursuits per Stripe billing period plus
  Markdown pursuit-history export. Roaring is the top plan.
- No free retail tier, membership/initiation fee, rollover, or retail overages at launch.
- Both paid plans include the complete pursuit workflow.
- One Apply Wizard use is consumed only when a new pursuit successfully persists at least one useful
  contact. Failed, empty, cached, repeated, and revisited pursuits do not consume another use.
- The usage count is deliberately discoverable in Profile → Plan and is not persistent in the
  dashboard or normal Apply Wizard.
- Existing tester access codes remain internal and outside the retail plan matrix.

The plan includes the atomic quota redesign, cost telemetry from the provider audit, Stripe
Checkout/Portal/webhooks and subscription lifecycle, Markdown export, public pricing and plan flow,
Terms/Privacy/Billing/Support requirements, Claude Design ownership, Codex implementation
ownership, migrations, test-mode validation, release sequencing, rollback, and post-launch
observation.

This was the original kickoff state. It is superseded by the completed Phase 1, approved Claude
design work, and locally verified Phase 2A state above. Exact ownership and the current starting
point are in `docs/next-session.md`.

## 2026-07-24 - Human Path production provider replaced with direct Exa discovery

The approved backend pivot is implemented. `lib/public-profile/pursuits/contact-provider.ts` is now
a lean Exa People Search provider with three dynamic searches derived from the actual job and
candidate profile. It validates an exact current-company work-history entry, requires a direct
LinkedIn profile, deduplicates candidates, classifies clear recruiters and leaders, preserves
other potentially useful contacts, and lightly ranks the full useful set without a five-contact
cap.

The prior OpenAI discovery, verification, prompt, parser, reconciliation, and cost-estimation
machinery was removed rather than retained as a parallel implementation. Missing evidence is no
longer treated as a rejection. Exa titles and employment data are presented as discovery data, not
verified current facts; the direct LinkedIn profile remains the final validation surface.

Provider responses, highlights, search queries, and excluded rows remain request-local. The
database stores only the normalized contact records required by the existing selection and
outreach workflow. Human Path events store aggregate diagnostics and counts, not contact arrays or
raw provider data.

Verification completed locally:

- 29 fixture suites passed
- typecheck passed
- focused API and provider tests passed
- the `other_useful_contact` database constraint migration passed twice for idempotency and rejected
  an unsupported value
- the full repository release check passed, including the Saved Pursuits migration suite, lint,
  and the Next.js production build
- a request-local Autodesk smoke test completed all three Exa lanes in 3.4 seconds and returned 16
  unique exact-company LinkedIn contacts from 30 rows

Randall separately approved the Apply Wizard accuracy correction. The live modal and its
`design-system/components/apply-wizard.html` parity card now describe potential contacts, ask the
user to confirm current role and relevance on LinkedIn, and label the inferred lane as "Possible
Hiring Manager." Stale "Verified" example data was replaced with the provider's actual
medium-confidence, unconfirmed-authority result shape. No CSS, layout, or behavior changed.

The copy pass is locally verified: focused pursuit/API fixtures, typecheck, lint with four
pre-existing warnings and no errors, `git diff --check`, and the production build passed. Rendered
Contacts and zero-contact states passed at 320, 375, 390, 1280, and 1440 pixels with no overflow,
painted-edge clipping, or copy orphans. Remote Claude Design card registration remains outstanding.

Production prerequisites completed on 2026-07-24: `EXA_API_KEY` is present in the Vercel
Production environment, and migration `20260724000100_human_path_other_useful_contact.sql` is
applied, recorded, and postflight-verified in production.

The release is live. Apply Wizard copy commit `8d5472a` deployed successfully, and production
bundle readback confirmed the four corrected contact concepts while the old reporting-chain and
verified-contact claims were absent. The first disposable authenticated workflow then exposed an
API-boundary defect: fresh provider contacts were returned before database IDs were assigned, so
contact selection could not submit a valid `contactIds` value. The temporary user and all cascaded
rows were deleted.

Follow-up commit `e8f3821` returns the persisted PostgREST contact representations, including their
database IDs, from the fresh Human Path response. Focused API and pursuit fixtures, typecheck, lint,
`git diff --check`, and the production build passed. Vercel deployment
`dpl_7twprGvp4aSc5ip3Sdjt5ckL4pCa` is tied to exact SHA
`e8f38219b5e5284431c6cf7c582aacc0ea938010`; GitHub reports Production success and all production
aliases point to that deployment.

The repeated disposable production workflow passed end to end against the shared Autodesk
Principal Program Manager, Design Operations posting: 19 exact-company contacts with direct
LinkedIn profiles across Hiring Manager, Recruiter, Functional Leader, and Other Useful Contact;
successful likely-hiring-manager selection using the returned persisted ID; one generated outreach
message with no em dash; and complete cleanup with zero candidate-profile, subscription, or pursuit
rows remaining. The canonical root and dashboard return HTTP 200. Remote Claude Design card
registration is the only outstanding release-adjacent item.

## 2026-07-23 - Human Path direct-discovery pivot paused on Exa data rights

Three user-approved jobs established that Exa raw discovery is useful enough to continue:
31 of 38 reviewed exact-company contacts were accepted at $0.063. A separate OpenAI verification
batch made the result worse. It retained 14 of the 31 useful Exa contacts, rejected 17 useful
contacts because evidence was missing, retained one known stale profile, and cost another $0.1779.

The approved product direction is direct discovery, exact-company validation, lightweight ranking,
explicit-conflict filtering, honest uncertainty, and a direct LinkedIn profile as the final
current-profile validation surface. No additional paid refinement test is approved. The OpenAI
web-verification approach is rejected.

This pause was resolved on 2026-07-24 when Randall confirmed that the cited terms allow the
temporary cache and user display used by this product. No additional licensing action is required
for the approved implementation.

After permission, replace the current provider cleanly and remove its obsolete OpenAI discovery,
verification, parsing, reconciliation, and test structure rather than layering Exa beside it. This
backend decision does not authorize Apply Wizard UI/design or public-copy edits.

## 2026-07-21 - Human Path contact quality and broad source restoration deployed

Commit `7df17f6` is pushed to `origin/main`; CI release checks passed and the Vercel production
dashboard bundle was read back with the new zero-contact recovery copy. The canonical production
root and dashboard return 200. The source-scan route returns the expected protected 401 without
its cron bearer token.

Human Path contact discovery now rejects candidates without a verified direct LinkedIn profile,
reconciles current LinkedIn headline and current-experience evidence before selecting a person,
and does not synthesize unsupported names or titles. A completed zero-contact result stays on
Contacts, disables Outreach, Track, and Continue, and provides a preloaded LinkedIn Boolean search
instead of retrying the identical discovery method. Production and design-system mirrors contain
the same zero-contact state. The Claude Design remote asset registration/readback was not available
in this Codex session and remains unverified.

Migration `20260721000100_restore_mapped_job_sources.sql` is applied through the Supabase
Management API and recorded as `restore_mapped_job_sources`. It restores 69 broad-market mappings
only. The 21 targeted company mappings recovered from Randall's personal profile are intentionally
excluded. Existing global starter sources remain. Production now has 85 active global sources and
1 private source; all 20 Adzuna mappings are active.

The first production backfill completed after one isolated Adzuna 503 was retried successfully:
85/85 active global sources have `last_scanned_at`, zero have `last_error`, and the shared pool has
4,017 jobs. Broad inventory includes Adzuna 270, Himalayas 344, Workable 221, Arbeitnow 100,
Remote OK 99, Remotive 41, and We Work Remotely 23. The full local-to-production backfill took
221.7 seconds because local Node networking required a temporary curl transport and each remote
database round trip crossed the public network. This does not measure Vercel's in-region runtime.
The next 06:00 UTC Vercel cron is the remaining verification for whether the expanded 85-source
run completes inside the route's 60-second function budget.

Verification: local production build, typecheck, migration idempotency, source tests, 28 fixture
suites, CI release checks, production HTTP checks, migration-history readback, source-health query,
and shared-job source counts. CI retains four existing unused-symbol warnings. The fixture suite
also retains its existing test-only unresolved em-dash log while passing.

## 2026-07-20 - Feedback feature production release verified

The job + message feedback flips are approved, implemented, release-audited, and synchronized to
Claude Design project `3af2f1ea-428c-49b3-8b02-c066ec0c7452` under plan
`plan_3af2f1ea428c49b3_da8bd4049e9f`. Six remote files were read back and exactly match the local
design-system mirror. TypeScript, lint, 28 fixture suites, production build, twice-applied migration
tests, and browser checks at 320/375/390/1280/1440 are green.

The audit hardened immutable job matching context, message generation context and exact revision
binding, async race handling, modal accessibility, retained feedback evidence, migration
idempotency, and the mobile checkbox/input layout. Full detail and exact release sequence are in
`docs/feedback-feature-handoff-2026-07-19.md`.

The consolidated production QA record, corrected browser-harness evidence, current deployment
validation, and broader design-parity findings are in
`docs/production-qa-parity-report-2026-07-20.md`.

The implementation commits are `2f6d6c4`, `d902bff`, and `ec86803`, all pushed to `origin/main`.
Production preflight passed and `20260719000100_feedback_capture.sql` is applied, recorded, and
postflight-verified, including PostgREST visibility. Vercel completed the `ec86803` deployment;
both production hosts returned 200 at the root and the protected feedback routes returned the
expected 401 without a session.

A disposable confirmed production user then saved one job-feedback report and one message-feedback
report through the authenticated production APIs. Both returned 200 and produced exactly one row
with the expected immutable match/generation context. The active scan, outreach message body,
message revision/timestamp, and existing usage rows were unchanged. The disposable Auth user and
all related application rows were deleted; the final orphan audit returned zero across every
fixture and feedback table. No known release work remains for this feature.

## 2026-07-19 - CLAUDE DESIGN TASK (DONE): job and message feedback flips

The approved product behavior, current backend contract, exact chip labels/codes, Claude Design
grounding sources, required interaction states, accessibility and responsive requirements, file
ownership, review format, and first action are consolidated in:

`docs/claude-design-feedback-brief-2026-07-19.md`

Claude should begin in DesignSync against project
`3af2f1ea-428c-49b3-8b02-c066ec0c7452`, ground with `get_file`, and build the job-card and full
Apply Wizard modal flip states in Claude Design. Do not start with local design-system or production
UI edits. Randall must approve the Claude Design result before production implementation.

The feedback backend is present only in the current shared dirty worktree. It is verified locally
but not committed, pushed, deployed, or migrated in production. Re-check git status before work and
do not overwrite the backend files listed in the brief.

## 2026-07-17 - Human Path wizard UI pass: buttons + copy + regenerate + LI Profile (Claude)

Session focus was the production Human Path (apply wizard). Randall gave a 5-item UI list;
all shipped in commit `dde302d` (pushed to origin/main). Both the app and the approved
Claude Design cards were updated in the same pass (parity held).

Shipped:
1. **Button hover pass (wizard-wide).** Every button hover is now scoped to
   `:not(:disabled)` so disabled Continue/Back/Save/Regenerate no longer light up.
   Non-navigable stepper steps carry `disabled` (default cursor, no tint); past steps get
   the teal-tint hover. Contact cards + tracking-checklist rows gained a soft teal-tint
   hover (they had none). Same disabled-hover scoping applied to `modal.html` (shared shell).
2. **Copy button = teal**, same button family/size as Regenerate (measured 50px = 50px),
   legacy two-squares icon. New `WizardCopyButton` component: the checkmark + "Copied"
   state flips **only after** `navigator.clipboard.writeText` resolves (blocked write stays
   on "Copy"). Keyed on `message.id:regenerationCount` so it resets after a regeneration.
3. **Message box auto-grows** to the full message: CSS `field-sizing: content` +
   `overflow-y: hidden`, with a JS `AutosizeTextarea` fallback (useLayoutEffect sets height
   to scrollHeight) for browsers without field-sizing (Safari). No inner-scroll clipping.
4. **"Regenerate once" -> "Regenerate"** with hover tooltips (CSS `.tipWrap` + `data-tip`,
   pseudo-element, shows over the disabled button via the wrapper): "1 re-generation per
   message" before use, "re-generations used" after. Button stays visible but disabled once
   `regenerationCount > 0` (was vanishing entirely). NOTE: tooltips are hover-only, so they
   do not show on touch devices.
5. **LI Profile pill** (name + new-tab arrow, shared `.seeProfileBtn` primitive) on BOTH
   the step-2 contact cards (next to each name) and the step-3 recipient header. Wired to
   the discovered `linkedin_url`. Full chain verified: contact-provider extracts/cleans the
   URL (prompt asks for direct LinkedIn profile, prefers LI-reachable) ->
   `contact_suggestions.linkedin_url` persistence -> pursuit read -> pill `href`, opens new
   tab. Pill only renders when a URL exists (no dead links). Same external-link arrow added
   to "Open job posting".

Files: `app/dashboard/ApplyWizardModal.tsx`, `app/dashboard/apply-wizard.module.css`,
`design-system/components/{apply-wizard,copy-generation,modal}.html`. DS cards registered
in Claude Design: apply-wizard **r8** (2026-07-24: potential-contact copy; Possible Hiring
Manager; stale verified/reporting-chain claims removed; registered at viewport 1280),
copy-generation **r2**, modal **r2**.

Verified: `tsc` clean; production build green; Playwright at 320/375/390/1280/1440 — zero
overflow, no textarea clipping, Copy/Regenerate heights equal, teal Copy hovers to bluebird,
disabled Regenerate + disabled stepper do NOT change on hover (default cursor), tooltip
renders with correct text, contact-card hover tint fires, step-2 LI pills sit next to each
name (at 320px a long name wraps the pill cleanly, no clip).

**NOT prod-verified end-to-end.** The wizard's live behavior (real clipboard, autosize,
tooltips, LI pills on both steps) was not exercised against production with a throwaway QA
account — the full flow requires a real pursuit + a metered OpenAI discovery call. Verified
at the card/measurement/build layer only. Next session, if desired: drive the live wizard
once through a temp QA user to confirm.

**Deferred (Randall's call, not done):** the homepage walkthrough card
(`design-system/components/home-human-path.html`) Message slide still shows the OLD flat
Copy button. It's a protected surface (homepage) and was out of scope; sweep to the new
teal Copy next session if wanted.

**Next session:** more Human Path items on Randall's list (not yet enumerated).

## 2026-07-16 (night) - Phred Telegram workflow externally delivers replies

The Phred QA workflow now closes the user-reply loop instead of stopping at a local
outbox file.

Shipped and verified:

- App commit `2258c03` added the signed production endpoint
  `POST /api/internal/qa/user-reply`.
- Relay commit `6d6be7c` added Telegram backlog management through `/backlog` and
  `/backlog JOB-###`, with idempotent Codex/Claude routing approvals.
- The relay posts approved replies to the app with an HMAC signature, a 15-second
  timeout, and two transient retries. The app sends through Resend SMTP with a stable
  idempotency key.
- Production sender identity is `Dumpster Fire
  <no-reply@mail.thejobmarketisadumpsterfire.com>`. The verified Resend domain is the
  `mail.` subdomain, not the root domain. Reply-To remains the existing public Contact
  address.
- Vercel production contains the Resend credential, webhook signing secret, project ID,
  From identity, Reply-To, and subject prefix. Secret values remain outside git.
- The local relay LaunchAgent uses external webhook delivery. Local and public ngrok
  health/readiness passed after restart. Readiness reported signed external delivery,
  two retries, and connected Codex and Claude workers.
- Live validation ticket `JOB-018` passed draft and delivery callbacks. The app returned
  HTTP 202, Resend accepted the email on attempt 1, the reply was stored as `sent`, and
  the ticket closed with `user_reply_sent`. This was webhook delivery, not local outbox
  delivery.

Operational flow:

1. Website feedback creates a Phred ticket and Telegram card.
2. `Save reply draft` creates and previews the response.
3. `Deliver approved reply` sends externally and posts a durable Telegram result.
4. `/backlog` lists queued product work; `/backlog JOB-###` opens a ticket for Codex or
   Claude routing.

Important diagnosis lesson: do not infer an email provider's authorized From domain from
the public site hostname. Validate the exact provider domain first. The initial root-domain
From address failed with Resend SMTP 550 even though email setup was already complete. The
Resend key was correctly restricted to the verified
`mail.thejobmarketisadumpsterfire.com` subdomain. The screenshot of the existing key exposed
the mismatch; changing only the From address fixed delivery. When Randall says setup is
already complete, diagnose the remaining mismatch from direct evidence instead of asking him
to repeat setup.

Next Phred starting point: use the next real website report to confirm a human Telegram tap
produces the transient callback acknowledgement, durable receipt, and inbox delivery together.
The full delivery action path is already verified. Synthetic callback IDs cannot validate
Telegram's temporary callback toast because Telegram did not issue those IDs.

## 2026-07-16 (evening) — Randall's bug list: 13 fixes SHIPPED + PROD-VERIFIED (Claude)

Every item below is committed to origin/main, deployed, and verified on production
(throwaway QA accounts via Supabase admin, created → deleted; Playwright measurement,
not eyeballing). No open work from this list.

1. **Onboarding Card 1 gate REMOVED** (0be2bbe) — the fieldset that grayed out all of
   onboarding until Card 1 saved is gone; disabled Card 1 save now says what's missing.
   NEW HARD RULE in AGENTS.md: "No Gates Without Approval" — never lock/disable/hide/
   sequence access without Randall's explicit per-gate OK.
2. **Stale-token 401s fixed app-wide** (7097285 + 2ce084c) — requestPublicProfileApi and
   the resume-scan fetch refresh the session once and retry on 401 (hour-old tabs sent
   dead tokens; raw "Invalid bearer token." leaked into UI — now human copy).
3. **Plan gate resolves pre-render** (001d97d) — no-plan users never see a flash of the
   onboarding form; neutral loading state meanwhile.
4. **Ashby/JS-shell job links ingest** (1937625) — JSON-LD JobPosting parsing in
   ingest-link; unit case added; verified with the reported Kit posting end-to-end.
5. **Skip / Open posting hover footprint** (7ac600c) — teal-tint hover on the public
   dashboard + paper scan surface; 3 DS cards swept. (Hit areas measured fine; the
   "dead clicks" were the stale-token bug above.)
6. **Inline page loader** (a38fe53) — mascot standee + one line on onboarding/dashboard/
   plan landings (approved in Claude Design as a scan-progress card state).
7. **OG share** (4940f79 + d84418d) — og:title = feed-the-machine tagline (iMessage shows
   only image+title+domain, never og:description), og:description picks up after it.
   Tab title + SEO meta description unchanged.
8. **Fit Signals fields REMOVED from onboarding** (e6026e1) — testers found them
   superfluous; was already optional. Backend/API/matching contribution + stored data
   intact. 3 DS cards swept. **"Avoid companies" was checked and has NO gate anywhere**
   (completion, validation, UI) — live-proven; if a tester reports it again, get a
   screenshot of what looked required.
9. **Dashboard heading spacing + hierarchy** (330f9c1) — topBar clears the sticky header;
   section h2 steps to 1.5rem; missing topBar added to the dashboard-jobs DS card.
10. **Homepage matchbook spacing** (c73addd + c393047) — hero frame clears the header
    (gap 20→36px); card-to-first-headline gap 174→104px desktop / 72px mobile (only the
    first post-hero section tightened; section rhythm below unchanged).

Ops notes: Vercel git builds can queue up to ~20 min — check `npx vercel ls` before
assuming the webhook failed (one redundant-but-harmless manual deploy happened). Reusable
prod E2E harnesses (new-user flow, forced-expiry, loaders, heading measurements) lived in
the session scratchpad and are GONE with the session — offer stood to commit under
scripts/qa/, Randall did not take it up; recreate from this doc's descriptions if needed.

**Next session starting point:** no open items from this bug list. Check the refinement
backlog below, the still-queued v8 outreach-prompt review (message-gen track), and
whatever new tester feedback has arrived. Parallel session shipped 2258c03 (QA reply
delivery endpoint) mid-session — coordinate before touching lib/qa or app/api/internal.

## Refinement backlog (low priority — pick up when the big fish are fried)

- **Card 1 DS lede still names an "Outreach" per-track card** that was cut from the
  product 2026-07-09 (58c6734, Outreach Rules retired). One-word deletion in
  `design-system/components/onboarding-resume-upload.html` ("Work Examples, Skills,
  Outreach" → "Work Examples, Skills") + full card re-sync (Claude Design push +
  register + mirror commit). No product code involved. (Flagged by Claude 2026-07-16,
  parked by Randall.)

## 2026-07-16 (later) - P0 scan matching FIXED: legacy engine ported (Claude)

> **UPDATE (same day): SHIPPED + LIVE-VERIFIED.** Commit `c9447ea` pushed to origin/main,
> Vercel deployed. Randall's 139 stale active `job_scan_results` cleared (3 dismissed rows
> kept; his 1 saved_jobs row — a garbage-era save — left in place but no longer surfaces).
> Prod rescan via minted session through a real browser (Vercel bot challenge blocks curl):
> POST /api/jobs/scan 200 → GET /api/jobs returns exactly the 4 roles the offline
> simulation predicted (84 Strong / 74 / 72 / 72 Potential, all program-management), zero
> garbage, zero duplicates; sidebar titleParameters = his 4 scan titles. EP-family postings
> verified against his real aggregate (probe4): remote agency EP = Strong 84, hybrid
> creative producer = 74, onsite EP = 62 w/ risk, low-comp = excluded on his $180k floor.
> **SECOND BUG, same day (Randall pushed back on the 4-result outcome, he was right):**
> the scan candidate query was capped at the newest 250 pool rows — under 10% of the
> 2,747-job pool (16 shared boards, all cron-scanned 06:00 with identical scraped_at, so
> the window was an arbitrary slice). Fixed in `cf216d0`: the scan pages the WHOLE
> eligible pool (1000/page, 10k safety cap, newest-first). Deployed + live-verified:
> prod scan now returns **47 results matching the offline evaluation exactly** — 8 Strong
> (incl. Brand Producer @ Figma), 26 Potential (incl. Internal Content Producer +
> Marketing Events Producer @ Anthropic, Creative Producer @ Stripe), 13 Weak, across 9
> of the 16 boards. Boards confirmed: 16 shared, 0 user-owned for Randall.
> Tuning levers if any specific rating looks off: profile poor-fit signals / track
> weak-signals feed the engine as penalties; lane rules live in matching/occupation.ts.

**OPEN INVESTIGATION (Randall 2026-07-16, handed to Codex): general/broad job boards are
missing from the public scan — coverage is company boards only.** Facts to start from:

1. The legacy source mandate (`docs/legacy-reference/SOURCE_INVENTORY.md`, canonical) defines TWO
   first-class source arrays: (1) broad job boards searched by candidate criteria and
   (2) targeted company career boards. Both must feed the same
   normalize → dedupe → match → rank flow. "Targeted company sources are not a substitute
   for broad-market coverage."
2. The public product ported ONLY array (2): 16 shared company ATS boards (greenhouse/
   lever/ashby) scanned by the 06:00 cron + user-added boards via
   `lib/scan/sources/board-registry.ts` (greenhouse|lever|ashby|workday|html). There are
   NO broad-source connectors in `lib/scan/`.
3. Legacy had broad sources IMPLEMENTED: Remotive (`remotive.com/api/remote-jobs`, ~28
   rows/query cap) and Himalayas (`himalayas.app/jobs/api/search`, 20/request, ~280-380
   rows/scan via 18 profile-derived query variants) — see the legacy connectors in
   `docs/legacy-reference/` (`connectors.ts`, `connector-runner.ts`, `search-sources.ts`,
   `board-registry.ts`, extracted from the retired `app/scans/` at commit `4e1e5d0`) and the
   inventory's per-source status/blocker notes (ready / blocked / needs_key / needs_proof)
   for the rest (LinkedIn/Indeed etc. have documented blockers).
4. Work needed: confirm which inventory sources are still viable; port broad connectors
   into the public pipeline (`ingestNormalizedJobs`) with profile-derived queries; decide
   cron vs per-scan fetch; broad rows land in the shared pool (owner_user_id null) and the
   full-pool scan (cf216d0) + ported engine (c9447ea) already handle matching/dedupe.
5. Scan-side coverage is otherwise verified working (47 results from the 2,747-row pool);
   any further mismatch reports should be tested against the offline probes pattern
   (scratchpad scan-probe) before touching the engine.

**Root cause of the P0 garbage-scan bug (and the earlier "142 roles, 0 a fit"):** the public
scan never used the refined legacy matcher. Randall had explicitly directed that the legacy
`app/scans/` engine and its improvements be ported; instead the public product shipped a
from-scratch keyword engine (Codex, `d850831` 2026-06-28) that was never tuned. Its scan
filter admitted any job whose description contained any ≥5-char word of any parameter
(substring "AI" matched "maintain"), and its scorer's generous neutral priors floated
irrelevant jobs to 50–61 (= 3★) while capping real fits under 70 (= "0 fits"). Confirmed
offline against Randall's real 139 active results: scores spanned 32–61, zero ≥70.

**Fix shipped (local, verified):** ported the legacy engine into the public matching lib —
- `lib/public-profile/matching/occupation.ts`: occupation-lane classifier (39-lane taxonomy)
  + per-user lane derivation from Role Tracks (replaces the legacy hardcoded polarity list).
- `lib/public-profile/matching/decision.ts`: evidence-gated additive scoring (title family
  +34/+24, authority/keyword/industry evidence, hard risks for avoid-company / wrong-lane /
  remote / comp-floor; excluded jobs capped ≤37). Whole-token term matching everywhere.
  More-specific wrong-lane titles beat generic target terms ("technical program manager"
  blocks even when "program manager" is a target).
- `lib/public-profile/matching/dedupe.ts`: company+title duplicate-posting collapse, applied
  at scan time (before the 75 cap) and at read time (prefers a saved copy, then best score).
- `engine.ts` evaluateMatch is now decision-led (same MatchResult shape; categoryFits kept
  as narrative); scorers.ts substring bug fixed (word-boundary matching).
- `lib/public-jobs/repository.ts`: scan inclusion = decision gate + dedupe (old
  `jobMatchesProfile` deleted).

**Verified:** offline probes against prod data (read-only; scratchpad scan-probe): his 139
results re-score to 1★x29/2★x105/4★x2 with every bug-report title (finance, staff SWE,
inference, data center, account exec ×31) excluded ≤37; fresh-scan simulation over the real
250-job window returns 4 genuine program-management roles. `tsc` clean, lint 0 errors,
build green, test:matching (new regression tests for wrong-lane + TPM) + test:public-jobs +
test:job-link all green. `test:matching` is now wired in package.json.

**Open follow-ups:**
1. NOT committed/pushed/deployed — awaiting Randall's OK.
2. His 139 stale active `job_scan_results` rows remain; garbage now sinks to the bottom with
   honest labels, but recommend clearing actives + rescanning after deploy (needs OK).
3. Profile thinness: his "Program Manager" track has 0 target titles and all tracks have 0
   keyResponsibilities (onboarding hardcodes `keyResponsibilities: []`) — enrich role tracks
   from résumé derivation so responsibility evidence scores; LLM-assisted rating is the
   later quality pass.
4. Two leftover empty candidate_profiles rows from other user ids (created 07-15/16, look
   like QA leftovers) — cleanup needs OK.

## 2026-07-16 - NEXT SESSION START HERE: scan-fit bug + bug list (Claude)

Randall is compiling a **large bug list** for the next session. One investigation is
already OPEN with diagnosis in progress:

**BUG (open): profile scan returned "142 roles, 0 a fit."** Facts established so far:
- His scan stored 140 active `job_scan_results` (16:38Z) with correct parameters
  (Producer/PM titles + industries) and `providerMode: normalized_public_jobs`.
- Match scores are NOT stored; they are computed at read time in
  `rankJobsForProfile` (`lib/public-jobs/repository.ts` ~L287) via `evaluateMatch`
  against the live aggregate, then the dashboard buckets by `starsFromScore`.
- So either the engine scores everything low against his current aggregate (data
  regression? his profile was regenerated 07-14 during résumé re-derivation), or the
  dashboard's star bucketing/labeling misreads healthy scores.
- Next step (script was staged, session ended before run): load his real aggregate +
  his 140 result jobs offline via `node --experimental-transform-types` importing
  `loadCandidateProfileAggregate` + `evaluateMatch` directly, print the true
  score/label distribution and per-category whyNotMatched. That splits engine-vs-UI
  in one run. Note 2026-07-15's owner-scope change to the candidate query is a
  suspect to RULE OUT (it only filters candidates; scoring path untouched).

Also shipped/closed 2026-07-16 (all live-verified):
- **PhredBot QA bot fully operational**: relay + static ngrok tunnel as Studio
  LaunchAgents, Telegram pings + inline approvals verified interactively; upstream
  `mergeEnvFile` bug documented; `scripts/resend-notification.js` added to the relay.
  First real ticket JOB-008 ran the whole loop.
- **JOB-008 fixed**: homepage walkthrough capped at the 770px intro column
  (`64859c2`) and centered (`f281d3c`); card at r5, mirror in parity.
- Telegram triage how-to: the 12 approve/reject rows are a menu, pick 1-2 (ack +
  one routing action); offer stands to slim the action set.

## 2026-07-15 (evening) - Homepage walkthrough LIVE + onboarding tips + prod sweep green (Claude)

1. **"How Dumpster Fire works" is live on the homepage** (`5d6ca2f`, verified in prod HTML +
   live screenshot). The 4-step Human Path gallery is replaced by the approved 5-slide
   whole-app walkthrough (Profile / Pursuits / Your Human / Message / Records): mascot intro
   row, document-style resume-highlight sheet ("From your résumé" tag), or-paste divider +
   pursue-a-link preview, contact cards with "who receives your message" copy, read-only
   message + Copy, records checklist with Coming Soon pill. No CTAs on any slide (Randall's
   r1-r3 notes). Design source: `design-system/components/home-human-path.html` (approved
   r3, repo mirror in parity, registered "approved + shipped"). Breakpoints verified on the
   production build at 320/375/390/1280/1440; the old gallery's em dash died with it.
2. **Onboarding prescriptive tips live** (`b9ccc2c`, Randall-dictated copy): résumé dropzone
   second hint line (output is as good as the input; vet/improve/format the PDF) and
   work-examples intro relevance guidance (examples are pulled for jobs you pursue; be
   specific in context). Swept across resume-upload / work-examples / card-interior cards.
3. **Full production sweep: 18/18 green** (pages 200, corrected OG byte-exact, all of
   today's ships confirmed in deployed chunks, six auth-gated APIs 401, RLS leak checks
   clean) + DB layer clean (1 user, 0 user_link rows, 3 migrations recorded, no bad
   regeneration counts).
4. **Access code confirmed in prod**: shared invite is `DUMPSTERFRIENDS` (plural), premium
   plan, 25 uses (1 redeemed); five unused single-use `GOODEST-*` tester codes.
5. **QA bot (PhredBot relay): parked on two Randall decisions.** The relay platform's only
   built-in notification channel is Telegram (no native Signal); it needs an always-on host
   (Fly.io/Railway/Studio+tunnel; storage can use existing Supabase Postgres). Next session:
   get the two answers, then drive deploy + `QA_AGENT_URL` in Vercel + notification setup.
   See `docs/qa-feedback-widget-integration-2026-07-02.md` "Outstanding work".
6. **Process note**: when Randall has directed a design revision line-by-line and says
   "ship it all", that IS the approval; do not hold the implementation at a re-approval
   gate. The Claude Design gate exists for designs he has not seen/directed.

## 2026-07-15 (later) - Private pasted jobs + pursue-a-link entry + OG overprint fix SHIPPED (Claude)

Commit `d74eec3`, deployed and verified live; migrations `20260715000100`/`20260715000200`
applied around the deploy (see `docs/database-migration-state.md`).

1. **Pasted jobs are private to the pasting user** (Randall's call). `jobs.owner_user_id`
   (null = shared pool): owner-scoped from-link dedupe, scan candidates, and RLS read
   policy; pursuit create + match return 404 for another user's job (indistinguishable
   from nonexistent); `/api/jobs/save` was already safe via scan-results gating. Verified
   on prod with two temp QA users (created then deleted): B cannot read/pursue/match/scan
   A's pasted job; B pasting the same URL gets an own private copy; A still dedupes to
   A's copy; shared-pool upsert works against the new 3-col conflict target.
2. **Pursue-a-link entry SHIPPED** — the approved Dashboard Jobs card block ("Found a job
   somewhere else?") at the top of the results column, wired to `POST /api/jobs/from-link`
   and straight into the Human Path wizard. This closes the missing front door to the
   external-job-link feature. Breakpoints verified 320-1440; orphan fix (nbsp) applied in
   card + implementation.
3. **Duplicate pursuit fixed end to end** — backend returns 409 `already_pursuing` with
   the existing pursuit (was an empty 500 from the unique-key collision), and the wizard
   resumes that pursuit (reads contacts/messages, recomputes match).
4. **OG share image corrected** (Randall-approved OG Share revision): wordmark now uses
   the hero-matchbook overprint (tomato slip on top, multiply blend) so the overlap
   darkens exactly like the homepage. Render source `design-system/components/
   og-share-compose.html` (1200×630); `public/og-share.png` regenerated and verified
   serving on prod.
5. **Design-flow correction (standing)**: the 07-14 Codex UI shipped without Claude
   Design approval; the gate applies to the change regardless of implementer. Proposed
   AGENTS.md rule pending Randall's decision (see conversation 2026-07-15).

## 2026-07-15 - Codex handoff closed out: regen migration live, both features prod-verified, DS cards registered (Claude)

Completed all three open items from `docs/codex-handoff-external-job-link-2026-07-14.md`:

1. **Migration `20260714000100_outreach_message_regeneration.sql` applied to production**
   via the Management API and recorded in `schema_migrations`. This was urgent: the code
   deploy (`9e7f1d3`) had auto-shipped ahead of the migration and the deployed repository
   selects `previous_message,regeneration_count` on every outreach-message read, so prod
   outreach reads were broken until the migration landed. Post-checks confirmed columns,
   default, and the 0/1 CHECK. Details in `docs/database-migration-state.md`.
2. **External job link verified end-to-end on production** with a temp QA user (created,
   verified, then deleted): real Reddit posting ingested via `POST /api/jobs/from-link`
   (200 `ingested`, correct title/company, `source=user_link`), resubmit returned
   `already_known` with the same jobId, and the jobId was accepted by pursuit creation.
3. **Message regeneration verified end-to-end on production**: full funnel (pursuit ->
   review -> Human Path -> contact selection -> outreach) then regenerate-once. Confirmed
   `previous_message` retains the original, `regeneration_count` becomes 1, the row is
   replaced in place (no new row), exactly one extra outreach credit is charged, a second
   regeneration returns 409 `already_regenerated` with no charge, and no em dashes in
   either generation.
4. **Claude Design registration completed** for the four touched cards (Apply Wizard,
   Copy Generation, Home Human Path, Onboarding Account Bar) - files + `_ds_manifest.json`
   pushed and `register_assets` run (the handoff's NOT VERIFIED item).

Found during verification (documented, not fixed): `POST /api/public-profile/pursuits`
returns an empty **500** (not a friendly 409) when the user already has a pursuit for that
job (`pursuits_user_id_job_id_key` unique violation is unhandled). The QA user's data was
fully cleaned up; the ingested Reddit posting legitimately remains in the shared jobs pool.
Open decision for Randall (flagged by Codex): whether user-pasted jobs need private
ownership - `jobs` is a shared global pool visible to other users' scans.

Found while verifying the QA widget deploy. `https://www.thejobmarketisadumpsterfire.com`
(and apex) currently serve the **Lab26 project**: `/onboarding`, `/dashboard`, and
`/api/account/redeem-code` (shipped in the 07-02 launch build) all return Lab26-branded
404s. The homepage only *looks* live because a stale copy is served from edge cache
(`age: ~9.3 days`, `x-vercel-cache: HIT`). The real app IS deployed and current at
`https://dumpster-fire-llc.vercel.app` (verified: launch routes + QA widget present,
`/api/qa-report` responds). This matches the prior warning in `docs/next-session.md`
about alias promotion. **Fix (Randall, Vercel dashboard):** point the
`thejobmarketisadumpsterfire.com` domains at the `dumpster-fire-llc` project /
promote the latest production deployment, then re-verify `/onboarding` returns 200.
Anyone using launch invite codes against the custom domain is hitting 404s today.

## 2026-07-02 - QA feedback widget + QA agent relay integrated (Claude)

Persistent comment box live on every page: the PhredBot dock (design source
`design-system/components/footer.html`) opens a QA feedback panel (new DS card
`design-system/components/qa-feedback.html`) that posts through `app/api/qa-report/route.ts`
to a standalone QA agent relay at `~/Sites/dumpster-fire-relay` (provisioned from
`~/Sites/QA-AGENT`, ticket prefix JOB). Verified end-to-end locally; fails soft when the
relay is unreachable. Full map, contract, and deferred steps (relay deploy, Telegram bot,
Vercel `QA_AGENT_URL`) in `docs/qa-feedback-widget-integration-2026-07-02.md`. The 06-30
"NEXT SESSION START HERE" priority below (contact-selection UI) is unchanged.

## 2026-06-30 - NEXT SESSION START HERE

Human Path contact discovery is **built + verified live** (OpenAI gpt-4.1 + web_search). Next:
wire the **design-gated contact-selection UI** (still unbuilt) so users can pick discovered contacts
for outreach — needs an approved design source first (AGENTS.md Design Authority). The backend chain
is complete: discovery -> contact_suggestions persistence -> contact selection API -> outreach
generator. Rotation: `OPENAI_API_KEY` joins the pre-launch key-rotation list.

## 2026-06-30 - Human Path contact discovery ported (Claude)

Built the "find the person to contact" half of the homepage lead value prop. Randall chose OpenAI
`gpt-4.1` + web_search (cheapest at ~$0.08-0.12/discovery; proven legacy path) over Anthropic web
search, after a real per-run token-cost comparison.

- `lib/public-profile/pursuits/contact-provider.ts` — real `HumanPathProvider` porting the proven
  legacy `app/scans/api/contacts/route.ts` logic: OpenAI Responses API + `web_search` tool, two-pass
  (initial + gap-fill when <3 contacts or no functional lead), ported system prompt +
  chain-of-command research plan + lenient parse/rank/dedup. Maps results to the public
  `HumanPathContact` shape (contact-type enum, low/medium/high confidence buckets, cited
  `verificationNotes`). Injected model-call seam (mockable); **graceful no-key degradation ->
  `provider_unavailable`** (outreach-generator convention), so nothing breaks before the key is set.
- Wired as the default provider at `lib/public-profile/api.ts` (~line 1163), replacing the
  `unavailableHumanPathProvider` stub. Metered Human Path subscription checks unchanged.
- Test: `scripts/test-public-profile-contact-discovery.mjs` (no-key degradation, parse/map/rank,
  gap-fill trigger + cross-pass dedup, junk-name filtering, prompt construction).
- Validation: `tsc` clean; lint 0 errors / 7 pre-existing warnings; `npm run build` compiles;
  contact-discovery + pursuits + outreach suites pass; `git diff --check` clean.
- **VERIFIED LIVE** with the real `OPENAI_API_KEY` (Randall set it): a discovery for "Director of
  Product Marketing @ Notion" returned 3 real, cited contacts in ~6-11s — Head of PMM (hiring
  manager), CMO (functional leader), GTM recruiter — each with evidence URLs + LinkedIn, ranked by
  chain-of-command. Live smoke exposed one mapping gap (model emits `long_shot` with an underscore;
  the normalizer only matched the spaced form) — fixed by treating `_` as a space in
  `normalizeContactType`, with a regression test.

Full plan / starting point: `docs/claude-handoff-contact-discovery-2026-06-30.md`.

## 2026-06-30 - Posting parser Phase 2: LLM gap-fill (Claude)

Gap-fill (Randall's choice): LLM extracts Responsibilities / Required experience only for postings
the heuristic left empty (~40% missing responsibilities, ~57% missing required experience, ~30%
both — measured in prod).

- `lib/scan/sources/llm-extract-posting.ts` — `extractPostingSectionsLLM` (callModel convention:
  lazy Anthropic SDK, claude-opus-4-8, graceful no-key → empty). Returns the two lists from any
  format/language. `parsePostingModelJson` tolerates code fences/preamble, cleans + caps items.
- `lib/scan/refine-postings.ts` — `runPostingRefinement` loads jobs with an empty bucket (bounded
  limit), LLM-extracts, fills ONLY the empty bucket (never overwrites heuristic results). Injectable
  loader/extract/callModel seams.
- `GET|POST /api/jobs/refine-postings` (CRON_SECRET-guarded, `?limit=`) + daily `vercel.json` cron
  at 07:00 UTC (after the 06:00 source scan).
- **Clobber fix:** source-scan now splits its upsert — rows with parsed sections include the
  columns; rows with empty sections OMIT them, so the daily scan never wipes an LLM gap-fill (on
  conflict, omitted columns are preserved).
- Validated end-to-end against prod (ESM run): 3/3 empty jobs filled, incl. Japanese postings.
  Tests: `test-llm-extract-posting`, `test-refine-postings`, updated `test-source-scan`. tsc/lint/
  build clean.
- Backfill: the daily cron chips away (limit-bounded for function-timeout safety); for a faster
  one-time fill, hit `/api/jobs/refine-postings?limit=100` repeatedly after deploy. NOTE: the
  CommonJS test-harness can't lazy-import the ESM SDK, so local `.mjs` validation of the live
  callModel no-ops — validate via the deployed endpoint or an ESM run (as done here).

## 2026-06-30 - Dashboard rebuilt to the match-card/scan-page design (Claude)

Implemented the live dashboard to the existing approved match-card/scan-page design (Randall: the
design was already done; no new card approval needed — fix the backend and build it in full).

- `app/dashboard/DashboardClient.tsx` + `dashboard.module.css` rebuilt to the scan-page layout:
  match-card stack (main, `minmax(0,1.4fr)`) + 300px Overview/Search-settings sidebar. Cards now
  show rank disc, fit score + star row, meta grid, description + keyword pills (from match signals),
  the **Responsibilities + Required experience sub-cards** (real parsed data) with **match-term
  highlighting**, and a Save / Open posting / Pursue action rail. Rating-filter tabs (functional, by
  fit tier). Wildcard ("weird match") flag on lowest-tier matches. Sidebar: Overview (last scan,
  active/saved counts, Run scan, View saved toggle) + Search settings (remote/salary floor/target
  titles/avoided, Edit -> profile editor).
- Backend support added: `PublicJobMatchSummary.signals` (matched terms for highlighting, from
  `evaluateMatch` categoryFits) and an optional `searchSettings` summary on the jobs read response
  (from the candidate aggregate). `Pursue` posts to `/api/public-profile/pursuits`.
- Verified: card synced to Claude Design matches (screenshotted 1120/560); tsc clean; lint baseline;
  build compiles; all job/match/parser suites pass.

Still open: Phase 2 LLM posting-parser refinement for heading-less postings; Edit Profile modal +
dashboard hero are still on `site.module.css` (separate slices; hero still has an eyebrow label).

## 2026-06-30 - Posting parser: Responsibilities + Required experience (Claude)

High-priority per Randall: match cards must show Responsibilities + Required experience (the legacy
match-card spec). Phase 1 (heuristic) built and live in prod.

- `lib/scan/sources/parse-posting.ts` — `parsePosting(description)` splits a posting into
  `responsibilities[]` + `requiredExperience[]` by detecting section headings (heading set adapted
  from legacy `app/scans/near-miss-review.ts`), bucketing responsibility vs requirement headings,
  filtering boilerplate, capping 6/section. Blurb headings (About the Role/Team) are boundaries.
  Heading-less postings degrade to empty (Phase 2 LLM will cover those).
- Wired into `runSourceScan`. Migration `20260630000200_jobs_posting_sections.sql` adds
  `responsibilities`/`required_experience text[]` to `jobs` — applied to prod + recorded.
  Backfilled by re-running the source scan (2102 jobs); most yield ~6 responsibilities + ~6
  required-experience items from real postings.
- Read path: `PublicJobRecord` gains `responsibilities`/`requiredExperience`; returned by scan/read.
- Tests: `scripts/test-parse-posting.{ts,mjs}`. All suites pass; tsc clean; lint baseline; build OK.

Next: Phase 2 LLM refinement (callModel/opus, graceful no-key) for heading-less/messy postings;
DashboardClient UI rebuild to the approved card (waiting on card approval; match-term highlighting
lands with the UI).

## 2026-06-30 - All migrations applied to prod; direct DDL capability (Claude)

Prod schema is now fully in sync with `supabase/migrations/`.

- Applied the three pursuit migrations (`20260629000100/200/300`) to prod and recorded all five
  recent versions (000100/200/300/400 + 20260630000100 RLS) in `supabase_migrations`. Verified:
  pursuit_events present with RLS + owner policy; pursuits/contact_suggestions/outreach_messages
  columns present. `docs/database-migration-state.md`: every migration applied + recorded, none
  outstanding.
- **New capability:** migrations can now be applied directly from the working environment via the
  Supabase Management API (runs SQL as `postgres`), using a personal access token in
  `.env.local` (`SUPABASE_ACCESS_TOKEN`, gitignored). No more hand-applying SQL in the dashboard.
  Method documented in `docs/database-migration-state.md`.
- Security: `subscription_plans` RLS fix verified live (anon read -> `[]`).

Note: `ANTHROPIC_API_KEY` was inadvertently surfaced in a 2026-06-30 chat transcript while fixing a
malformed `.env.local` line — add to the existing key-rotation list (see project-todo "Rotate
exposed credentials").

## 2026-06-30 - Match scoring wired into scan ranking (Claude)

Per-user scans now rank and annotate results with the rich matching engine instead of only the
coarse keyword filter.

- `readPublicJobsForUser` (which both `GET /api/jobs` and `runPublicJobsScanForUser` return through)
  now scores each result via `evaluateMatch` against the candidate profile, attaches a compact
  `match` summary (`{ score, label }`) to each `PublicJobRecord`, and sorts best-first.
- The coarse `jobMatchesProfile` filter still governs which jobs enter scan results; scoring is a
  spectrum and never hard-filters — poor-fit jobs still surface, annotated with their score/label.
- `PublicJobRecord.match?` added (`PublicJobMatchSummary`). Repository test asserts the annotation.

Validation: all 8 test suites pass; `tsc` clean; `npm run lint` 0 errors / 7 pre-existing warnings;
`npm run build` compiles; `git diff --check` clean.

Remaining open: apply the three Codex pursuit migrations to prod (`20260629000100/200/300`); record
the `000400` bookkeeping row. Both need the Supabase dashboard.

## 2026-06-30 - Source scan LIVE in prod (Claude)

The source scan pipeline is running against production data.

- Migration `20260629000400` DDL applied to prod (by Randall, dashboard). Bookkeeping row in
  `supabase_migrations.schema_migrations` still pending — see `docs/database-migration-state.md`.
- `job_sources` seeded with 16 starter companies (verified working public boards):
  - Greenhouse: Stripe, Airbnb, Dropbox, Coinbase, Robinhood, GitLab, Databricks, Figma, Discord,
    Anthropic
  - Ashby: Ramp, Linear, Notion, Runway, OpenAI
  - Lever: Spotify
  - Starter set — Randall can add/remove/pause rows in `job_sources` anytime (see
    `docs/scan-sources-setup.md`).
- First source scan run manually against prod (via the real `runSourceScan` code): all 16 sources
  succeeded (0 errors), 3702 fetched, **2105 jobs upserted**. 1018 carry parsed salary; remote-type
  classification populated. Verified the new `jobs` columns and `job_sources.last_scanned_at`.

The one remaining piece for automation needs Randall's Vercel account: **set `CRON_SECRET` in Vercel,
then redeploy** so the `vercel.json` cron registers. No Vercel CLI/token exists in the working
environment, so it cannot be done from here. The endpoint + cron are deployed in code; prod is
already populated from the manual run, and the daily cron just keeps it fresh. Instructions:
`docs/scan-sources-setup.md`.

Also still pending (separate from source scan): the three Codex pursuit migrations
(`20260629000100/200/300`) are not applied to prod yet — needed before pursuit features work live.

## 2026-06-29 - Public source scan engine, Slice 1 (Claude)

Built the public product's own job source scan so the public `jobs` table can be fed independently
of the legacy `/scans` system (Randall: nothing should rely on a legacy DB/system; do not reduce
functionality). Backend-only foundation; no UI. Named under the **Scan** paradigm (Randall): the
connectors are the *sources a scan pulls from*, so this lives in `lib/scan/`, not a parallel
"connectors" concept.

Context that drove this: the mature connectors in `app/scans/` only ever fill the legacy
`job_search_jobs` table, while the public scanner (`lib/public-jobs/runPublicJobsScanForUser`)
only ever reads the separate public `jobs` table — which nothing populated. This slice closes that
gap with an independent source-scan path.

- New independent scan-source engine `lib/scan/sources/` (no `app/scans` import): full port of all
  providers (Greenhouse, Lever, Ashby, Workday, iCIMS, Magnit, HTML, RSS, Rippling, Adzuna,
  Workable) plus salary/HTML/JSON-LD extraction and the fetch runner (retries, Workday
  title-variant fan-out, Himalayas pagination, Adzuna credential injection).
- `lib/scan/source-scan.ts` `runSourceScan` + `lib/scan/sources/registry.ts`: load active
  `job_sources`, fetch + normalize per source, upsert into public `jobs`
  (`on_conflict=source,source_url`), mark each source scanned, isolate per-source errors. Empty or
  paused source list is a safe no-op. Injectable `loadSources`/`fetchSource`/`markScanned` seams.
- Migration `supabase/migrations/20260629000400_public_job_sources.sql`: new `job_sources` config
  table (RLS-enabled, service-role only, no seed rows; tracks `last_scanned_at`/`last_error`) and
  extends public `jobs` with `external_job_id`, `apply_url`, `department`, `salary_min`,
  `salary_max` so no normalized field is dropped. Validated on a throwaway local Postgres:
  non-destructive ALTER, idempotent re-apply, RLS on, check constraints enforced. Not yet applied
  to prod.
- Tests: `scripts/test-scan-sources.{ts,mjs}` (per-provider parser fixtures + plan endpoints +
  salary parsing) and `scripts/test-source-scan.{ts,mjs}` (orchestration: upsert shape, dedupe,
  empty no-op, error isolation, Workday variant passthrough, cap).

Why the legacy relevance/scoring layer was NOT ported, and what operates instead:
- Legacy `app/scans/matching.ts` (`randallPrivateMatchingConfig`, single-user hand-tuned rules) +
  `app/scans/relevance.ts` filter jobs at fetch time for one user. The public product already has
  its own profile-driven engine `lib/public-profile/matching/` (`evaluateMatch` + category
  scorers; wired into `POST /api/public-profile/match` and pursuit creation) plus the scan-time
  filter `jobMatchesProfile` in `runPublicJobsScanForUser`.
- Porting the legacy layer would create a second, conflicting scorer hardcoded to Randall, and
  would filter the SHARED `jobs` pool to one user's relevance at source-scan time — wrong layer.
  Source scan fills the shared pool; per-user relevance is applied at scan time.
- Open gap to "complete" matching: `runPublicJobsScanForUser` currently selects results with the
  coarse `jobMatchesProfile`. The richer `evaluateMatch` scoring exists but is not yet wired into
  scan-result selection/ranking/annotation. Wiring it in is the next matching step.

Validation: new + existing test suites pass; `tsc --noEmit` clean; `npm run lint` 0 errors / 7
pre-existing warnings; `npm run build` compiles; migration validated locally; `git diff --check`
clean.

## 2026-06-29 - Source scan trigger, Slice 1b (Claude)

Added the scheduled trigger for the source scan. Backend/infra only.

- `GET|POST /api/jobs/source-scan` ([app/api/jobs/source-scan/route.ts](../app/api/jobs/source-scan/route.ts))
  guarded by `CRON_SECRET` (Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`). Handler
  `handleSourceScanRequest` in [lib/scan/api.ts](../lib/scan/api.ts): 503 if `CRON_SECRET` unset,
  401 on bad/missing bearer, 503 if storage unconfigured, else runs `runSourceScan` and returns the
  summary. This is an application-level route guard, not server-level auth.
- `vercel.json` schedules it daily at 06:00 UTC (`0 6 * * *`; Hobby-compatible, bump to `0 */6 * * *`
  on Pro).
- Tests: `scripts/test-scan-api.{ts,mjs}` (not-configured / unauthorized / storage-missing /
  authorized-run).
- Setup doc: [docs/scan-sources-setup.md](scan-sources-setup.md) — how to set `CRON_SECRET`, the
  schedule, and the `job_sources` seeding shape per provider.

Still needed before it produces data (Randall):
- Set `CRON_SECRET` in Vercel env.
- Add the real `job_sources` rows (companies + ATS board tokens) — see the setup doc. Until then the
  trigger runs and is a safe no-op.

Still open (later): wire `evaluateMatch` into per-user scan-result ranking/annotation;
de-duplicate the connector engine shared with legacy `app/scans`.

## 2026-06-29 - Pursuit read/list API (Claude)

Added the read/list API layer for public pursuits so future pursuit dashboard UI has data to
consume. Backend-only, no migrations, no UI, no design-gated surfaces touched.

- `GET /api/public-profile/pursuits` lists the user's pursuits (newest activity first), excludes
  `deleted` by default, supports `?status=<status>` filter and `?includeDeleted=true`, and returns
  each pursuit with its job summary plus per-status `counts`.
- `GET /api/public-profile/pursuits/[id]` returns full detail: pursuit + job + contacts +
  outreach messages + event timeline. First dynamic route in the app (Next 16 `params: Promise`).
- Repository: `loadPursuitsForUser`, `loadOutreachMessagesForPursuit`, `loadPursuitEventsForPursuit`
  in `lib/public-profile/pursuits/repository.ts`; batch `loadPublicJobsByIds` exported from
  `lib/public-jobs/repository.ts`; `OutreachMessageRecord` type added to pursuits/types.ts.
- Handlers `handlePublicProfilePursuitsListRequest` / `handlePublicProfilePursuitReadRequest` in
  `lib/public-profile/api.ts` with injectable loader seams.
- Tests extended in `scripts/test-public-profile-pursuits.ts` (repository) and
  `scripts/test-public-profile-api.ts` (handlers).

Validation: all public-profile test suites + `test:public-jobs` pass; `tsc --noEmit` clean;
`npm run lint` 0 errors / 7 pre-existing warnings; `npm run build` registers both new routes;
`git diff --check` clean.

Next backend-adjacent options remain: wire external connector ingestion into `/api/jobs/scan`,
or move to the design-gated pursuit dashboard UI track.

## 2026-06-29 - Codex backend brief complete

Codex completed and pushed the backend-only brief from
`docs/codex-tasks-backend-2026-06-28.md`. Matching, pursuit state machine/API slices,
Human Path provider boundary, contact selection, outreach generation persistence, status
tracking, lifecycle actions, and subscription enforcement are implemented and tested as backend
foundation.

Claude restart note: read `docs/claude-handoff-codex-backend-completion-2026-06-29.md` before
deciding the next track. The backend brief is complete, but public matching/pursuit/Human
Path/outreach UI remains unbuilt and design-gated. A sensible backend continuation, if explicitly
approved, is a read/list API for public pursuits so future dashboard work has data to consume.

## 2026-06-26 - Active session rules

Use this top section as the active session memory. Older `NEXT SESSION`, `RESUME HERE`, handoff, or dated markers in this file are historical notes only and must not be treated as the active resume point unless Randall explicitly names one.

- Start by pulling from git, then report `git status --short --branch` before implementation.
- Work only in `/Users/randallfransen/Sites/dumpster-fire-llc`; Lab26 is legacy/reference only and must not be used unless Randall explicitly asks for it.
- Before implementation, report git status and any sync task that was skipped, unavailable, or intentionally not done.
- Do not proceed to Step 4 Matching before design normalization.
- Do not start design implementation until the guardrails below are verified.

Homepage guardrail correction:

- Preserve the production animated grain texture exactly.
- Do not generalize `LandingBackground`, replace it, remove its canvas layers, or touch homepage structure without explicit Randall confirmation.
- Homepage content is not final, but approved sections preserve copy only.
- Ignore eyebrow/headline layout treatments as design direction unless Randall explicitly approves them.

## 2026-06-26 - Handoff retired after sync

The temporary MacBook Air handoff file was only for transfer between machines and should not remain an active restart source. Its durable instructions have been folded into this top section, and the handoff file was removed to prevent future sessions from treating it as another resume marker.

Added `docs/restart-handoff.md` as the machine-agnostic restart source for the next session.

## 2026-06-26 - Failed Codex design pass

The latest Codex design implementation should not be treated as approved design work. Codex guessed at CSS/UI mappings instead of using the exact Claude Design items/cards. The next session must use Claude Design as implementation authority and should rebuild or correct the design pass from the exact cards, not from this Codex CSS.

- Current recovery state: Step 1 profile gate copy is implemented; Step 2 Edit Career Profile is functionally kick-started; Step 3 Jobs/Saved Jobs is functionally kick-started.
- Do not proceed to Step 4 Matching before design normalization.
- Randall approved moving into design implementation now, but it must use the Claude design system primitives and must not add more ad hoc layout/styling.
- Treat the current dashboard/profile/jobs UI as functional scaffolding, not approved design.
- `docs/design-implementation-handoff.md` was corrected to preserve the current export decision: pursued-jobs/pursuit-history export only, no profile export.

## 2026-06-25 - Design system complete; implementation handoff ready

The mid-century design system is essentially complete and synced to Claude Design (`3af2f1ea`). Read **`docs/design-implementation-handoff.md`** before any design-implementation work; it has the locked decisions (full paper, body-font split with `--font-ui`=Gotham, grain ground app-wide, teal-forward accents), the product rules baked into the cards (profile pass/fail gate, "Add a Career Page", pursued-jobs export instead of match export, Application Details, tuning removed as admin-only), three code gaps to reconcile (compiler hard gate, career-page request email, pursued-jobs export backend), and the A-to-E port sequence.

- App design foundation is NOT started: `globals.css` is still the dark theme, only Gotham loaded, no DS tokens. Step A (tokens + fonts into `globals.css`/`layout.tsx`, flip to light) is the first move and is additive/non-destructive.
- Grain carryover: `app/LandingBackground.tsx` becomes the app-wide ground. Homepage content-only lock still applies; confirm with Randall before generalizing the grain onto home.
- Do not start the port until Randall greenlights it.

## 2026-06-26 - Public product gap build plan

Added `docs/public-product-gap-build-plan-2026-06-26.md` to turn the product-roadmap audit into an execution plan for the current standalone site.

- Confirmed the current public site has `/`, `/onboarding`, `/dashboard`, and public profile APIs, while `/scans` remains private legacy machinery and should not be counted as public-product completion.
- Mapped missing public work by product area: auth/account entry, onboarding quality, profile management, public jobs/saved jobs, matching, pursuits, Human Path, outreach, subscriptions, and final public landing/pricing.
- Recommended build sequence: stabilize profile completion, build `Edit Career Profile`, add public jobs and Saved Jobs, add public matching, add Pursuits, add Human Path, add outreach, add subscription enforcement, then finalize public launch/pricing copy.
- Restored the approved homepage header, `Is the Job Market a Dumpster Fire?` section/cards, and Human Path intro copy after an over-broad first cleanup pass. Those areas should remain unchanged until Randall explicitly revises them or the forthcoming Claude Design cards replace the Human Path mock visuals.

Step 1 clarification and implementation:

- Profile completion remains operationally pass/fail: incomplete profiles cannot scan; if Scan is unavailable, Matching, Saved Jobs, Pursuits, Human Path, Outreach, and Pursued Jobs Export are unavailable too.
- Weak/Good/Strong-style guidance remains allowed inside questionnaire/ingest UX, but it does not create a partial operating state.
- `/onboarding` now shows the agreed incomplete-profile justification: "Without the full picture, outreach won't be good. And if outreach isn't good, your chances drop. Finish your profile."
- `/dashboard` complete-state copy now uses the product terms without the public/private semantic split.
- Profile export is not a feature. Export means pursued jobs/pursuit history only: job pursued, selected Applying As Role Track/narrative, message sent, recipient/contact, status, and timestamps.
- Terminology: `Role Track` is the maintained profile narrative; `Applying As` is the pursuit-level selected Role Track/narrative, such as Executive Producer or Product Manager.

Step 2 implementation kick-start:

- `/dashboard` now opens a full-screen `Edit Career Profile` modal after the complete-profile gate passes.
- The modal has left-side navigation for every onboarding-created profile section and embeds the existing section editor in `profile-editor` mode, so completed profiles no longer redirect out of editing.
- `app/onboarding/OnboardingClient.tsx` now supports `mode="profile-editor"`, section anchors, compact editor styling, and Role Track duplicate/archive controls.
- The first Step 2 slice intentionally reuses the existing section save handlers and API payloads; full debounced autosave, profile version-history UI, and regeneration controls remain follow-up work.

Step 3 clarification:

- Step 3 means the roadmap phase for Jobs and Saved Jobs, not the Human Path modal steps.
- Jobs are user-scoped scan results, not a shared/global pool.
- The existing scan button should use the user's current profile search requirements/constraints; changing scan parameters happens by editing those profile search requirements.
- Each new scan should merge with unsaved and unactioned prior scan results so jobs are not lost.
- Saved Jobs means "pursue later" only; saving does not create a pursuit.
- Repeated scan results should dedupe by source URL/company/title, and expired/stale jobs should disappear automatically.

Step 3 implementation kick-start:

- Added `job_scan_results` migration as the user-owned bridge between global normalized `jobs` and per-user scan results.
- Added public Jobs APIs: `GET /api/jobs`, `POST /api/jobs/scan`, and `POST /api/jobs/save`.
- `/api/jobs/scan` now uses the complete public profile's search requirements/constraints to merge matching normalized public jobs into the user's active scan results; external connector ingestion remains a follow-up provider seam.
- `/dashboard` now shows a Run scan button, active Jobs list, Saved Jobs panel, v1 job card fields, and save/unsave actions.
- Saved Jobs remain "pursue later" only and do not create pursuits.

## 2026-06-26 - Public homepage content cleanup kick-start

Started recovery from the failed public-homepage copy pass without changing the approved animated grain background or homepage layout.

- `app/page.tsx` briefly received over-broad copy cleanup, then the approved homepage header, `Is the Job Market a Dumpster Fire?` section/cards, and Human Path intro were restored per Randall's correction.
- Replaced premature pricing-plan language with an `Access` section that distinguishes beta profile setup, gated private scan workspace, and future public pursuit workflow.
- Removed internal/implementation handoff language from public onboarding copy and made `/dashboard` honest that it is a profile-complete placeholder, not the finished public matching dashboard.
- Updated root metadata to describe the public product around structured profile and pursuit workflow instead of private scan workflows.
- Validation passed: `npx tsc --noEmit --incremental false`, `npm run lint` with the five known legacy warnings, `git diff --check`, and local route checks for `/`, `/onboarding`, and `/dashboard` on the already-running standalone dev server at `127.0.0.1:3020`.
- Visual checks captured: `/private/tmp/dumpster-fire-llc-home-cleanup-desktop.png`, `/private/tmp/dumpster-fire-llc-home-cleanup-mobile.png`, `/private/tmp/dumpster-fire-llc-onboarding-cleanup-desktop.png`, and `/private/tmp/dumpster-fire-llc-dashboard-cleanup-desktop.png`.

Follow-up:

- Continue auditing public surfaces for private `/scans`, Lab26-era, implementation-roadmap, pricing, or not-yet-built workflow claims before adding new product copy.

## 2026-06-25 - Public homepage recovery checkpoint

Recovered the public homepage animated grain background from the live production implementation and marked this as the reversion point for future homepage work.

- `app/LandingBackground.tsx` now owns the approved background implementation: two canvases, `publicLandingMesh` and `publicLandingStatic`.
- The mesh canvas uses drifting radial blooms; the static canvas redraws animated brown grain at `1.5x` viewport size.
- `app/site.module.css` keeps the approved canvas treatment: fixed canvases, mesh `blur(90px)`, static `mix-blend-mode: multiply`.
- Validation passed: `npm run lint` with the same five legacy warnings, `npx tsc --noEmit --incremental false`, and `npm run build`.
- Browser-level canvas proof passed: both canvases present and the static canvas changed frame-to-frame (`staticChanged: true`).
- Local visual proof captured at `/private/tmp/dumpster-recovered-production-grain.png`.

Next session warning:

- The next homepage session is for **CONTENT updates only** unless Randall explicitly expands scope.
- Content means public-facing words: headline, nav labels, section copy, pricing labels, feature descriptions, CTA copy.
- Do not copy internal process notes, recommendations, roadmap sequencing, audit language, implementation order, or “recommended next step” text into public homepage content unless Randall explicitly approves that exact text.
- Do not replace the animated canvas background, remove `LandingBackground`, swap it for CSS noise, or restructure the page while making content edits.

## 2026-06-25 - Repo cleanup ownership matrix

Started the standalone repo cleanup from the issue/docs queue:

- Confirmed `dumpster-fire-llc` is the canonical public app repo; Lab26 is legacy read-only reference only and must not be used as a save target for public-app work.
- Checked GitHub open issues for `fransencomesalive/dumpster-fire-llc`; none were returned, so the actionable queue remains local docs (`docs/project-todo.md`, `docs/next-session.md`, `docs/spec-review-phase-1.md`, and `docs/implementation-roadmap.md`).
- Added `docs/repo-cleanup-migration-matrix.md` with the current inventory, classifications, migration decisions, dependency order, and guardrails.
- Current recommended implementation order after cleanup inventory: preserve the public profile/API foundation, continue remaining onboarding forms from `docs/project-todo.md`, keep `/scans` isolated as gated legacy-active product machinery, and rebuild public landing/pricing/auth routing in the standalone repo only after the product routes stabilize.

Follow-up audit completed:

- Added `docs/product-roadmap-audit-2026-06-25.md` to compare current built pages and functions against the full product roadmap and feature set.
- Summary: Phase 1 public profile foundation is largely built and validates cleanly; Phase 2 onboarding UI now has editable shells, section-level readiness/status UX, and client-side Profile Complete routing for every required and optional section; auth-provider polish, public profile management, matching, pursuits, Human Path, outreach, subscriptions, pricing, and final landing are not yet built as public workflows.
- Validation passed: all public profile focused tests, `npx tsc --noEmit --incremental false`, `npm run lint` with five legacy warnings, and `npm run build`.
- Built-route smoke on `127.0.0.1:3017`: `/` and `/onboarding` returned `200`, `/scans` returned the access-code login, public profile APIs rejected missing bearer tokens with `401`, and `/scans/api/dashboard` rejected missing private session with `401`.

Phase 2 continuation:

- Added Proof Library editing to `app/onboarding/OnboardingClient.tsx`.
- `/onboarding` now loads `/api/public-profile/proof-library` with the existing profile bootstrap, stores proof projects in client state, supports add/remove/edit for all proof-object fields, and saves through the authenticated Proof Library `PATCH` endpoint.
- Proof Library fields now cover name, link, confidence, candidate role, description, proof signals, capabilities, supported responsibilities/experience, industries, best/avoid use, metrics, and caveats.
- Added Skills Inventory editing to `app/onboarding/OnboardingClient.tsx`.
- `/onboarding` now loads `/api/public-profile/skills` with the existing profile bootstrap, stores skills in client state, supports add/remove/edit for skill evidence and guardrails, links skills to Proof Library and Work History records, and saves through the authenticated Skills Inventory `PATCH` endpoint.
- Skills Inventory fields now cover skill name, proficiency, evidence, related proof, related work history, best role fit, and do-not-overclaim guidance.
- Added editable shells for Why People Hire Me, Operating Style, Decision Style, Communication Style, Writing Samples, What AI Gets Wrong, Outreach Rules, and optional Leadership Profile.
- `/onboarding` now loads and saves every public profile onboarding section endpoint. Shared quality narrative sections use the profile-quality field keys 1:1; richer sections preserve their settings/list shapes.
- Added live section-level readiness/status UX to `/onboarding`.
- The server hero now avoids a hardcoded incomplete state before auth. The signed-in client summary shows live complete/incomplete status, required-section count, blocker count, weak response count, and last-checked timestamp.
- The section inventory now maps `profileQuality.incompleteReasons` and `weakFields` into per-section badges and blocker counts.
- Added client-side Profile Complete routing around the existing local bearer-token flow.
- `/` now checks a stored public profile token and routes complete profiles to `/dashboard` or incomplete profiles to `/onboarding`.
- `/onboarding` redirects complete profiles to `/dashboard`; `/dashboard` sends missing-token or incomplete profiles back to `/onboarding`.
- Added `/dashboard` as the Profile Complete destination placeholder until the public Saved Jobs/Pursuits dashboard exists.
- Next Phase 2 hardening step is quality-scoring/remediation guidance and production auth-provider polish.

## ▶ NEXT SESSION — RESUME HERE (handoff 2026-06-24)

**What this session did:** mid-century design-system reskin of `/scans`, in `design-system/` (repo root, never ships), all synced to the Claude Design project **"Dumpster Fire Design System" (`3af2f1ea-428c-49b3-8b02-c066ec0c7452`)** via the DesignSync tool. Screenshot loop: `node /tmp/ds-shot-*.mjs` (playwright-core from Lab26 + installed Chrome). Full locked conventions live in Claude auto-memory `project_dumpster_fire_design_system.md` — read it first.

**Built + synced this session:** modal shell (`modal.html`), Apply Wizard (`apply-wizard.html` — Pursuit/Human Path phrasing, 4 discrete steps), match-card CTA → "Pursue", and the **hero** (two options).

**Hero is the open thread.** Two options in `design-system/components/`, both synced:
- `hero-matchbook.html` — cream stock + printed cover frame, Original Surfer hand-painted wordmark in a teal+tomato off-registration overprint (slip 4/4.5px), tight centered title+mascot pair.
- `hero-atomic.html` — Tanager Red field with a regular tiled **mod lattice** (atomic-star + dot `<pattern>`), Shrikhand wordmark (cream + teal slip), tight centered title+mascot pair.
- Both: title-case lead, tagline banner ("Stop applying. Start pursuing."), pursuit copy (NO em dash), die-cut mascot, no red+yellow. Roadside concept was trashed per Randall.

**OPEN QUESTION asked, awaiting Randall's answer (resume here):**
1. On `hero-atomic`, is an **all-over mod pattern** right, or should the mid-century texture be **concentrated** (band/corner block) so type sits on cleaner field?
2. Are we close enough to **lock one of the two** (Matchbook vs Atomic) and move on?

Hard-won rules from this session (do NOT repeat the mistakes): build literally from the saved refs (El Rancho matchbook, Mr. Product) — no invented web-hero defaults; **title block + mascot = one centered flex pair** (never a `1fr/auto` grid that voids the middle); **atomic = a regular tiled pattern, never scattered icons**; **Ventura font rejected ($30)** — using free SIL OFL faces (Original Surfer / Shrikhand / Pacifico active; Lobster/Kaushan/Rye/Fontdiner downloaded as candidates), licenses bundled in `design-system/fonts/`.

**After the hero is locked:** compose the **full scan-page mock** (hero + section header + rating filter tabs + match-card stack + Overview/Config sidebar incl. `.scanNowBtn`), then port finalized tokens + component CSS into live `app/scans/scans.module.css` and verify the gated page. Secondary surfaces still undesigned: scan-progress modal, activity/scan-history list.

**Production commit update 2026-06-25:** the public-product migration (`app/scans/`, `app/onboarding/`, `app/api/public-profile/`, `lib/`, `scripts/`, `supabase/`, and product docs) is intentionally included in the production-ready handoff. `Design System Resources/` remains local-only reference material and is intentionally ignored/untracked.

---

## 2026-06-24 (cont.) - Design system: hero options revised (atomic + matchbook only)

Feedback round: roadside was off-theme (deleted entirely, local + Claude Design + manifest); the atomic elements weren't reading; layouts had dead space / vertical drift; matchbook offset too strong. Fixes:
- **Layout (both):** proper two-column grid (`minmax(0,1fr) auto`, `align-items:center`) — title block left, mascot right, vertically centered. No dead right-space, no downward drift, mascot no longer absolute.
- **Atomic (`hero-atomic.html`):** rebuilt with real, prominent mid-century motifs — **sputnik starburst, atom diagram, molecule, boomerang, diamonds** — composed across the red field as a deliberate backdrop (cream + teal), behind the lockup. Now reads as hero + atomic.
- **Matchbook (`hero-matchbook.html`):** off-registration slip dialed back 35% (6/7px → 4/4.5px); a few restrained atomic accents (sputnik/boomerang/diamond) added.
- Two options remain: Matchbook (A) + Atomic (B). Verified 1280 + 390. Synced.

Follow-up round (layout + atomic still off): replaced the `1fr/auto` grid (which left a dead middle void and pushed the mascot to the far edge) with a **centered flex pair** — title block + mascot together, vertically aligned, controlled gap. Replaced the **scattered atomic icons** (read as random clip-art) with a **regular tiled mod lattice** (atomic-star + dot `<pattern>`) for cohesive mid-century texture on the red field; matchbook has no scattered icons (clean cover). Re-synced.

## 2026-06-24 (cont.) - Design system: 3 finished hero options (build-them-all)

Per Randall ("build them all"), developed each concept into a complete, polished masthead (with the section-header context below) as three standalone components in a new "Hero options" group; retired the old Bemio `hero.html` and the rough `hero-concepts.html` (deleted locally + from Claude Design) to keep the list clean. Synced.
- `components/hero-matchbook.html` (**A**) — cream + printed frame, Original Surfer wordmark, teal+tomato off-registration overprint, sparse atomic accents (atom-star/boomerang/diamond), die-cut mascot.
- `components/hero-atomic.html` (**B**) — Tanager Red field, Shrikhand wordmark (cream + teal slip + ink keyline), atomic spread (atom orbit, spiky stars, boomerang) + faint cream diamond wallpaper, mascot.
- `components/hero-roadside.html` (**C**) — travel-poster landscape (sunset sky, setting sun at the road's vanishing point + rays, layered teal/green hills, pines, telephone poles, dashed road), Pacifico script wordmark in the sky (copy contrast fixed by keeping all text in the sky band), mascot standee on the hills.
- All: title-case lead, tagline banner, pursuit copy (no em dash), no red+yellow, verified 1280 + 390. AWAITING Randall's pick of which to lock as the canonical hero for the full page mock (fonts/field colors still swappable). Fonts synced+licensed: Original Surfer, Shrikhand, Pacifico (Rye/Fontdiner/Lobster/Kaushan downloaded, unused).

## 2026-06-24 (cont.) - Design system: 3 hero concepts to choose from

v3 (Bemio overprint) got closer but the title font was too system-display; Randall asked for script/hand-painted type, atomic-era elements, and a possible landscape, built as a separate component. Pulled more free OFL faces (Original Surfer, Shrikhand, Rye, Fontdiner Swanky; Pacifico/Kaushan/Lobster already present) with licenses bundled. Built `design-system/components/hero-concepts.html` (synced; new card):
- **A · Matchbook** — cream + printed frame, wordmark in **Original Surfer** with teal+tomato off-registration overprint, sparse atomic accents (atom-star, boomerang), die-cut mascot.
- **B · Atomic Lounge** — bold **Tanager Red field**, wordmark in **Shrikhand** (cream + teal slip), atomic spread (atom orbit, spiky star, boomerang), mascot.
- **C · Roadside** — travel-poster **landscape** (sunset sky, horizon sun+rays, layered hills, pines, road) in flat two-ink, wordmark in **Pacifico** script, mascot standee.
- All: title-case lead, tagline banner, pursuit copy (no em dash), no red+yellow. Verified 1280 + 390.
- AWAITING Randall's pick of concept (+ font). Known refinement if C: description ink overlaps the dark near-hill (contrast) — move/relighten on selection. Only Original Surfer + Shrikhand fonts synced (used); Rye/Fontdiner downloaded but unused.

## 2026-06-24 (cont.) - Design system: hero v3 (matchbook two-ink overprint)

v2 was rejected: ugly script font (Lobster), starburst + tiled-halftone background not in any reference, em dash in copy, tagline buried in a paragraph, lazy headline-left/mascot-right layout. v3 rebuilds straight from the El Rancho matchbook:
- **Cream stock** (paper-deep) + soft-light grain, inside a **matchbook cover frame** (heavy ink rule + inner hairline keyline). Dropped the bold blue field because a true overlaid-ink off-registration only reads on cream (the matchbook approach). Field-color is revisitable.
- Wordmark **"Dumpster Fire" as a two-ink off-registration overprint**: a teal plate + a tomato plate slipped down-right, multiplied so the overlap prints a dark third tone and each ink shows on one edge. Set in Bemio (the script font is dropped; Lobster/Pacifico/Kaushan files remain in fonts/ but are unused).
- Removed the starburst and the tiled-halftone wallpaper entirely.
- Lead is **title case** ("The Job Market Is A"). Tagline **"Stop applying. Start pursuing."** pulled out into its own tomato banner (ink border + hard offset), not body copy.
- Copy rephrased per Randall, **no em dash**: "…the person who actually does the hiring by leveraging your own voice and experience to make contact."
- Mascot = die-cut standee (cream sticker edge + ink offset). Verified 1280 + 390. Synced.
- Palette safe: teal+tomato+cream+ink, no red+yellow pairing.

## 2026-06-24 (cont.) - Design system: hero v2 (pushed texture + pursuit copy)

Feedback on v1: too flat, not enough of the screenprint style, badge unneeded, copy was a stale artifact. v2:
- Removed the "Private beta" pill.
- Pushed the printed-ephemera treatment: atomic **sunburst rays** behind the mascot, **ben-day halftone** across the field (masked to fade center), soft-light grain, a real **screenprint misregister** on the wordmark (mustard fill + ink keyline + cream offset plate), and the mascot as a **die-cut standee** (cream sticker edge + sunburst/halftone seal disc + hard ink offset).
- Rewrote the subhead from the product's own positioning (`public-product-build-epics.md`: "Stop applying. Start pursuing." / "stop disappearing into application portals"): portals/ATS are where candidates disappear; the fix is a direct line to the person who hires, in your own voice, with experience + proof. Tagline "Stop applying. Start pursuing." set in mustard.
- Verified 1280 + 390 (mobile: mascot leads, no overflow). Synced.

## 2026-06-24 (cont.) - Design system: hero redesign (vintage logo lockup)

First hero pass was just the original page's text + mascot. Redesigned per Randall's reference review (Mr. Product mascot logos, El Rancho matchbook, Danny Donut, Ventura script, paint deck). Chosen direction: **vintage product-logo lockup on a bold flat color field**, mascot as brand character, **Ventura script accent**, full sentence kept.

`design-system/components/hero.html` now: Egyptian Blue (`--c-bluebird`) full-bleed field (grain soft-light), a cream/ink **label badge**, wordmark = "The job market is a" (Bemio cream) + **"Dumpster Fire" in script** (mustard, ink print-outline + screenprint slip), the dumpsterfireguy mascot popping off the blue, cream description, heavy ink rule into the cream section header. Mirrors `.page/.hero/.heroInner/.heroTitleRow/.heroMascot`; drops the dark `.meshBg`. No Scan CTA (the real hero has none — `.scanNowBtn` is in the sidebar). Verified 1280 + 390 (mobile stacks, no overflow). Synced to Claude Design (`3af2f1ea`).

**OPEN / needs Randall:**
- **Script font.** Ventura ($30 commercial) rejected; replaced with free **SIL OFL** fonts now embedded in `design-system/fonts/` (with `OFL-*.txt` licenses): **Lobster** active (recommended), **Pacifico** + **Kaushan Script** also loaded — swap via `--font-script`. Comparison at `/tmp/ds-script-compare.png`. Randall to confirm the pick; then copy the chosen TTF + OFL to `app/scans/fonts/` on port.
- **Field color** is a one-token swap (`--hero-field`): Egyptian Blue now, flip to Tanager Red (`--c-tomato`) if preferred.
- **Badge copy** "Private beta · by invitation" is placeholder — set the real line.

## 2026-06-24 (cont.) - Design system: Pursuit phrasing + Human Path wizard refinements

Reviewed the modal + wizard against the actual product specs and applied corrections:
- **Pursuit phrasing across the board** (per `docs/pursuit-workflow-spec.md` — "users do not apply, they pursue"): match-card CTA `Apply` → **Pursue**; wizard title `Apply wizard` → **Human Path** (provisional — may be dropped since the stepper makes steps clear); `Open apply link` → **Open job posting**; final `Save actions` → **Save pursuit**; `Application tracking` → **Pursuit tracking**; close-confirm copy now says Pursuits, not "Previous Applications". Kept spec-correct terms: Step-1 **"Applying as"** (= Role Track recommendation) and **"Applied"** as a Track state.
- **Contacts step:** removed the manual "Re-research Contacts" button — the Human Path is found automatically on Pursue (a metered, multi-second AI lookup, so NOT instant). Added a **"Fetching potential contacts"** loading placeholder (dashed panel + pulsing dot + skeleton cards). Fixed the 0px status/button gap. Recommendation: generate once per pursuit and cache (Human Path is metered), not on every visit.
- **Outreach step:** confirmed **save-approved-message** + **rejection-reason** are real (data model `OutreachMessage.status` + `saved_message_feedback` table). Replaced the confusing standing "No rejection note" dropdown with an **Approve / Reject** control; the reason select now appears only after Reject.
- **Footer:** removed the redundant **Back** button (the numbered stepper already navigates), which also resolves the button-size mismatch.
- Re-synced apply-wizard + modal + match-card to Claude Design (`3af2f1ea`); verified 1280 + 390.

## 2026-06-24 (cont.) - Design system: modal shell + Apply Wizard

Continued the design-system reskin. Per decision, built the dialog/sub-flow surfaces before the full page mock.

Built + synced (2 new component cards):
- `design-system/components/modal.html` — reusable modal shell: ink-wash overlay, paper-stock dialog (heavy ink outline + hard offset), printed close button, info-note (`.modalNote`, calm bluebird left-accent), two-column field grid, footer (`.modalBtnClose` secondary / `.modalBtnSave` primary), and the close-confirm interrupt + `.modalBoxSmall` variant.
- `design-system/components/apply-wizard.html` — full 4-step flow shown as **4 discrete modal states** (Review → Contacts → Outreach → Track), one step visible at a time, navigated by the stepper + Back/Continue (Step 4 ends in Save actions). Active step = teal with paper-knockout disc (avoids the forbidden red+yellow pairing). Step 1 **"Applying as:"** lists the candidate's submitted title narratives from `apply-modes.ts` (Executive Producer / Program Director / AI Workflow · Product Ops) — the lens the candidate applies under, NOT a fit/matching mode. Plus contact lead cards (`.contactSuggestion` + `.seeProfileBtn`), outreach message block (`.copyHeader` + `.messageTextarea` + approval/reject row), and the tracking `.checklistGrid`.
- Class names mirror `app/scans/DashboardClient.tsx` (`.modalOverlay/.modalBox/.modalHeader/.modalTitle/.modalClose/.modalIntro/.modalFooter/.modalBtnClose/.modalBtnSave/.wizardSteps/.wizardStep/.wizardStepActive/.modeSection/.copyGenerationPanel/.contactSuggestion/.messageTextarea/.checklistGrid`) so CSS ports back ~1:1.
- Mobile (≤560px): formGrid → 1 col, wizard stepper → 2×2, checklist → 1 col, contact panel stacks. Verified at 1280 + 390 (no overflow/truncation).
- `_ds_manifest.json` cards array hand-patched with both new cards; all three files synced to the "Dumpster Fire Design System" project (`3af2f1ea`).
- **Not yet committed** — design-system/ working-tree changes (2 new files + manifest) pending `git add`/commit/push.

**RESUME HERE (next step):** design the **hero/page header** component (the one remaining main-view surface: mascot + title row + primary Scan CTA — `app/scans` `.hero/.heroInner/.heroTitleRow/.heroMascot`), then compose the **full scan-page mock** assembling hero + section header + filter tabs + match-card stack + Overview/Config panels. Screenshot mobile+desktop, sync. *Then* port finalized tokens + component CSS into live `app/scans/scans.module.css` and verify the gated page. Remaining secondary surfaces still undesigned: scan-progress modal, activity/scan-history list.

## 2026-06-24 - Mid-century design system (in progress)

Building a mid-century-mod reskin of the `/scans` dashboard as a synced Claude Design system, in `design-system/` (repo root, never ships).

State:
- Foundations (color, type, texture) + components (match card, panel, login, badges, forms, modal shell, Apply Wizard) all built, screenshotted mobile+desktop, and synced to the "Dumpster Fire Design System" project on claude.ai/design. Foundations→forms committed + pushed (`edac2c3`); modal + wizard pending commit.
- Component class names mirror `app/scans/DashboardClient.tsx` so CSS ports back ~1:1.
- Full design context, locked conventions, and gotchas live in Claude auto-memory: `project_dumpster_fire_design_system.md`.
- Workspace is additive/isolated; the in-progress `/scans` public migration in the working tree is untouched and still uncommitted.

## 2026-06-24 - Work History onboarding form

Expanded the live onboarding shell to the next structured required section.

Implemented:
- `/onboarding` now loads Work History alongside Identity/Search, Role Tracks, and Resume Uploads after bootstrap.
- Added authenticated Work History add/edit/remove/save UI in `app/onboarding/OnboardingClient.tsx`.
- Added company/title/date/current-role/source fields plus responsibilities, accomplishments, skills, and metrics.
- Added resume attachment checkboxes that use active Resume IDs.

Validated:
- `npx tsc --noEmit --incremental false`
- `npm run build`
- `npm run lint`
- Production deploy to Vercel.
- Public-domain smoke test on `https://thejobmarketisadumpsterfire.com`: `GET /onboarding`, `POST /api/public-profile/bootstrap`, `PATCH /api/public-profile/role-tracks`, `PATCH /api/public-profile/resumes`, and `PATCH /api/public-profile/work-history`; temporary user cleanup returned `200`.

Next:
- Add Proof Library editing to the onboarding shell.

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
- `npm run build`
- `npm run lint`
- Production deploy to Vercel.
- Public-domain smoke test on `https://thejobmarketisadumpsterfire.com`: `GET /onboarding`, unauthenticated `GET /api/public-profile/role-tracks` returns `401`, `POST /api/public-profile/bootstrap`, `PATCH /api/public-profile/role-tracks`, and `PATCH /api/public-profile/resumes`; temporary user cleanup returned `200`.

Next:
- Add Work History review/editing to the onboarding shell.

## 2026-06-23 - Deployment env and Role Tracks onboarding

Continued the public onboarding implementation after the live Supabase bootstrap path was verified.

Implemented:
- Synced required Supabase runtime variables into Vercel for Production, Preview, and Development without printing secret values.
- Verified Vercel now lists the public Supabase variables as encrypted project env vars.
- Deployed the current app to Vercel production.
- Promoted the known-good deployment after a newer incomplete deployment temporarily took the aliases.
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
- The route does not return generated markdown. Markdown remains internal and is not a profile export surface.

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
- Meter Human Path generation, outreach generation, and Pursued Jobs Export.
- Human Path usage is consumed only when Generate Human Path is clicked.
- Outreach usage is consumed per generated message for selected contacts.
- Pursued Jobs Export is Pro-only.
- Upgrade prompts should be benefit-led and avoid fake urgency, countdowns, hidden limits, and dark patterns.
- Failed billing freezes generation and Pursued Jobs Export actions but preserves login, search, saved jobs, dashboard, and profile editing.

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
- Profile status, last updated, version, and quality issues remain visible.
- Every edit autosaves; no Save button.
- Regeneration is debounced and triggered by meaningful profile changes, not every keystroke.
- Future hooks are reserved for interview prep, company research, response tracking, outreach performance, and profile analytics, but not built for launch.

## 2026-06-23 - Candidate profile schema ingested

Added the public Candidate Profile schema brief as `docs/candidate-profile-schema.md`. This is reference documentation only; no product implementation was started.

Key decisions captured:
- Candidate Profile status is binary: `incomplete` or `complete`.
- Incomplete profiles block pursuit generation, outreach generation, contact research, role fit messaging, and proof selection.
- Structured profile data is the source of truth; markdown is generated internally and is not exported as a profile artifact.
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
