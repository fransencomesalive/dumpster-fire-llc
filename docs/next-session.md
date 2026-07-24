# Next Session - Starting Point

_Updated 2026-07-24. Read `docs/project-operating-state.md` Session Start
Protocol and `AGENTS.md` first. This file names the immediate next work only._

## Priority 1 - Configure and release the Human Path Exa provider

The approved pivot is implemented locally. Evaluation evidence and the final architecture decision
are in:

`docs/human-path-retrieval-architecture-plan-2026-07-22.md`

Completed:

- Replaced the former OpenAI contact provider with Exa People Search.
- Removed the old discovery, verification, prompt, parser, reconciliation, cost-estimation, and
  rejection machinery instead of retaining parallel code.
- Added three dynamic search lanes derived from the actual job and candidate profile.
- Added exact current-company matching, direct LinkedIn-only results, deduplication, light ranking,
  and `other_useful_contact`.
- Kept missing evidence as unknown and preserved all potentially useful exact-company results.
- Kept provider responses and highlights request-local. Persisted events now contain only aggregate
  diagnostics, while normalized contact suggestions remain available for selection and outreach.
- Replaced the contact-model environment example with `EXA_API_KEY`.
- Applied the separately approved Apply Wizard accuracy copy to the live modal and its local design
  card without changing layout, CSS, or behavior.
- Added and confirmed `EXA_API_KEY` in the Vercel Production environment.
- Applied, recorded, and postflight-verified
  `20260724000100_human_path_other_useful_contact.sql` in production.

Verification:

- `npm run test:fixtures`: 29 suites passed.
- `npm run typecheck`: passed.
- Focused provider and API fixtures: passed.
- `npm run test:migrations:human-path-contact-type`: passed.
- `npm run release:check`: passed, including the Saved Pursuits migration suite, lint with four
  pre-existing warnings and no errors, and the Next.js production build.
- Live request-local Autodesk smoke test: all three lanes completed in 3.4 seconds; 30 rows became
  16 unique exact-company LinkedIn contacts after validation and deduplication.

Next:

1. Commit and push the approved Apply Wizard copy and project-state updates on `main`.
2. Register the touched Apply Wizard card in the Claude Design project; local card parity is
   complete, but remote registration was not available in this session.
3. Confirm the pushed `main` commit completes its Vercel production deployment.
4. Run one authenticated production pursuit through discovery, contact selection, and outreach.
5. Confirm the direct LinkedIn links, contact classifications, and selected-contact persistence.
6. Do not add another paid verification layer or refine against only the three evaluation jobs.

## Current local verification

- `node scripts/test-fixtures.mjs --saved-pursuits`: two focused suites passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed with four existing unused-variable warnings and no errors.
- `git diff --check`: passed.
- `npm run build`: passed.
- Rendered Contacts and zero-contact states passed at 320, 375, 390, 1280, and 1440 pixels with no
  overflow, painted-edge clipping, or copy orphans.

The 2026-07-11 priorities below are historical and superseded as the immediate starting point.

## Shipped this session (live on prod)

- **Apply wizard (Human Path 4-step modal).** Phase 0 backend prereqs (`cc84765`) +
  Phases 1–4 modal (`7d4f8ca`), both pushed and live. Modal ported 1:1 from the approved
  DS card `design-system/components/apply-wizard.html`.
- **Onboarding is now the profile edit surface.** Deleted the bespoke dashboard
  `profile-editor` mode; `/onboarding` is the edit surface (a user who arrives already
  complete edits in place; first-run users still auto-advance to `/dashboard` on the
  transition to complete). Dashboard "Edit Career Profile" / "Edit" now navigate to
  `/onboarding`. "Back to dashboard" added to the account/profile card (shown when
  complete); Redeem stays there. Reset-profile button removed (server
  `/api/public-profile/reset` untouched — see Open below).

## Historical Priority 1 — Account-bar / profile-card → action menu

Redesign the account/profile card (DS card `design-system/components/onboarding-account-bar.html`;
live impl = `accountPanel` in `app/onboarding/OnboardingClient.tsx`) into an **action menu**.
"Back to dashboard" and "Redeem code" currently sit in this card as placeholders. Randall will
spec a **future profile page** the menu links to. This is design-gated: work it in the Claude
Design "Dumpster Fire Design System" project (projectId `3af2f1ea-428c-49b3-8b02-c066ec0c7452`),
review THERE (never localhost), then implement 1:1 and re-sync per the Full Design-Sync Checklist.

## Historical Priority 2 — Dead-CSS cleanup

Remove the now-unreferenced (0 hits in TSX) CSS left by deleting the profile-editor surface:
- `app/onboarding/onboarding.module.css`: `.profileEditorMode`, `.profileEditorGrid`,
  `.authPanelCompact`, `.readinessPanelCompact`, `.readinessStats`, `.authActions`,
  `.gateNotice`, `.issueCard` (and any descendant selectors / media-query variants).
- `app/dashboard/dashboard.module.css`: `.editorOverlay`, `.editorBox`, `.editorHeader`,
  `.editorTitle`, `.editorIntro`, `.editorClose`, `.editorBody`, `.editorNav`, `.editorContent`.
Verify each class is unreferenced before deleting; keep shared primitives
(`.primaryButton`, `.secondaryButton`, `.statusLabel/Value/Detail`, etc.).

## Open (Randall directs)

- **Reset-profile functionality.** The button was removed but the server endpoint and the
  reset flow remain. Randall will say where reset lives so it doesn't cross-contaminate.
- Pre-existing unused `listField` warning in `OnboardingClient.tsx` (predates this session).
