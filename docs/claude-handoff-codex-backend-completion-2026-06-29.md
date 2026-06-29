# Claude Handoff - Codex Backend Completion - 2026-06-29

## Status

Codex completed the backend-only brief in `docs/codex-tasks-backend-2026-06-28.md`.

The repo was clean and synced before this report was written. The backend completion head was:

`32f6f5159c81113e511227e361f3acba6438498e`

## What Codex Completed

### Matching

- Added framework-neutral matching engine under `lib/public-profile/matching/`.
- Added scorers, recommendation helpers, risks, and explanation output.
- Honored Randall's 2026-06-29 decision that salary floor, remote preference, and blacklisted or avoided companies are soft negative signals, not hard drops.
- Added authenticated `POST /api/public-profile/match`.
- Added matching and match-route fixture coverage.

### Pursuits

- Added pursuit event/state-machine backend under `lib/public-profile/pursuits/`.
- Added defensive migration `supabase/migrations/20260629000100_pursuit_events.sql`.
- Added authenticated pursuit API slices:
  - `POST /api/public-profile/pursuits`
  - `POST /api/public-profile/pursuits/review`
  - `POST /api/public-profile/pursuits/human-path`
  - `POST /api/public-profile/pursuits/contacts`
  - `POST /api/public-profile/pursuits/outreach`
  - `POST /api/public-profile/pursuits/status`
  - `POST /api/public-profile/pursuits/lifecycle`
- Added defensive migrations:
  - `supabase/migrations/20260629000200_contact_selection.sql`
  - `supabase/migrations/20260629000300_outreach_work_examples.sql`
- Preserved the product rule that Saved Jobs are "pursue later" only and do not create pursuits.
- Added state-machine and API coverage for review, Human Path boundary, contact selection, outreach, status tracking, notes, expiration, and deletion.

### Subscription Enforcement

- Added backend subscription enforcement under `lib/public-profile/subscription/`.
- Implemented Tester, Basic, and Pro limit checks for metered features.
- Enforced Human Path and outreach limits before provider/model work.
- Gated Pursued Jobs Export to Pro+ in data-returning enforcement logic.
- Left live billing webhook work blocked on the billing-provider decision.

## Verification Already Run

Codex repeatedly verified the backend slices with:

```bash
node scripts/test-public-profile-api.mjs
node scripts/test-public-profile-pursuits.mjs
node scripts/test-public-profile-subscription.mjs
node scripts/test-public-profile-matching.mjs
npm run test:public-jobs
npx tsc --noEmit --incremental false
npm run lint
git diff --check
```

Latest documented lint result: 7 existing warnings, 0 errors.

Local migration validation was also run for the 2026-06-29 migrations using disposable local Postgres clusters. No production database access was used.

## Commit Range

Recent backend API completion commits:

```text
33716b9 add public profile pursuit creation route
b8c96a5 add public profile pursuit review route
35e177c add public profile human path route
e77d5e0 add public profile contact selection route
23613db add public profile pursuit outreach route
31fe00a add public profile pursuit status route
32f6f51 add public profile pursuit lifecycle route
```

The original matching, pursuit state-machine, migration, and subscription commits are immediately before that range. See `docs/codex-tasks-backend-2026-06-28.md` for the full session log.

## What Is Not Done

This handoff does not mean the public product workflow is fully shippable. The completed work is backend/API foundation only.

Still blocked or not started:

- No pursuit list/read API for dashboard consumption yet.
- No public matching, pursuit, Human Path, or outreach UI.
- No real Human Path provider decision or provider integration.
- No billing provider, checkout, portal, or webhook integration.
- No OAuth polish for Google or Apple.
- No resume storage or parsing provider decision.
- Public-product UI and copy remain design-gated under `AGENTS.md` and `docs/design-state.md`.

## Recommended Claude Restart

1. Run `git status --short --branch`.
2. Confirm `main` is synced with `origin/main`.
3. Read this report and `docs/codex-tasks-backend-2026-06-28.md`.
4. Treat the Codex backend brief as complete.
5. Decide the next product track explicitly:
   - Claude/design track: resume Phase D onboarding implementation from `docs/phase-d-implementation-handoff-2026-06-28.md`.
   - Backend continuation track: add a read/list API for public pursuits before any pursuit dashboard UI.
   - Provider/product-decision track: choose Human Path provider, billing provider, OAuth polish, and resume storage/parsing path.

Do not infer approval to edit UI, CSS, layout, design tokens, homepage, onboarding, dashboard, or public-facing copy from this backend handoff.
