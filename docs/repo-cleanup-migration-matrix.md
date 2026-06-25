# Repo Cleanup Migration Matrix

## Purpose

Dumpster Fire public-app work is now owned by this standalone repo:

`/Users/randallfransen/Sites/dumpster-fire-llc`

Lab26 is not a peer source of truth. Anything in `/Users/randallfransen/Sites/Lab26/app/dumpster-fire` is historical reference only and should be opened only when a specific implementation question cannot be answered from this repo. If Lab26 is referenced, it must remain read-only comparison material. Do not save, stage, deploy, or treat Lab26 files as canonical public-app work.

## Current Issue Source

- GitHub open issues for `fransencomesalive/dumpster-fire-llc`: none returned on 2026-06-25.
- Active cleanup and implementation issues live in this repo's docs:
  - `docs/project-todo.md`
  - `docs/current-state.md`
  - `docs/next-session.md`
  - `docs/spec-review-phase-1.md`
  - `docs/implementation-roadmap.md`

## Ownership Rules

- Canonical public app code, docs, migrations, and deployment config live in `dumpster-fire-llc`.
- Lab26 is legacy reference only; it must not receive public-app functionality, docs, styles, or product state.
- Public profile tables and APIs are the foundation for launch work. They live beside legacy private scan tables and should not be merged into `job_search_*`.
- `/scans` is the private dashboard port and remains access-code gated. It is useful product machinery, but it is not the public profile/onboarding source of truth.
- `design-system/` is a non-shipping design sandbox until specific tokens/components are intentionally ported into app CSS.

## Inventory

| Area | Current State | Classification | Cleanup Action |
|---|---|---|---|
| `/` public home | Placeholder page pointing to `/onboarding` and `/scans`. | Rebuild in standalone | Keep as temporary placeholder until landing page is rebuilt from standalone specs and chosen design direction. |
| `/onboarding` | Authenticated shell with Identity/Search, Role Tracks, Resume Uploads, and Work History editable forms. | Canonical foundation | Continue Phase 2 forms from `docs/project-todo.md`; next product slice is Proof Library unless cleanup uncovers blocking structure work. |
| `/api/public-profile/*` | Authenticated Supabase bearer-token section APIs for all public profile sections. | Canonical foundation | Preserve. Use these APIs as the dependency boundary for onboarding/profile UI. |
| `lib/public-profile/*` | Public profile contracts, quality, markdown generation, repository seam, section service, browser client. | Canonical foundation | Preserve. Extend here before adding UI for new public profile sections. |
| `lib/public-auth/*` | Public Supabase Auth config/session helpers. | Canonical foundation | Preserve. Google/Apple OAuth remain external setup blockers. |
| `supabase/migrations/20260623000100_public_foundation_schema.sql` | Public launch schema beside legacy scan tables. | Canonical foundation | Preserve. Future public migrations should keep non-`job_search_*` naming. |
| `supabase/migrations/20260604-20260612 job_search_*` | Legacy private scan/dashboard schema. | Legacy but active | Keep while `/scans` remains operational. Do not use as the public profile schema. |
| `/scans` app | Ported private scan dashboard, match tuning, connectors, Apply Wizard, contact/outreach tooling. | Legacy active product machinery | Keep gated. Mine only for behavior that should be rebuilt into public Saved Jobs/Pursuits/Human Path later. |
| `/scans/api/*` | Private dashboard APIs and connector/write paths. | Legacy active product machinery | Keep isolated under `/scans/api`. Public APIs should not reuse private route names or private profile defaults. |
| `app/scans/ARCHITECTURE.md`, `CLAUDE-START-HERE.md`, `EXPERIMENT.md` | Ported Lab26-era notes with stale experiment language and some old read paths. | Needs cleanup | Rewrite or retire after public inventory. Do not let these override root `docs/architecture.md`. |
| `design-system/` | Mid-century design sandbox, tokens, components, hero options, full scan-page pattern, fonts/licenses. | Non-shipping reference | Keep out of runtime. Port only selected tokens/components after Randall locks direction. |
| `Design System Resources/` | Untracked local reference assets. | Local reference | Keep untracked. Do not rely on it for production unless assets/licenses are deliberately copied and documented. |
| `app/site.module.css` | Minimal placeholder public-home CSS. | Temporary | Replace during standalone landing build; do not port Lab26 landing CSS by default. |
| `app/onboarding/onboarding.module.css` | Live onboarding shell/form CSS. | Canonical current UI | Extend carefully for remaining forms; may later be reskinned from approved standalone design tokens. |
| `app/scans/scans.module.css` | Ported private dashboard CSS. | Legacy active UI | Keep gated/private. Port design-system CSS only after design lock; do not use Lab26 CSS as canonical. |
| `docs/* product specs` | Standalone public product, data, onboarding, profile, matching, pursuit, subscription specs. | Canonical docs | Preserve as source of truth. |
| `scripts/test-public-*` | Public profile fixture tests. | Canonical validation | Use as focused validation for public profile changes. |
| `scripts/test-dumpster-fire-*` and matching scripts | Ported private scan/matcher validation. | Legacy active validation | Use when changing `/scans`; do not run write/apply scripts without explicit approval. |

## Migration Decisions

### Keep And Continue

- Public profile API foundation in `app/api/public-profile/*`.
- Public profile service/model layer in `lib/public-profile/*`.
- Public Supabase Auth boundary in `lib/public-auth/*`.
- Public foundation migration and standalone product docs.
- `/onboarding` as the active creation surface, with the next implementation focused on remaining section forms.

### Keep But Isolate

- `/scans` private dashboard and `/scans/api/*`.
- `job_search_*` migrations, scripts, and fixtures.
- Private matcher/source/tuning docs under `app/scans/`.

These are still useful and may power future public features, but they must remain behind `/scans` until public Saved Jobs, Pursuits, Human Path, and Outreach are rebuilt against public user/profile tables.

### Rebuild In Standalone

- Public landing page and pricing page.
- Public auth routing for no profile, incomplete profile, and complete profile states.
- Saved Jobs and Pursuits.
- Human Path generation and usage metering.
- Outreach generation and usage metering.
- Profile management modal.

### Discard Or Retire

- Old holding-page implementation files already deleted from the original standalone scaffold.
- Lab26 host-routing strategy through `middleware.ts`, once standalone deployment owns the `.com` routes.
- Lab26 public landing/session-churn CSS unless a specific copy or structural idea is explicitly selected and rebuilt in this repo.
- Lab26 experiment metadata conventions for Dumpster Fire.

## Dependency Order

1. Stabilize repo ownership and docs so all future public-app work lands in `dumpster-fire-llc`.
2. Continue public onboarding forms against existing section APIs.
3. Add profile-management UI only after all onboarding-created sections are editable.
4. Add public Saved Jobs/Pursuits after the public profile can become complete.
5. Rebuild Human Path and Outreach against public profile, pursuit, usage-ledger, and contact-message tables.
6. Rebuild public landing/pricing/auth routing when product routes and plan assumptions are stable enough to sell.
7. Retire Lab26 custom-domain routing after standalone parity is deployed and verified on `thejobmarketisadumpsterfire.com`.

## Guardrails For Future Sessions

- Before using Lab26 for reference, write down the specific question being answered.
- Do not copy Lab26 files wholesale into this repo.
- Do not save edits to Lab26 for public-app work.
- Do not let private Randall defaults leak into public profile, matching, outreach, screenshots, fixtures, or public copy.
- Do not let `design-system/` ship accidentally; port deliberate CSS into `app/*` only after design lock.
- Do not run scripts with write/apply behavior without explicit confirmation.
