# Design State — CANONICAL SOURCE OF TRUTH

Date verified: 2026-06-26 (against code, not other docs)
Repo: `dumpster-fire-llc` (canonical; Lab26 is legacy/reference only)

> This file supersedes the design sections of every other doc. If another doc disagrees
> with this one about the **state of the design implementation**, this one is correct
> because it was verified against the actual code. Re-verify the tables below with the
> listed commands before trusting them in a new session — do not re-derive design state
> from `design-implementation-handoff.md`, `restart-handoff.md`, or
> `project-operating-state.md`; those are superseded for design state.

## Why this exists

Prior sessions looped: an agent read a stack of ~22 contradictory docs, could not find a
consistent ground truth, guessed at the design port, was told it failed, wrote a new
"failed pass" doc, and the next session repeated it. Two specific traps caused this:

1. **The docs were stale.** `design-implementation-handoff.md` says "App design
   foundation: NOT started" — but the foundation **is** done in code.
2. **A false premise.** The docs say "port the DS cards ~1:1, they mirror DashboardClient."
   The cards mirror the **private legacy `/scans`** class names (`jobCard`, `matchSection`).
   The **public** app uses entirely different markup (`publicLanding*`). There is no 1:1
   mapping for the public app, so "port 1:1" is impossible and agents freelance.

## Scope (decided by Randall, 2026-06-26)

- The **public app is the only concern.** All public surfaces, including the public
  scan/match experience, must be formatted to the approved designs.
- The private `/scans` app is **not** reskinned. But its DS cards (`match-card`,
  `scan-progress`, `scan-history`, `scan-page`) are the **spec** for the public job/scan/
  match surfaces.

## The reframe (how the port actually works)

DS cards are **visual specifications**, not literal class-name ports for the public app.
To style any public surface, apply to its **own** markup:

1. DS **tokens** — already global in `app/globals.css :root`.
2. DS **base primitives** — `.ds-btn`, `.ds-link`, `.ds-surface`, `.ds-subhead`
   (from `design-system/lib/base.css`).
3. The **visual spec** of the matching DS card (surface color, ink outline, hard offset
   shadow, type, spacing), screenshotted against that card.

The home page (`app/site.module.css`) already follows this pattern (token-driven paper,
zero dark literals). Bring every other public surface to that same standard.

## Verified state (2026-06-26)

### Design system — COMPLETE & COHERENT (`design-system/`)
- `tokens/tokens.css` — full paper-light tokens (paper/ink + tomato/teal/mustard/bluebird/
  rose accents, type scale, spacing, radius, inked borders, grain+fiber texture,
  registration misprint, hard-offset shadows). Accent strategy: teal-forward; tomato =
  primary CTA + destructive only; mustard = new/weird flags only; red + yellow never co-star.
- `lib/base.css` — primitives: `.ds-btn`, `.ds-link`, `.ds-surface`, `.ds-subhead`,
  `.ds-halftone`.
- 20 component cards + `scan-page` pattern. Synced to Claude Design `3af2f1ea`.

### Production — LIVE
`www.thejobmarketisadumpsterfire.com` → HTTP 200 (verified `curl -I`).

### App surfaces
| Surface | File(s) | State | Action |
|---|---|---|---|
| Foundation | `app/globals.css`, `app/layout.tsx` | DS tokens in `:root`, `color-scheme: light`, Bemio/Bebas/Plantagenet/Gotham loaded, grain ground global | **DONE** (font-default correction pending — see below) |
| Home `/` | `app/site.module.css` (`publicLanding*`) | Paper, 0 dark literals, token-driven | **Good**; verify vs hero/header/footer cards |
| Onboarding `/onboarding` | `app/onboarding/onboarding.module.css` | Half-ported: token refs + 17 dark-green literals still live | **In progress** — port off dark literals |
| Dashboard `/dashboard` | `app/dashboard/DashboardClient.tsx` (imports `site.module.css`) | Functional scaffold, ad-hoc styling | Normalize to primitives |
| Public scan/match | not built as public UI | cards exist | Build from `match-card`/`scan-progress`/`scan-history`/`scan-page` |
| Private `/scans` | `app/scans/scans.module.css` | Dark, `.meshBg` active | **Out of scope** (spec source only) |

Re-verify with:
```
grep -cE '#10170f|#162112|#041109|#0a1c10|#f5f0df|#fff7dc' app/onboarding/onboarding.module.css
grep -cE 'var\(--(c-|role-|space-|font-)' app/site.module.css
curl -I https://www.thejobmarketisadumpsterfire.com | head -1
```

## Foundation correction (Step 1)

`globals.css` currently sets `body { font-family: var(--font-body) }` = Plantagenet
**serif** globally. The token system reserves serif for marketing/long-form and `--font-ui`
(Gotham) for dense app UI. App surfaces (dashboard, onboarding forms, scan/match) should
use `--font-ui`; marketing/home keeps the serif. (Confirm the marketing-vs-app split with
Randall per surface.)

## Sequence (live checklist)

- [x] Step 0 — this doc + supersede banners on stale docs. (2026-06-26)
- [x] Step 1 — font split applied at app-surface roots (`--font-ui`); global `body` serif kept for marketing. Onboarding `.page` now uses `--font-ui`.
- [ ] Step 2 — shared public primitives layer (port `base.css`). Deferred: onboarding consumes tokens directly; build the shared layer with the dashboard slice.
- [x] Step 3.1 — onboarding ported. Collapsed THREE conflicting CSS layers (dark original + two paper override layers with `!important`) into ONE clean token layer. 863→594 lines, 0 dark literals, 0 `!important`. Renders identically (preserved the winning cascade). Verified: tsc/lint/test/build all pass.
- [x] Step 3.2 — dashboard DONE (2026-06-30). Full scan-page layout in
  `app/dashboard/{DashboardClient.tsx,dashboard.module.css}` (token-driven, 0 dark literals):
  match-card stack (rank, fit score+stars, meta grid, Responsibilities/Required-experience sub-cards
  with highlights, keyword pills, Save/Open/Pursue) + rating-filter tabs + 300px Overview/Search-
  settings sidebar. Landing-style hero replaced with a lean token top bar (no eyebrow). Edit Career
  Profile modal restyled to the DS modal card (ink-wash overlay, paper dialog + hard offset, printed
  X close, section nav; embeds the already-ported OnboardingClient). Verified via card + harness
  (1120/560/1180). Dead `profileEditor*`/`hero` classes remain in `site.module.css` (home still uses
  the hero ones); harmless.
- [~] Step 3.3 — scan progress DONE (2026-06-30). `scanProgress` overlay on the dashboard Run scan:
  DF-small.gif mascot + teal progress bar + Fetching/Matching/Saving phase bars + complete/error
  states (counts + View matches). Per Randall: generic/estimated progress, NO per-source feed rows
  (the per-user scan matches the shared pool, not a live source fetch), same view for all users.
  Styled from the `scan-progress` card; `public/DF-small.gif` added. Verified via harness.
  scan-history NOT built — it depicts the system-wide source-scan run log (admin/ops), which has no
  per-user data or surface; deferred (not requested for the public dashboard).
- [x] Step 3.4 — home verified (2026-06-30). Live home (dev, screenshotted 1280/480) renders to the
  approved matchbook hero + header nav + feature-list footer: paper stock, printed cover frame,
  off-registration teal+tomato "Dumpster Fire" wordmark, die-cut mascot, STOP APPLYING / START
  PURSUING signs, Request access. No eyebrows, no em dashes, no banned vocab; responsive/clean (the
  apparent 390 overflow was the headless-Chrome sub-~400 min-window crop artifact — clean at 480).
  Finding (NOT changed — protected surface): `app/site.module.css` uses its own `--landing-*`
  palette + a few literals rather than the DS `--c-*` tokens; the visual matches the cards, so
  aligning to DS tokens would be a homepage redesign needing explicit approval, out of a
  verification pass.
- [ ] Step 3.5 — future public pages from tokens + primitives + cards.

Every surface checked at 320 / 375 / 390 / 1280 / 1440 against its DS card: no overflow,
no orphans/widows, no em dashes, full clickable hit areas.

## Design rules (standing)

- **No eyebrow headlines.** Never place a kicker/eyebrow label above a headline on any
  surface. Headlines stand alone. (Randall, 2026-06-26.) Form labels, badges, and nav
  labels are fine — the rule targets the kicker-above-a-title pattern.

## Guardrails

- Do not reskin private `/scans` (`scans.module.css`) — reference only.
- Do not touch protected homepage copy or the production grain (`app/LandingBackground.tsx`).
- Do not resurrect profile export; do not build user-facing tuning UI.
- Public product copy boundary (AGENTS.md): no internal/implementation/provider/roadmap
  language in user-facing copy.
