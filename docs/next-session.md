# Next Session — Starting Point

_Updated 2026-07-11 (session close). Read `docs/project-operating-state.md` Session Start
Protocol and `AGENTS.md` first. This file names the immediate next work only._

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

## Priority 1 — Account-bar / profile-card → action menu

Redesign the account/profile card (DS card `design-system/components/onboarding-account-bar.html`;
live impl = `accountPanel` in `app/onboarding/OnboardingClient.tsx`) into an **action menu**.
"Back to dashboard" and "Redeem code" currently sit in this card as placeholders. Randall will
spec a **future profile page** the menu links to. This is design-gated: work it in the Claude
Design "Dumpster Fire Design System" project (projectId `3af2f1ea-428c-49b3-8b02-c066ec0c7452`),
review THERE (never localhost), then implement 1:1 and re-sync per the Full Design-Sync Checklist.

## Priority 2 — Dead-CSS cleanup

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
