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
- **No commit/push without Randall's explicit OK.**
- **Never print secret values** from `.env.local`; scripts only read them.

## Sync + git treatment

Full cross-machine sync AND full siloing — not either/or.

- **Committed (durable history):** the tool + harness code, `data/versions.json`,
  per-version changelog, `data/feedback-*.json`, `data/corpus-*.json` (the frozen messages
  feedback attaches to), `data/prompts/*.txt` (exact system prompt used), and
  `data/inputs/*-profile.md` (frozen profile snapshot per version). Freezing per version =
  each round keeps the exact inputs/outputs it was judged against.
- **Gitignored (regenerable scratch):** the working `profile.md`, `scan-jobs.json`,
  `outreach-messages.json`, and the human-readable `baseline-*.md` at the dir root.

## Layout

```
scripts/outreach-quality/
  pull-evidence.mjs        # pull profile.md + jobs (with source_url) + stored messages
  gen-baseline.mjs         # generate a version's corpus; PROMPT_VARIANT selects the prompt
  review-server.mjs        # local review console (zero-dep node http server)
  data/
    versions.json          # [{id,label,createdAt,changeNotes[]}]  <- committed
    corpus-<id>.json       # frozen messages + job context + auto-metrics  <- committed
    feedback-<id>.json      # Randall's comments + slider values  <- committed
    prompts/<id>.txt        # exact system prompt used  <- committed
    inputs/<id>-profile.md  # frozen profile snapshot  <- committed
```

## Tracked mechanics (the sliders)

**Auto-computed meters (read-only — what the detectors find per message):**
nautical-tic density · hero-example present · invented-number present ·
concession-opener present · "tells them what they want" opener · Q4 brag-tag present ·
length. Heuristic/regex — tunable later (they can be wrong; the point is a trend signal).

**Randall's ratings (interactive 0–10):** Sounds like me · Right humility · Fit honesty ·
Would-send-as-is. Plus **Priority to fix** (0–10).

Free-text **prescriptive comment** per message is the primary output.

## How to run

```
# 1. refresh inputs (writes scratch profile.md + scan-jobs.json into this dir)
node scripts/outreach-quality/pull-evidence.mjs

# 2. generate a version's frozen corpus into data/
PROMPT_VARIANT=baseline node scripts/outreach-quality/gen-baseline.mjs
PROMPT_VARIANT=v2       node scripts/outreach-quality/gen-baseline.mjs
# ...add v3, v4 as new entries in the systemByVariant map + versions changelog

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

## Next steps

- [x] Build the console (Slice 1 + changelog + historical context). Done 2026-07-13.
- [ ] Randall reviews baseline + v2 in the console → prescriptive, priority-ranked feedback.
- [ ] Draft v3 from that feedback (reserve concession for thin fits; delete invented count;
      drop residual "I do" brag tag; consider length cap). Re-run same jobs.
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

1. **Draft v3** against the v2 findings (see the diagnosis doc §5 v3 direction): reserve the
   concession opener for genuinely thin fits so good-fit messages open on strength; delete
   the invented doc-count entirely (never a number); drop the residual "I do" brag tag;
   consider a ~700-char length rein. Add as `v3` in `systemByVariant` + `variantMeta`,
   regenerate baseline+v2+v3 (same jobs), and leave it in the console for Randall.

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
