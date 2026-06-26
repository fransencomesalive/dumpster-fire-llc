# Design Implementation Handoff

Date: 2026-06-25
Audience: whoever ports the design system into the app (Codex). Read with `docs/design-system-token-mapping-audit-2026-06-25.md` (the token/color/font map + component coverage matrix).

**Do not start the port until Randall greenlights design implementation.** This doc is so the plan is understood and ready when he does. Most of the design is complete; the app foundation is not yet touched.

## Where things stand

- **Design system: COMPLETE** in `design-system/` (repo root, never ships), synced to Claude Design project `3af2f1ea`. Foundations (color/type/texture), components (match-card, panel, login, badges, forms, modal, apply-wizard, scan-progress, scan-history, **feedback, compiler, connector, company, copy-generation, detail, export**), chrome (**header, footer**), and the full `scan-page` pattern. Class names mirror `app/scans/DashboardClient.tsx` so `/scans` CSS ports back ~1:1.
- **App design foundation: NOT started.** `app/globals.css` is still the dark theme (`color-scheme: dark`, `#10170f`, only `--font-gotham` loaded). No DS tokens (`--c-paper`, `--font-ui`, etc.) exist in the app. Bemio / Bebas Neue / Plantagenet are not loaded.
- **Grain background already exists** at `app/LandingBackground.tsx` (home only). This production animated grain texture is protected and must be preserved exactly.
- The `Ship public app foundation` commit was the **product** foundation (profile/API/onboarding), not the design one. They are separate workstreams that converge here.

## Locked design decisions (apply on port)

1. **The design system OVERWRITES all existing app styles.** Sole exception: the production home grain background (`LandingBackground.tsx`) is preserved exactly. Do not generalize it or touch homepage structure without explicit Randall confirmation.
2. **Full paper theme, no dark shell.** Flip `color-scheme` to light. Dark-green grounds invert to paper; warm-off-white text inverts to ink.
3. **Body font is split:** `--font-body` = Plantagenet (serif, marketing/long-form); `--font-ui` = **Gotham** (sans, app/dense UI: dashboard, tables, forms). Bemio = display/headlines, Bebas = subheads/labels. Load Bemio/Bebas/Plantagenet via `next/font/local` (Gotham is already loaded; `tokens.css` sets `--font-ui: var(--font-gotham), ...`).
4. **Grain ground direction is blocked pending explicit confirmation.** The current production homepage grain stays exactly as-is. Dashboard/onboarding/scans may be normalized to the Claude design primitives, but do not generalize `LandingBackground` or change the homepage ground/structure without Randall explicitly approving that move.
5. **Teal-forward accents:** teal = dominant UI accent (links/active/positive); tomato = primary CTA + destructive only; mustard = new/weird flags only; bluebird sparingly. Red + yellow never co-star.

## Product rules baked into the cards (some differ from current code; reconcile during the port)

- **Profile = hard pass/fail; must be complete to scan.** `compiler.html` (Profile Readiness): Complete = teal, scan enabled; Incomplete = tomato, scan locked. No confidence levels, no amber. **CODE GAP:** `profile-compiler.ts` grades `high|medium|low` and only *warns* on `missingInputs` (does not block scanning). Enforce the hard gate.
- **"Add a Career Page"** (`connector.html`): user pastes a careers URL; one rule set for all scrapes (driven by profile intake), no endpoints/rules shown. If a page can't be scanned, show the error + a request-support form that **emails fransencomesalive@gmail.com** the page URL + the user's email. **TO BUILD:** that request-email backend.
- **Add company = minimal: company name + careers URL** (`company.html`). `atsProvider`/`atsBoardToken` stay internal, never asked.
- **Export = pursued jobs/pursuit history only, NOT profile export and NOT match results** (`export.html`). Include the job pursued, selected Applying As Role Track/narrative, message sent, recipient/contact, status, and timestamps. Premium users see no "premium" marker; non-premium see a disabled button with tooltip "Upgrade to Premium for this feature." **CODE GAP:** pursued-jobs export backend is not enabled yet.
- **Application Details** (`detail.html`) is the real `setDetailJob` modal (role snapshot / track actions / saved outreach drafts), not a generic "match detail."
- **Tuning is admin-only** (`app/scans/admin/tuning/`), a review/report tool with no user- or admin-settable guardrails. It was removed from the product design system. Do not build user-facing tuning UI.

## Implementation sequence

- **A. Foundation (additive, non-destructive).** Port `design-system/tokens/tokens.css` → `app/globals.css :root`; load Bemio/Bebas/Plantagenet via `next/font/local`; flip `color-scheme` to light; drop the dark `#10170f` defaults. Keep Gotham (it is `--font-ui`). No visual change to surfaces yet.
- **B. Grain/background handling.** Preserve the production homepage grain exactly. Do not generalize `LandingBackground.tsx`, replace it, remove canvas layers, or touch homepage structure without explicit Randall confirmation. Continue design normalization on non-home public app surfaces using Claude primitives.
- **C. Port `/scans` surfaces against the DS cards** (class-name parity ≈ 1:1): login → hero → match-card → sidebar/panels → badges/forms → modals/wizard → scan-progress → the long-tail (feedback / compiler / connector / company / copy / detail / export). Replace dark literals and remove `.meshBg` per surface. Screenshot each against its card.
- **D. Apply the DS to the NEW public surfaces** (no 1:1 cards yet): onboarding (`OnboardingClient.tsx`, large; build from the forms/panel/badges cards + tokens) and `/dashboard` placeholder first. Do not alter homepage structure or layout unless Randall explicitly confirms that scope. Token + component driven, not 1:1 ports.
- **E. Reconcile the three code gaps** (compiler hard gate, career-page request email, export backend) as product work alongside the visual port.

## Coordination / guardrails

- **Respect the homepage content-only lock** (`docs/current-state.md`, `docs/next-session.md`): do not replace `LandingBackground`, remove the canvas layers, generalize the background, or restructure the home while doing design work unless Randall explicitly confirms that scope. Approved homepage sections preserve copy only; eyebrow/headline layouts are not approved design direction by default.
- **Canonical repo = `dumpster-fire-llc`. Lab26 is legacy/reference only, never a token source.**
- The component coverage was measured against `/scans` (120 of 269 classes already match the DS cards). The new public surfaces (onboarding/dashboard) are large and have no 1:1 cards; they get the foundation + components, not a wholesale port.
