# Track: Message Gen Refinement

The dedicated workstream for fixing the quality/voice of AI-generated outreach messages.
The outreach message IS the product; this track exists to iterate it to a high bar with
prescriptive, versioned feedback so refinement doesn't get away from us.

Parent context + diagnosis: `docs/outreach-message-quality-session-2026-07-13.md`.

---

## What this track is

A **local review console** + a **versioned corpus pipeline**. You read each generated
message, leave prescriptive per-message feedback, and set/see the tracked mechanics as
sliders. Every generation round is frozen as a version with a changelog, so we can always
compare across versions and walk back a path that isn't working.

## Guardrails (hard)

- **Siloed from production.** Everything lives under `scripts/outreach-quality/`. No `app/`
  route, no DS card, no prod build path. It cannot leak into production.
- **No prod prompt edits without Randall's approval** of the resulting message diff. The
  production files (`lib/public-profile/outreach-generator.ts`, `voice-fingerprint.ts`,
  `profile-markdown.ts`) change only after a variant is approved here.
- **Work Example inventory parity is a generation prerequisite.** No refinement round may
  call the model unless every structured Work Example, including title, one-hitter, optional
  link, and context, is present in the compiled profile snapshot. Missing, extra, duplicated,
  stale, or changed inventory fails the round before version artifacts are written.
- **No commit/push without Randall's explicit OK.**
- **Never print secret values** from `.env.local`; scripts only read them.

## Sync + git treatment

Full cross-machine sync AND full siloing — not either/or.

- **Committed (durable history):** the tool + harness code, `data/versions.json`,
  per-version changelog, `data/feedback-*.json`, `data/corpus-*.json` (the frozen messages
  feedback attaches to), `data/prompts/*.txt` (exact system prompt used), and
  `data/inputs/*-profile.md` (frozen profile snapshot per version), and
  `data/inputs/*-work-examples.json` (privacy-minimized inventory audit). Freezing per
  version = each round keeps the exact inputs/outputs it was judged against.
- **Gitignored (regenerable scratch):** the working `profile.md`, `scan-jobs.json`,
  `outreach-messages.json`, and the human-readable `baseline-*.md` at the dir root.

## Layout

```
scripts/outreach-quality/
  pull-evidence.mjs        # pull profile.md + jobs (with source_url) + stored messages
  gen-baseline.mjs         # generate a version's corpus; PROMPT_VARIANT selects the prompt
  review-server.mjs        # local review console (zero-dep node http server)
  work-example-audit.mjs   # structured-data ↔ compiled-profile parity + selection identity
  test-work-example-audit.mjs
  data/
    versions.json          # [{id,label,createdAt,changeNotes[]}]  <- committed
    corpus-<id>.json       # frozen messages + job context + auto-metrics  <- committed
    feedback-<id>.json      # Randall's comments + slider values  <- committed
    prompts/<id>.txt        # exact system prompt used  <- committed
    inputs/<id>-profile.md  # frozen profile snapshot  <- committed
    inputs/<id>-work-examples.json # privacy-minimized parity audit  <- committed
```

## Tracked mechanics (the sliders)

**Auto-computed meters (read-only — what the detectors find per message):**
nautical-tic density · hero-example present · invented-number present ·
concession-opener present · "tells them what they want" opener · Q4 brag-tag present ·
length · exact selected Work Example + corpus selection spread. Heuristic/regex — tunable
later (they can be wrong; exact Work Example identity comes from returned metadata).

**Randall's ratings (interactive 0–10):** Sounds like me · Right humility · Fit honesty ·
Would-send-as-is. Plus **Priority to fix** (0–10).

Free-text **prescriptive comment** per message is the primary output.

## How to run

```
# 1. refresh inputs (writes scratch inputs only after every read + parity check succeeds)
node scripts/outreach-quality/pull-evidence.mjs

# 2. generate a version's frozen corpus into data/
PROMPT_VARIANT=baseline node scripts/outreach-quality/gen-baseline.mjs
PROMPT_VARIANT=v2       node scripts/outreach-quality/gen-baseline.mjs
PROMPT_VARIANT=v3       node scripts/outreach-quality/gen-baseline.mjs
# ...add v4+ as new entries in the systemByVariant map + versions changelog

# 3. review
node scripts/outreach-quality/review-server.mjs   # prints a localhost URL
```

## Console features

- Left column per message: overview line (company · title · fit · length), link to the
  original posting (`source_url`), the message, inserted example, autosaving comment box.
- Right column: the mechanics as sliders/meters (above).
- Version switcher + per-version **changelog** at top; corpus scorecard rolls up the
  auto-meters so we see the trend across versions.
- **Historical context:** reviewing vN shows the prior version's comment + slider values
  for the same job inline, so we can tell whether a change addressed the note.
- **Cross-style matrix view:** any manifest-verified `data/style-matrix-<id>.json` shows up in
  the version switcher as "▦ Cross-style matrix (<id>)". The view separates hard failures from
  heuristic review flags, surfaces persona-target and invention/concession signals, groups every
  cell by persona, and persists the five cross-style ratings plus optional prescriptive comments.
  A separate blind-first view records eight same-job voice-identification guesses before revealing
  the actual personas.

## Versions so far

- `baseline` — exact current production system prompt. Reference point.
- `v2` — six levers: Q4 as thinking-signal (not a quote/mic-drop), anti-authority stance,
  fragment rule, hero-example cap, nautical demoted, ban invented specifics. Directional
  win; introduced a new concession-opener tic and didn't kill the invented doc-count.
- `v3` — complete evidence + respectful fit: full Work Example consideration, accurate résumé
  retrieval before concessions, respectful former-employer familiarity, first-person-only Q4
  translation, stronger anti-authority rules, exact example metadata, and a 750-character cap.
  Generated 2026-07-13: 10/10 valid messages, zero unmatched selections, 648 average characters,
  732 maximum, 3 nautical tics, 1 P.H.R.E.D. name hit, 0 invented numbers, 3 concession openers,
  0 tells-them-what openers, and 0 Q4 brag tags. Selection remains lopsided: P.H.R.E.D. 4,
  Bored Ape 1, Mozilla 0, Bot Busters 0, no Work Example 5. Reviewed by Randall: four strong
  structural outcomes, two material failures among the good/medium set, and two non-actionable
  matches excluded from prompt-tuning signal. Do not port before cross-style validation.

## Next steps

- [x] Build the console (Slice 1 + changelog + historical context). Done 2026-07-13.
- [x] Randall reviewed all 10 v2 messages: six good/medium fits rated; four bad matches excluded.
- [x] Prove current Work Example parity: 4 structured examples = 4 compiled examples, all required
      fields present. Add fail-closed parity + multi-example generation-context regression coverage.
- [x] Generate and verify v3: 10/10 messages, zero unmatched selections, four-example inventory
      present, metrics verified, and console readback confirmed on 2026-07-13.
- [x] Randall reviewed v3 message-by-message. Strong: Business Process Improvement, Luxe Supply,
      Trust & Safety, and Art Director. Failed: Roadmap sendability and Process Strategy evidence
      stretch. Coinbase Infra needs relevance-first adjacency; French/SWE are non-match sampling.
- [x] Build the offline pre-v4 cross-style gate: six frozen voice personas, six controlled jobs,
      28 unique cells, real fingerprint-prepass runner, exact v3 prompt/profile hashes, invariant
      rubric, production-renderer parity, pinned job inputs, fail-closed structural publication,
      sealed-artifact verification, review-visible quality violations, and offline tests. Spec:
      `docs/message-gen-cross-style-validation.md`.
- [x] Claude ran the 34-call style-matrix generation (`6 fingerprints + 28 messages`) on
      2026-07-13 (Codex egress cannot transmit the private base profile — see "Network step:
      Codex cannot run it" below). Complete matrix published: `data/style-matrix-v3.json` (+
      human `style-matrix-v3.md`, sealed manifest verified). Result: 22/28 have no hard contract
      failure, avg length 689 (603–814). Hard failures: `over_750_characters` 4 and
      `q4_quoted_verbatim` 2. Heuristic review flag: `selected_example_not_obvious` 13. Persona
      length target passed 12/28; one invented-number signal and two concession-opener signals
      also require review.
      Surfaced + fixed a harness bug on the way: a single unparseable response hard-aborted the
      whole run with no retry (Codex added bounded retry in 2e475e5). Reviewable in the console
      via the "▦ Cross-style matrix (v3)" entry in the version switcher.
- [x] Make the matrix reviewable end to end: manifest-verified console loading, hard-failure versus
      heuristic-flag separation, persona-target and invention/concession summaries, persisted
      five-category ratings/comments, blind-first voice identification, safe partial autosave
      merging, and responsive verification at 320/375/390/1280/1440. Randall completed the blind
      check on 2026-07-14: 4/8 correct. Labeled review remains 0/28.
- [ ] **Complete the human matrix review before authoring v4.** Automated findings identify
      candidate targets, not final prompt requirements:
      1. **Evidence selection independent of expression.** P.H.R.E.D. was the only selected Work
         Example (13 cells); the other 15 used none. Three of six full-matrix jobs varied between
         P.H.R.E.D. and none. Because this is one nondeterministic sample per persona, human review
         must determine relevance before attributing the variation to voice.
      2. **Voice-aware length inside a universal ceiling.** Four messages exceeded 750, but the
         broader portability failure is 16/28 persona-target misses. Minimal/direct missed its
         350–550 target in all six cells, showing the fixed v3 length instruction can override the
         onboarding voice.
      3. **Close the last Q4 leak.** Two verbatim Q4 quotes survived v3's ban, both on the Business
         Process Improvement job under wry/casual and calm/polished.
      4. **Recheck invention.** The wry/casual Databricks cell triggered the invented-number
         detector with "ten docs" and must be evaluated against the frozen evidence.
- [ ] Iterate vN until approved; then port the winning prompt to the production files and
      re-verify from the real prod code path.
- [ ] Later: revise the fingerprint pre-pass itself (over-tuned; source of the tic + frag
      problems); widen the job sample (~18); tune the auto-metric detectors.

## Network step: Codex cannot run it — hand it off (do not retry)

Any script that calls Anthropic (`gen-baseline.mjs`, `gen-style-matrix.mjs`, any future
generator) reads the private base profile + Work Examples off local disk and POSTs them to
`api.anthropic.com`. **Codex's execution environment blocks this** — first the sandbox has no
egress, and when elevated execution is requested the policy reviewer rejects it because the
command transmits private workspace data to an external service. This is an execution-policy
block, not a missing key, a bad command, or a broken workflow. The command and API are valid;
retrying (even with explicit user authorization) will keep being denied. **Codex must not
loop on this.**

The workflow is NOT blocked, because generation is split from authoring:

- **Codex authors offline** (no network): prompt variants, persona configs, metric detectors,
  audit/parse logic, the console. All pure text editing.
- **The network step runs where it's authorized to** — the Claude Code session (which reaches
  Anthropic) or Randall in a plain terminal outside the sandbox. Codex commits its change,
  then asks that runner to execute e.g.
  `PROMPT_VARIANT=v4 node scripts/outreach-quality/gen-baseline.mjs` or
  `node scripts/outreach-quality/gen-style-matrix.mjs`.
- Artifacts land in `data/`; the console at :4137 shows them; Randall reviews.

Codex can validate its own harness offline without any network via the preflight:
`MATRIX_PREFLIGHT_ONLY=1 node scripts/outreach-quality/gen-style-matrix.mjs` (checks config,
hashes, and cell count; prints `"ok": true`). Proven end-to-end on 2026-07-13: Codex authored
the matrix + retry fix offline, Claude ran the 34 calls, the full 28-cell corpus published.

## Handoff → Codex (several sessions; weekly limit resets tonight 2026-07-13)

Codex can make progress on this track WITHOUT touching production. Stay inside the
harness. Guardrails above still apply: **no prod prompt edits** (`outreach-generator.ts`,
`voice-fingerprint.ts`, `profile-markdown.ts`) and **no commit/push** without Randall's
explicit OK. Iterate by adding new `PROMPT_VARIANT` entries + `variantMeta` changelog in
`gen-baseline.mjs`, regenerating (hand the network step off — see above), and reviewing in the
console. Randall reviews in the console and rates/prioritizes; you turn that into the next variant.

Safe-to-do this stretch (harness only):

1. **Complete the pre-v4 cross-style review.** The 28-cell matrix is generated, sealed, and
   available in the console. The blind check is complete at 4/8. Start immediately in the
   **Labeled matrix review (v3)** view, record all five ratings for every cell, and add prescriptive
   comments wherever a message needs to change. When the console reaches `reviewed: 28/28`,
   aggregate the saved feedback against
   `docs/message-gen-cross-style-validation.md` before
   authoring v4.

2. **Work-examples selection bias (Randall flagged 2026-07-13).** All **4** work examples
   ARE compiled into profile.md — this is NOT a data-pull gap. The generator over-selects
   **P.H.R.E.D.** (in ~4/10 bodies) and under-uses the rest: **Bot Busters is never used**,
   Mozilla / Bored Ape only occasionally. Investigate the selection bias and try a prompt
   nudge (harness variant only) to consider ALL work examples and pick the most relevant
   per job, spreading across the corpus instead of defaulting to the AI-flavored hero.
   Measure via the `heroPresent` meter + inserted-example spread across the 10 messages.

3. **Thin résumé/work-experience data (related, deeper).** In profile.md the résumés parse
   as quality "weak" with Strengths / Gaps / Use-when / Avoid-when all "None captured", so
   the generator has little real experience to cite beyond a few highlights. This is likely
   what "expand work experience pulls" points at. Diagnose where the résumé enrichment drops
   off (`lib/public-profile/resume-highlights.ts`, `resume-parse.ts`, the onboarding résumé
   scan) and propose — do NOT implement without scope — how to pull richer, quotable work
   experience into the profile so message gen has more to draw on.

Report findings + proposed variants back here (update Versions + Next steps). Do not port
anything to production or commit without Randall.
