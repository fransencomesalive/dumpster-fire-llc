# Systems Gut Check — 2026-07-02

> **NEXT SESSION STARTING POINT (set 2026-07-02, post-launch):** the homepage has
> "some bad design choices" per Randall that must be resolved — start by getting his
> specific critiques (the subscription matrix was approved only provisionally), review
> live on localhost or Claude Design per AGENTS.md Review Presentation. Launch state:
> prod live with Google OAuth + access codes (shared: DUMPSTERFRIENDS; five GOODEST-*
> single-use); Supabase auth config verified/fixed via Management API. Still open:
> CRON_SECRET in Vercel, key rotation, WS5 feedback backend, T&C doc, WS4 RLS
> passthrough, pursuit wizard UI.

> **LAUNCH BUILD SHIPPED 2026-07-02.** Everything from the resume plan is implemented
> and validated (33/33 test suites, tsc clean, lint 0 errors / 7 pre-existing
> warnings, build compiles):
>
> 1. **Access codes**: `access_codes` table (migration `20260702000100`),
>    `POST /api/account/redeem-code`, redeem field in the onboarding account panel.
>    Users without a subscription now default to `basic` (Good, profile-only);
>    codes grant e.g. free `tester` (pursuits 25 / discovery 25 / outreach 75 / export).
> 2. **Sessions + Google OAuth**: supabase-js with refresh-token rotation mirrored
>    into the legacy token key; Google button gated by
>    `NEXT_PUBLIC_SUPABASE_AUTH_GOOGLE_ENABLED`.
> 3. **Tier realignment**: rules.ts matches the public matrix (basic 0/0/0,
>    pro discovery 25, premium 50/50/150 + export); pursuit creation is now
>    quota-enforced; export requires premium.
> 4. **One-gen-per-contact lock**: pursuit outreach never regenerates a contact's
>    message (409 `already_generated`); metering counts only newly generated drafts.
> 5. **WS1 ID authority**: section saves mint-or-match every item id server-side
>    (`resolveOwnedItemId` in sections.ts) and filter cross-references to owned rows.
> 6. **LLM seams**: timeouts (Anthropic 30s / OpenAI 90s, 1 retry) + structured
>    no-key/error logging at all four callModel seams.
>
> **Randall's side to finish launch:** Google OAuth client in Supabase + set
> `NEXT_PUBLIC_SUPABASE_AUTH_GOOGLE_ENABLED=1` in Vercel env; `CRON_SECRET`; key
> rotation. Access-code rows: mint via SQL insert into `access_codes`.

---

## 1. Audit summary

### Architecture vs product plan

Backend spine is essentially complete: profile (7-section IA + quality gate +
profile.md), voice fingerprint + outreach generator (Claude `claude-opus-4-8`),
deterministic matching engine wired into scan ranking + pursuit creation, pursuits
(state machine + events + persistence), subscription enforcement (human_path +
outreach metered), source-scan ingestion (16 sources live in prod, daily cron),
posting parser + LLM gap-fill, Human Path contact discovery (OpenAI gpt-4.1 +
web_search, verified live).

Not built: pursuit/contact-selection UI (design-gated), billing provider integration,
resume upload storage, OAuth beyond email, launch landing/pricing.

### Findings (with decisions, Randall 2026-07-02)

| # | Finding | Decision |
|---|---------|----------|
| F1 | Cross-tenant write via client-supplied IDs in multi-item section saves (`sections.ts` apply fns + `repository.ts` `on_conflict=id` upserts under service role) | **Fix approved** (WS1) |
| F2 | Client IDs interpolated unvalidated into PostgREST query strings (`id=not.in.(...)`) | **Fix approved** (WS1) |
| F3 | FE discards refresh token; access token in localStorage; sessions die silently ~1h | **Fix approved**; OAuth is a priority (WS2) |
| F4 | LLM calls swallow all errors — outage indistinguishable from no-key | **Minimal logging approved**, prescriptive spec in WS3 |
| F5 | No timeouts/retries on model calls (hung call hangs request) | **Fix approved** (WS3) |
| F6 | Generation abuse surface (unmetered regen; regenerable outreach) | **Decided 2026-07-02:** outreach generation is user-initiated only, exactly ONE generation per contact per job, no regeneration (if regen is needed, the voice-fingerprint goal is failing). Profile.md rebuilds stay save-triggered/system-internal (WS3) |
| F7 | RLS policies exist but are dormant (server uses service-role key everywhere) | **Implement RLS plan** (WS4) |
| F8 | No user feedback loop in public product (`saved_message_feedback` unused; no match feedback) | **Must ship in initial launch for all users**; audit legacy vs optimized + port (WS5) |
| F9 | Avoided-companies hard exclusion in `jobMatchesProfile` | **Approved as-is** — keep |
| F10 | Remote-only users never see onsite jobs (hard drop pre-scan) | **Decided 2026-07-02: soften (option b)** — onsite jobs surface with a low score + explicit "onsite vs your remote-only preference" risk note, consistent with matching-is-a-spectrum |
| F11 | Billing provider not built | **Deferred until after first real production push** |
| F12 | Exposed keys (Supabase service_role/anon, DB password, ANTHROPIC_API_KEY, OPENAI_API_KEY) | Rotate pre-invite (existing standing item; WS1 gate) |

---

## 2. Workstreams

### WS1 — Security hardening (pre-invite blockers)

1. **ID ownership validation.** In every multi-item section parse/apply path
   (role tracks, resumes, work examples, skills, writing samples, role-track outreach
   rules — `lib/public-profile/sections.ts`), reject any incoming `id` that is not
   present in the user's loaded aggregate. New items get **server-minted**
   `crypto.randomUUID()` (the pattern pursuit creation already uses,
   `lib/public-profile/api.ts` `handlePublicProfilePursuitCreateRequest`).
   Client-proposed IDs for new rows are ignored, not honored.
2. **UUID format enforcement.** At parse time, validate every incoming id against a
   strict UUID regex before it can reach a PostgREST query string. This closes the
   filter-injection surface (F2) and shrinks F1's blast radius.
3. **Tests.** Section tests asserting: foreign id → validation error; new item →
   server-minted id; crafted id with `)`/`,` → rejected.
4. **Key rotation (Randall).** Rotate Supabase service_role + anon, DB password,
   `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`. Set `CRON_SECRET` in Vercel + redeploy (also
   unblocks the daily source-scan cron).

### WS2 — Sessions + OAuth (priority; billing deferred)

1. **Adopt `@supabase/supabase-js` for browser session management** — replaces the raw
   password-grant fetch in `OnboardingClient.tsx` and the bare-access-token
   localStorage helper (`lib/public-profile/browser-session.ts`). Gets refresh-token
   rotation + auto-refresh for free; API calls keep sending
   `Authorization: Bearer <access_token>` so the server contract is unchanged.
2. **Google OAuth** (then Apple) via Supabase Auth — needs Randall's provider
   credentials (blocked decision now unblocked as a priority).
3. Server side unchanged: `getPublicAuthSession` already validates any bearer against
   `/auth/v1/user`.
4. **Billing provider: explicitly deferred** until after the first real production
   push. Subscription enforcement keeps running on the existing
   `user_subscriptions`/`usage_ledger` machinery with manually provisioned rows.

### WS3 — LLM reliability (prescriptive)

Applies to all four call sites: `voice-fingerprint.ts`, `outreach-generator.ts`,
`llm-extract-posting.ts` (Anthropic), `pursuits/contact-provider.ts` (OpenAI).

1. **Distinguish the three failure states** in each `defaultCallModel`:
   - No key configured → `console.info("[llm:<feature>] skipped: no API key")` once
     per call; return `undefined` (behavior unchanged).
   - Transport/API error → `console.error("[llm:<feature>] call failed", { name,
     status, message })`. **Never log prompts, responses, or key material** (they
     contain user profile data).
   - Parse failure (model returned prose/bad JSON) → `console.warn("[llm:<feature>]
     unparseable response", { length })` — log length/shape only, not content.
   Vercel function logs pick these up; no new infra. Return shape stays `undefined`
   so graceful degradation is unchanged.
2. **Timeouts + bounded retry** via SDK options, not hand-rolled:
   - Anthropic: `new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1 })`.
   - OpenAI (contact discovery uses web_search, 6–11s observed):
     `new OpenAI({ apiKey, timeout: 90_000, maxRetries: 1 })`.
3. **Generation policy (F6, decided 2026-07-02).**
   - **Outreach messages: user-initiated only, one generation per contact per job,
     no regeneration.** Nothing auto-generates on wizard open (saves the first-pass
     token spend). Enforce with a uniqueness key on `outreach_messages`
     (pursuit_id + contact) checked before calling the model; the UI offers **edit
     the draft**, never a regenerate button. Product rationale (Randall): if a regen
     is necessary, the voice-fingerprint core goal is failing — surface that as a
     signal, don't paper over it.
   - Technical failures (timeout, `model_unavailable`) do NOT consume the
     one-generation allowance — only a successful generation locks the pair and
     writes the `usage_ledger` entry.
   - The standalone ad-hoc `POST /api/public-profile/outreach` route (job+contact
     without a pursuit) conflicts with per-pair enforcement — fold it into the
     pursuit-bound outreach path (or apply the same job+contact uniqueness) as part
     of this work.
   - **Voice-fingerprint pass: capped at 3 updates per month** (Randall, 2026-07-02).
     Implementation: `voice_fingerprint` becomes a metered `usage_ledger` type checked
     on the save-triggered pass; the pass only runs when fingerprint inputs (Voice &
     Personality answers, writing samples, tone tags) actually changed (input-hash
     check + debounce). **At the cap, profile saves still succeed and profile.md still
     rebuilds — it reuses the most recent fingerprint block** rather than calling the
     model; never block a save.
   - **Disclosure requirements for the cap** (Randall, 2026-07-02): (a) it must be
     stated in the **Terms & Conditions** — note: no T&C document exists yet; drafting
     one is now a pre-launch item (cover: one generation per contact per job, 3
     fingerprint updates/month, pursuit caps per tier); (b) the **profile setup flow**
     must say it in plain product language (design-gated copy change, brand voice,
     e.g. "your voice fingerprint updates up to three times a month, so make your
     samples count") — exact copy needs Randall's approval before it ships.

### WS4 — Make RLS live (JWT passthrough)

Current posture: every public table has RLS enabled; owner policies exist across the
foundation schema; `job_sources`/`subscription_plans`/legacy `job_search_*` are
service-role-only. But the app connects only with the service-role key, so policies
are dormant. Plan:

1. **Add a user-scoped repository request factory**: same shape as
   `createPublicProfileRepositoryRequest`, but sends `apikey: <anon key>` +
   `Authorization: Bearer <user access token>` so PostgREST evaluates RLS as the user.
2. **Migrate user-scoped handlers** to it in phases (profile sections first, then
   jobs/saved-jobs/pursuits reads+writes). The service-role client remains ONLY for
   system paths: source scan, refine-postings cron, `usage_ledger` inserts,
   subscription context reads/writes, profile bootstrap row creation.
3. **Policy audit before cutover** (live prod check): confirm owner policies exist and
   are correct on `outreach_messages`, `contact_suggestions`, `saved_message_feedback`,
   and every pursuit child table (`pursuit_events` already verified). Confirm the
   junction tables (`resume_role_tracks`, `skill_work_examples`) are covered via their
   parent-join policies for all four operations.
4. **RLS test harness**: new script using the existing throwaway local-Postgres pattern
   (`docs` + memory: brew postgresql@16, stubbed auth schema) — seed two users, run
   PostgREST-style queries as each, assert every cross-user read/write is denied.
   Zero tests exercise the policies today.
5. Sequencing note: WS1 ships first regardless — RLS-as-user would ALSO stop F1, but
   defense in depth wants both layers.

### WS5 — Feedback in initial launch (required for all users)

Legacy audit (what `/scans` has):

| Legacy piece | What it does | Port verdict |
|---|---|---|
| `job_search_match_feedback` (1–5 stars + reason + match_version) | Per-job match rating | **Port, optimized**: structured verdict instead of stars |
| `review-feedback.ts` fit verdicts (`match/good/stretch/not_a_match`) + rationale chips (typed, positive/concern/source tones, routed to signal buckets) | Structured, machine-readable "why" | **Port — this is the keeper.** Best-designed part of the legacy loop |
| `near-miss-review.ts` + `review-learning.ts` + `match-learning.ts` | Single-user near-miss queue + hand-tuning analytics | **Do not port** — single-user admin machinery, wrong layer for multi-tenant |
| Tuning preview/report (admin) | Rule tuning against Randall's profile | **Do not port** |

Optimized public design (launch scope):

1. **Match feedback**: new `match_feedback` table — `user_id`, `profile_id`, `job_id`,
   verdict (`match/good/stretch/not_a_match`), rationale chips (text[]), optional
   note, plus **`match_score` + `match_label` captured at feedback time** (this is
   what makes effectiveness measurable: system rating vs user verdict). Owner RLS
   policy from day one. Unique on (user_id, job_id), upsert on re-rate.
   API: `POST /api/jobs/feedback` (auth, validates job is in the user's scan results —
   same guard as save). Surface on the match card (design-gated UI slice).
2. **Outreach feedback**: wire the already-designed Approve/Reject + rejection-reason
   control (apply-wizard DS card) to the existing `saved_message_feedback` table.
   Persist alongside the `outreach_messages` row the pursuit flow already writes.
3. **Effectiveness readout (internal first)**: a script/endpoint summarizing agreement
   between `match_label` and user verdicts, and outreach approve/reject rates — the
   measurement loop, no automated weight-tuning yet.
4. **Deferred (post-launch)**: automated per-user learning (feeding verdicts back into
   category weights / Fit Signals suggestions). Capture now, learn later.

Copy boundary reminder: user-facing labels must follow brand voice — no "proof"
vocabulary, no "improve matching" framing (the system rates matches; feedback tells us
where it's wrong).

### WS6 — Pursuit / contact-selection UI (needed; design-gated)

Backend chain is complete (discovery → contact_suggestions → selection API → outreach
generation → persistence). UI is the missing half. **Design source CONFIRMED by
Randall (2026-07-02): the original apply-wizard design**
(`design-system/components/apply-wizard.html`, 4-step Pursue flow: Review → Contacts
→ Outreach → Track). Implementation maps components from that card; no new primitives.
Honor the F6 generation policy in the wizard: the Outreach step shows a **Generate**
action (user-initiated), then an editable draft with Approve/Reject — no regenerate.
WS5's outreach feedback control lives in the same step. The **match-card verdict
control is approved in principle for the match card** but the specific design addition
requires a separate approval pass (Randall, 2026-07-02) — mock it against the existing
match-card DS component and present before implementing.

---

## 2b. Unit economics & tier plan (decision 3 input)

Model pricing at audit time: Claude `claude-opus-4-8` $5/M input, $25/M output;
contact discovery (OpenAI gpt-4.1 + web_search) measured live at ~$0.08–0.12/run.

Per-action worst-case LLM cost:

| Action | Tokens (typical) | Cost |
|---|---|---|
| Outreach message (profile.md ~3–4k + job ~1k + system → ~5k in; ≤1k out) | ~5k in / ~0.4k out | **~$0.04** (round $0.05) |
| Human Path discovery | web_search, 2-pass | **~$0.10–0.12** |
| Voice fingerprint (per profile save, debounced) | ~2–3k in / ≤1k out | ~$0.03 |
| Posting gap-fill / source scan | shared pool, cron-bounded | pennies/user amortized |

**A fully-worked pursuit** (1 discovery + up to 3 one-shot messages, one per
discovered contact) costs **~$0.25 worst case**. The one-gen-per-contact-per-job rule
(F6) is itself the outreach cost cap: outreach ≤ 3 × pursuits.

**Tier gating (homepage is the source of truth):** Good = profile building only;
Gooder = + job scanning; Goodest = + 1:1 outreach & pursuits. Confirmed mapping:
Good=`basic`, Gooder=`pro`, Goodest=`premium`, `tester`=internal comp plan.
⚠️ The current `subscription/rules.ts` contradicts this — it grants `basic`/`pro`
outreach + human_path quotas. **Fix as part of WS3/WS1 follow-through:**

| Internal plan | Public tier | Pursuits/mo | Human Path/mo | Outreach/mo | Worst-case LLM cost |
|---|---|---|---|---|---|
| `basic` | Good | 0 (locked) | 0 | 0 | ~$0.10 one-time onboarding + $0.03/save |
| `pro` | Gooder | 0 (locked) | 0 | 0 | + scanning (shared, pennies) |
| `premium` | Goodest | **50** | 50 (1/pursuit) | 150 (3/pursuit) | **≤ ~$13/mo** |
| `tester` | internal | 25 | 25 | 75 | ≤ ~$6.50/mo |

Rationale for 50 pursuits/mo on Goodest: ~2.3 pursued jobs per workday is genuinely
generous for one job seeker, while capping worst-case variable cost at ~$13/month.
Pricing implication (Randall sets final prices): any Goodest price ≥ **$19/mo** keeps
>30% margin at 100% quota consumption and ~85%+ at realistic usage; **$29/mo** gives
a strong ≥55% worst-case margin. Good/Gooder carry near-zero variable cost, so their
prices are pure positioning. Discovery caching (one discovery per pursuit, cached —
already the documented design intent) keeps Human Path spend bounded at 1×/pursuit.

---

## 3. Sequencing

| Order | Work | Blocked on |
|---|---|---|
| 1 | WS1.1–1.3 ID validation + tests | nothing |
| 2 | WS3 logging + timeouts + F6 generation policy (one-gen lock, no auto-gen, debounced fingerprint) | nothing |
| 3 | Tier realignment in `subscription/rules.ts` + pursuit caps (§2b) | Randall approves §2b numbers |
| 4 | WS1.4 key rotation + CRON_SECRET | Randall (dashboard/Vercel access) |
| 5 | WS2.1 supabase-js session handling | nothing |
| 6 | WS2.2 Google OAuth | Randall (provider credentials) |
| 7 | WS5.1–5.3 feedback backend + effectiveness readout | nothing (backend); UI is design-gated |
| 8 | WS4 RLS JWT passthrough + policy audit + test harness | after WS1; phased |
| 9 | WS6 pursuit/contact-selection UI from the apply-wizard card (+ WS5 UI; F10 soft remote-filter lands with matching changes) | design source confirmed; match-card feedback addition needs its own approval |
| 10 | Billing provider | after first real production push |

Decisions resolved 2026-07-02 (Randall):
1. F10 remote-only filter: **soften** — onsite jobs surface low-scored with a risk note.
2. Generation policy: **user-initiated only; one generation per contact per job; no
   regeneration** (see F6 / WS3.3). Profile.md rebuilds stay save-triggered.
3. Pursuit caps & tier economics: see §2b — Goodest 50 pursuits/mo recommendation
   **pending Randall's approval of the numbers**.
4. WS6 design source: **the original apply-wizard design is confirmed**.
5. Tier mapping confirmed: Good=basic, Gooder=pro, Goodest=premium, tester=internal.
6. Match feedback: **on the match card**, with a separate design-addition approval
   pass before implementation.

Additional decisions 2026-07-02 (Randall, second pass):
7. **Homepage subscription section rebuilt as a feature matrix — DONE 2026-07-02.**
   Randall's direction (superseding the earlier card copy the same day): the section
   is **subscription tiers**, not "Access", and must display as a **matrix/grid** —
   features down the left, Good/Gooder/Goodest across the top, included/not-included
   marks in the cells, price slot under each tier name. Implemented in `app/page.tsx`
   (`subscriptionTiers` + `subscriptionFeatures`, semantic `<table>`, section
   `#subscription`, nav label "Subscription") + `site.module.css`
   (`publicLandingTierTable*`, teal ✓ for included, muted bar for not included —
   tomato stays reserved). 10 feature rows incl. "Pursuits per month: 50" under
   Goodest. Verified at 320/375/390/1280/1440: no body overflow, no internal table
   scroll at any width, nav fits with the new label; tsc clean, lint 0 errors / 7
   pre-existing warnings. **Prices still empty** — tier header renders the price
   the moment `subscriptionTiers[].price` is set.

   **Second design pass (same day, Randall's critique):** first table was too flat /
   off-system. Rebuilt with the real DS treatment: ink `--line-bold` outline +
   `--shadow-card` hard offset + `--c-paper-deep` fiber/grain card; **ink header band**
   with Bemio (`--font-display`) knocked-out tier names; **ink vertical column rules
   with faint row rules** (column-first "graph" reading per Randall); **Goodest column
   teal-filled header + teal-tinted column**. Content changes (Randall): job-scanning
   row REMOVED (scanning is app-wide on all tiers, never gated); "Work example
   portfolio" → "Work examples, woven into your outreach"; contact discovery relabeled
   "Contact discovery: customized outreach" and **moved down to Gooder**; outreach row
   → "Generate custom outreach (1 per contact)"; "Pursued jobs export" → "Export
   history"; pursuits cap row relabeled "Jobs you can pursue each month" (50, Goodest).
   Re-verified at all five widths.

   ⚠️ **Economics ripple:** contact discovery on Gooder means the `pro` plan now
   carries ~$0.10/discovery variable cost and needs its own monthly discovery cap in
   `subscription/rules.ts` (proposed: 25/mo ≈ $2.50 worst case — Randall to confirm),
   plus a product answer for discovery-without-pursuit (Gooder has no pursuit
   tracking; discovery likely attaches to a saved job).
8. **Voice fingerprint: 3 updates per month**, disclosed in T&C and in the profile
   setup flow (see WS3.3).

Still open for Randall:
- Eventual dollar prices for the tiers (homepage price slot is ready for them).
- Approve the profile-setup-flow disclosure copy for the fingerprint cap when drafted.
- Note: the homepage now publicly states the 50-pursuit cap, which implicitly
  ratifies the §2b numbers — `subscription/rules.ts` realignment (basic/pro locked
  to 0, premium 50/50/150, tester 25/25/75) should land before invites.

---

## 4. Standing verdicts from the audit (context, no action)

- App-level user scoping is consistent everywhere else audited: aggregates load by
  `user_id`, pursuits filter by `user_id` on reads and writes, job saves validate
  membership in the user's own scan results.
- The LLM seam convention (injected callModel, lazy SDK, graceful no-key, strict JSON
  parse) is solid — keep it for every future AI feature.
- Matching engine is deterministic/explainable and honors the spectrum decision
  (soft exclusions, labels + reasons + risks); avoided-company exclusion approved.
- Legacy `/scans` remains reference-only; nothing public depends on it.
