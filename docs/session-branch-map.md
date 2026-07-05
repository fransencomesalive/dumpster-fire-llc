# Session Branch Map

Use this file to keep parallel sessions clearly separated and reviewable.

## Current mapping

- **No active parallel sessions.** All work happens on `main`.
- **Branches are created only when Randall explicitly asks for one.** Do not create or
  switch branches on your own; default to `main` unless told otherwise (Randall, 2026-07-04).

## History

- 2026-07-05: Onboarding auth surface rebuild ran on branch
  `design/onboarding-auth-2026-07-05` (created for the design-gated work), then merged
  fast-forward into `main` and pushed (`153dbd4`). Nothing is outstanding on the branch;
  it is fully merged.
- 2026-07-04: A design workflow and a legal/public-app workflow ran at the same time. The
  branch names `design/onboarding-2026-07-04` and `feat/legal-pages-2026-07-04` were reserved
  in this file, but the branches were never actually created — both workflows were committed
  directly to `main` and pushed. Nothing is outstanding on a separate branch.

## Rules

- Default to `main`. A session gets its own branch only when Randall explicitly asks for
  one; do not create or switch branches on your own.
- When Randall has assigned branches for a set of parallel sessions, each of those sessions
  stays on its assigned branch (recorded under Current mapping above) until told otherwise.
- Do not merge one session into another without explicit review.
- Before starting work, confirm the intended branch and workflow in this file.
- Use the short reminder phrase `session check` whenever you need to confirm the active workflow and branch.
- Treat prompts about branch work, session ownership, parallel work, parallel sessions, or simultaneous work as a cue to follow this workflow.
- After each handoff or sync, update this file with the current branch ownership.
