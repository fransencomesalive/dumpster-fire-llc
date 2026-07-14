# Message Gen — Generalization Audit & Multi-User Readiness (2026-07-14)

Requested by Randall 2026-07-14: audit all message-generation improvements and prepare, as
best we can, for users with differing careers, experience, and industries — everything so
far has been built and judged against one profile (Randall's). Also: an architecture note
(note only, no build) for extending the review dashboard to up to 5 free-code testers.

Parent track: `docs/message-gen-refinement-track.md`.

---

## 1. Improvement inventory and portability

Enforcement layers: **prompt** (instruction in the system prompt), **hard rule** (validated
after generation; violating cells regenerate up to 3 attempts; final violations stay
visible), **meter** (heuristic console metric, review signal only).

| Improvement (introduced) | Enforced by | Portable to any user? |
| --- | --- | --- |
| Q4 opinion = private reasoning, never quoted/announced (v2/v3) | prompt | Yes — generic |
| Anti-authority stance; never redefine the reader's field (v2/v3) | prompt | Yes — generic |
| Concessions only for genuinely unsupported hard requirements; check full profile first (v3) | prompt | Yes — generic |
| Respectful former-employer familiarity (v3) | prompt | Yes — generic |
| Complete Work Example inventory consideration + exact metadata audit (v3) | prompt + fail-closed parity audit | Yes — audit is structural, not profile-specific |
| Work Example link must reach the message body (v3-link) | prompt + hard rule + exact meter | Yes — conditional on the example having a link |
| No em dashes, ever (v3-nodash; standing rule in AGENTS.md) | prompt + hard rule + meter | Yes — generic |
| 750-char hard cap, 550–700 target (v3 → v4 hard) | prompt + hard rule | Yes — generic (voice-aware per-persona length is still an open matrix finding) |
| Opinions hedged as first-person experience, never declared fact (v4) | prompt | Yes — generic |
| Opening line = complete standalone sentence; fragments never first (v4) | prompt | Yes — generic |
| No coined jargon absent from posting/profile (v4) | prompt | Yes — generic |
| Résumé-highlight variety; ≤2 highlights per message; don't repeat marquee names (v4) | prompt | Yes, but effectiveness depends on profile richness (see §3 thin-résumé) |
| Numbers only if stated in the profile, incl. rhetorical counts (v4) | prompt + hard rule (`ungroundedNumbers`) + meter | Yes — the validator compares against the user's own profile text, so it generalizes by construction |
| Exemplar phrases show register, not vocabulary; most messages need no flourish (v4) | prompt | Yes — generic (replaces v3's Randall-specific "nautical" line) |

**The v4 prompt contains nothing Randall-specific.** v3's "never repeat nautical or
absurdist language" named one user's tic; v4 generalizes it. v4 is the production-port
candidate.

**The hard-rule validation layer is profile-independent by design** (length, em dash,
link-in-body, numbers-vs-profile). It exists because prompt-only enforcement measurably
leaked (750-cap and invented counts recurred across three rounds); production needs the
same validate-and-retry loop because no one will hand-review other users' messages.

## 2. Randall-specific remnants (all harness-side, none in the port path)

- **Console meters** `nauticalTic`, `heroPresent` (P.H.R.E.D. regex), `inventedNumber`
  (doc-count regex) are tuned to this profile's known tics. Fine for this console; a
  multi-user harness would need per-profile tic detectors — deriving each from the user's
  own voice fingerprint is the natural source. The generic `ungroundedNumber`,
  `emDash`, `exampleLinkMissing`, and `length` meters carry over unchanged.
- **Job sampling** (batch 2 picks) encodes Randall's fit judgments; per-user batches would
  come from each user's own scans/matches.
- **The voice-fingerprint pre-pass** (`lib/public-profile/voice-fingerprint.ts`) remains
  over-tuned: v4 still produced one nautical-family flourish in 8/12 messages even with
  exemplar reuse banned, because the fingerprint's exemplars over-index the same imagery.
  This is the known structural root (track doc "later" item) and the single biggest
  cross-user risk: a sparse or eccentric writing sample could fingerprint into a tic
  machine for any user. Revising the pre-pass should precede or accompany the port.

## 3. Differing careers / experience / industries — known degenerate cases

- **No Work Examples**: handled — the prompt allows "no example" and 2–3 of 12 corpus
  messages exercise the null path each round. Parity audit passes with an empty inventory.
- **Examples without links**: handled — the link rule is conditional.
- **Thin résumé / few highlights**: the résumé-variety rule degrades (nothing to vary
  into). Known enrichment gap (`resume-highlights.ts` / `resume-parse.ts` pull too little
  quotable experience) — this is the highest-leverage fix for less-credentialed users.
- **Sparse or short writing samples**: fingerprint quality untested; see §2.
- **Non-tech industries**: all scan sources are tech companies; the generator has never
  produced a message for, e.g., healthcare, education, retail, or trades. Prompt rules are
  industry-neutral on paper but unvalidated.
- **Junior experience levels**: the profile under test is 15+ years senior; messages for a
  2-year candidate (nothing famous to cite, fit gaps everywhere) are unvalidated — the
  concession and brag-tag rules matter most exactly there.

**Proposed pre-friend validation: a synthetic career matrix** — same pattern as the proven
cross-style matrix (frozen fixtures, sealed manifest, console review), but varying the
PROFILE instead of the voice: e.g. an ICU charge nurse (healthcare ops), a high-school
teacher moving to edtech, a junior frontend dev, a restaurant GM, a nonprofit fundraiser —
each with realistic Work Examples (some link-less), thin-to-rich résumés, and 3–4 jobs.
Codex can author fixtures + runner fully offline (`MATRIX_PREFLIGHT_ONLY=1` validates);
the Claude session runs the network step. This validates every rule above against careers
we don't have, before real friends' profiles hit the generator.

## 4. Multi-user review dashboard — architecture note (NO BUILD; Randall said wait)

Goal if/when built: the same review console for up to 5 testers using the free code
(DUMPSTERFRIENDS → Goodest).

- **Today's coupling to one user:** `pull-evidence.mjs` selects the profile by
  `full_name = "Randall Fransen"`; all artifacts live in a flat `data/` namespace; the
  console has no user dimension; feedback is committed to the repo.
- **Proposed shape (small, stays siloed in `scripts/outreach-quality/`):**
  1. `pull-evidence.mjs --user <user_id>` (service-role query by id, not name); refuse to
     run without an explicit user id once multi-user.
  2. Namespace all artifacts per user: `data/users/<user-slug>/{versions.json,
     corpus-*.json, feedback-*.json, prompts/, inputs/}`. Randall's existing `data/*`
     stays where it is (or migrates to `data/users/randall/` in one move).
  3. `review-server.mjs` gains a user switcher above the version switcher; the state API
     takes a `user` param; ratings/comments write to that user's feedback file.
  4. Per-user job batches come from the user's own scans/saved jobs, same sampling rules
     (variety, no language gates, no never-apply padding).
- **Privacy decision for Randall (blocking, must be answered before pulling any tester's
  data):** corpus + profile snapshots are personal data. Options: (a) keep committing
  (repo is private, but testers' profiles would live in git history permanently), or
  (b) gitignore `data/users/*` except Randall's and treat tester artifacts as local-only.
  Recommend (b) + explicit consent from each tester.
- **Who reviews:** the console is localhost; for 5 testers the workable loop is Randall
  reviewing their generated corpora himself (they don't get the console). An in-app
  feedback surface for testers is product/design work (design-gated) and out of scope.
- **Cost/limits:** 12 messages × 5 users per round is trivial API volume; enforcement
  retries add ≤3×.

## 5. QA pass (pre-friend-testing) — 2026-07-14

Results recorded by the session that ran them; see track doc bookmark for the exact date.

- Harness offline tests: `test-work-example-audit.mjs`, `test-review-server-matrix.mjs`,
  `test-cross-style-matrix.mjs` — see bookmark.
- Repo validation: `npx tsc --noEmit --incremental false`, `npm run lint`,
  `npm run build`, `npm run test:public-jobs` — see bookmark.
- Console verified serving all versions including v4 at localhost:4137.

## 6. Port-to-production plan (gated on Randall approving the v4 corpus in the console)

1. Replace the system prompt in `lib/public-profile/outreach-generator.ts` with the exact
   v4 text (`data/prompts/v4.txt` is the frozen source of truth).
2. Add the same hard-rule validation + bounded retry (length / em dash / link-in-body /
   ungrounded-numbers-vs-profile) around the production generation call, keeping the
   graceful no-key degradation intact.
3. Re-verify from the real prod code path (not the harness): existing generator tests +
   one live generation, then `npm run test:public-jobs` and a deploy check.
4. Only then: friends.

Not yet in the port: voice-aware persona length targets (open matrix finding), fingerprint
pre-pass revision (§2), résumé enrichment (§3).
