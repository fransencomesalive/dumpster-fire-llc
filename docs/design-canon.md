# Dumpster Fire — Design Canon

**This is the single authoritative design reference.** It documents the system *as it
already exists* in `design-system/tokens/tokens.css` and `app/ds.css`. It does not invent a
new design language; it makes the existing one impossible to pass over.

A pre-edit hook points here whenever a design-bearing file is touched. When you see that
reminder: read the relevant section of this file **before** writing the change, not after.

If a decision is not covered here and not shown in an approved Claude Design card: **STOP and
ask Randall.** Do not fill the gap with judgment. Inventing a "reasonable" answer is the most
expensive failure this project has.

---

## 0. The non-negotiables (scan this every time)

1. **Tokens only. Never a raw value.** No hex colors, no px font sizes, no ad-hoc spacing,
   no hand-rolled shadows. Every color/size/space/shadow comes from a `var(--…)` token
   defined in `tokens.css`. If the value you need is not a token, that is a signal to STOP,
   not to hardcode.
2. **Never introduce a new color.** The palette is closed (Section 1). No new hex, no new
   `color-mix()` tint, no new accent. If a state seems to need a color that does not exist,
   STOP and flag it — do not create one.
3. **Never introduce a new element, card, panel, or interaction pattern** that is not in this
   canon or an approved Claude Design card. If you believe one is genuinely needed, STOP,
   name it explicitly, and get Randall's approval before building it. Silently adding it is
   the failure that causes the most rounds of rework.
4. **Never shift a paradigm.** If the system already solves something one way (hover, selected
   state, list input, elevation), use that way. Do not introduce a second way of doing the
   same thing.
5. **Reuse before you build.** Before writing any CSS, check for an existing `ds-*` class
   (Section 5) or module class that already does it. Composition over new CSS.
6. **No banned patterns** (Section 7): no teal-tint paper hover, no halftone/dot backgrounds,
   no eyebrow/kicker headlines, no em dashes in product copy.
7. **Grid discipline** (Section 4): every margin, padding, and gap is a `--space-*` step.
   Nothing is off the 4px grid.
8. **Design work is created in Claude Design, not in live files** (Section 9). Live CSS/TSX is
   only ever the *implementation* of an already-approved card.
9. **Nothing reaches Randall until it clears the Definition of Ready** (Section 10).

---

## 1. Color — the palette is closed

Every color is one of these tokens. There are no others. Never write a raw hex, never invent
a `color-mix()` tint as a new color.

### Core palette
| Token | Hex | Role |
|---|---|---|
| `--c-paper` | `#F3E8D2` | page ground |
| `--c-paper-deep` | `#EAD9BC` | card paper surface |
| `--c-paper-edge` | `#DFC9A6` | hairline / paper shadow |
| `--c-ink` | `#241F1A` | primary text + all outlines |
| `--c-ink-soft` | `#4A4038` | secondary text |
| `--c-ink-faint` | `#8A7B6A` | tertiary / captions / placeholder |
| `--c-tomato` | `#E0512E` | negative / destructive **only** (Skip, remove, Not a match) |
| `--c-teal` | `#1F9E96` | affirmative / proceed CTA + links / active / positive / done states (Saved, Skipped) |
| `--c-mustard` | `#E0A52F` | Save + utility actions (Save, View Saved Pursuits, Edit, Open-posting underline) + "new / weird" flags |
| `--c-bluebird` | `#2A6AA0` | deep cool, used sparingly (button hover, applied badge) |
| `--c-rose` | `#E2998C` | soft secondary, rare |

### Semantic roles (prefer these over core tokens in components)
`--role-bg` `--role-surface` `--role-text` `--role-text-muted` `--role-text-faint`
`--role-line` `--role-line-soft` `--role-action` (teal) `--role-action-text`
`--role-accent` (teal) `--role-highlight` (mustard) `--role-info` (bluebird)
`--role-positive` (teal) `--role-attention` (mustard) `--role-critical` (tomato).

### Color meaning (this is semantic, not decorative) — action roles updated Randall 2026-07-23
- **Teal = affirmative / proceed / positive / on / selected / done.** Every proceed CTA
  (Pursue, Run scan, Resume, Add, primary CTAs) is teal, and every "done" state is teal:
  Saved AND Skipped both render as solid teal fill + white checkmark, identically. `--role-action`
  is teal.
- **Tomato = negative / destructive ONLY** (Skip, remove-X, Not a match). Never a proceed CTA,
  never a generic accent.
- **Mustard = Save + utility actions** (the Save button, View Saved Pursuits, all Edit buttons)
  plus "new / weird" flags. Solid mustard fill carries ink text (not paper).
- **Open posting = ink text with a mustard underline** — never mustard text (fails contrast on
  cream), never a turquoise/teal tint, never a ghost button. Hit area padded to full font height.
- **The old "red + yellow never co-star" rule is RETIRED (Randall 2026-07-23).** By direction,
  solid mustard Save sits directly beside tomato Skip in the action row.
- **Bluebird = sparingly** (e.g. the `applied` badge).

For auth/nav specifically: primary CTAs are **teal** (positive), not tomato.

---

## 2. Type

| Token | Value | Use |
|---|---|---|
| `--font-display` | Bemio | headlines + buttons |
| `--font-subhead` | Bebas Neue | condensed all-caps subheads, tracked |
| `--font-body` | Plantagenet Cherokee (serif) | marketing / long-form |
| `--font-ui` | Gotham (via next/font) | app / dense UI / forms / tables |

Sizes: `--type-display` `--type-h1` `--type-h2` `--type-subhead` `--type-body` `--type-small`
`--type-caption`. Tracking: `--tracking-subhead` (0.06em, Bebas needs air),
`--tracking-display`. Leading: `--leading-tight`, `--leading-body`.

- Bebas subheads are **uppercase + tracked**. Never set Bebas tight.
- next/font `.variable` classes must live on `<html>`, never `<body>`, or every custom font
  silently falls back. (See memory: font-tokens-require-html-scope.)
- Prefer the `ds-display / ds-h1 / ds-h2 / ds-subhead / ds-body / ds-lede` classes over
  re-declaring font-family + size.

---

## 3. Elevation, borders, radius

- **Elevation is printed, not glowy.** `--shadow-card` = `3px 3px 0 var(--c-ink)` (hard offset
  block). Soft variant `--shadow-card-soft` exists but the hard block is the house style. Never
  add a blurry drop shadow or glow.
- **Borders are inked.** `--line-hair` (1px), `--line-reg` (2px, default outline), `--line-bold`
  (3px, heavy screenprint weight). Outlines are `var(--c-ink)`.
- **Radius:** `--radius-sm` (4) `--radius-md` (8) `--radius-lg` (14) `--radius-pill` (999).
- **Registration misprint** is the signature move: `--reg-shadow` (text/links) and `--reg-box`
  (filled surfaces) offset one semi-transparent ink plate top-left. This is how things "lift,"
  not opacity or glow.

---

## 4. Spacing & grid — 4px base, no exceptions

Every margin, padding, gap, and offset is a spacing token. Nothing off-grid.

`--space-1` 4 · `--space-2` 8 · `--space-3` 12 · `--space-4` 16 · `--space-5` 24 ·
`--space-6` 32 · `--space-7` 48 · `--space-8` 64 · `--space-9` 96.

- Never write `padding: 10px` or `margin: 15px`. Round to the nearest step and use the token.
- Card default padding is `--space-5`. Panel header gap is `--space-4`. Match neighbors.
- Responsive: verify at 320 / 375 / 390 (mobile) and 1280 / 1440 (desktop). No horizontal
  overflow; no orphaned single words; full clickable bounding box on interactive elements.

---

## 5. Component vocabulary — reuse these, do not re-roll them

`app/ds.css` defines global classes. Compose these before writing new CSS:

- **Type:** `ds-display` `ds-h1` `ds-h2` `ds-subhead` `ds-body` `ds-lede`
- **Surface/texture:** `ds-surface` (fiber + grain), `ds-card` (paper-deep card w/ ink border +
  hard shadow), `ds-panel-header` `ds-panel-title` `ds-panel-body`
- **Buttons:** `ds-btn` (teal proceed primary), `ds-btn-ghost` (paper + ink outline), `ds-btn-sm`.
  Save = mustard fill + ink text; Skip / destructive = tomato; done states (Saved/Skipped) = teal + check.
- **Links:** `ds-link` (teal underline with registration-slip on hover); Open-posting links use an ink-text + mustard-underline variant
- **Forms:** wrap in `ds-form`; `ds-label` `ds-field` `ds-field-select`; teal focus ring is
  built in. `ds-filter-row` / `ds-filter-tab` for segmented tabs.
- **Badges/tags:** `ds-badge` + modifiers (`--saved` teal, `--applied` bluebird, `--new`
  mustard, `--skipped` teal + check (matches saved), `--scan` teal, `--warn` mustard, `--alert` tomato). Also
  `ds-keyword` `ds-industry` `ds-missing`.
- **Callouts:** `ds-callout` (tomato left border), `ds-callout--positive` (teal).

If none fits, that is a STOP-and-flag moment, not a build-a-new-one moment.

### List-like inputs (fixed interaction contract)
- Short values (titles, companies, tags, industries) = **token/chip input** (chips above the
  field; Enter/comma/blur commit; comma splits; × removes; case-insensitive dedupe).
- Prose entries (fit signals, skill evidence) = **newline-separated textarea**, one per line.
  Never split prose on commas.
- Single-value action inputs (paste-a-URL + Add) = input + button; Enter commits.
- Instructional copy must state the gesture. Never a fourth pattern.

---

## 6. Texture

- The **grain background is the global app ground** (home, dashboard, onboarding). Surfaces sit
  opaque on top. Cards must never set their own page/body background.
- `--grain-img` multiply-blends over saturated fills (buttons, badges) for printed ink.
  `--fiber-img` scatters paper strands. Use `ds-surface` / `ds-card` which already composite
  these; do not hand-roll the blend.

---

## 7. Banned — do not add these, and remove on sight

- **Teal-tint paper hover.** `color-mix(in srgb, var(--c-teal) N%, var(--c-paper))` (14/12/8%)
  as a **hover background** is banned everywhere. It reads as filler and was never approved.
  For hover, use the real vocabulary: `--reg-box` lift, a hard `2px 2px 0 var(--c-ink)` offset,
  or the `ds-link` teal-underline slip. (Teal as a **fill** for selected/saved is fine; teal
  focus **rings** are fine. The banned thing is the pale teal hover *background* on paper.)
- **Halftone / dot-pattern backgrounds.** Rejected for all new work. Old DS cards may still
  carry it — strip it when deriving from them.
- **Eyebrow / kicker headlines** (small tracked label above a title). The headline stands
  alone. (Component labels — form labels, badges, nav — are fine.)
- **Em dashes in product copy** and in any generated message. Use commas, parentheses,
  semicolons, colons, or a new sentence.
- **Server-level gates / access locks** without Randall's explicit per-gate approval.

---

## 8. Design System ↔ production parity

The `design-system/` cards and the live surfaces are two views of one design. A change to a
shared component (footer, header, nav, cards, buttons, form controls, tokens) lands in **both**
the DS card and the live surface in the same pass, or it is not done. When one side is fixed and
the other is stale, reconciling them IS the fix.

---

## 9. Claude Design is where design is *created*

Live CSS/TSX is only ever the implementation of an already-approved card. You do not invent
design in `.module.css` + a localhost screenshot. The pipeline:

1. DesignSync authorized? If not, ask Randall to run `/design-login` and **wait**.
2. Ground via `DesignSync get_file` on the **project** (id `3af2f1ea-428c-49b3-8b02-c066ec0c7452`),
   not local files — read the project's tokens/primitives/sibling cards.
3. Build the card **into** the Claude Design project (`finalize_plan` → `write_files`).
4. Randall approves **in Claude Design** (never a chat plan of local paths, never a localhost
   preview).
5. Only then implement 1:1 in live code, and mirror the card into local `design-system/`.

**Full sync for every card change** (including parity edits): update card HTML (keep the
`<!-- @dsCard … -->` marker) → ensure/add its entry in `_ds_manifest.json` and push the
manifest → `register_assets` for every touched card → mirror into local `design-system/` and
commit. A new card needs a manifest entry or the pane never indexes it; verify via
`DesignSync get_file _ds_manifest.json` before telling Randall to look. When a product change
ships, sweep **all** cards showing that surface.

A blocked gate (unauthorized DesignSync, missing approval) is a **FULL STOP**: report and wait.
Never reinterpret the block into something you can do autonomously.

---

## 10. Definition of Ready — nothing reaches Randall until all true

Too many review rounds happen because half-finished work is handed over. Before showing
Randall any UI change, every item must pass:

1. **Tokens only** — no raw hex, px type, ad-hoc spacing, or hand-rolled shadows.
2. **No new color / element / pattern** — or, if one is genuinely needed, it is explicitly
   called out for his decision, not silently included.
3. **On grid** — every space value is a `--space-*` step.
4. **Reused, not re-rolled** — existing `ds-*` / module classes used where they fit.
5. **No banned patterns** (Section 7).
6. **Responsive** — verified at 320/375/390 and 1280/1440; no overflow, no orphans, full
   clickable hit areas.
7. **DS ↔ prod parity** — the DS card and live surface match.
8. **Approved source identified** — the exact Claude Design card this implements is named; if
   none exists, this is a STOP, not a build.

If any item fails, keep working. Do not hand over a half-fix and do not narrate it as done.
