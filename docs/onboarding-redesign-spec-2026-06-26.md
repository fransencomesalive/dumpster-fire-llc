# Onboarding Redesign Spec

Date: 2026-06-26
Repo: `dumpster-fire-llc`
Status: **AWAITING APPROVAL — no code changed yet.**
Source: Randall's localhost:3020 onboarding review (2026-06-26).

This is the approved-spec-first artifact for the onboarding IA/UX redesign. Nothing here is
implemented. Each numbered item is a discrete change. Implementation happens in the slices in
§9 only after Randall signs off, one slice at a time.

> **SUPERSEDED for input architecture — see `docs/generator-and-inputs-design-2026-06-26.md`
> (canonical).** As of the 2026-06-26 generator design session, the legacy 14 sections collapse
> to ~7, and the personality cluster (Why People Hire Me, Operating Style, Communication Style,
> Writing Samples, AI Misreadings) collapses into one **Voice & Personality** section with just
> **two questions (Q1 value, Q4 opinion-hook)** + writing samples + tone tags. This overrides §4
> and §5 below (including "keep all six WPHM questions" / D5) and the quality-narrative pattern.
> §1-§3 (header, sign-in, Identity field changes, terminology) and Slice 1 still stand.

## 0. Decisions already made (this session)

- **Scope is global** for the two terminology fixes (beta + Human Path): editing the
  protected homepage (`app/page.tsx`) and layout metadata (`app/layout.tsx`) is explicitly
  authorized for this pass. All other changes stay inside onboarding.
- **Human Path = the pursuit process. Outreach is one step *within* Human Path.** They are not
  siblings and not synonyms.
- Catalogue sources to be **researched and proposed** (done — see §7). **All three approved.**
- **Spec-first**, then sliced implementation.

Resolved after first review (2026-06-26):
- **D2:** quality-UX fix (remove checkbox + notes-textarea) applies to the **whole**
  quality-narrative pattern, not just Why People Hire Me.
- **D3:** Proof Library → **full end-to-end rename** (key, route, DB column, not label-only).
- **D5:** **Keep all six** Why-People-Hire-Me questions.
- **D6:** **All three** data sources approved.

New standing rules (Randall, 2026-06-26 second review):
- **Not a beta, not a phased rollout.** The Access section is a **pricing structure** with three
  ascending tiers: **Good / Gooder / Goodest**. No "beta", "rollout", "open now", "limited",
  "coming soon" framing anywhere.
- **Eliminate "proof" vocabulary** in all user-facing copy. The concept is **work examples /
  portfolio**. (Internal `proof*` identifiers/route/DB are renamed in the Work Examples slice.)
- **No "improve the profile / improve matching" framing.** Matches are *rated by the system* to
  provide better matching; the user maintains the profile, they do not improve matching.
- **D1: RESOLVED** — pricing tiers above; the rollout announcement paragraph was removed.
- Still open: **D4** (drop removed columns now via migration vs. leave orphaned).

## 1. Terminology corrections (global)

### 1a. Human Path vs outreach
Current copy repeatedly lists them as parallel siblings, e.g. "matching, Human Path, and
outreach." That is wrong: outreach lives inside Human Path. Fix everywhere:

- `app/layout.tsx:46`, `:52` (site metadata)
- `app/page.tsx:41`, `:222`, `:305` (and the Human Path feature section `:113-305`)
- `app/onboarding/page.tsx:31`
- `app/onboarding/OnboardingClient.tsx:245`
- `app/dashboard/DashboardClient.tsx:306`

Replacement principle (exact strings drafted at implementation): present Human Path as the
pursuit process; outreach as a step inside it (alongside contact research/sourcing). Do not
delete the Human Path feature section; correct its framing.

### 1b. Remove all "beta"
- `app/page.tsx:121` ("Available in beta"), `:126` ("Limited beta"), `:131` ("Next beta
  area"), `:325` ("open for beta users…")
- `app/onboarding/OnboardingClient.tsx:1282` ("Sign in with your beta account…")
- Replace pricing/availability copy with non-beta language (exact wording drafted at
  implementation; pricing labels need Randall's final words since they are public product copy).

### 1c. "Improve the matching, not the profile"
- `app/onboarding/page.tsx:31-32`: "keep improving the profile" → reframe so the user improves
  **matching** (the profile is the input; matching is what gets better).

## 2. Header & sign-in card — `app/onboarding/page.tsx`

- **Persistent header.** Make the existing nav (`:17-24`) sticky; keep brand + home link.
  Do not remove nav.
- **Sign-in card is incomplete and the copy is wrong.** Current card (`:44-50`) shows
  "Profile Completion / Sign in / Required sections: N. Completion status appears after you
  sign in." The "Required sections" line makes no sense to a signed-out user.
  - Replace with a complete, legible sign-in card.
  - **Sign in must be a real button**, not the static text at `:46`.
  - Card states: signed-out (prompt + Sign in button) and signed-in (actual completion status).
- Remove the eyebrow label `statusLabel` "Profile Completion" above the value if it reads as a
  kicker (no-eyebrow rule). Card title stands alone.

## 3. Identity & Search fields

Data model: `lib/public-profile/types.ts` + `lib/public-profile/sections.ts:38-50`,
UI: `OnboardingClient.tsx` identity form, validation: `sections.ts:445-456` +
`section-service.ts`, persistence + API route `app/api/public-profile/identity-search`.

| # | Field | Change |
|---|---|---|
| 3a | Location | Single text → **dropdown/autocomplete**, pre-populated, **North America only** (US/CA/MX). Used for matching. Source §7c. |
| 3b | Work authorization (`workAuthorization`) | **Remove** from model, UI, validation, persistence, markdown generation. |
| 3c | Availability (`availability`) | **Remove** (same surfaces as 3b). |
| 3d | Target comp | **Range: two fields, min → preferred.** Model already has `targetCompensationMin` + `targetCompensationPreferred` (`sections.ts:45-46`); UI must expose both as a labeled min→preferred range. |
| 3e | Employment types (`employmentTypes`) | Multi-select checkbox grid → **dropdown** (multi-select). Enum: `full_time \| contract \| freelance \| part_time` (`types.ts:3`). |
| 3f | Target industries (`targetIndustries` / `avoidIndustries`) | Free text → **catalogue picker**. Source §7b. |

Removing `workAuthorization` and `availability` touches: `types.ts`, `sections.ts` (type,
empty defaults `:676`, mapper `:690-702`, allowlist `:445-456`), `section-service.ts`,
repository/persistence, `profile-markdown.ts`, profile-quality completion rules, the DB
columns, and identity-search fixtures/tests. This is a real schema change, not UI-only.

## 4. Section information architecture

### 4a. Remove Work History as an input
`workHistory` section (`onboarding.ts:43-48`). Per prior documentation, work history is
**never** a direct input — everything is pulled from uploaded resumes. Remove the
`workHistory` onboarding section and its editable UI. Resume parsing (separate, still-pending
provider decision) becomes the source of experience data. Keep/relocate any downstream
consumers that read parsed experience so nothing references a removed section.

### 4b. Rename "Proof Library" → "Work Examples / Portfolio"
`proofLibrary` section (`onboarding.ts:49-54`).
- Rename the user-facing label and key-facing copy.
- Add an **explanation of what to put in**.
- **Text only.** Used solely as context for outreach-message generation. Remove any non-text
  (attachment/object) affordances from this section's UI.
- **DECIDED (D3): full end-to-end rename** — key, API route, DB column, type, fixtures all move
  from `proofLibrary` → `workExamples` (final internal name TBD at implementation). Requires a
  DB migration.

### 4c. Role Tracks explanation
`roleTracks` (`onboarding.ts:31-36`). Add a plain-language explanation visible to **all users**
of what a Role Track is and why it matters, before the editor.

### 4d. Skills autocomplete
`skills` section. Skill input gains **type-ahead suggestions** from a real catalogue (§7a) as
the user types. Free-entry still allowed; suggestions reduce junk + improve matching.

## 5. Why People Hire Me (and the quality-narrative pattern)

Renders via `renderQualityNarrativeCard` (`OnboardingClient.tsx:1200-1244`) and
`renderQualityFields` (`:1246-1274`). Six questions (`:258-265`):
problems people bring me · what breaks if I'm not there · messes I clean up · teams that
benefit from me · situations where I'm most useful · situations where I'm not useful.

- **Remove the "Complete" checkbox** (`:1220-1227`, `:1257-1264`). It is user self-grading of
  `field.quality`. Bad paradigm — **just save**. Quality is assessed server-side (the
  `profile-quality` engine already computes `weakResponseCount`); the user should not toggle it.
- **"Notes for improvement" must not be a text input.** Today it is a second editable
  `textarea` bound to `field.feedback` (`:1231`, `:1268`). Replace with **short, approved,
  static helper lines** (system microcopy), not a user field. Open question: drop `field.feedback`
  from the user surface entirely vs. keep it server-side only (recommend remove from UI; keep
  column unused or migrate out later).
- Remove the "Editable Section" eyebrow (`:1211`) per the no-eyebrow rule.
- This card pattern is shared by operating style, decision style, communication style, writing
  samples, AI misreadings, outreach rules, leadership profile. **DECIDED (D2): apply the
  checkbox/notes change to the whole pattern.**

### 5e. Justification audit (per Randall's request)
Why each Why-People-Hire-Me question earns its place for **outreach-message generation**:

| Question | Outreach value |
|---|---|
| Problems people bring me | The differentiated value prop an outreach message leads with. |
| What breaks if I'm not there | Impact framing — concrete stakes, not generic adjectives. |
| Messes I clean up | Specific pain-point hooks tied to a target company's situation. |
| Teams that benefit from me | Audience targeting — who the message should address. |
| Situations where I'm most useful | Role-fit signal + the angle the message should take. |
| Situations where I'm not useful | Honesty guardrail; stops the generator overclaiming. |

**Conclusion:** keep all six — each yields specific, non-generic input the outreach generator
can't synthesize from a resume. The problem Randall is reacting to is the **input UX** (self-
grading checkbox + a second textarea that looks like more homework), not the questions. Fixing
§5 above resolves it. If Randall still wants cuts, the weakest-standalone is "teams that
benefit from me" (partially derivable from Role Tracks) — flag, don't cut without approval.

## 6. Standing no-eyebrow violations found (fix as part of this pass)
- `app/onboarding/page.tsx` statusLabel above card value.
- `OnboardingClient.tsx:1211` "Editable Section" above each quality card title.
- (Dashboard eyebrows already logged in the Step 3.2 dashboard proposal.)

## 7. Data sources (researched — for approval)

### 7a. Skills — Lightcast Open Skills
34,000+ skills, free with registration, open/transparent taxonomy, API + bulk export, refreshed
biweekly. Pull a snapshot into our own table for type-ahead (don't hard-depend on their API at
runtime). Fallback: O*NET (public domain, coarser).

### 7b. Industries — LinkedIn Industry Taxonomy V2
434 industries, NAICS-aligned, 20 sectors, published free on Microsoft Learn. Familiar to job
seekers. Curate to a usable subset for the picker. Official fallback: NAICS.

### 7c. Location (NA) — GeoNames
Free, CC-BY 4.0. Filter `cities15000` to US/CA/MX → clean metro-level autocomplete set we host
ourselves. Attribution required (CC-BY).

All three: snapshot into our own data, no hard runtime dependency on a third party.

## 8. Backend / data-model impact (not UI-only)
Changes in §3 and §4a touch, at minimum: `types.ts`, `sections.ts`, `section-service.ts`,
repository/persistence, `profile-markdown.ts`, `profile-quality.ts`, the onboarding section
manifest, the relevant `app/api/public-profile/*` routes, DB columns/migrations, and the
fixture/test scripts. Each slice must keep `npm run build` / `tsc` / lint / `test:public-jobs`
green and binary `complete`/`incomplete` profile status intact.

## 9. Proposed implementation slices (each approved + reviewed separately)
1. **Terminology + beta + matching copy** (global, copy-only). Lowest risk. **DONE 2026-06-26** —
   tsc/lint/build green; beta refs = 0; no Human-Path/outreach sibling lists; no em dashes.
   Beta-replacement strings are **drafts pending Randall's final wording (D1)**.
2. **Header persistent + sign-in card/button** (onboarding layout + auth UI).
3. **Identity & Search field changes** (remove work-auth/availability, comp range, employment
   dropdown) — schema + UI + tests.
4. **Catalogues**: import Skills / Industries / Location data; wire pickers + autocomplete.
5. **IA**: remove Work History; rename Proof Library → Work Examples (label-only); Role Tracks
   explanation.
6. **Quality-narrative UX**: remove checkbox + notes-textarea across the shared pattern;
   approved helper lines; remove eyebrows.

## 10. Decisions
- D1: **OPEN** — exact new pricing/availability copy to replace the beta labels (public product
  copy; Randall to provide the strings).
- D2: **RESOLVED** — whole quality-narrative pattern.
- D3: **RESOLVED** — full end-to-end Proof Library → Work Examples rename.
- D4: **OPEN** — drop removed columns now via migration vs. leave orphaned for later cleanup.
- D5: **RESOLVED** — keep all six WPHM questions.
- D6: **RESOLVED** — all three data sources approved.
