# Onboarding — Broken Areas (DOCUMENTATION ONLY)

Date: 2026-07-04
Author: Claude (recovery session)
Scope: **Documentation only — no functional fixes made.** Randall's instruction:
"document all the broken areas on onboarding … do not fix, just document." Design
feedback in the same session (below) WAS fixed; this file records the functional
breakage to be scheduled and fixed later.

## Method

- Static review of `app/onboarding/page.tsx`, `app/onboarding/OnboardingClient.tsx`,
  `lib/public-auth/supabase-browser.ts`, `lib/public-profile/*`.
- Local render at `http://localhost:3020/onboarding` (dev).
- **Could not drive the authenticated flow locally** — no working sign-in produced a
  session token, so authenticated per-section behavior is documented from code analysis
  and is marked NOT VERIFIED where a live session is required.

## Root cause that makes the whole tool look broken

**Authentication is the single gate for every onboarding section.**

- `saveSection()` starts with `if (!accessToken) return;` — with no token, every save is a
  silent no-op. (`OnboardingClient.tsx` ~line 911.)
- Every Save button is `disabled={!accessToken || busy}`, and section loads run only after
  a token resolves (`loadProfile` in the mount effect, ~line 808).
- Therefore: **if sign-in does not yield a token, ALL sections are non-functional.** This is
  the mechanism behind "all sections are functionally broken." It is one failure (auth),
  not N independent section bugs — though individual sections still need live verification
  once auth works (see checklist).

## Broken area 1 — Sign-in / Google OAuth does not complete

Observed (Randall): two sign-in locations, neither works; "there is no Google OAuth flow."

What the code actually has:
- **Upper-right "Profile Completion" card** (`page.tsx`, `statusValue`) renders the static
  text **"Sign in"** — it is a label, NOT a control. It looks like a button and does
  nothing. Misleading; should not read as an actionable sign-in.
- **Account card** (`OnboardingClient.tsx`) has the real controls: email + password +
  **"Continue with Google"**.
  - Password: `signInWithPasswordSession()` → `supabase.auth.signInWithPassword`. Requires an
    existing Supabase user and email auth enabled.
  - Google: `signInWithGoogle("/onboarding")` → `supabase.auth.signInWithOAuth({ provider:
    "google", redirectTo: origin + "/onboarding" })`. Session is picked up on return via
    `detectSessionInUrl: true` (no custom callback route).

Likely root causes to verify (NONE fixed here):
1. **Redirect URL not allow-listed.** Supabase Auth → URL Configuration must include the
   current origin's `/onboarding` (e.g. `http://localhost:3020/onboarding` for local, and the
   production origin). If the origin isn't allow-listed, the OAuth round-trip never
   establishes a session. **Verify in Supabase dashboard — do not instruct from memory.**
2. **Dev-server env timing.** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   ARE present in `.env.local`, but `NEXT_PUBLIC_*` values are inlined at dev-server start. If
   the running dev server (port 3020) was started before those were set,
   `getSupabaseBrowserClient()` returns `null` and every sign-in throws "Sign in is not
   configured." **Restart `next dev` to rule this out first.**
3. **Google Cloud OAuth client** authorized redirect URI must point at the Supabase auth
   callback (`https://<project>.supabase.co/auth/v1/callback`). Verify in Google Cloud console.
4. **No local password test user** seeded, so password sign-in can't be exercised locally.

## Broken area 2 — Static "Sign in" label reads as a broken button

Both the page hero status card and the client status block show non-interactive text
("Sign in" / "Sign in to continue."). Cosmetic, but it presents as a dead control next to
the real Account-card controls. Consolidate to one obvious sign-in affordance (design +
behavior task).

## Broken area 3 — Every section Save is inert without a session

Expected gating, but with auth broken it manifests as universal breakage: user can type in
Identity & Search, Role Tracks, Resumes, Work Examples, Skills, Voice/Writing Samples,
Outreach Rules, Leadership — and nothing persists, with only a status-line message. No
per-section code bug was found beyond the shared `accessToken` gate; each still needs a live
round-trip test once auth works.

## NOT VERIFIED — live checklist (run once a session token exists)

For each, sign in, edit, Save, reload, confirm persistence + `profileQuality` update:
- [ ] Identity & Search → `/api/public-profile/identity-search`
- [ ] Fit Signals → `/api/public-profile/fit-signals`
- [ ] Role Tracks → `/api/public-profile/role-tracks` (`saveRoleTracks`)
- [ ] Resumes (+ Role Track attachment) → resume endpoints
- [ ] Work Examples → work-examples endpoint
- [ ] Skills → skills endpoint
- [ ] Voice & Personality + Writing Samples → voice endpoints
- [ ] Outreach Rules → outreach-rules endpoint
- [ ] Leadership Profile (optional) → leadership endpoint
- [ ] Access-code redemption (`/api/account/redeem-code`)

## Confirmed WIRED (Randall asked to confirm Fit Signals)

**Fit Signals is wired end-to-end** and is legitimate, not dead scaffolding:
- Registered onboarding section — `lib/public-profile/onboarding.ts` (`key: "fitSignals"`,
  `path: "/api/public-profile/fit-signals"`).
- Parse/apply/persistence — `lib/public-profile/sections.ts`
  (`parseFitSignalsSectionPatch`, `applyFitSignalsSectionPatch`, `fitSignalsSection`).
- API route — `app/api/public-profile/fit-signals/route.ts`.
- Included in the generated profile — `lib/public-profile/profile-markdown.ts` emits
  `goodSignals` / `poorFitSignals`.
- **Consumed by matching** — `lib/public-profile/matching/scorers.ts` folds
  `fitSignals.goodSignals` / `poorFitSignals` into the score as **soft signals** (a score
  contributor, not a hard filter — consistent with the "matching is a spectrum" rule).

Justification: Fit Signals lets the candidate state what makes a role a good/poor fit; those
phrases feed match scoring and the profile.md used for outreach. It is not a gate and does
not exclude roles.

## Design feedback in the same session (FIXED — for the record)

- Homepage: removed hero "Request access" button; all outreach email now
  `fransencomesalive@gmail.com`; loop card 3 → "1:1 custom outreach"; loop cards condensed
  with a teal separator line between headline and sub-copy.
- Onboarding: removed both "Back to public home" links (nav + hero). Brand wordmark still
  links home (standard logo behavior) — flagged for Randall.
- Role Tracks empty-state rewritten with an explanation + example (PM in one Track, Producer
  in another).

## Still OPEN design item (blocked on a source)

**Human Path slideshow** ("update to reflect the final outreach design"): there is no built
"final outreach design" in the app — the dashboard has jobs/save/pursue, but the outreach
message UI is still design-gated and unbuilt. Needs Randall to point at the approved design
(Claude Design card or a spec) before the slideshow content/visuals can be updated.
