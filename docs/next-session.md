# Next Session: 2026-08-04 JOB-021 and JOB-022 Awaiting Release Authorization

_Updated 2026-08-04. Read `AGENTS.md` and follow the Session Start Protocol in
`docs/project-operating-state.md` before editing._

## Current in-flight state

JOB-021 and JOB-022 are implemented and verified locally. Production migration
`20260804000100_remote_preference_no_preference.sql` is applied and recorded, but the application
changes are not committed, pushed, or deployed. Production remains at
`ad493ca2351d4d2ec73c6dceba45b6605f476b4e`.

- JOB-021 adds a neutral **No preference** Remote Preference value across onboarding, dashboard
  editing, profile parsing, both matching paths, database validation, and local design-system cards.
- JOB-022 keeps incomplete onboarding sections quiet during ordinary saves. The global review panel
  and **Needs work** states appear only when the final Voice & Personality save attempts to continue
  into scanning.

Local evidence is complete: all 36 fixtures, TypeScript, Webpack production build, focused migration
test, and the real-component browser journey passed. Browser geometry passed at 320, 375, 390, 1280,
and 1440 pixels without overflow or browser errors. The default Turbopack build stalled and was
stopped. Lint has zero errors and the same four pre-existing warnings.

Next immediate action: commit and push only `main`, wait for GitHub/Vercel success, verify HTTP 200
and deployment identity, and run authenticated production checks. Remote Claude Design registration
remains **NOT VERIFIED** because this session has no Claude Design connector.

Durable lesson: never treat a successful section save as an attempt to complete onboarding. The
user can be shown whole-profile blockers only at the transition toward scanning.

## 2026-08-04 outreach correction state

`origin/main` contains outreach correction commit `3504a87ba7be2658579553a1321d09b61559997a`,
live in Vercel production deployment `dpl_Ho7y9XKsEMSg1K64oca7Fy4TAaPk`. GitHub CI run
`30938464311` passed, Vercel reports the deployment successful, and the canonical domain returns
HTTP 200 from that deployment.

The earlier `5e8a91c` relevance/diversity release was incomplete for jobs whose important criteria
are stored outside the general description. The reported Dropbox posting put its AI requirement in
`required_experience`, but outreach previously passed only title, company, and description into
selection and prompting. It also detected repeated phrases but not a repeated rhetorical skeleton.

The live correction now:

1. passes structured Responsibilities and Required Experience through selection and prompting;
2. scores every Work Example against each job section, with explicit requirements weighted most;
3. preserves short domain signals such as AI during evidence matching;
4. requires and validates mention of a matched explicit requirement when supported by the selected
   example; and
5. rejects the observed repeated attraction, career-sweep, preference/familiarity, talk-close
   structure even when the words change.

The exact production profile and Dropbox job were rechecked without persisting a new message or
resending private profile data to an AI provider. The corrected engine selected R.E.C.O.N., matched
AI from Required Experience, and rejected the old message for missing that requirement plus lexical
and structural repetition. Do not describe this as a fresh persisted production provider-output
journey. If Randall asks to test a real new message, obtain explicit authorization because it will
send the current profile to the configured provider and may consume metered usage.

Durable lesson: never verify outreach relevance/diversity from generic fixtures alone. Use the
reported user/profile and exact stored job; confirm structured fields reach both ranking and the
prompt; test factual requirement coverage and rhetorical structure separately.

## Prior 2026-08-04 combined release baseline

Before the outreach correction above, `origin/main` and production were at
`b7f2c999e5cef2d5229af43e0c90c096a08cd7c3` on Vercel deployment
`dpl_6AguuiHqmenUVXmJXYtKYuvGSYP8`. That combined deployment contained the original outreach
evidence selection release (`5e8a91c`), indexed blocked-link fallback (`376d128`), and paired
scan-card expansion (`b7f2c99`).

Current product behavior:

1. Outreach considers every current profile work example against the specific job. The selected
   Role Track influences ranking but does not exclude relevant examples from other tracks. Linked
   skills supply example evidence. Recent example use and recent phrasing affect diversity only
   after relevance is established. Current profile data and recent persisted messages are loaded
   for each generation or regeneration request.
2. A job link that defeats normal server retrieval can use the metered, exact-posting indexed
   fallback. The original pasted URL stays canonical in Dumpster Fire storage. The reported Indeed
   URL was ingested successfully on the current deployment as the iHerb Sr. Director posting, and
   the disposable production data was deleted.
3. Responsibilities and Required Experience share one expansion state per job card. Either control
   expands or collapses both lists. The deployed interaction passed authenticated browser checks at
   320, 375, 390, 1280, and 1440 pixels with no browser errors or horizontal overflow.

Verification for the combined release:

- all 35 fixture suites passed;
- TypeScript passed;
- lint reported zero errors and the same four pre-existing warnings;
- the production build passed;
- Vercel completed the deployment;
- all disposable production QA accounts were deleted and cleanup audits passed.

Important boundary: the scan-card browser QA used controlled API job data to isolate the deployed
client interaction. It is not a new Run scan production journey and does not replace the repository's
Production Scan Verification requirements.

No work from this release remains in flight. Begin with `session check`, confirm a clean synchronized
`main`, and wait for Randall's next explicit scope. Do not silently start older queued work. The
previously recorded access-code cron observation, remote Claude Design registration tasks, Phase 4
Markdown export, and Next.js security maintenance remain separate potential tasks.

## 2026-08-03 new-account activity check

Production has six Auth users total. Three accounts were created during the August 3
America/Denver calendar day:

- `rich@richardoedwardo.com` - incomplete initialized profile, no meaningful onboarding sections
  saved, no subscription, and no access-code grant;
- `kmaroonfoto@gmail.com` - no candidate profile, no subscription, and no access-code grant;
- `ajobateh@gmail.com` - incomplete initialized profile, no meaningful onboarding sections saved,
  no subscription, and no access-code grant.

None completed onboarding and none redeemed DUMPSTERFRIENDS or another access code. The two
initialized profile rows are bootstrap records, not saved user progress. Browser-local unsaved
drafts are not visible server-side. Do not confuse these signups with the three older permanent
access-code accounts in the release postflight.

## 2026-08-03 access-code release complete

Commit `c0664a1cef9f3b7861ec665a7ae48647382edef2` is on `origin/main`, GitHub CI run
`30850024380` passed, and Vercel production deployment `dpl_3zkLmaKMcYiX5CtuZeGLovUE2nhi` is
complete. Production migrations `20260726000100` and `20260803000100` through `20260803000300`
are applied and recorded.

The release gives new access-code redemptions one exact 30-day grant, prevents a second grant per
account, meters Apply Wizard across the stored grant period, blocks new work at expiration while
preserving cached results, and permits Stripe conversion only after a timed grant actually ends.
Access-code accounts display **Full access** and **Access code**, including DUMPSTERFRIENDS, while
retaining the internal premium plan and its 45-use allowance. The three existing accounts remain
permanent by explicit prior decision; production postflight confirmed all three subscription rows
and their three new durable grant-ledger rows remain active null-window grants.

The two original GitHub failures were the same time-dependent saved-pursuits fixture. Its quota
subscription ended August 1, so the August 3 runs counted zero prior uses and raised
`pursuit_limit_reached:0:0`. The fixture now derives that scenario's period from the current UTC
month, and the complete release gate passes.

Next immediate starting point:

1. Verify the first scheduled hourly expiry cron execution. Do not manually mutate production
   accounts merely to manufacture evidence.
2. In a Claude Design-enabled session, register and read back
   `design-system/components/plan-billing-step.html` and
   `design-system/components/plan-billing-detail.html`. Remote registration is **NOT VERIFIED**;
   local parity and responsive rendering are verified.
3. Use `env -u SUPABASE_ACCESS_TOKEN` for Supabase CLI commands until the known stale token line in
   `.env.local` is replaced or removed securely. The CLI login stored by this release is valid.
4. No access-code implementation is in flight. Resume unrelated planned product work only after
   Randall explicitly approves its scope.

## 2026-07-30 saved-result and custom-URL release

Commit `91d03cdb66ec18156e9d9bef64738d6782b2d776` is on `origin/main` and live in
production deployment `dpl_6cd6g6EREmHfnzeAajAYowfPNs82`.

The reported state problem had two related paths:

1. Saving a job from the active scan list wrote the canonical pursuit but continued returning the
   same job from `GET /api/jobs`, so it remained on the dashboard after the optimistic Saved state,
   after reload, and after later scans.
2. The dashboard's single-job URL input already ingested an owner-scoped job and created the same
   canonical pursuit when Human Path initialized. Tracking already determined whether that pursuit
   belonged to Saved for later or Applied, but this relationship was not covered by the active-scan
   read or by a production journey using the reported Ontra URL.

Implemented:

- `lib/public-jobs/repository.ts`
  - active scan reads now exclude every non-deleted canonical pursuit;
  - the temporary `saved_jobs` table remains a fallback only when no canonical pursuit exists;
  - a deleted canonical pursuit overrides a stale compatibility row and can return to active scans;
  - equivalent company/title copies are excluded so a duplicate board posting cannot reappear;
  - the saved count is independent of the visible active list;
  - `lastScanAt` remains present when every active result has moved out of the list.
- `app/dashboard/DashboardClient.tsx`
  - Save is one-way from the active list;
  - it uses the existing 680ms Skip exit animation;
  - the accessible status message reads `Job posting moved to Saved for later.`;
  - the card is restored from the saved snapshot if the request fails;
  - closing Human Path reloads jobs so any newly created pursuit leaves the active list.
- `scripts/test-public-jobs-repository.ts`
  - coverage now proves Save removal, reload persistence, rescan persistence, duplicate exclusion,
    canonical lifecycle precedence, compatibility fallback, saved count, and retained scan time.
- `scripts/test-public-profile-api.ts`
  - pursuit creation coverage now uses a same-user `user_link` posting and verifies the
    `user_owned` snapshot.
- `design-system/components/dashboard-jobs.html`
  - the local card mirrors the approved Save exit and status state;
  - the impossible Saved card state was removed from the active-match example;
  - the first-line marker and existing `_ds_manifest.json` entry remain intact.

Local verification:

- `npm run test:public-jobs`: passed.
- `npm run test:fixtures`: all 34 suites passed.
- `npm run typecheck`: passed.
- `npm run lint`: zero errors and the same four pre-existing unused-variable warnings.
- `npx next build --webpack`: passed.
- `git diff --check`: passed.
- rendered browser checks at 320, 375, 390, 1280, and 1440 pixels had zero horizontal overflow;
  the Save hit area measured 92.3125 by 40 pixels; the card exited and the status appeared.

The default local Turbopack build emitted no new output for more than three minutes and was stopped.
The documented webpack fallback passed, GitHub's `verify` check passed, and the exact Vercel
deployment completed successfully. Do not present the silent Turbopack run as a passing check.

Production verification:

- canonical production domain returned HTTP 200 and identified
  `dpl_6cd6g6EREmHfnzeAajAYowfPNs82`;
- Vercel status for commit `91d03cd` was successful;
- GitHub `verify` completed successfully;
- the permanent production scan harness started with zero rows, clicked the real Run scan control,
  received one HTTP 200 `POST /api/jobs/scan`, persisted 75 rows, rendered 75 after reload, recorded
  zero console/page errors, and cleaned up to zero rows;
- scan reference: `899b1ddb-e5a5-468a-a1d5-a28fc480b8e7`;
- Vercel request ID: `sfo1::iad1::fs26p-1785458707089-eb9813b86cba`;
- a disposable production Save journey moved one result from 75 active jobs to 74, wrote one
  compatibility row and one canonical pursuit, classified it as Saved for later, kept it absent
  after dashboard reload, rendered it in Saved Pursuits, recorded zero browser errors, and cleaned
  every disposable row;
- the exact reported Ontra URL returned HTTP 200 at layer 0 and then returned HTTP 200 from
  `/api/jobs/from-link` in the authenticated production browser;
- the custom posting rendered as `Director, Product Operations` in Saved for later;
- authenticated tracking returned HTTP 200 with bucket `applied` and a persisted
  `trackingStartedAt`, after which the same posting rendered under Applied;
- that disposable custom-URL run also recorded zero browser errors and cleaned its profile,
  owner-scoped job, saved row, pursuit, and tracking rows to zero.

The disposable production QA scripts used for the two new journeys were deleted after execution.
The existing permanent scan harness was unchanged.

Verification attempts worth not rediscovering:

- A Playwright locator for the first job card re-resolved to the next card after removal, so waiting
  for that locator to detach timed out even though production Save returned HTTP 200. The corrected
  check retained an element handle for the original DOM node.
- A passive response listener was asserted before its asynchronous JSON handler completed. The
  corrected run awaited `/api/jobs/save` directly.
- Closing Human Path as soon as the dialog appeared can precede pursuit initialization. The
  successful custom-URL run waited until Review's Continue control was actionable.
- A brand-new Saved pursuit resumes at Review, not Track. To avoid paid contact/outreach generation,
  the production routing check used the same authenticated tracking endpoint as the Track UI, then
  verified the Applied tab.

### Remaining item and next immediate starting point

Product behavior is complete and production-verified. The repository was clean and synchronized
after commit `91d03cd`.

Remote Claude Design registration is still **NOT VERIFIED** because this Codex session had no
Claude Design `register_assets` connection. A Claude Design-enabled session should:

1. Read project `3af2f1ea-428c-49b3-8b02-c066ec0c7452`.
2. Push the exact committed `design-system/components/dashboard-jobs.html` and the unchanged
   `_ds_manifest.json` together without creative changes.
3. Register the Dashboard Jobs card at a 1440 by 900 viewport with a subtitle noting that Save now
   exits active scans and moves the posting to Saved for later.
4. Read the remote card back and compare it byte-for-byte with the local file.

Do not revise production code while completing that remote registration. After it is registered,
there is no work in flight. The previously documented Phase 4 Markdown export remains the next
planned product phase only after Randall explicitly approves its implementation scope.

---

# Prior Handoff: Scan Failure Resolved, Phase 4 Next

_Updated 2026-07-28. Read `AGENTS.md` and follow the Session Start Protocol in
`docs/project-operating-state.md` before editing._

## 2026-07-28 first-user scan failure

Larissa Fransen's first production scan failed before any request reached the scan API. Production
evidence ruled out profile readiness, inventory, and matching:

- her candidate profile and profile-quality rows were complete;
- her search settings and target titles were populated;
- she had zero `job_scan_results`;
- a read-only run of her exact profile against the 5,112-row production pool selected the
  75-result cap;
- Vercel logs for her test window contained the successful dashboard reads but no
  `POST /api/jobs/scan`.

The exact no-request signature was reproduced in a disposable authenticated production browser:
the dashboard loaded from the authoritative Supabase session, the legacy mirrored
`dumpster-fire-public-access-token` local-storage key was removed, and the existing Run scan
handler redirected to onboarding without dispatching a request or recording an error. The
dashboard load and the scan action were using different authentication authorities.

Implemented and deployed:

- `resolvePublicActionAccessToken` resolves the live Supabase session first and treats the
  local-storage mirror only as a compatibility fallback;
- the dashboard Run scan handler uses that resolver before deciding the user is signed out;
- scan API exceptions return safe JSON with a trace reference, and successful responses carry the
  same reference for log correlation;
- the scan modal reads the server error and reference instead of showing only an opaque HTTP code;
- unit coverage proves authoritative-session precedence, missing-mirror restoration, fallback
  behavior, and traceable scan API failures;
- `scripts/qa/production-scan-browser.mjs` is now a permanent release test. It creates a disposable
  complete production account with zero results, signs in through the real UI, deliberately removes
  the mirrored token, clicks the real Run scan control, requires one HTTP 200 scan request, confirms
  persisted result rows, reloads and confirms the dashboard renders them, then deletes the account
  and audits cleanup.

Pre-fix production evidence from the permanent harness:

- commit `2c6ac12aaa48919c5575b3dc43c7e5836e6697e4`;
- no `/api/jobs/scan` request, response, console error, or page error;
- zero persisted results;
- the browser returned to `/onboarding`;
- disposable account, profile, and scan-result cleanup counts all returned zero.

Verification completed locally:

- focused public-auth and public-jobs repository suites pass;
- TypeScript passes;
- full `npm run release:check` passes all migration harnesses, all 34 fixture suites, lint with the
  same four pre-existing warnings and zero errors, and the production Next.js build.

Production verification completed on code commit
`b64b23128c74b547ee0fe7a2091c3d6150feb2ac` and was repeated after the documentation release
`1f0e21a784290503b0590b87de7eea0a96ad0627`:

- Vercel reported the production deployment complete;
- the unchanged permanent harness ran at the responsive 850 x 567 viewport;
- its authoritative Supabase session remained valid while the mirrored legacy token was removed;
- the real Run scan control dispatched exactly one `POST /api/jobs/scan`;
- production returned HTTP 200; the final run carried trace reference
  `1dfcacf2-cf9a-4f2d-9c0a-55894b448fcc` and Vercel request ID
  `sfo1::iad1::x8nwg-1785272349558-5746e1a7dfad`;
- the response returned 75 matches, 75 active rows persisted, and the reload rendered the same
  active-result count;
- the browser recorded zero console errors and zero page errors;
- disposable account, profile, and scan-result cleanup counts all returned zero.

Larissa's named production account was then remediated through the same scan service. Her scan
persisted and returned 75 matches, with `lastScanAt` recorded at
`2026-07-28T20:56:47.48+00:00`. No impersonated browser session, password reset, email, outreach,
or other external action was used.

## 2026-07-27 site bug release

The approved site-bug session is implemented in code commit `a54e3ff`
(`Fix reported dashboard and pursuit bugs`). The release contains only the reported fixes:

- feedback saves compare timestamps by instant, so equivalent database timestamp formatting no
  longer creates a false stale-draft error;
- feedback error notices use the approved resume-upload alert treatment without the exclamation
  icon, with matching production and design-system files;
- creating a pursuit also maintains the temporary `saved_jobs` compatibility row, so returning
  from Saved Pursuits preserves the saved state;
- outreach generation receives the selected Role Track, rejects titles from alternate tracks, and
  never persists a message that still violates a hard generation rule after retries;
- Saved Pursuits includes the approved Dashboard and Run scan actions above its heading, and the
  Run scan shortcut focuses the existing dashboard action without automatically spending a scan;
- Human Path accepts a finite set of employer identities only when the current posting explicitly
  states the relationship. Ordinary exact-company searches are unchanged, no extra search pass is
  added, unrelated client-company contacts remain excluded, and empty results remain unmetered.

Verification completed before the release commit:

- the full `npm run release:check` gate passed all billing and Saved Pursuits migration harnesses,
  all 34 fixture suites, TypeScript, lint with four pre-existing warnings and zero errors, and the
  production build;
- a real three-lane Exa smoke test for the Haldren/Keller posting returned three useful contacts
  without an additional provider pass;
- responsive rendered QA passed at 320, 375, 390, 1280, and 1440 pixels without horizontal
  overflow, clipped actions, or orphaned alert copy;
- dashboard and styleguide localhost header checks returned HTTP 200;
- `git diff --check` passed and the added lines contain no em dashes.

The local production/design-system parity files are committed. Remote `register_assets` for the
touched Claude Design cards was not available because this Codex session had no connected Claude
Design document session. Do not describe that remote card state as synced until it is registered
and read back.

**Resolved 2026-07-27 (Claude session).** The remote design sync below is complete and verified.
See "Claude Design remote sync result" at the end of this section.

### Claude Design follow-up for Claude

Randall wants Claude to complete this in the next Claude session. This is a remote design-system
sync task only. Production is already live at code commit `a54e3ff`; do not revise the approved
layout, copy, CSS, behavior, or production components while completing the sync.

Use Claude Design project `3af2f1ea-428c-49b3-8b02-c066ec0c7452` and bring these committed local
mirrors into remote parity:

1. `design-system/components/apply-wizard.html`
   - feedback alerts no longer include the exclamation icon;
   - the Human Path empty state explains the posting-backed Keller Executive Search fallback and
     that an empty result did not count toward the Apply Wizard total.
2. `design-system/components/dashboard-jobs.html`
   - feedback alerts no longer include the exclamation icon.
3. `design-system/components/feedback.html`
   - feedback alerts no longer include the exclamation icon.
4. `design-system/patterns/saved-pursuits-page.html`
   - Dashboard and Run scan actions appear above the Saved Pursuits heading using the approved
     mustard utility and teal proceed button roles.

Follow the full design-sync checklist:

1. Read each committed card and confirm its first-line `@dsCard` marker.
2. Confirm every card remains present in `design-system/_ds_manifest.json`.
3. Push the exact committed card state to the Claude Design project without creative changes.
4. Run `register_assets` for every card above with an accurate change subtitle and viewport.
5. Read the remote cards and asset registrations back to verify project, card content, manifest
   presence, and refreshed registration.
6. Record the successful remote sync and readback in this handoff. If any remote content differs,
   stop and report the discrepancy instead of changing production to match stale remote content.

### Claude Design remote sync result (2026-07-27, Claude session)

Completed. No design, copy, CSS, layout, or production file was changed; this was a push of the
already-committed `a54e3ff` card state plus registration and readback.

Project verified before writing: `3af2f1ea-428c-49b3-8b02-c066ec0c7452`, "Dumpster Fire Design
System", `PROJECT_TYPE_DESIGN_SYSTEM`, `canEdit: true`.

Plan `plan_3af2f1ea428c49b3_7eceab2f0a8a` wrote 5 files from `design-system/` with zero deletes:
the four cards plus `_ds_manifest.json`. `register_assets` returned 4 registered cards with change
subtitles at viewport width 1280:

- `components/apply-wizard.html` (Components): icon-free feedback alert; Human Path empty state
  explains the posting-backed search company and that it did not count toward the total.
- `components/dashboard-jobs.html` (Components): icon-free feedback alert.
- `components/feedback.html` (Components): icon-free feedback alert, all states.
- `patterns/saved-pursuits-page.html` (Patterns): Dashboard/Run scan actions above the heading.

Readback evidence, all four cards fetched from the project after the write and compared against the
committed local mirrors:

- `patterns/saved-pursuits-page.html`, `components/feedback.html`,
  `components/dashboard-jobs.html`, and `components/apply-wizard.html` each came back
  byte-identical to the local file, `truncated: false`, with the first-line `@dsCard` marker intact
  (27,138 / 44,380 / 61,280 / 93,650 bytes respectively).
- Change-specific confirmations in the remote content: no `<svg>` inside any `feedbackAlert` block;
  the new alert treatment (`color-mix(in srgb, var(--c-tomato) 10%, var(--c-paper))` plus a 6px
  tomato left border) present in both `dashboard-jobs` and `feedback`; the Keller Executive Search
  empty-state copy, the "did not count toward your Apply Wizard total" sentence, and the Keller
  LinkedIn query present in `apply-wizard` with the old OpenAI query gone; the `pageActions` nav
  present in the Saved Pursuits top bar and in both the 375 and 320 frames.
- `_ds_manifest.json` was read before the push and already listed all four cards; the local manifest
  (48 cards, unchanged since `c536002`) was pushed in the same plan.

No remote discrepancy was found, so no production file needed reconciling.

### Edit Profile shortcut correction (2026-07-27, approved by Randall in session)

Randall's correction to the `a54e3ff` Saved Pursuits buttons: the Dashboard button was right, the
Run scan button should never have been there. It is replaced by an Edit Profile action that returns
the user to the profile form, and the same action is added to the dashboard Overview card.

Approved direction, given item by item in session: keep mustard; use the edit pencil icon inside the
button; remove the now-dead scan focus plumbing; leave the retired `patterns/scan-page.html` card
stale.

Implemented:

- `app/saved-pursuits/SavedPursuitsClient.tsx`: the Run scan shortcut is now Edit Profile linking to
  `/onboarding`, carrying the canonical edit pencil.
- `app/saved-pursuits/saved-pursuits.module.css`: `.dashboardAction` and the removed teal
  `.scanAction` collapse into one shared mustard `.utilityAction`; `.pageAction` gains a
  `var(--space-2)` icon gap.
- `app/dashboard/DashboardClient.tsx`: the Overview card gains an Edit Profile button under View
  Saved Pursuits, reusing the existing mustard `.scanSecondaryBtn` primitive. The
  `#dashboard-run-scan` hash-focus effect and the matching button id, both added in `a54e3ff` only
  to serve the removed Saved Pursuits link, are deleted.
- `app/dashboard/dashboard.module.css`: a stacking gap for adjacent mustard utility buttons plus
  `.editProfileBtn` icon centering.
- Design-system parity in the same pass: `patterns/saved-pursuits-page.html` (top bar plus the 375
  and 320 frames) and `components/dashboard-jobs.html` (Overview card).

Verification:

- typecheck clean; lint 0 errors with the same four pre-existing warnings; production build passed.
- Rendered QA in headless Chrome at 320, 375, 390, 1280, and 1440 pixels. Both controls measure
  mustard `rgb(224, 165, 47)` on ink text, the pencil sits left of the label, and the two Overview
  buttons are equal width with a `var(--space-3)` gap. The nav wraps to two full-height 46px rows at
  320 and sits on one row from 375 up.
- Pre-existing and unchanged by this work: both demo cards overflow a 320-pixel viewport by 43 and 9
  pixels because of their fixed-width phone/demo frames. Rendering the committed `HEAD` cards
  produced the identical 43 and 9 pixel values. Not fixed here, per bug-fix scope discipline.
- Claude Design sync completed under plan `plan_3af2f1ea428c49b3_b0af61535e9a`: 2 writes, 2 assets
  registered, and both cards read back byte-identical to the local mirrors with `truncated: false`.

### Board-aware pasting (2026-07-27, approved by Randall in session)

A pasted link and a scanned board are the same posting reached two ways, but the paste path never
consulted the board registry: it fetched the public web page and reverse-engineered HTML, which
fails on boards that render in the browser. Pasted links now resolve against the same
`resolveBoardFromUrl` registry the scan uses.

- `lib/public-jobs/board-posting.ts` (new): reads a single posting from Greenhouse
  (`boards-api.greenhouse.io/v1/boards/{token}/jobs/{id}?content=true`), Ashby, and Lever, deriving
  the posting id from the pasted URL. Falls back silently when a board has no single-posting path
  or its API does not answer.
- `lib/public-jobs/ingest-link.ts`: resolves the board before fetching. A blocked board returns the
  new `board_unsupported` result carrying its hostname; a supported board is read through its API,
  which skips the page fetch, the extraction claim, and the model entirely; anything else keeps the
  existing HTML path unchanged.
- `lib/public-jobs/api.ts`: `board_unsupported` returns 422 naming the board, so a login-gated
  board reads as a specific reason instead of a generic extraction failure.

Verified end to end against the real boards: Greenhouse, Ashby, and Gem ingest with **no model
call** (Greenhouse previously required the LLM), and recruiterflow still ingests via JSON-LD.

### Scan/paste parity (corrected and expanded 2026-07-28)

**Requirement (Randall): any job a scan presents to the user must also be ingestible through the
single-URL input through the same scan data structure.** The three reported URLs are examples, not
the acceptance set. Parity covers every active production source/hostname class and every connector
class the scan engine can emit. A source-specific posting page does not need to be independently
scrapable when the scan already persisted the structured posting.

Measured against production on 2026-07-28: 5,112 shared-pool jobs, 85 active global sources, and 18
distinct source/hostname classes. The audit forced each class through the paste pipeline with a
different tracking parameter. Two remaining failures were found after the earlier board-only pass:

1. **Adzuna tracking was asymmetric.** Scan rows retain Adzuna's own `utm_*` values. Stripping
   tracking only from the pasted URL could never equal a stored URL carrying different tracking.
2. **Remote OK emitted one non-specific URL.** A production scan row retained mixed hostname casing
   and `/remote-jobs/`, which identifies the board rather than the posting.

The complete parity fix:

- `dedupeKeyUrl` strips campaign and referral parameters (`utm_*` plus a conservative list) and the
  dedupe query matches the pasted URL **or** its stripped form. The URL the user pasted is still
  what gets stored, so "Open posting" always opens the link they had. Identifying parameters such
  as `gh_jid` are deliberately never stripped.
- `scanJobIdentityFromUrl` derives the durable `external_job_id` already persisted by scan
  connectors. A pasted link can therefore match Adzuna, Remote OK, Greenhouse, Ashby, Lever,
  Arbeitnow, Magnit, Himalayas, Remotive, and We Work Remotely across harmless URL differences.
- Historical mixed-case Remote OK URLs have a read-only compatibility key.
- Remote OK normalization now reconstructs a specific posting URL from the API slug and rejects a
  row that has only the board root, so future scans cannot surface an unidentifiable link.
- `boardTokenFromConfiguredSources` prefers a `job_sources` token whose value equals a hostname
  label over the registry's guess, so a careers host resolves to the board the scan reads.

Live read-only verification: 18/18 active production source/hostname classes returned
`already_known` before page fetch, model use, fallback insertion, or production writes. The
regression matrix also covers inactive-but-supported Workday, iCIMS, Rippling, account-level
Workable, and generic JSON-LD connectors, for 23 scan URL classes total. The earlier "34% cannot be
pasted" figure and the narrower "17 hosts OK" claim are superseded.

### Gem single-posting ingestion (resolved 2026-07-28)

Gem was not a browser-rendering problem after all. Its HTML response is an empty JavaScript shell,
but the public page's own unauthenticated client reads the posting through
`https://jobs.gem.com/api/public/graphql`. The exact query and response fields are published in
Gem's public `jobBoards` JavaScript asset.

- `lib/scan/sources/board-registry.ts` now distinguishes a `posting_only` source from a whole board.
  A Gem job URL can therefore enter manual link ingestion without falsely enabling Gem as a
  recurring company-board source.
- `lib/public-jobs/board-posting.ts` sends the same public `ExternalJobPostingQuery` used by Gem's
  browser client, then extracts the title, company/team display name, main description, intro,
  outro, and compensation into the existing deterministic posting path.
- Gem pastes skip the empty HTML shell, model extraction, and headless-browser rendering.
- Whole-board Gem registration remains unsupported. This change supports a pasted posting, not a
  recurring scan of every role on a Gem board.

Live verification against Randall's reported Function Health URL returned `Head of Special
Projects`, `Function Health`, and 9,460 characters of usable posting text. The exact reported
Greenhouse and Ashby links also passed through their structured adapters.

The broader long-tail question still exists for a future provider that returns only a browser shell
and exposes no public structured endpoint. Measure real failures before adding Chromium or a
rendering vendor; Gem is no longer evidence that such a dependency is needed.

### Pinned, not acted on: profile vs onboarding naming

Randall's observation, logged as a potential scope change and explicitly not implemented: now that
Edit Profile sends a logged-in user to `/onboarding`, that surface is editing a finished profile
rather than onboarding a new user, so it should probably present as **Profile** when the user is
signed in. Anything here needs its own approved scope and design direction. Likely surfaces to
consider: the route itself, the page title and heading, the `SiteHeader` profile link label, and any
remaining copy that calls the surface onboarding. No decision has been made.

The next planned product task remains Phase 4 Markdown export. Start by confirming production is
serving `a54e3ff` or a later `main` commit and that the repository is clean, then return to the
preserved Phase 4 plan. Do not expand into live Stripe setup without explicit scope.

## 2026-07-27 pause point

Phase 3 and the separately approved production UI port are implemented locally. The complete
Stripe sandbox lifecycle exit gate passed on 2026-07-27. The implementation and persistent
session-closure rule are committed on `main` at `ae1ca43`. Nothing has been deployed or applied to
production.

Verified local/backend state:

- Stripe SDK `22.1.1`, configuration, exact-account validation, price allowlist, Checkout, Portal,
  plan-change, signed webhook, idempotency, reconciliation, and account subscription/usage code
  are included in commit `ae1ca43`.
- The Phase 3 target is the dedicated **Dumpster Fire sandbox**
  `acct_1TxaWWJtJtSFf8Kw`. The primary Dumpster Fire account
  `acct_1TxaN3JzLRNdHYq3` remains the later live-account target.
- `.env.local` is gitignored and contains the sandbox test secret, exact sandbox account ID,
  sandbox price IDs, Portal configuration ID, and the most recent sandbox Stripe CLI webhook
  secret. Never print or commit the secret values.
- Sandbox resources are tagged with `project=dumpster_fire_llc`,
  `integration=subscription_billing`, `environment=sandbox`,
  `account_context=dumpster_fire_sandbox`, and the sandbox account ID.
- Smoldering sandbox Product/Price: `prod_UxWMgxEgvnNs3r` /
  `price_1TxbKCJtJtSFf8Kwh6OoBQfO`.
- Roaring sandbox Product/Price: `prod_UxWMNcOUMPH6kg` /
  `price_1TxbKEJtJtSFf8KwSvD6Mb37`.
- Dedicated sandbox Portal configuration: `bpc_1TxbKGJtJtSFf8KwJvIJIZCM`. It enables payment
  method updates, invoice history, and cancellation at period end, while disabling uncontrolled
  Portal plan switching.
- The original primary-account test resources were left intact. Do not use or delete them without
  explicit scope.
- Local Supabase uses `supabase/config.toml`; Analytics is disabled because its optional Vector
  service cannot mount Colima's socket. `.env.development.local` is gitignored and overrides
  Supabase with the local stack while enabling local billing and Checkout.
- A clean `supabase db reset` applied every migration through
  `20260726000100_stripe_billing_backend.sql`. The postflight passed schema, RPC security,
  migration history, and service-role repository-read checks.
- Fresh-install testing exposed missing `service_role` `SELECT` grants on
  `user_subscriptions`, `subscription_plans`, and `usage_ledger`. The Phase 3 migration,
  postflight, and isolated migration harness now encode the fix; the corrected harness passes.
- The approved Smoldering/Roaring homepage pricing, plan selection and return states, Profile
  Plan/Billing/change-plan modals, and Apply Wizard zero-use, inactive-payment, and final-use
  states are ported to production components. Markdown export itself remains deferred.
- Responsive browser QA passed at 320, 375, 390, 1280, and 1440 pixels for the pricing, plan,
  Profile Plan modal, and Apply Wizard zero-use surfaces, with no page-width overflow.
- `npm run release:check` passed after the UI port and again after the authenticated Stripe
  lifecycle fix. It included all billing migration harnesses, 34 fixture suites, typecheck, lint
  with four existing warnings and zero errors, and the production build.

Corrected Stripe Dashboard finding and sandbox decision:

- Checkout reached the correct sandbox but Stripe rejected required Terms consent because the
  sandbox business profile is incomplete.
- The current Stripe Dashboard does not expose an independent editable Public details page for
  this sandbox. **Payments > Checkout and Payment Links > Public information > Public details**
  routes into **Business details**, where Stripe shows **Your business information is incomplete**
  and **Add business information**. The Account Status representative-review item is complete;
  it is not the missing Checkout configuration.
- Randall chose not to complete a fictional sandbox business onboarding. The local development
  environment now explicitly sets `STRIPE_CHECKOUT_TERMS_CONSENT=omit`.
- Application configuration defaults Checkout Terms consent to `required`. `omit` is accepted
  only with a Stripe test-mode secret key; a live key is rejected. The Checkout request entirely
  omits `consent_collection` in this sandbox mode.
- Live Checkout must remain `required`. Before live launch, complete the live account business
  details and configure:
  - Terms: `https://www.thejobmarketisadumpsterfire.com/legal/terms`
  - Privacy: `https://www.thejobmarketisadumpsterfire.com/legal/privacy`
- Both legal URLs returned HTTP 200 on 2026-07-26.
- Focused Stripe billing regressions, TypeScript, and the full `npm run release:check` gate passed
  on 2026-07-27 after this change.

Authenticated Stripe lifecycle evidence:

- Checkout Session `cs_test_a1Snsv4QHixNMfVWf8Q6h9gWaXowHvSwYVgYk0bXtpz0IROEdME0Xkqc5D`
  completed and was paid in test mode. Its metadata contained the correct project, user, plan,
  contract, environment, and integration tags.
- Signed Stripe CLI forwarding delivered lifecycle webhooks to localhost with HTTP 200. The local
  subscription mirror became active Smoldering with 20 uses.
- Customer Portal Session creation passed. The dedicated Portal configuration was read back as
  active with invoice history, payment-method update, and period-end cancellation enabled, while
  uncontrolled subscription updates remained disabled.
- Immediate Smoldering-to-Roaring upgrade passed. The local account API changed to 45 uses and
  enabled Markdown export.
- The first real downgrade attempt exposed the root cause
  `end_behavior: "renew"`: Stripe accepts only `release` or `cancel`. The implementation now uses
  `release`, regression coverage pins that contract, and the corrected real downgrade created a
  two-phase schedule: current Roaring, next-period Smoldering. A replay returned
  `alreadyScheduled: true` without creating another schedule.
- Period-end cancellation kept current Roaring access while setting `cancelAtPeriodEnd=true`.
  Reversal cleared both `cancelAtPeriodEnd` and `canceledAt`. Immediate final cancellation changed
  the local mirror to `canceled`.
- One already-processed signed Checkout event was replayed twice with Stripe SDK's official
  signature generator. Both responses were HTTP 200 with `duplicate=true`; the audit record
  remained one processed row with `attempt_count=1`.
- Reconciliation passed before and after cancellation: one checked, one matched, zero mismatches,
  zero errors.
- The disposable local auth user and subscription mirror were removed. The disposable Stripe
  customer `cus_Uxm5O3NapWg9YX` was deleted after its subscription was canceled. Shared products,
  prices, Portal configuration, and Stripe event history were untouched. The local
  `stripe_webhook_events` table retains 34 processed audit rows.

Remaining production-readiness gaps:

- The Stripe backend migration is not applied to production, and production Checkout remains off.
- Live-mode Stripe Products, Prices, Portal, webhook, keys, completed business details, legal URLs,
  required Terms consent, invoice/failure emails, and the tax decision remain Phase 9 work.
- Markdown export behavior remains Phase 4.

Exact next starting point:

1. Run `session check`, follow the Session Start Protocol, and confirm `main` is clean and includes
   the first-user scan fix plus this session-memory commit.
2. Confirm production still returns HTTP 200 before beginning new work.
3. Phase 4 Markdown export is the next planned implementation phase. Do not begin it without
   explicit scope.
4. Do not expand into live Stripe setup or production enablement without explicit scope.

## Session check

1. Run `git pull`.
2. Run `git status --short --branch`.
3. Confirm the active branch is `main`.
4. Read `docs/subscription-billing-production-plan-2026-07-24.md`.
5. Read the Phase 2C production result and Phase 3 starting point below.
6. Read the relevant server/API guides in `node_modules/next/dist/docs/` before implementation.

## Unified pricing initiative state

The approved retail contract is:

- Smoldering: $22/month for 20 successful new Apply Wizard pursuits.
- Roaring: $32/month for 45 successful new Apply Wizard pursuits plus Markdown pursuit-history
  export.
- Roaring is the top plan.
- No free retail tier, one-time membership fee, rollover, or retail overages.
- A use is consumed only when a new pursuit atomically persists at least one useful contact.
- Failed, empty, cached, repeated, and revisited pursuits do not consume another use.
- The usage counter is quiet and appears only on deliberate Plan/Billing surfaces.
- Tester remains an internal access-code entitlement outside the retail plan matrix.

### Codex Phase 1: committed and production schema confirmed

Commit `3a3453d` is on `origin/main`. It added provider cost telemetry, safe rate-card estimation,
source-content reuse, posting-refinement backoff, extraction claims, and the first unit-economics
report.

The 2026-07-25 read-only production preflight directly confirmed these migration files are applied
and recorded in production:

- `20260724000200_provider_usage_events.sql`
- `20260724000300_jobs_source_content_hash.sql`
- `20260724000400_posting_refinement_backoff.sql`
- `20260724000500_job_link_extraction_claims.sql`

The same query confirmed the expected Phase 1 schema objects. This live database evidence
supersedes the earlier note that the four migrations were unapplied. A real production
unit-economics baseline still requires provider events accumulated after deployment.

Known Phase 1 limitations:

- An already-ingested URL is not refetched merely because its remote content later changes.
- Identical content arriving concurrently at different URLs can still produce duplicate provider
  work.

### Claude pricing design: approved and synced

Commit `c536002` contains five approved pricing/billing design cards. They were registered with the
Claude Design project and mirrored into the repository:

- `design-system/components/homepage-pricing.html`
- `design-system/components/plan-billing-step.html`
- `design-system/components/plan-billing-detail.html`
- `design-system/components/apply-wizard.html`
- `design-system/components/export.html`
- `design-system/_ds_manifest.json`

The approved designs cover:

- two-tier homepage pricing;
- plan acquisition, checkout return, access-code, active, canceled, and unavailable states;
- quiet Profile Plan/Billing usage, upgrade, downgrade, cancellation, and payment-recovery states;
- Apply Wizard zero-use, inactive-payment, and final-use exception states;
- Roaring Markdown export and Smoldering locked states.

The production port is now implemented locally for homepage pricing, plan acquisition and return
states, Profile Plan/Billing/change-plan states, and Apply Wizard usage states. It maps to the
approved cards above and is committed in `ae1ca43` but not deployed. Markdown export remains
deferred, and the legal pages were not changed.

### Codex Phase 2A: committed and applied to production

Phase 2A added:

- `supabase/migrations/20260724000600_subscription_billing_two_tier.sql`
- `scripts/test-subscription-billing-two-tier-migration.sh`
- the `test:migrations:subscription-billing` package command;
- automatic inclusion of that harness in `release:check`.

The migration contract:

- sets `basic` to Smoldering at $22/20/no Markdown;
- sets `premium` to Roaring at $32/45/Markdown;
- preserves tester at 25 uses with internal Roaring-equivalent capability;
- retires `pro` from new entitlement;
- adds subscription source and Stripe-ready lifecycle fields;
- backfills existing non-Stripe tester and premium rows as `access_code`, following Randall's
  2026-07-25 legacy-account decision; other pre-Stripe rows remain `manual`;
- prevents access-code writes from replacing a Stripe subscription;
- removes the database fallback that treated a missing subscription as active `basic`;
- adds the authoritative `apply_wizard` usage type, lifetime one-use-per-pursuit uniqueness, and
  immutable pursuit latch;
- backfills only pursuits with persisted useful contacts;
- adds service-role-only atomic access-code redemption;
- adds service-role-only atomic Human Path contact, event, debit, and latch persistence;
- preserves legacy pursuit, Human Path, and outreach write behavior for the application cutover;
- keeps authenticated contact reads while making contact mutations service-role-only;
- uses Stripe half-open billing periods and UTC calendar months for access-code/manual
  entitlements;
- discards raw provider contact and diagnostic fields outside the allowlist.

Verification passed:

- three idempotent migration applications;
- exact catalog, preservation, backfill, security, period, debit, empty-result, and replay checks;
- Stripe source and billing-period fail-closed checks;
- tester UTC renewal regression;
- legacy Saved Pursuits migration harness;
- 32 fixture suites;
- typecheck;
- lint with four pre-existing warnings and zero errors;
- production build;
- full `npm run release:check`.

The migration was applied and recorded on 2026-07-25 after the verification and authorization
documented below. The Phase 2B runtime calls the new RPCs only behind the disabled production flag.

### Codex Phase 2B: deployed with billing false

The application compatibility bridge is committed as `b76e7f8`, pushed to `origin/main`, and
deployed successfully by Vercel. GitHub Actions run `30178555166` passed. `BILLING_ENABLED` is
absent from the production environment, so it resolves false and the legacy paths remain active.

Implemented behavior:

1. Schema-aware subscription types and database mapping cover plan source, Stripe lifecycle,
   Apply Wizard allowance/usage, periods, and Markdown entitlement.
2. Enabled missing subscriptions fail closed; the false path retains the active-basic fallback.
3. Enabled enforcement uses database plan entitlements; the false path retains `PLAN_RULES`.
4. Enabled access-code redemption uses `redeem_access_code_subscription`.
5. Enabled Human Path uses `apply_wizard` preflight and the atomic
   `persist_human_path_generation` RPC.
6. Structured RPC results cover limit, inactive, replay, contacts, pursuit, usage, invalid period,
   invalid state, and visibility outcomes.
7. Stripe periods fail closed; access-code/manual periods derive from the current UTC month.
8. The false path keeps legacy access-code, Human Path, pursuit, and outreach behavior.
9. Outreach debits and production UI remain unchanged.

Changed application and test files:

- `.env.example`
- `lib/public-profile/subscription/types.ts`
- `lib/public-profile/subscription/repository.ts`
- `lib/public-profile/subscription/enforcement.ts`
- `lib/account/access-codes.ts`
- `lib/public-profile/pursuits/types.ts`
- `lib/public-profile/pursuits/repository.ts`
- `lib/public-profile/api.ts`
- `scripts/test-account-access-codes.ts`
- `scripts/test-account-access-codes.mjs`
- `scripts/test-public-profile-subscription.ts`
- `scripts/test-public-profile-pursuits.ts`
- `scripts/test-public-profile-api.ts`
- `scripts/test-fixtures.mjs`
- `package.json`

Verification passed:

- Phase 2A migration harness;
- legacy Saved Pursuits migration harness;
- 33 fixture suites;
- typecheck;
- lint with four pre-existing warnings and zero errors;
- production build;
- `git diff --check`.

## Production migration and postflight result

The aggregate-only read-only preflight ran on 2026-07-25:

- migrations `20260724000200` through `20260724000500` are recorded and their schema is present;
- at preflight time, only `20260724000600` was missing;
- production has three active `premium` subscriptions;
- production has one premium access code with 12 recorded uses;
- production has no durable per-user link from an access-code redemption to a subscription;
- before Randall's decision, migration `00600` would have classified the three premium
  subscriptions as `manual`;
- 10 contact-backed Apply Wizard uses, all for one user and all in the current UTC month, qualify
  for the migration backfill.

Randall selected internal `access_code` entitlement treatment on 2026-07-25. Migration `00600`
now backfills existing non-Stripe `tester` and `premium` subscriptions as `access_code`; other
pre-Stripe plans remain `manual`. Its isolated harness includes a legacy premium fixture. The
focused harness and full local release check passed after this change: three idempotent migration
applications, the Saved Pursuits harness, 33 fixture suites, typecheck, lint with four pre-existing
warnings and zero errors, and the production build.

After a fresh preflight and explicit authorization, migration `00600` was applied and recorded on
2026-07-25. `scripts/postflight-subscription-billing.sql` confirmed:

- the expected Smoldering, Roaring, tester, and retired pro catalog;
- three active premium subscriptions classified as `access_code`;
- 10 unit Apply Wizard backfill rows for 10 distinct pursuits and one user;
- zero duplicate, malformed, debit-without-latch, or latch-without-debit rows;
- all expected schema fields and both atomic RPCs;
- service-role-only execution for code redemption and Human Path persistence.

Randall authorized the controlled flag-on verification. The first attempt failed before
authentication or a provider call because the disposable fixture referenced two profile columns
removed by the redesign. Cleanup returned zero, the flag was removed, and a rollback deployment
completed. The corrected seed-only rehearsal passed while flag-off. The approved retry then passed:

- premium access-code plan read;
- atomic `already_entitled` code response without consuming a code use;
- Roaring export entitlement;
- 23 persisted Human Path contacts;
- one unit Apply Wizard debit, one event, and one pursuit latch;
- 1 of 45 used with 44 remaining;
- cached replay with no additional provider call;
- zero legacy Human Path debits;
- zero disposable rows after cleanup.

`BILLING_ENABLED` remains enabled in Production. The aggregate postflight still shows the three
real premium access-code subscriptions and 10 historical Apply Wizard rows, with no malformed,
duplicate, or unmatched rows.

The checked-in QA harness is `scripts/qa-subscription-flag-on-production.mjs`. Its final local
release check passed both migration harnesses, all 33 fixture suites, typecheck, lint with four
pre-existing warnings and zero errors, and the production build.

## Phase 2C production result

The backend cutover is implemented, migrated, and production-verified:

- new migration: `supabase/migrations/20260725000100_outreach_metering_removal.sql`;
- isolated harness: `scripts/test-outreach-metering-removal-migration.sh`;
- read-only production preflight: `scripts/preflight-outreach-metering-removal.sql`;
- aggregate postflight: `scripts/postflight-outreach-metering-removal.sql`;
- billing-enabled compatibility changes in `lib/public-profile/api.ts` and
  `lib/public-profile/pursuits/state-machine.ts`;
- focused flag-on coverage in `scripts/test-public-profile-api.ts`;
- automatic release-gate coverage through `package.json`.

The same-signature RPC now requires the Apply Wizard latch, persists messages atomically and
idempotently, returns zero retired debit metadata for new requests, and writes no new
`pursuit`/`outreach_message` ledger row. Historical requests retain their original replay
metadata. Billing-enabled initial outreach and regeneration skip legacy application quota checks
and usage events. Provider/model telemetry remains unchanged.

Local verification passed:

- three idempotent Phase 2C migration applications;
- historical positive-debit replay preservation;
- multi-contact zero-debit persistence and identical no-write replay;
- unlatched pursuit rejection with zero partial state;
- Apply Wizard-only quota enforcement;
- service-role-only RPC execution;
- legacy Saved Pursuits migration harness;
- 33 fixture suites;
- typecheck;
- lint with four pre-existing warnings and zero errors;
- production build;
- `git diff --check`.

After explicit authorization, `20260725000100` was applied and recorded as
`outreach_metering_removal`. Postflight proved the Apply Wizard-only quota function, latch
requirement, zero legacy usage writes, nonnegative compatibility metadata, service-role-only RPC,
unchanged historical rows, and zero duplicate contact messages.

The first authenticated QA attempt passed Human Path and initial outreach but regeneration failed
before persistence because the model's last retry was 873 characters against the 750-character
limit. Cleanup returned all disposable state to zero, and postflight remained green. Randall
explicitly authorized one additional provider-costing retry. It passed with 19 contacts, one Apply
Wizard debit, cached replay, one zero-debit outreach request, no legacy pursuit/outreach rows, one
in-place regeneration, a rejected second regeneration, 736- and 721-character messages, and full
cleanup. The final aggregate audit found zero disposable QA Auth users and profiles. Canonical `/`
and `/plan` return HTTP 200.

## Immediate next task: Phase 4 Markdown export

The first-user scan failure is resolved, deployed, production-browser verified, and remediated for
the named tester. The Phase 3 backend, authenticated Stripe sandbox lifecycle, and approved billing
UI port remain committed on `main`. Phase 4 Markdown export is the next planned implementation
phase and requires explicit scope before work begins.

No live Stripe configuration, live product creation, production secret change, deployment, or
production enablement is authorized by this handoff.

## Explicitly still incomplete

- A real production unit-economics baseline after post-deploy provider events exist.
- Markdown pursuit-history export backend.
- Terms, Privacy, Billing, and Support updates plus the legal-counsel checkpoint.
- Production Stripe configuration, end-to-end verification, and release authorization.
- Dependency security maintenance: production `npm audit --omit=dev` reports high-severity
  advisories through Next.js `16.2.10` and its `sharp` dependency. The available fix path is
  Next.js `16.2.12`; this was not mixed into the scan bug fix.

## Production safety boundary

Do not disable `BILLING_ENABLED`, configure live Stripe, or edit protected production UI/copy
without new explicit scope. Production uses the database-backed entitlement and atomic Apply
Wizard paths. The new Stripe Checkout, Portal, webhook, and production UI work is committed on
`main` but is not deployed.
