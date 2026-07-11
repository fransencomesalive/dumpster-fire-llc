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
  `job_sources` ingestion; port legacy URL→board-token resolution from
  `app/scans/board-registry.ts` `resolveBoardFromUrl`). **Decision (Randall,
  2026-07-10): prod `job_sources` gets a clean-slate reset WHEN this feature
  ships — not before** (scope of the reset decided at ship time; note that
  deleting `jobs` rows cascades to saved_jobs/job_scan_results/pursuits).

### Scan-batch IMPLEMENTED 2026-07-10 (commit `d4e662b`, committed on main)

All five deliverables from the approved cards built 1:1 in production (plan:
~/.claude/plans/binary-munching-rossum.md; validation: tsc/lint/build/test:public-jobs
all green, headless no-overflow at 320/375/390/1280/1440 on / /onboarding /dashboard):

1. Card 1 job-title chips (OnboardingClient + onboarding.module.css `.titleTokens`/
   `.titleToken`): Enter/blur commits, × removes; saved tracks persist immediately
   (whole-array role-tracks PATCH), new tracks carry a draft list into Save;
   create-new-track pre-fills from the active track (duplicate-and-edit).
2. "Job titles in this scan" sidebar card between Overview and Search settings —
   NEW `summary.titleParameters` (track names + target titles, no industries).
3. Skip: `dismissed` status + POST /api/jobs/skip + RESURRECTION GUARD (the scan's
   merge-duplicates upsert force-sets status active, so dismissed job ids are
   excluded from the candidate set — covered by a re-scan test). One-click, no
   confirm, no un-skip (per design). Note: skipping a saved job removes it from
   the Saved view too (saved list derives from active results).
4. Private boards: `owner_user_id` on job_sources (NULL = global), owner-scoped
   uniqueness, resolveBoardFromUrl ported to lib/scan/sources/board-registry.ts,
   GET/POST/DELETE /api/jobs/boards (add = resolve → live-verify fetch → insert →
   immediate ingest; cap 15/user), Run scan live-fetches the user's boards
   (6/scan LRU rotation, concurrency 3, isolated failures, board rows unioned into
   the candidate set), scan route maxDuration 60. Daily cron picks up user boards
   automatically (revert lever: owner_user_id=is.null filter in loadActiveJobSources).
5. Rating tiles condensed to approved values (gap 3px, 6px vertical padding, roles
   0.82rem — prod had drifted on padding too).

REMAINING GATES (exact steps in docs/database-migration-state.md "NOT yet applied"):
- Push + Vercel deploy verify, then apply migrations 20260710000100 + 20260710000200
  with Randall's OK (20260709000300 was ALREADY applied 2026-07-09 — the "not
  applied" note earlier in this doc is superseded).
- Authed visual pass on Card 1 chips + both sidebar cards (new UI is behind auth;
  CSS is a verbatim port of the measured DS cards).
- Skip + add-a-board E2E after migrations (until then both fail gracefully).
- job_sources clean-slate reset: separate decision at apply time.

### Input normalization SHIPPED 2026-07-10 (approved strategy, same day)

Randall's comma-chip finding on Card 1 titles triggered a full list-input audit +
approved normalization (strategy + audit table in the session log; durable rule now in
AGENTS.md "Input Conventions — List-Like Fields"):

- Shared `TokenListInput` primitive in OnboardingClient (Enter/comma/blur commit, comma
  splits typed OR pasted lists into one chip per segment, case-insensitive dedupe, chips
  ABOVE the input). Card 1 titles refactored onto it; placeholder now teaches the
  gesture ("Type a title — Enter or comma adds it").
- **Avoid companies → chips** (absorbs finding #5): visible saved list, same gestures,
  picker-token skin. DS identity-search card updated + approved + re-synced.
- **Fit Signals + Skills Evidence textareas now split on NEWLINES, not commas** — prose
  entries keep their commas; copy flipped to "One signal/piece of evidence per line."
  (Comma-splitting was silently shredding sentences into fragments.)
- Confirmed harm of the pre-fix merged title chip: one 8-word title signal scores ~0
  title-fit for its component titles, scan keyword goes word-loose, profile.md renders
  one bullet. Users with merged chips: remove + re-paste the list once this is live.
- onboarding-pickers DS card now carries the written gesture contract + free-text
  flavor; noted in-card that its catalogue examples still show tokens BELOW the input
  (Card 1 order = above) — reconcile at next rework.

### Scan-batch review outcomes (Randall, 2026-07-10 — cards approved in Claude Design)

All six scan-batch cards approved with edits (applied same day, re-synced):
1. Scan Controls: approved; boards error message gained "Use the feedback chat bubble
   to request a job board that didn't work."
2. Card 1 job-title chips: approved as designed.
3. Rating-filter tiles condensed: gap 5→3px, vertical padding →6px, "roles" font
   0.74→0.82rem (+10.8%); measured 89.7→70.4px (−21.6%) headless at 1440.
4. **Skip is BACK as a real function** (not just design): skipping removes the posting
   from the user's results ("not interested"). Visible note by the button: "This job
   will be removed from results." Needs backend at implementation: a skip/dismiss
   status on job_scan_results (or equivalent) so skipped jobs stay gone across scans.
5. **Company job boards are PRIVATE per user** (Randall's decision): job_sources
   gains user scoping (user_id column or a user_job_sources table); user-added boards
   feed only that user's scans. Fetched postings still dedupe into the shared jobs
   pool. Cost impact assessed 2026-07-10: no AI-token cost anywhere in the pipeline
   (connectors + matching are heuristic, board-URL resolution is pure parsing);
   storage is negligible (~2–3 MB per active user worst case); the real scale watch
   item is daily-cron runtime growing linearly with total boards — mitigate by
   scanning user boards inside that user's own scan run, or batching the cron.

### Scan-batch additions (Randall, 2026-07-10 — scoped, queued for Claude Design)

- **Card 1 job-title chip input (per role track).** Type titles into a field,
  chips render above — same interaction as the industry/CataloguePicker chip
  pattern. Example: "Executive Producer, Senior Producer, Creative Producer" on
  the Executive Producer track. Backend already live end-to-end:
  `role_tracks.target_titles` exists, feeds scan keywords
  (lib/public-jobs/repository.ts scanParametersForAggregate) and matching
  scorers (lib/public-profile/matching/scorers.ts) — the UI input is the only
  missing piece (OnboardingClient initializes targetTitles empty, no input).
  **The résumé scan stays exactly as-is** (Randall 2026-07-10: "resume scan
  should remain… no replacement") — titles are an ADDITION to Card 1, and the
  résumé highlights pipeline (profile.md + outreach context) is untouched.
- **Scan page: "Job titles in this scan" section.** Right-hand column of the
  dashboard scan page, chips listing the active scan's title parameters, with
  a helper note below: "To edit job titles, change parameters in this role
  track in your profile."
- **Scan/results page DS↔production reconciliation.** The DS scan cards
  (match-card / scan-progress / scan-history / dashboard-jobs / scan-page
  pattern) were derived from legacy `/scans` markup; production
  DashboardClient.tsx has since grown surfaces the DS never covered (fit-filter
  star grid, WEIRD MATCH tag, Overview card, Search settings card, Pursue
  action, scan overlay's current form). Inventory the divergence, design the
  missing cards in Claude Design, and re-sync per the Full Design-Sync
  Checklist. Process approved by Randall 2026-07-10.
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
