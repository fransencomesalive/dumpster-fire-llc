# Completion Roadmap — Full Project Audit (2026-07-04)

Audit scope requested by Randall: (1) broken OAuth/sign-in + broken onboarding buttons,
(2) design to-dos + custom-domain/Vercel mismatch, (3) PhredBot QA relay integration.
This doc is the single ordered path to a complete, launchable app. It supersedes the
"Near-Term (scheduled)" ordering in `docs/project-todo.md` (which remains the detailed
task ledger).

---

## Root-cause finding: the three reported breakages are one chain

1. `www.thejobmarketisadumpsterfire.com` is attached to the **Lab26** Vercel project
   (verified 2026-07-04: `x-matched-path: /dumpster-fire`, ~9-day-old edge cache; all real
   routes 404). The **apex** domain now serves the current app (verified: `/onboarding`
   200, `/api/qa-report` responds; content identical to `dumpster-fire-llc.vercel.app`).
2. Supabase Auth `uri_allow_list` contained ONLY the apex domain + localhost. Anyone using
   the app at `dumpster-fire-llc.vercel.app` (the only fully-working host) who clicked
   "Continue with Google" got bounced to the Site URL fallback — which was serving Lab26.
   OAuth therefore *appeared* broken; the provider itself is configured correctly
   (Google enabled, authorize hop 302s to accounts.google.com with a real client_id).
3. With no session establishable, `/onboarding` still renders the ENTIRE editable form,
   but every Save handler starts with `if (!accessToken) return;` — buttons silently
   no-op. That is the "broken onboarding buttons" report. The buttons are fine; the
   session was never there.

Additional auth gaps found (not previously documented anywhere):

- **There is no sign-up UI at all.** The auth panel offers email/password *sign-in* and
  Google only. Email/password works solely for accounts created by hand in Supabase.
  Google OAuth is the only self-serve account-creation path.
- **No custom SMTP** (`smtp_host` unset). Supabase's built-in mailer is rate-limited to a
  handful of emails/hour and unsuitable for real users. If email/password signup is ever
  wanted, custom SMTP is a prerequisite (signups require confirmation;
  `mailer_autoconfirm=false`).
- `docs/onboarding-broken-areas-2026-07-04.md` referenced in session memory was never
  written; this doc replaces it.

## Fixed during this audit (2026-07-04)

- **Supabase `uri_allow_list` updated via Management API** (same token/path used for
  migrations) — now includes apex, www, and `dumpster-fire-llc.vercel.app` (root +
  `/onboarding` each), plus the two localhost entries. Verified by reading the config
  back. Google sign-in from the vercel.app host will now return to the vercel.app host.
- Site URL left as `https://thejobmarketisadumpsterfire.com` (correct now that apex
  serves this app).

NOT VERIFIED yet: a real end-to-end Google sign-in from a browser on
`dumpster-fire-llc.vercel.app` and on the apex domain. Verification = click "Continue
with Google" on `/onboarding`, complete auth, land back on `/onboarding` signed in, and
confirm section Save buttons persist (message "… saved.").

---

## Phase 0 — Unbreak the launch surface (auth + domain) — DO FIRST

1. [x] Supabase redirect allowlist fix (done, above).
2. [x] **Domain cleanup — DONE 2026-07-04 (Randall + Claude).** Randall removed the www
   domain from Lab26 and added it to `dumpster-fire-llc`. Final layout is **www-primary**
   (Vercel's recommended shape, inverse of the original plan): www serves the app, apex
   308-redirects to www (path-preserving). Verified live: www `/` and `/onboarding` 200
   with content identical to `dumpster-fire-llc.vercel.app`, zero Lab26 headers, QA
   proxy fail-soft responding on www. Supabase `site_url` updated to
   `https://www.thejobmarketisadumpsterfire.com` via Management API (both hosts remain
   in the allowlist). Zero Lab26 anything remains.
   Note: no Vercel CLI/token exists in the working environment; add a `VERCEL_TOKEN` to
   `.env.local` if agents should handle Vercel directly in future.
3. [ ] End-to-end Google sign-in verification on apex + vercel.app — Randall tests after
   the domain cleanup (steps in NOT VERIFIED above).
4. [ ] **Account creation: DECIDED 2026-07-04 — build email sign-up with custom SMTP**
   (the missing sign-up UI was never a deliberate choice). Plan:
   1. Provider recommendation: **Resend** (simplest setup, generous free tier ~3k
      emails/mo, first-class Supabase SMTP integration; Postmark/SES are fine
      alternatives if deliverability or cost profiles change).
   2. Randall: create the Resend account, add + verify the domain
      `thejobmarketisadumpsterfire.com` (DNS records go wherever the domain's DNS is
      hosted), create an SMTP API key, provide it env-only.
   3. Claude: apply SMTP config to Supabase via the Management API
      (`smtp_host smtp.resend.com`, port 465, sender e.g.
      `no-reply@thejobmarketisadumpsterfire.com`) — no dashboard needed.
   4. Claude: customize the confirmation-email template to brand voice (no
      corporate-speak), then build the sign-up UI — design-gated: needs Randall's
      design direction for the auth panel (sign-in vs create-account states).
   5. Verify: real signup → confirmation email → confirmed session → Save buttons work.
5. [ ] Signed-out `/onboarding` UX: stop rendering silently-dead Save buttons. Gate the
   form behind the auth panel (or disable inputs + show "Sign in to edit"). NOTE: this
   is a UI change → design-gated per AGENTS.md; needs Randall's design direction, but the
   *behavior* bug (silent no-op) should be named in whatever design gets approved.

## Phase 1 — PhredBot / QA relay go-live

State today: widget + `/api/qa-report` proxy are deployed and fail soft in prod
(verified live: apex POST → 503 `qa_agent_unconfigured`, app unaffected). Relay exists at
`~/Sites/dumpster-fire-relay`, is not running, has NO git repo, no Telegram wiring.
Detailed steps live in `docs/project-todo.md` ("QA feedback relay — end-to-end go-live");
sequence:

1. [ ] Deploy the relay — **RECOMMENDED HOST: Railway (decided 2026-07-04).** Why: the
   relay needs an always-on process (Telegram webhook + REST API), a public HTTPS URL,
   and Postgres. Railway gives GitHub-connected auto-deploy from the new
   `dumpster-fire-relay` repo, detects the Dockerfile, one-click Postgres that injects
   `DATABASE_URL`, dashboard env vars, and an automatic HTTPS domain — near-zero ops.
   Fly is CLI-heavy (flyctl + fly.toml), its machines default to auto-stop (bad for
   webhooks), and it no longer offers managed Postgres. Steps:
   1. Randall: railway.app → New Project → Deploy from GitHub repo →
      `fransencomesalive/dumpster-fire-relay`; add a Postgres service in the same
      project.
   2. Env vars on the relay service: `HOST=0.0.0.0`, `PUBLIC_BASE_URL=<the Railway
      domain>`, `DATABASE_URL` (referenced from the Postgres service), plus the values
      from the local relay `.env`.
   3. Run `npm run db:prepare` once against the Railway `DATABASE_URL` (JSON file store
      loses tickets on redeploy — Postgres is required for durability).
2. [ ] Randall: create `@TheJobMarketIsADumpsterPhredBot` via BotFather; `npm run
   telegram:handoff` walks through it; set the bot token in the relay `.env`.
3. [ ] Randall: message the bot once, then `npm run telegram:admins -- --write true` and
   `npm run telegram:setup` (needs `PUBLIC_BASE_URL` live).
4. [ ] Set `QA_AGENT_URL` in Vercel (prod + preview), redeploy, submit real feedback from
   production, confirm ticket via relay `GET /api/tickets` + Telegram notification.
5. [x] Give the relay a git home — DONE 2026-07-04: private repo
   `fransencomesalive/dumpster-fire-relay`, initial commit `b2ef159` pushed to `main`;
   verified `.env` and `data/*.json` are untracked.
6. [ ] Optional: `GITHUB_TOKEN` in relay `.env` so approved tickets open issues on
   `fransencomesalive/dumpster-fire-llc`.

## Phase 2 — Security hygiene (before invites go out)

1. [ ] Rotate all previously exposed credentials (see `docs/project-todo.md` "Rotate
   exposed credentials"): Supabase service_role + anon keys, DB password,
   `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_ACCESS_TOKEN`. Update Vercel envs +
   `.env.local` + redeploy.
   **Randall (2026-07-04): this gets its own dedicated session** with a full, specific,
   step-by-step plan written first (every key: where it's minted, every place it's
   consumed, verification after each swap) so nothing is missed or broken mid-rotation.

## Phase 3 — Design-gated UI (the bulk of remaining product work)

Everything here needs an approved design source first (AGENTS.md Design Authority,
`docs/design-state.md`). Suggested order by user-value:

1. [ ] Contact-selection UI (Human Path backend is live; this was the 06-30 "NEXT SESSION
   START HERE" and remains the highest-value unbuilt surface).
2. [ ] Pursuit dashboard/list/detail UI (backend + read APIs done).
3. [ ] Outreach generation + review workflow UI (backend done).
4. [ ] Subscription upgrade states (limit reached, export locked).
5. [ ] Onboarding quality/remediation UI + the Phase-0 signed-out gating design.
   **Randall's design-pass notes captured 2026-07-04** (auth panel placement/styling,
   persistent header nav on onboarding, access-code input, email shown when signed in,
   review-sections only on save errors, homepage sign-in pill → teal DS button):
   `docs/design-pass-notes-onboarding-auth-2026-07-04.md` — that doc is the requirements
   input for this design pass.
6. [ ] Homepage design fixes (in progress per launch-state memory) + Human Path slideshow
   (blocked on design source).
7. [ ] Final landing + pricing pages (Good/Gooder/Goodest — pricing structure language,
   never beta/rollout).

## Phase 4 — Decision-blocked (Randall decisions required)

1. [ ] Billing provider + checkout/portal/webhooks (Stripe is the obvious candidate;
   backend enforcement matrix already built).
2. [ ] Resume file storage provider + retention; resume parsing provider.
3. [ ] Custom SMTP provider if email/password signup is wanted (Phase 0.4 Option B).
4. [ ] Apple OAuth (optional; Google is live).

## Phase 5 — Small unblocked backend (fill-in work)

1. [ ] Phase 9 verify item: audit that no public surface leaks scaffold/agent/provider
   copy.
2. [ ] Profile regeneration action wiring after structured edits.
3. [ ] Outreach version pruning.
4. [ ] Pursued Jobs Export backend.

---

## Definition of done for "app complete"

Custom domain (www + apex) serves the app; a stranger can sign in with Google, redeem an
access code, complete onboarding, run a scan, pick a discovered contact, generate + review
outreach, and file feedback through PhredBot that reaches Randall on Telegram — with
billing or the access-code tier structure enforcing limits, and no exposed credentials.
