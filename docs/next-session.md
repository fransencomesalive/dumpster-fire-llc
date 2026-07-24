# Next Session — Starting Point

_Updated 2026-07-23 at session close. Read `docs/project-operating-state.md` Session Start
Protocol and `AGENTS.md` first. This file names the immediate next work only._

## Priority 1 - Confirm Exa data rights, then replace the Human Path provider cleanly

The approved pivot and evaluation evidence are in:

`docs/human-path-retrieval-architecture-plan-2026-07-22.md`

Decision:

- Exa's raw discovery batches were useful enough: 31 of 38 reviewed exact-company contacts were
  accepted at $0.063.
- The separate OpenAI verification batch is rejected as a production direction. It cost $0.1779,
  retained only 14 of 31 useful Exa contacts, and still kept one known stale profile.
- Continue with direct discovery, exact-company validation, lightweight ranking, explicit-conflict
  filtering, honest uncertainty, and direct LinkedIn profile links.
- Do not add another paid verification or refinement test.

The immediate blocker is Exa production data-use permission. Exa's standard Terms of Service,
Section 4.2(a), appear to restrict copying, storing, or displaying information obtained through the
service unless Exa expressly permits it in writing or an additional agreement controls. Before
production code changes, confirm an Exa MSA, business agreement, or written permission that allows
Dumpster Fire to store and display people-search results to end users.

Once that permission is confirmed:

1. Replace `lib/public-profile/pursuits/contact-provider.ts`; do not layer a new provider onto the
   existing OpenAI discovery and verification implementation.
2. Remove OpenAI web-verification prompts, parsers, evidence reconciliation, cost tracking,
   verification rejection machinery, and their obsolete tests.
3. Add `other_useful_contact` as an honest production classification.
4. Keep exact-company validation, lane variety, deduplication, lightweight ranking, explicit
   contradictions, and uncertainty preservation.
5. Move the reviewed contacts into a provider-neutral regression fixture and remove obsolete
   OpenAI comparison and hybrid-verification harnesses.
6. Replace the Human Path contact-model environment configuration with `EXA_API_KEY`.

Do not edit Apply Wizard UI, CSS, design-system cards, or public copy during this backend cleanup.
Raw provider response exports remain local and are not part of the Git sync while Exa's storage and
display rights are unresolved.

## Session-close verification

- `npm run test:fixtures`: 29 suites passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed with four existing unused-variable warnings and no errors.
- `git diff --check`: passed.
- `npm run build`: not verified. The build produced no progress after
  `Creating an optimized production build ...` for more than two minutes and was manually stopped
  with exit 130. At the next session start, rerun `npm run build`. If it stalls again, inspect the
  Next.js/Turbopack process and environment before changing application code.

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
