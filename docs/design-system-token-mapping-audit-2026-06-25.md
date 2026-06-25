# Design System → App Token & Component Mapping Audit

Date: 2026-06-25
Purpose: quantify the gap between the design system (source of truth) and the runtime app, so the reskin is a sequenced port, not a guess.

## Canonical scope (confirmed)

- **Source of truth (tokens + components):** `design-system/` (synced to Claude Design `3af2f1ea`)
- **Runtime target:** `app/*`
- **Private dashboard:** `app/scans/scans.module.css` (3,942 lines)
- **Public app (as built):** `app/site.module.css` (70 lines), `app/onboarding/onboarding.module.css` (418 lines)
- **Lab26 is legacy/reference only.** Never a token source, never matched 1:1, never saved into public-app work.

## Headline findings

1. **The component port is tractable.** 120 of the 269 class names in `scans.module.css` already exist verbatim in the DS cards (the DS was authored to mirror `DashboardClient.tsx`). Those port wholesale: swap the rule body, keep the class name.
2. **The real work is tokens, not structure.** The app is barely token-driven: `scans.module.css` has ~90 color-var usages but **476 raw color literals** (126 hex + 350 rgba). There is almost nothing to "remap" — the values are baked in.
3. **It is a theme conversion, not a value swap.** Current `/scans` is a dark-green shell with cream cards + mustard/mint/coral. The DS is full paper + ink. Grounds invert; every contrast pair must be re-derived.
4. **DS fonts are not loaded.** `app/layout.tsx` loads only Gotham. Bemio / Bebas Neue / Plantagenet Cherokee must be wired via `next/font/local`.
5. **Long tail of 149 uncovered classes** (compiler*, connector*, company*, copy*, detail*, export*, feedback*, tuning*) has no DS card — these need design decisions, not a port.

## 1. Token foundation gap

| Concern | Today | Needed |
|---|---|---|
| DS tokens in app | absent | port `design-system/tokens/tokens.css` into `app/globals.css` `:root` (single source) |
| Token scope | `scans` defines `--mustard`/`--green-900`/`--warm-off-white` inside `.page` | DS tokens are global `:root` |
| Fonts loaded | Gotham only | add Bemio / Bebas / Plantagenet via `next/font/local` |
| Page ground | `.meshBg` (dark green blur) in `DashboardClient.tsx:3105`, `LoginPanel.tsx:38` | paper ground; cards must NOT set `body` background |

## 2. Color mapping (live clusters → DS token)

| Live literals | Role today | DS token | Caveat |
|---|---|---|---|
| `#fffaf0` `#fff7dc` `#efe5bd` | cream card surfaces | `--c-paper` / `--c-paper-deep` | direct |
| `#f4f1ea` `#f5f0df` | warm off-white **text on dark** | `--c-ink` (#241F1A) | **inverts** — was light text, becomes dark |
| `#041109` `#070f0a` `#10170f` `#0a1c10` `#0c2415` `#102d1a` `#162112` | dark-green **grounds** | `--c-paper` (ground) / `--c-ink` (when used as text) | no paper-side equivalent for "dark ground"; this is the inversion zone |
| `#3d2d08` `#3f4f32` `#6e5b2e` `#7a6123` | olive/brown secondary | `--c-ink-soft` / `--c-ink-faint` | re-check contrast on paper |
| `#e5b535` `#c9981f` `#ffd568` `#d5b85a` `#ffe0a2` | mustard/gold | `--c-mustard` (#E0A52F) | consolidate 5 golds → 1 |
| `#78d9a5` `#9fd8b6` | mint accent | `--c-teal` (#1F9E96) | hue + darkness shift |
| `#ff8878` | coral | `--c-tomato` (#E0512E) | direct-ish |
| 350 × `rgba(...)` (mostly green/cream washes) | tints, borders, shadows | `--shadow-card` / `color-mix()` with DS colors / `--role-line*` | **case-by-case, the bulk of the labor** |

## 3. Font mapping

| App var | Today | DS token | Risk |
|---|---|---|---|
| `--font-headline` | Gotham | `--font-display` (Bemio) | low |
| section labels / eyebrows | Gotham caps | `--font-subhead` (Bebas) | low |
| `--font-body` | Gotham (sans) | `--font-body` (Plantagenet, **serif**) | **HIGH** — serif body in a dense data dashboard hurts legibility; see Open Decisions |

Metrics differ between Gotham and Bemio/Bebas — every size/line-height needs a wrapping re-check, not just a family swap.

## 4. Component coverage matrix

| File | Classes | Covered by a DS card | Uncovered |
|---|---|---|---|
| `app/scans/scans.module.css` | 269 | **120 (45%)** | 149 |
| `app/site.module.css` | 7 | built from hero + header + footer cards | landing chrome |
| `app/onboarding/onboarding.module.css` | 41 | 4 (`forms`, `hero`, `page`, `brand`) | 37 |

**Covered, port wholesale (sample):** `card`, `jobCard`/`jobNumber`/`jobTitle`/`jobMetaGrid`, `matchSection*`, `actionRail`/`btnApply`/`btnSave`/`btnSkip`/`btnSource`, `dashboardGrid`/`dashboardSidebar`, `ratingFilter*`, `scanModal`/`scanPhases`/`scanProgress*`, `modal*`, `wizardStep*`, `loginCard`/`loginShell`, `statusBadge`/`scanBadge`/`keywordPill`/`industryTag`/`missingTag`, `configStat*`, `metaLabel`/`metaValue`, `editBtn`, `fitSummary`, `flagRow`.

**Uncovered long tail (need design decisions / new DS cards):** `compiler*`, `connector*`, `company*` (add-company flow), `copy*` (message generation), `detail*`, `export*`, `feedback*`, `tuning*`.

## 5. Recommended port sequence

1. **Foundation (additive, non-destructive):** port `tokens.css` → `globals.css :root`; load DS fonts via `next/font/local`. No visual change yet.
2. **Bridge quick wins:** where the app already uses a var, re-point it to a DS token (`--mustard`→`--c-mustard`, `--warm-off-white`→ context-dependent, `--font-headline`→`--font-display`). Small, low-risk.
3. **Port the 120 covered components, surface by surface,** using each DS card as the spec; screenshot every change against the card. Order: login → hero → match-card → sidebar/panels → badges/forms → modals/wizard → scan progress.
4. **Swap `.meshBg`** for the paper ground last, once surfaces are paper-ready.
5. **Long tail:** decide designs for the 149 uncovered classes (build DS cards first where reused), then port.

## 6. Decisions (LOCKED 2026-06-25)

All design-system styles OVERWRITE the existing app styles. Sole exception: the **production home grain background** is preserved and becomes the global app ground.

1. **Theme:** full paper everywhere (no dark shell). The dark-green grounds invert to paper; warm-off-white text inverts to ink.
2. **Body font (split):** `--font-body` Plantagenet (serif) for marketing/long-form; `--font-ui` sans for the app (dashboard, tables, forms). **App sans = Gotham** (already loaded). Bemio = display, Bebas = subheads/labels.
3. **Page ground:** same grain everywhere — port the production home grain as the global app ground (home, dashboard, onboarding); surfaces opaque on top; never set body/page background on a card.
4. **Accent strategy:** teal-forward. Teal = dominant UI accent (links/active/positive); tomato = primary CTA + destructive only; mustard = new/weird flags only; bluebird sparingly. Red + yellow never co-star.
5. **Uncovered UI:** author DS cards for ALL reused uncovered patterns before porting (compiler, connector, add-company, copy-generation, detail, export, feedback, tuning); true one-offs styled inline from tokens.

## 7. Next build-out (gated on these decisions)

A. **Lock tokens** — done: `--font-ui` added; accent + ground rules documented in `tokens.css`. Sync to Claude Design.
B. **New DS cards** for the reused uncovered families (decision 5): compiler, connector, add-company, copy-generation, detail panel, export, feedback, tuning.
C. **Token + font foundation in app** — port `tokens.css` → `globals.css :root`; load Bemio/Bebas/Plantagenet via `next/font/local` (Gotham already loaded for `--font-ui`); flip `color-scheme` to light; install the grain ground globally.
D. **Port surfaces** against DS cards (login → hero → match-card → sidebar/panels → badges/forms → modals/wizard → scan progress), then the new long-tail cards. Screenshot each against its card.
E. **Remove** `.meshBg` and the old dark literals as each surface lands.
