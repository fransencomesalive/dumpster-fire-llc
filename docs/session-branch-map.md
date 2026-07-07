# Session Branch Map

## Branches are eliminated (Randall, 2026-07-06)

**All work happens on `main`. No branches — ever.** The branch-per-session experiment was
unsuccessful and has been retired. Do not create, switch to, or push any branch other than
`main`. See AGENTS.md → "No Branches — All Work On `main` (hard rule)".

This file is retained only as a pointer to that rule and for historical record. There is no
branch map to maintain because there are no branches.

## History

- 2026-07-06: Branch usage eliminated entirely (Randall). All sessions work on `main`.
- 2026-07-05: Onboarding auth surface rebuild ran on branch
  `design/onboarding-auth-2026-07-05`, then merged fast-forward into `main` and pushed
  (`153dbd4`). Fully merged; nothing outstanding.
- 2026-07-04: A design workflow and a legal/public-app workflow ran at the same time.
  Branch names `design/onboarding-2026-07-04` and `feat/legal-pages-2026-07-04` were
  reserved but never created — both were committed directly to `main` and pushed.
