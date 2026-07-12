# Direction — Finalize Onboarding / Billing / Sign-up (for inviting testers)

**Created:** 2026-07-12 (Randall) · **Status:** decisions locked, DESIGN NOT STARTED
**Goal:** finalize the sign-up → plan/billing → onboarding path so we can start inviting users to test.

## Grounded current state (verified 2026-07-12)

- **Sign-up/in:** Google OAuth (`signInWithGoogle`, auto-creates the account) + email/password
  **sign-in for existing accounts only** (`signInWithPasswordSession`). **No self-serve email sign-up,
  no magic link.** New self-serve users can currently only enter via Google.
- **Plans** (`lib/public-profile/subscription/rules.ts`): `tester` (free, generous — 25 pursuits /
  25 Human Path / 75 outreach / export on) plus `basic` / `pro` / `premium`, feature-gated.
- **Access code** (`lib/account/access-codes.ts`, `POST /api/account/redeem-code`,
  `GET /api/account/plan`): working. Redeeming a code grants a plan via `access_codes.plan_name`.
  The `DUMPSTERFRIENDS` / `GOODEST-*` codes grant `tester` = full access. In the UI the redeem field
  now lives **inside the Billing popup** on the onboarding profile card (2026-07-12 QA batch).
- **Billing/checkout:** **NONE.** No Stripe, no way to pay for a plan. `app/legal/billing` is a terms
  page only. Today's path is just: Google sign-in → onboarding → dashboard (no plan/payment step).

## Decisions (Randall, 2026-07-12 — do not re-litigate)

1. **Access code stays in the Billing popup** (not surfaced as a separate prominent step). Testers
   open Billing → redeem. (I flagged discoverability; Randall chose to keep it in Billing.)
2. **Build self-serve email sign-up** (in addition to Google). Requires transactional email — plan on
   **Resend SMTP** (per the 2026-07-04 decision). Randall to provide the Resend key when needed.
3. **Design the WHOLE stepped path first** in Claude Design (design-first, per AGENTS.md Design
   Authority), get approval THERE, then implement. Do not build any of it before the design is approved.
4. **All users start with no billing.** Billing is designed *into* the stepped path for everyone, but
   the access code removes all billing requirements for testers — testers never touch checkout.

## Target stepped path (to design)

`Sign up (Google or email) → Plan / billing step (access-code bypass = full access, no checkout) →
Onboarding (build profile) → Dashboard`

- The plan/billing step is present for all users but **satisfiable by an access code**; a code-holder
  skips any payment entirely.
- Paid checkout (Stripe or chosen provider) is designed now but can be **built after** testing starts —
  the tester path must not depend on it.

## Open decisions before/within the design

- **Billing provider** (Stripe assumed; confirm) and what the paid checkout step actually collects.
- **Email sign-up** specifics: confirmation email vs magic link; Resend as SMTP; the sign-up form IA.
- Whether the plan/billing step is skippable/among sign-up vs a distinct screen.

## Grounding for the design (existing DS cards / code to map to, not rebuild)

- `design-system/components/login.html`, `onboarding-signed-out.html` — existing auth surfaces.
- `design-system/components/onboarding-account-bar.html` — profile card + Billing popup (access code).
- Live: `app/onboarding/OnboardingClient.tsx` login card (`loginCard`), `app/components/SiteHeader.tsx`,
  `lib/public-auth/supabase-browser.ts`, `lib/account/access-codes.ts`, `lib/public-profile/subscription/*`.

## Next action

Design the stepped path in the "Dumpster Fire Design System" Claude Design project
(`3af2f1ea-428c-49b3-8b02-c066ec0c7452`), starting from a scope/IA proposal Randall approves, then
implement 1:1. Not started.
