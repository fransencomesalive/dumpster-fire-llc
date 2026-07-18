# Legacy `/scans` reference (port source — do not wire directly)

These files were extracted verbatim from the retired private `app/scans/` app at commit
`4e1e5d0` (the parent of `57a8722`, which deleted `/scans`). They are kept **only as the
reference implementation for the still-open broad-board port** — see the "general/broad job
boards are missing from the public scan" investigation in `docs/current-state.md`.

Randall's standing directive: broad-market coverage (Remotive + Himalayas, plus the source
mandate) must be **ported** from this legacy implementation into the public pipeline
(`lib/scan/`), never rebuilt from scratch. Rebuilding instead of porting is what caused the
P0 garbage-scan bug.

## What's here
- `SOURCE_INVENTORY.md` — canonical source mandate: the two first-class source arrays (broad
  job boards + targeted company boards) and each source's status/blocker (ready / blocked /
  needs_key / needs_proof).
- `connectors.ts` — the legacy source-connector engine (Remotive, Himalayas, etc.).
- `connector-runner.ts` — the fetch/normalize path.
- `search-sources.ts` — profile-derived query-variant generation.
- `board-registry.ts` — board-type registry.

## Important
- **Not compiled.** This folder is in `tsconfig.json`'s `exclude`; the `.ts` files still
  import from other (deleted) `app/scans/` siblings and are reference-only, not live code.
- **Do not import these from `app/` or `lib/`.** Port the logic into `lib/scan/` against the
  public data model instead.
- The full retired `app/scans/` app remains recoverable from git history at `4e1e5d0` if more
  than these five files is ever needed.
