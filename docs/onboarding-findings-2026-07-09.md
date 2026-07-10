# Onboarding findings — Randall's full pass, 2026-07-09 (evening)

## STATUS UPDATE 2026-07-09 (late session) — decisions locked, backend batch BUILT

Randall's decisions (all explicit, same day):
1. **Target company types: REMOVED** (field, scan usage, DB column). The legacy
   "add a specific company's job board" capability goes to the design batch — the
   ingestion machinery already exists (`job_sources` + connector suite + cron
   `/api/jobs/source-scan`); only a user-facing "add a company board" is missing.
2. **Best role fit: REMOVED entirely** (field, completion gate, matching-scorer
   signal, DB column). Scan/matching role signal comes from Role Tracks
   (names + target titles) — verified at lib/public-jobs/repository.ts.
3. **Do not overclaim: REMOVED entirely** (never requested originally). Types,
   gates, profile.md Guardrails rendering, outreach-prompt enforcement, DB columns.
4. **Work-example tags (#11): SKIP** — the skills↔example linkage already feeds
   tag-like signal into recommendations.
5. **Outreach Rules (#20): CUT from onboarding.** Card, registry entry, and all
   completion gates removed; default house rules now live in the outreach
   generator system prompt. DB tables + section APIs kept for later power-user use.
6. **Leadership Profile (#21): HIDDEN** (registry entry + card removed; backend kept).
7. **Skill completion gate = name + proficiency + evidence** (evidence stays required).
8. **Voice gate: both writing-sample buckets stay required**; a "skip this input"
   checkbox for never-sound is wanted → design batch.

Bug diagnoses (run against Randall's LIVE profile, read-only):
- **#22 (Skills blocked):** his 2 skills both had evidence + proficiency; the only
  failing gates were bestRoleFit/doNotOverclaim → resolved by the removals above.
- **#23 (Voice blocked):** his added snippet SAVED FINE but landed in the
  `want_to_sound` bucket, not `never_sound` — a bucket-labeling/clarity problem,
  not persistence. After this batch his one remaining blocker is a real
  never-sound snippet (or the skip checkbox once designed).

Also shipped in this batch:
- **#3 industries "catalogue is bad" — rediagnosed:** the catalogue is the LinkedIn
  Industry Taxonomy V2 (434 records, includes Hospitals and Health Care etc.). The
  real bug was search matching: "healthcare" couldn't match "Health Care". Fixed with
  space-insensitive matching + label-over-sector ranking in
  lib/public-profile/catalogues/index.ts. Catalogue data unchanged.
- **#2:** Avoid industries now uses the same CataloguePicker as Target industries.
- **#19:** "Sounds like me" writing-sample word cap raised 120 → 200 (sections.ts +
  OnboardingClient; Q1/Q4 answer cap unchanged at 120).
- Migration `20260709000300_drop_overclaim_rolefit_companytypes.sql` written and
  validated on a throwaway local Postgres 16 (clean apply, idempotent, rows intact).
  **NOT applied to prod. Apply only after the code deploy, with Randall's OK,** then
  record it in `supabase_migrations` per docs/database-migration-state.md.
- DS parity: onboarding-sections-rail.html updated (Outreach Rules + Leadership
  rows removed, both copies) and re-synced to the Claude Design project.

### Late-session additions (same day, all SHIPPED — prod HEAD `3196a08`, measured live)
- Randall approved all cards in Claude Design; implemented 1:1: homepage Human Path
  carousel (`components/home-human-path.html`, Patterns group — each slide = the
  Apply Wizard step verbatim), picker custom-add at TOP of the dropdown, DS card
  example text wired as production placeholders (Q1/Q4, writing-sample buckets,
  avoid-note, compensation), sections rail sticks under the sticky header.
- Carousel sizing fix (Randall's 4 findings, verified with headless-Chrome
  measurements at 1440/1280/390/320): uniform slide heights (532px desktop, footer
  pinned), hidden slide radios are position:fixed 1px so tab/arrow clicks never
  scroll the page, arrows exactly 20px below the carousel, section fits one
  viewport (800px @ 1440x900 / 796px @ 1280x800 via scoped 48px section
  padding-top). DS card mirrored + re-synced/registered.
- AGENTS.md gained the "Full Design-Sync Checklist" hard rule (card + manifest +
  register_assets + local design-system/ mirror + sweep all cards showing a
  changed surface).

### Design-batch queue (Claude Design pipeline; nothing built yet)
- #1 industries picker custom-add at TOP of dropdown (own section + divider).
- #5 avoid-companies chip/token feedback + visible saved list.
- #6 Fit Signals copy font/spacing; #7-#10 Work Examples (intro line, formatting,
  button placement next to Save, saved-entry rendering with live titles).
- #12-#15 Skills card (formatting, Add Skill placement, proficiency dropdown
  proportions, rename Evidence → "Metrics / Results").
- #18 "Sounds like me" input margins; DS voice card copy 120 → 200 words.
- Never-sound "skip this input" checkbox (+ backend skip flag designed with it).
- Writing-sample bucket labeling clarity (root cause of bug #23).
- "Add a company's job board" to the scan (user-facing add over existing
  `job_sources` ingestion; port legacy URL→board-token resolution).
- **Homepage Human Path carousel parity (Randall, 2026-07-09):** the marketing
  slideshow (`humanPathSlides` in app/page.tsx, 4 slides: Review role / Contacts /
  Outreach / Tracking) is outdated and was never designed. Redesign it to mirror
  the ACTUAL shipped Human Path experience (match review → contact discovery →
  outreach draft → pursuit tracking). Homepage = protected surface; goes through
  Claude Design like the rest of the batch.
- Sections-rail DS card still shows "Role Tracks" + "Resume Uploads" as separate
  rows (pre-dates merged Card 1) — reconcile when the rail is next touched.
- #20/#21 successor decisions (what, if anything, replaces Outreach Rules/
  Leadership Profile as user-facing surfaces) remain open product questions.

Original findings follow, unedited.


Recorded verbatim-in-substance from Randall's live walkthrough after the Phase C ship.
**No action taken this session (out of context).** This is the START HERE input for the
next session's planning pass. The outreach ingest test is PAUSED at the section-fill
step until these are addressed — do not run regenerate/contact-discovery/outreach yet.

Tags: **[design]** needs the Claude Design pipeline (card first, approval there, then 1:1);
**[backend]** code/data change, no design gate; **[bug]** shipped behavior is wrong;
**[product]** decision needed from Randall before any build.

## Identity & Search

1. **[design] Industries picker — custom-add placement.** When the typed text isn't in
   the list, the "add your own" option must appear at the TOP of the dropdown in its own
   section, then a divider, then suggested matches. Today it renders at the bottom —
   users don't discover that adding is possible without scrolling.
2. **[backend] Avoid industries should use the same pre-populated picker** (type-ahead +
   catalogue + custom add) that Target industries has. Today it's a bare comma-list input.
3. **[backend] The industries catalogue is bad.** It doesn't even include "healthcare".
   Regenerate/replace the catalogue source (scripts/generate-public-profile-industries-
   catalogue.mjs) with a credible taxonomy.
4. **[product] "Target company types" — questionable field.** Randall doubts users have
   a clear picture, or that it's relevant. What it's actually plugged into (verified
   2026-07-09): it feeds the job-scan keyword list (lib/public-jobs/repository.ts →
   scanParametersForAggregate) alongside role-track names/titles and target industries;
   it has NO matching scorer and was removed from profile.md on 2026-07-09. So its only
   effect is scan-keyword matching. Candidate for removal — Randall to decide.
5. **[design][bug] Avoid companies has no feedback.** Unclear whether to add one at a
   time (do chips appear?), several with commas, where the saved list is visible for
   future editing, and whether this surface is where it gets edited. Needs a designed
   interaction (likely the same token/chip picker pattern) — "this needs a fix."

## Fit Signals card

6. **[design] Paragraph copy has inconsistent fonts and line spacing.** Fix.

## Work Examples card

7. **[design] Needs an intro line:** "Add examples of your work that are worth
   mentioning to hiring managers."
8. **[design] Paragraph copy is a mess; formatting is a mess.**
9. **[design] "Add Work Example" button placement is random.** It should sit in the same
   horizontal grid as "Save Work Examples" (pattern: new-input controls live at the
   bottom next to Save, because that's where the new input generates).
10. **[design] Saved examples should render as entries.** Saving a work example creates
    an "entry" (title + one-hitter) inside the card and prompts another input. The
    "Example 1" label should update live as the Title is typed/saved.
11. **[product][backend] Tagging structure for matching.** Add tags per example (e.g.
    AI, Experiential, website, web3) IF it makes matching higher quality — the tag pulls
    the right example into the right context. Evaluate against the matching engine
    (scoreWorkExampleFit) before building.

## Skills card

12. **[design] Same font/formatting issues as the other cards.**
13. **[design] "Add Skill" button placement** — same rule as #9: bottom, next to Save.
14. **[design] Proficiency dropdown is weirdly proportioned — too tall.**
15. **[design] Rename "Evidence" → "Metrics / Results".**
16. **[product] "Best role fit" — is it relevant?** Randall thinks not; wants to be told
    if he's wrong. Next session: check what skills[].bestRoleFit/role-fit data feeds
    (matching? outreach recommendations?) and answer with evidence before removing.
17. **[product] "Do not overclaim" — do we need it from users?** Randall doubts we need
    to guard this. Note: doNotOverclaim lines are rendered into profile.md Guardrails
    and the outreach system prompt explicitly enforces them ("Respect every
    do-not-overclaim line"). Removing the user-facing field ≠ removing the guardrail
    concept — decide what, if anything, replaces it.

## Voice & Personality card

18. **[design] "Sounds like me" input margins** — copy extends too far right and crowds
    the "Add a snippet" button.
19. **[product→backend] "Sounds like me" word count: raise to 200 max** (currently 120).
    Word-limit constants + quality validation + DS card copy all reference 120.

## Sections that don't make sense as shown

20. **[product] Outreach Rules — "I have no idea what this is or where it came from."**
    The card fails to explain itself. Either redesign with real explanation or rethink
    the section. (It came from the legacy 14-section IA; per-track approach questions.)
21. **[product] Leadership Profile also doesn't make sense as shown.**

## Readiness/blocker bugs (both reproduced on Randall's live profile)

22. **[bug] Skills: 2 skills entered, still listed as a blocker** in the sections rail.
23. **[bug] Voice & Personality: everything filled in, still listed as blocked.**
    For both: start at lib/public-profile/profile-quality.ts (what counts a section
    complete) vs what the UI actually saves — likely the quality evaluator requires
    fields the card doesn't clearly demand (e.g. writing-sample buckets, per-skill
    evidence), or a save didn't persist what the UI displays. Diagnose with his real
    profile data before touching code.

## Next-session protocol reminders

- Design items go through Claude Design (ground → build INTO the project → Randall
  approves THERE → implement 1:1). Product items need Randall's decision first.
- Bugs #22/#23 are diagnosable immediately (no design gate) — likely first work item.
- Outreach ingest test resumes only after Randall says the sections are in good enough
  shape: regenerate → contact discovery (Hinge Health posting:
  https://jobs.ashbyhq.com/hinge-health/c9c6716f-1f34-47b5-8986-efeea2b2be61/application)
  → outreach. Résumés already ingested (Program Manager + Executive Producer tracks).
- Old Anthropic/OpenAI API keys: revocation in both consoles still pending on Randall.
