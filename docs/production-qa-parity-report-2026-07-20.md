# Production QA and Design Parity Report

Date: 2026-07-20

Validated application SHA: `f03a4886ae62b8ad7ab332e1a6c44c03976ac99a`

Feedback release SHA: `ec86803`
Status: **The Claude GitHub update and follow-up logic fix are live, the current production UI
passes responsive QA, and the feedback additions pass. The corrected repo-backed design cards
still require Claude Design registration and remote readback.**

## Scope

This is the consolidated QA record for:

- The job-match and generated-message feedback additions.
- The approved production and design-parity findings recorded during the 2026-07-20 audit.
- The homepage header-to-matchbook and matchbook-to-headline spacing corrections.
- The final release gates and live production checks.

The detailed feedback release record remains in
`docs/feedback-feature-handoff-2026-07-19.md`. The `/api/qa-report` route is the PhredBot
feedback-widget endpoint, not this QA report.

## Deployment confirmation

Result: **PASS for `5f3e88c` and follow-up `f03a488`**

- Initial Claude confirmation found local `HEAD` and `origin/main` both at
  `5f3e88cad46234f6b5ed135eb6e9dae22d68f795`.
- GitHub check `verify` completed successfully for that exact SHA.
- GitHub deployment `5529493401`, created by `vercel[bot]`, records that exact SHA in the
  `Production` environment.
- Its deployment status is `success` with description `Deployment has completed`.
- Follow-up `f03a4886ae62b8ad7ab332e1a6c44c03976ac99a` passed GitHub check `verify`.
- Vercel deployment `5529799752`, created by `vercel[bot]`, records that exact follow-up SHA in
  the `Production` environment with status `success` and description `Deployment has completed`.
- `https://www.thejobmarketisadumpsterfire.com` returns HTTP 200 from Vercel.
- The apex domain returns HTTP 308 to the canonical `www` host.

The pushed commit contains the approved production corrections for:

1. Saved Pursuits access after a profile becomes incomplete.
2. Current Human Path records-slide labels and removal of `Coming Soon`.
3. The signed-in profile action on Saved Pursuits.
4. `Saved Pursuits` dashboard status vocabulary.
5. The shared header design card and its embedded header examples.

## Homepage spacing and responsive production QA

Result: **PASS**

The live production homepage was measured and visually inspected at 320, 375, 390, 1280, and
1440 pixels.

### Header to matchbook card

At all five widths:

- The header element box and matchbook card are 13px apart.
- The approved header shadow paints 3px below the element box.
- The visible gap from the painted shadow edge to the matchbook card is therefore exactly 10px.
- No header or navigation control overlaps the card.

This matches the approved `home-hero-header-spacing` card and the durable decision in
`docs/current-state.md`.

### Matchbook card to first headline

The live gap from the bottom of the matchbook card to `Is the Job Market a Dumpster Fire?` is:

- 72px at 320, 375, and 390 pixels.
- 104px at 1280 and 1440 pixels.

This matches the recorded approved reduction from 174px desktop to 104px desktop and 72px mobile.

### Required viewport checklist

At all five widths:

- Document horizontal overflow is 0.
- The navigation stays inside the viewport.
- Every navigation control has a real, nonzero hit area inside the viewport.
- The Human Path records slide stays inside the viewport.
- The records slide shows `Sent outreach message`, `Applied online`, `Received response`, and
  `Interviewing`.
- `Coming Soon`, `Messaged Sam Lewis`, `Heard back`, and `Saved for follow-up` are absent.
- Multiword records-slide labels do not end with a one-word orphan line.

Desktop and 320px screenshots were visually inspected after the assertions passed. The header,
matchbook card, records slide, typography, and controls remain contained with no overlap.

## Feedback additions QA

Result: **PASS**

### Design and production parity

Approved Claude Design source:

- Project: `3af2f1ea-428c-49b3-8b02-c066ec0c7452`
- Plan: `plan_3af2f1ea428c49b3_da8bd4049e9f`
- Cards: `feedback`, `match-card`, `dashboard-jobs`, `copy-generation`, and `apply-wizard`

`node scripts/verify-feedback-design-cards.mjs` passed at 320, 375, 390, 1280, and 1440 pixels.
The verifier confirms both approved feedback flips, focus behavior, reset behavior, reduced-motion
fallback, selection-required Save state, the mobile `Something Else` layout, and zero horizontal
overflow.

### API, migration, and retained evidence

- `npm run test:migrations:feedback` passed, including repeat application, constraints, retention,
  grants, and row-level security.
- Live unauthenticated `POST /api/jobs/feedback` returns HTTP 401.
- Live unauthenticated
  `POST /api/public-profile/pursuits/outreach/[messageId]/feedback` returns HTTP 401.
- The authenticated production release QA recorded one successful save for each feedback surface,
  correct immutable context capture, unchanged message and usage records, and full disposable-data
  cleanup.
- No feedback implementation, API, library, or feedback migration file changed between the
  authenticated feedback release and the current production SHA.

No known feedback-feature defect remains.

## Approved findings disposition

### 1. Outreach hard-rule fallback

Production status: **RESOLVED on `f03a488`**

Root cause: after three hard-rule failures, `generateOutreachMessage` returned its least-bad
violating result. Callers could then persist or return a message containing an em dash or another
prohibited condition.

Correction:

- `lib/public-profile/outreach-generator.ts` now returns `undefined` when violations remain after
  the bounded retry loop.
- `scripts/test-public-profile-outreach.mjs` now asserts that no violating near-miss is returned.
- The focused test and the full fixture suite pass.

The focused regression, full 28-suite fixture run, typecheck, lint, production build, GitHub
verification, and Vercel production deployment all pass.

### 2. Saved Pursuits access after profile incompleteness

Production status: **RESOLVED on `5f3e88c`**

`Saved Pursuits` is outside the profile-complete-only action group. `Job scan` retains its existing
profile-completion condition.

### 3. Homepage Human Path records slide

Production status: **RESOLVED on `5f3e88c`**

The live labels and availability state match the approved `home-human-path` card at every required
width.

### 4. Saved Pursuits signed-in header action

Production status: **RESOLVED on `5f3e88c`**

The Saved Pursuits route maps `SiteHeader` to `profileHref="/onboarding"`, which selects the
existing signed-in profile-icon primitive.

### 5. Dashboard Saved Pursuits vocabulary

Production status: **RESOLVED on `5f3e88c`**

The two stale `Saved Jobs` status strings now use `Saved Pursuits`.

### 6. Shared header design card

Production status: **LIVE HEADER PASSES; repo card corrections are pushed; Claude Design remote
sync remains**

The pushed design card includes the current routes, labels, signed-out actions, and signed-in
profile action. The audit found two card-only differences from the live shared primitive:

- The pushed card forced a display font on the brand and auth pills, while production uses the
  subhead font for the brand and body font for the auth pills.
- The pushed card added a 320-only compact rule not present in production.

The pushed repo mirror now matches the computed production typography and removes the card-only
compact rule in:

- `design-system/components/header.html`
- `design-system/components/home-hero-header-spacing.html`
- `design-system/components/onboarding-account-bar.html`
- `design-system/components/onboarding-signed-out.html`

Local browser QA confirms zero overflow for all four signed-in and signed-out header examples,
including both 320px examples. The corrected files are in `f03a488`; they still require Claude
Design `register_assets` and remote readback before the design sync can be called complete.

## Automated release gates

Result: **PASS on the deployed follow-up tree**

- `npm run release:check`
  - Saved Pursuits migration verification passed.
  - All 28 fixture suites passed.
  - TypeScript passed.
  - ESLint passed with zero errors and four known unrelated warnings.
  - Next.js 16.2.10 Turbopack production build passed.
- `npm run test:migrations:feedback` passed.
- `node scripts/verify-feedback-design-cards.mjs` passed.
- `node scripts/test-public-profile-outreach.mjs` passed.
- `git diff --check` passed.

The Chrome and PostgreSQL checks require normal local system access because the sandbox cannot open
Chrome's debug port or PostgreSQL shared memory. The unchanged checks passed with that access.

## Release readiness

The exact Claude commit `5f3e88c` and follow-up `f03a488` are pushed, deployed, HTTP-healthy, and
release-gate clean. The feedback additions remain live and verified. The fail-closed outreach
correction is live.

The only remaining parity task is to run Claude Design `register_assets` for the four corrected
header-bearing cards and read them back against the repo mirror. This is a design-system remote
sync gap, not a production application or feedback-feature defect.

## Exact rerun commands

```bash
npm run release:check
npm run test:migrations:feedback
node scripts/verify-feedback-design-cards.mjs
node scripts/test-public-profile-outreach.mjs
git diff --check
curl -I https://www.thejobmarketisadumpsterfire.com
```
