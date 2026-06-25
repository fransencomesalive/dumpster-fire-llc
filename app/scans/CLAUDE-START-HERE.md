# Claude Start Here — Dumpster Fire

You are taking over the `dumpster-fire` experiment after a Codex pass. Do not rely on chat memory. Treat this file and the repo docs as the crossover system of record.

## First Command

Run this before planning or changing code:

```bash
node scripts/check-dumpster-fire-crossover.mjs
```

The checker is local and no-write. It verifies that the active handoff docs mention the current cleanup/Greenhouse state, confirms the review-batch export if present, checks that Greenhouse is documented as targeted-company ATS API coverage, and reports the current dirty worktree.

If the checker fails, stop and repair the handoff mismatch before continuing product work.

## Read Order

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/scans-execution-path-2026-06-10.md` — canonical forward path, invariants, and pitfalls ledger; when older notes disagree, this wins
4. `docs/current-state.md`
5. `docs/scans-codex-handoff.md`
6. `app/scans/ARCHITECTURE.md`
7. `app/scans/SOURCE_INVENTORY.md`
8. `app/scans/TUNING_PLAN.md`
9. `docs/scans-failure-audit-2026-06-09.md`
10. `docs/scans-hardening-plan-2026-06-10.md`
11. `docs/scans-matching-audit-2026-06-10.md`
12. `app/scans/job_search_context_for_codex.md`

For UI work, also read the mandatory design docs and the closest reference CSS before changing JSX or CSS.

## Current Product Boundary

Dumpster Fire is a private job-intelligence system for Randall's real search. The source and matcher work must preserve three lanes:

- Main dashboard: current best matches plus Apply Wizard workflow.
- Admin tuning: review/learning queue for source and matcher calibration.
- Source ingestion: broad job-board sources plus targeted company career-page sources in one normalize, dedupe, match, rank flow.

Do not treat `Today's Best Matches` as the whole review surface, and do not treat targeted company ATS rows as broad-market coverage.

## Greenhouse Boundary

Greenhouse is incorporated as targeted-company ATS coverage. Company rows with a Greenhouse board token use the public JSON board endpoint:

```text
https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
```

This is not HTML scraping of Greenhouse pages, credentialed access, profile scraping, or auto-apply behavior. Current private Greenhouse rows include Anthropic and Block.

## Current Review Batch

The latest local review-batch export, when present, is:

```text
/private/tmp/scans-review-batches.json
```

As of the latest handoff it is a source/profile-fit calibration batch, not a balanced broad/targeted sample. If the checker reports it missing or stale, regenerate only after reading the handoff docs and confirming source/matcher state.

## Safe Validation Commands

Use focused commands first:

```bash
node scripts/test-dumpster-fire-review-details.mjs
node scripts/test-dumpster-fire-review-feedback.mjs
node scripts/test-dumpster-fire-matching.mjs
node scripts/test-dumpster-fire-review-learning.mjs
```

Use networked/source commands only when the task requires live source verification:

```bash
node scripts/run-dumpster-fire-matching-diagnostic.mjs
node scripts/run-dumpster-fire-review-batches.mjs --batches=2 --batch-size=17 --include-near-misses
node scripts/run-dumpster-fire-verdict-benchmark.mjs
```

The verdict benchmark replays saved human review verdicts against the active matcher config (read-only, Supabase reads only). Pass `--config=<path.json>` to compare a candidate config; it exits non-zero when the candidate regresses positive recall or wrong inclusions. No matcher config may be applied without a passing benchmark run. See `docs/scans-matching-audit-2026-06-10.md` for the audited rule changes waiting on this gate.

Do not run apply/write scripts unless Randall explicitly asks for that action and the confirmation phrase is understood.

## Handoff Back To Codex

Before ending a meaningful pass:

- Update `docs/current-state.md` if active state, decisions, source behavior, or next steps changed.
- Update `docs/scans-codex-handoff.md` when the next model needs specific operational context.
- Update this file if the read order, checker, or Greenhouse/source boundary changes.
- Run `node scripts/check-dumpster-fire-crossover.mjs` and include the result in the handoff.
