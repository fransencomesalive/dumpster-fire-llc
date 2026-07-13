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
- [ ] Claude runs the 34-call style-matrix generation (`6 fingerprints + 28 messages`) because
      Codex egress cannot transmit the private base profile. Then review invariant violations,
      per-persona fidelity/sendability, and same-job evidence selection before any v4 work.
- [ ] Iterate vN until approved; then port the winning prompt to the production files and
      re-verify from the real prod code path.
- [ ] Later: revise the fingerprint pre-pass itself (over-tuned; source of the tic + frag
      problems); widen the job sample (~18); tune the auto-metric detectors.

## Handoff → Codex (several sessions; weekly limit resets tonight 2026-07-13)

Codex can make progress on this track WITHOUT touching production. Stay inside the
harness. Guardrails above still apply: **no prod prompt edits** (`outreach-generator.ts`,
`voice-fingerprint.ts`, `profile-markdown.ts`) and **no commit/push** without Randall's
explicit OK. Iterate by adding new `PROMPT_VARIANT` entries + `variantMeta` changelog in
`gen-baseline.mjs`, regenerating, and reviewing in the console. Randall reviews in the
console and rates/prioritizes; you turn that into the next variant.

Safe-to-do this stretch (harness only):

1. **Generate and review the pre-v4 cross-style matrix.** Offline preflight passes at 6 personas,
   6 jobs, and 28 cells using the exact frozen v3 prompt/profile. Claude runs
   `node scripts/outreach-quality/gen-style-matrix.mjs`; no artifacts publish unless all six
   fingerprints and all 28 structurally valid messages succeed. Review the matrix against
   `docs/message-gen-cross-style-validation.md` before authoring v4.

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
