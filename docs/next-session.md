# Next Session - Starting Point

_Updated 2026-07-24. Read `docs/project-operating-state.md` Session Start
Protocol and `AGENTS.md` first. This file names the immediate next work only._

## START HERE: Smoldering / Roaring production initiative

The next product initiative is approved and specified in:

`docs/subscription-billing-production-plan-2026-07-24.md`

Approved retail contract:

- **Smoldering:** $22/month, 20 successful new Apply Wizard pursuits per Stripe billing period.
- **Roaring:** $32/month, 45 successful new Apply Wizard pursuits per Stripe billing period plus
  Markdown pursuit-history export.
- Roaring is the top plan.
- No free retail tier.
- No membership/initiation fee.
- No usage rollover.
- No retail overages at launch.
- Both plans include the complete profile, scan/matching, saved jobs, contact discovery, outreach,
  and pursuit-tracking workflow.
- One Apply Wizard use is charged only when a new pursuit successfully persists at least one useful
  contact. Failed, empty, cached, repeated, and revisited pursuits do not consume another use.
- The usage count is quiet and deliberately discoverable in Profile → Plan. It is not persistent in
  the dashboard, navigation, job cards, or normal Apply Wizard.
- Existing internal tester access codes remain outside the public retail plan matrix.

`AGENTS.md` now contains the Smoldering/Roaring vocabulary as an advisory standing instruction. The
old Good/Gooder/Goodest names still exist in production code and design cards because implementation
has not started. Do not treat those stale live strings as approved product direction.

### Immediate task

Kick off Phase 1 from the production plan: **provider cost telemetry foundation**.

First backend slice:

1. Add `supabase/migrations/20260724000200_provider_usage_events.sql`.
2. Add a small provider-usage type/repository boundary under `lib/costs/`.
3. Store operational units and estimated cost only:
   - provider category;
   - operation/model/version;
   - request and token/cache units;
   - result count and outcome;
   - integer estimated-cost micros;
   - rate-card version;
   - user/pursuit/job correlation IDs when applicable;
   - timestamp.
4. Never store raw prompts, resume text, generated messages, contact results, Exa highlights, or
   provider response bodies in the cost table.
5. Add a focused migration harness and framework-neutral unit tests before instrumenting production
   call sites.
6. Stop after the schema/boundary/test slice and report the exact next instrumentation call sites.

Likely first-slice files:

- `supabase/migrations/20260724000200_provider_usage_events.sql`
- `lib/costs/provider-usage.ts`
- new focused migration and TypeScript fixture tests
- `package.json` only if a focused test command is added

This slice is backend/data only. It does not authorize UI, CSS, design-card, pricing-copy, legal-copy,
Stripe live configuration, or production migration changes.

### Claude Design lane

Claude can begin the non-overlapping design workstream in Claude Design project
`3af2f1ea-428c-49b3-8b02-c066ec0c7452` while the backend slice proceeds.

Claude starts with:

1. Revise `design-system/components/plan-billing-step.html` from three stale tiers to the approved
   Smoldering/Roaring contract.
2. Create or revise an explicit homepage-pricing design card grounded in the current live pricing
   section, because no dedicated approved two-tier homepage-pricing card exists.
3. Then design the quiet Profile → Plan usage detail, the Apply Wizard final-use/zero-use states,
   and the Roaring Markdown-export states listed in plan Section 13.
4. Present every design review as a numbered list.
5. Do not edit production UI or public copy until Randall approves the exact Claude Design result.
6. Complete the full design-sync checklist for every approved card.

Claude-owned likely files:

- `design-system/components/plan-billing-step.html`
- `design-system/components/onboarding-account-bar.html`
- `design-system/components/apply-wizard.html`
- `design-system/components/export.html`
- a new approved homepage-pricing card
- `design-system/_ds_manifest.json`

Codex must not touch those files while Claude owns the design lane. Claude must not touch the
backend cost-telemetry files while Codex owns the first backend slice. All work remains on `main`.

### Not yet authorized or not yet ready

- Do not edit the homepage, plan flow, Profile Plan/Billing popup, Apply Wizard, export UI, or legal
  pages before their scoped design/copy approvals.
- Stripe test/live Products, Prices, Portal, webhooks, tax decision, and Vercel secrets remain
  Randall/manual work at the phases identified in the production plan.
- The final Terms, Privacy, Billing, and Support language requires Randall approval and a
  pre-launch legal-counsel checkpoint.
- Do not apply the provider-usage or subscription migrations to production until their local
  migration tests, read-only production preflight, and explicit production authorization pass.

### First-session verification

At the beginning of the next session:

1. Run the Session Start Protocol.
2. Confirm `main` and inspect `git status --short --branch`.
3. Confirm whether Claude or Codex owns the selected lane and list exact files before editing.
4. Read the full production plan.
5. Re-check the latest migration number before creating a migration.
6. Keep the completed Human Path release below as historical context, not the next task.

## Human Path Exa provider release complete

The approved pivot is live. Evaluation evidence and the final architecture decision
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
- Corrected the fresh Human Path response to return persisted contact suggestions with the database
  IDs required by contact selection (`e8f3821`).
- Deployed and verified the release on all production aliases.

Verification:

- `npm run test:fixtures`: 29 suites passed.
- `npm run typecheck`: passed.
- Focused provider and API fixtures: passed.
- `npm run test:migrations:human-path-contact-type`: passed.
- `npm run release:check`: passed, including the Saved Pursuits migration suite, lint with four
  pre-existing warnings and no errors, and the Next.js production build.
- Live request-local Autodesk smoke test: all three lanes completed in 3.4 seconds; 30 rows became
  16 unique exact-company LinkedIn contacts after validation and deduplication.
- Disposable authenticated production workflow: 19 Autodesk contacts across four classifications,
  successful likely-hiring-manager selection, one em-dash-free outreach message, and complete
  cleanup with zero temporary profile, subscription, or pursuit rows remaining.
- Production bundle readback confirmed the corrected Apply Wizard copy and absence of the old
  reporting-chain and verified-contact claims.

Next:

1. Claude completes the remote Apply Wizard registration task below.
2. Do not add another paid verification layer or refine against only the three evaluation jobs.
3. No additional production test is required for this release unless a new failure is observed.

## Claude pickup — register the Apply Wizard card — COMPLETE (2026-07-24)

Remote registration is done. The updated `components/apply-wizard.html` was pushed to the Claude
Design project `Dumpster Fire Design System` (`3af2f1ea-428c-49b3-8b02-c066ec0c7452`) and
`register_assets` succeeded (`{"registered":1}`) with:
- Name: `Apply Wizard`
- Subtitle: `Potential-contact copy; Possible Hiring Manager; stale verified and reporting-chain claims removed`
- Viewport: `1280` (reused the existing Apply Wizard asset viewport)

Readback of the remote card confirmed the new copy is present — `may be useful for outreach`,
`No potential contacts turned up for this role`, `Found 2 potential contacts`,
`Possible Hiring Manager` — and the stale claims are absent — no `reporting chain is built
automatically`, no `No verified contacts turned up`, no `reporting-chain contacts`, and no
`Verified` claim on the example contact. The dirty working-tree files (`_ds_manifest.json`,
`case-study-lockup.html`, `exports/`) were left untouched.

Original task steps (kept for reference):

1. Open the Claude Design project `Dumpster Fire Design System`, project ID
   `3af2f1ea-428c-49b3-8b02-c066ec0c7452`, and ground the session with `get_file`.
2. Push the exact local card `design-system/components/apply-wizard.html`. Its first line already
   has `<!-- @dsCard group="Components" -->`.
3. Keep the existing remote manifest entry for `components/apply-wizard.html` in group
   `Components`. The committed local manifest already contains that entry, so this task requires
   no local manifest edit.
4. Run `register_assets` for the Apply Wizard card so the Design System pane refreshes. Use:
   - Name: `Apply Wizard`
   - Subtitle: `Potential-contact copy; Possible Hiring Manager; stale verified and reporting-chain claims removed`
   - Viewport: reuse the existing Apply Wizard asset viewport rather than inventing a new one.
5. Inspect the refreshed asset in the Design System pane. Confirm these concepts are present:
   - `We found people at this company who may be useful for outreach.`
   - `No potential contacts turned up for this role.`
   - `Found 2 potential contacts.`
   - `Possible Hiring Manager`
6. Confirm these stale claims are absent:
   - `The reporting chain is built automatically`
   - `No verified contacts turned up`
   - `reporting-chain contacts`
   - A visible `Verified` claim on the example contact
7. Report the exact registered asset and the successful `register_assets` result. Then update
   `docs/next-session.md` and `docs/current-state.md` to mark remote registration complete. If
   asked to sync, commit and push those documentation updates directly on `main`.

Working-tree ownership warning: the current changes to `design-system/_ds_manifest.json`,
`design-system/components/case-study-lockup.html`, and `exports/` belong to unrelated work. Do not
stage, overwrite, or include them in this task. If the Claude Design tool requires a manifest push,
use the already committed Apply Wizard entry and coordinate before touching the dirty local
manifest.

## Final release verification

- Focused public-profile API and pursuit fixtures: passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed with four existing unused-variable warnings and no errors.
- `git diff --check`: passed.
- `npm run build`: passed.
- Rendered Contacts and zero-contact states passed at 320, 375, 390, 1280, and 1440 pixels with no
  overflow, painted-edge clipping, or copy orphans.
- Exact production SHA: `e8f38219b5e5284431c6cf7c582aacc0ea938010`.
- Canonical production root and dashboard: HTTP 200.

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
