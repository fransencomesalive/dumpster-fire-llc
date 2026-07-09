# Onboarding findings — Randall's full pass, 2026-07-09 (evening)

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
