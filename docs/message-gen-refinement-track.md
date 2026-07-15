# Track: Message Gen Refinement

The dedicated workstream for fixing the quality/voice of AI-generated outreach messages.
The outreach message IS the product; this track exists to iterate it to a high bar with
prescriptive, versioned feedback so refinement doesn't get away from us.

Parent context + diagnosis: `docs/outreach-message-quality-session-2026-07-13.md`.

---

## What this track is

A **local review console** + a **versioned corpus pipeline**. You read each generated
message, leave prescriptive per-message feedback, and set/see the tracked mechanics as
sliders. Every generation round is frozen as a version with a changelog, so we can always
compare across versions and walk back a path that isn't working.

## Guardrails (hard)

- **Siloed from production.** Everything lives under `scripts/outreach-quality/`. No `app/`
  route, no DS card, no prod build path. It cannot leak into production.
- **No prod prompt edits without Randall's approval** of the resulting message diff. The
  production files (`lib/public-profile/outreach-generator.ts`, `voice-fingerprint.ts`,
  `profile-markdown.ts`) change only after a variant is approved here.
- **Work Example inventory parity is a generation prerequisite.** No refinement round may
  call the model unless every structured Work Example, including title, one-hitter, optional
  link, and context, is present in the compiled profile snapshot. Missing, extra, duplicated,
  stale, or changed inventory fails the round before version artifacts are written.
- **No commit/push without Randall's explicit OK.**
- **Never print secret values** from `.env.local`; scripts only read them.
- **No em dashes in any generated message (Randall, 2026-07-14).** A platform-wide rule, not a
  variant experiment: no outreach message may ever contain an em dash; use commas, parentheses,
  semicolons, colons, or restructure. Enforced in prompts from `v3-nodash` on, measured by the
  `emDash` meter, and recorded in `AGENTS.md`. Ports to production with the winning variant.
- **No logistics talk in any generated outreach (Randall, 2026-07-14).** Never discuss,
  volunteer, or claim location, remote, hybrid, in-office, relocation, or availability in an
  outreach message, regardless of the user's remote-preference setting or the job's stated
  location. Enforced from `v6` on (prompt + `logisticsMention` hard-rule detector with
  auto-retry); recorded in `AGENTS.md`.

## Sync + git treatment

Full cross-machine sync AND full siloing — not either/or.

- **Committed (durable history):** the tool + harness code, `data/versions.json`,
  per-version changelog, `data/feedback-*.json`, `data/corpus-*.json` (the frozen messages
  feedback attaches to), `data/prompts/*.txt` (exact system prompt used), and
  `data/inputs/*-profile.md` (frozen profile snapshot per version), and
  `data/inputs/*-work-examples.json` (privacy-minimized inventory audit). Freezing per
  version = each round keeps the exact inputs/outputs it was judged against.
- **Gitignored (regenerable scratch):** the working `profile.md`, `scan-jobs.json`,
  `outreach-messages.json`, and the human-readable `baseline-*.md` at the dir root.

## Layout

```
scripts/outreach-quality/
  pull-evidence.mjs        # pull profile.md + jobs (with source_url) + stored messages
  gen-baseline.mjs         # generate a version's corpus; PROMPT_VARIANT selects the prompt
  review-server.mjs        # local review console (zero-dep node http server)
  work-example-audit.mjs   # structured-data ↔ compiled-profile parity + selection identity
  test-work-example-audit.mjs
  data/
    versions.json          # [{id,label,createdAt,changeNotes[]}]  <- committed
    corpus-<id>.json       # frozen messages + job context + auto-metrics  <- committed
    feedback-<id>.json      # Randall's comments + slider values  <- committed
    prompts/<id>.txt        # exact system prompt used  <- committed
    inputs/<id>-profile.md  # frozen profile snapshot  <- committed
    inputs/<id>-work-examples.json # privacy-minimized parity audit  <- committed
```

## Tracked mechanics (the sliders)

**Auto-computed meters (read-only — what the detectors find per message):**
nautical-tic density · hero-example present · invented-number present ·
concession-opener present · "tells them what they want" opener · Q4 brag-tag present ·
length · exact selected Work Example + corpus selection spread. Heuristic/regex — tunable
later (they can be wrong; exact Work Example identity comes from returned metadata).

**Randall's ratings (interactive 0–10):** Sounds like me · Right humility · Fit honesty ·
Would-send-as-is. Plus **Priority to fix** (0–10).

Free-text **prescriptive comment** per message is the primary output.

## How to run

```
# 1. refresh inputs (writes scratch inputs only after every read + parity check succeeds)
node scripts/outreach-quality/pull-evidence.mjs

# 2. generate a version's frozen corpus into data/
PROMPT_VARIANT=baseline node scripts/outreach-quality/gen-baseline.mjs
PROMPT_VARIANT=v2       node scripts/outreach-quality/gen-baseline.mjs
PROMPT_VARIANT=v3       node scripts/outreach-quality/gen-baseline.mjs
PROMPT_VARIANT=v3-link  node scripts/outreach-quality/gen-baseline.mjs
PROMPT_VARIANT=v3-nodash node scripts/outreach-quality/gen-baseline.mjs
PROMPT_VARIANT=v3-nodash-b2 node scripts/outreach-quality/gen-baseline.mjs   # job batch 2
# ...add v4+ as new entries in the systemByVariant map + versions changelog
# If every call fails with "Connection error." while curl reaches api.anthropic.com fine,
# the machine's IPv6 route is broken and Node isn't falling back to IPv4. Preload an
# IPv4-pinning dns.lookup shim: NODE_OPTIONS="--require <shim>.cjs" (see 2026-07-14 note).

# 3. review
node scripts/outreach-quality/review-server.mjs   # prints a localhost URL
```

## Console features

- Left column per message: overview line (company · title · fit · length), link to the
  original posting (`source_url`), the message, inserted example, autosaving comment box.
- Right column: the mechanics as sliders/meters (above).
- Version switcher + per-version **changelog** at top; corpus scorecard rolls up the
  auto-meters so we see the trend across versions.
- **Historical context:** reviewing vN shows the prior version's comment + slider values
  for the same job inline, so we can tell whether a change addressed the note.
- **Cross-style matrix view:** any manifest-verified `data/style-matrix-<id>.json` shows up in
  the version switcher as "▦ Cross-style matrix (<id>)". The view separates hard failures from
  heuristic review flags, surfaces persona-target and invention/concession signals, groups every
  cell by persona, and persists the five cross-style ratings plus optional prescriptive comments.
  A separate blind-first view records eight same-job voice-identification guesses before revealing
  the actual personas.

## Job batches (corpus sampling rules)

- **Batch 1** (2026-07-13, retired): 10 jobs picked by index from a flat recency-200 pull —
  ended up 6× Airbnb plus language-gated non-starters (French-fluency AE, Korea-based TPM)
  and poor-fit padding. Randall 2026-07-14: too much repeated review effort; a batch like
  this is much less useful.
- **Freshness rule (standing, found 2026-07-14):** picks must come from rows seen by the
  MOST RECENT scan (`scraped_at` within the latest scan window). The scan upserts live
  postings but never removes delisted ones, so dead jobs sit in the table looking live —
  ~17% of the pool (440/2522) when discovered, incl. a batch-3 pick delisted 4 days prior.
  Greenhouse serves its "no longer available" page with HTTP 200, so scan-absence is the
  only reliable death signal; a link check cannot catch it.
  **PRODUCT DECISION (Randall, 2026-07-14): stale posts are NOT being addressed.** The
  harness freshness guard stays; no product-level staleness handling. Do not re-raise.
- **Batch 2 rules (standing, Randall 2026-07-14):** the evidence pull is company-balanced
  (full board per company — a flat recency pull let four big boards crowd out the rest);
  picks are keyed by **stable job id**, spread across companies (batch 2: 12 jobs, 9
  companies, max 2 per company); **exclude any job gated on a language fluency Randall
  doesn't have**; **no poor-fit padding** he'd never apply to (stretch fits cover concession
  behavior); fit spread stays mixed (batch 2: 4 good / 5 medium / 3 stretch). Frozen batch-1
  corpora stay judged against their own inputs.

## Versions so far

- `baseline` — exact current production system prompt. Reference point.
- `v2` — six levers: Q4 as thinking-signal (not a quote/mic-drop), anti-authority stance,
  fragment rule, hero-example cap, nautical demoted, ban invented specifics. Directional
  win; introduced a new concession-opener tic and didn't kill the invented doc-count.
- `v3` — complete evidence + respectful fit: full Work Example consideration, accurate résumé
  retrieval before concessions, respectful former-employer familiarity, first-person-only Q4
  translation, stronger anti-authority rules, exact example metadata, and a 750-character cap.
  Generated 2026-07-13: 10/10 valid messages, zero unmatched selections, 648 average characters,
  732 maximum, 3 nautical tics, 1 P.H.R.E.D. name hit, 0 invented numbers, 3 concession openers,
  0 tells-them-what openers, and 0 Q4 brag tags. Selection remains lopsided: P.H.R.E.D. 4,
  Bored Ape 1, Mozilla 0, Bot Busters 0, no Work Example 5. Reviewed by Randall: four strong
  structural outcomes, two material failures among the good/medium set, and two non-actionable
  matches excluded from prompt-tuning signal. Do not port before cross-style validation.
- `v3-link` — single lever on v3 fixing Randall's #1 issue (2026-07-14): the model copied each
  used example's link into `insertedExample` metadata but never wrote it into the message body,
  so the reader could never click through to the work (v3: 0/5 example-bearing bodies had the
  link; production has the same permissive "at most one link" wording). v3-link makes the body
  link a hard requirement whenever a Work Example is used, keeps the one-link cap, and adds the
  exact (non-heuristic) `exampleLinkMissing` auto-metric checked against the matched compiled
  example. Generated 2026-07-14: 10/10 valid, **7/7 example-bearing bodies contain the exact
  link**, 0 over 750 (avg 630), 0 Q4 brag tags, 3 nautical, 3 concession openers. Watch-outs
  for review: example usage rose 5→7 and P.H.R.E.D. took 6 of 7 (selection bias unchanged —
  known v4 target), and the invented doc-count tic reappeared in 2 messages ("forty disconnected
  docs", "ten docs" — profile mentions no doc counts; v4 invention lever). Kept isolated on
  purpose; full v4 still waits on the 28-cell matrix review.
- `v3-nodash` — v3-link + the standing no-em-dash rule (Randall, 2026-07-14; see Guardrails +
  `AGENTS.md`). Before: 10/10 v3-link messages contained em dashes (20 total, ~2 each) while the
  profile has almost none — model habit, not voice. The prompt now bans them outright with
  restructuring guidance (commas, parentheses, semicolons, colons, new sentence); new exact
  `emDash` count metric in the harness + console. Generated 2026-07-14: 10/10 valid, **0 em
  dashes**, no en-dash or double-hyphen substitution (0 of each; 1 semicolon, 4 parentheticals),
  6/6 example-bearing bodies keep their exact link, 0 over 750 (avg 640), 0 invented numbers,
  1 nautical, 0 Q4 brag tags. Selection spread still lopsided (P.H.R.E.D. 5, Bored Ape 1,
  no-example 4) — unchanged v4 target.
- `v3-nodash-b2` — same prompt as v3-nodash, regenerated on **job batch 2** (see Job batches
  above). Generated 2026-07-14: 12/12 valid, 0 em dashes (no en-dash substitution), 9/9
  example-bearing bodies carry their exact link, avg 659 chars. Watch-list: one length
  violation (Anthropic Head of Copy, 785 > 750); the invented **doc-count tic hit 3/12**
  ("fifteen docs", "forty docs", "twelve docs" — none in the profile), nondeterministic but
  persistent across rounds → firm v4 lever; selection still hero-heavy (P.H.R.E.D. 7,
  Mozilla 1, Bored Ape 1, Bot Busters 0, none 3) though Figma Brand Producer → Bored Ape and
  Ramp Viral Creative Producer → Mozilla show relevance-based selection CAN happen.
- `v4` — Randall's b2 review notes implemented + generalized for any career (this is the
  production-port candidate; full rationale in
  `docs/message-gen-generalization-audit-2026-07-14.md`). Levers: first-person hedge on
  opinions/generalizations (never declared fact, never as the opener); opening line must be a
  complete standalone sentence; no coined jargon absent from posting/profile; résumé-highlight
  variety (≤2 per message, don't repeat marquee names); NUMBERS hard rule (a number may appear
  only if the profile states it, incl. rhetorical counts); exemplars demonstrate register not
  vocabulary; DE-PERSONALIZED (v3's "nautical" line generalized). Also introduces the
  **hard-rule validation + bounded retry layer** in the harness: length ≤750, no em dash,
  example link in body, ungrounded-numbers-vs-profile — violating cells regenerate (max 3
  attempts), final violations stay visible (`generationAttempts` + `hardRuleViolations` per
  message; `ungroundedNumber` meter in the console). Prompt-only enforcement measurably leaked
  across three rounds; this layer is profile-independent and is what production should adopt.
  Final corpus 2026-07-14: 12/12 valid, 4 cells needed retries, 2 unresolved violations kept
  visible (one 768-char cell, two idiomatic "dozen" uses), 0 em dashes, 9/9 links, avg 688.
  Review watch-list: OpenAI cell says "Growth creative" (posting-derived?) and renames
  P.H.R.E.D. to "Project OS" (invented product naming — no rule covers referring to Work
  Examples by their actual titles yet); flourish-per-message habit persists (8/12 one each) —
  structural fix is the fingerprint pre-pass revision.

- `v5` — the three blockers (Randall, 2026-07-14: "these are blockers... resolved before I
  share"). (1) **Register-only fingerprint**: `voice-fingerprint.ts` pre-pass rewritten to
  extract HOW someone writes, never their imagery/phrases (the old pass synthesized a
  maximum-density tic line as an exemplar; that is the carry-over mechanism for ANY user);
  Randall's profile regenerated — imagery echo went 8/12 → 0 real hits (2 detector false
  positives: the job's own "anchor days", generic "steering"). (2) **No-admission default**:
  never apologize for / acknowledge / disclaim thin or missing experience; thin evidence =
  shorter plainer message; only a stated hard requirement gets one brief factual flag, never
  the opener — 0 admission phrases in 12/12. (3) **Résumé extraction fixed**: NOT a parsing
  defect (parsed_text was complete) — the highlights pass capped at 6 and its prompt said
  "notable... ('Director of Engineering at Stripe')", i.e. fame bias; now 12 highlights,
  concrete-over-famous, whole career arc (CP+B $4MM+, One Show Golden Pencil, Greenstone,
  ALEO, Yuga/BAYC now present); empty user-authored Strengths/Gaps/Use-when/Avoid-when
  blocks no longer render as "None captured" noise. Credential spread across the corpus:
  Swift 8, HTC 5, Base 4, AKQA 3, BAYC 3, CP+B 2, Golden Pencil 1 (Nike/Trek crutch → 0).
  Watch-list: drafts run longer with richer material (avg 738; retries 10/12, 4 visible
  near-misses — mostly the "dozen" idiom and length); possible v6 lever: aim 500–650.
  Also new: strict number-word grounding can flag benign paraphrase ("team of four" vs
  profile's "team of 4") — visible, not fatal; tune later.

- `v6` — Randall's v5 review notes (12/12 reviewed; mostly 7–8s; five notes). First-person
  opening anchor is now a HARD rule with auto-retry (the declarative opener survived three
  prompt attempts; v6 Coinbase now opens through experience and humility should recover from
  its 1). Fragment/label openers banned explicitly (Figma). **No-logistics standing rule**
  (see Guardrails + AGENTS.md) enforced as prompt + hard-rule detector: 0 logistics mentions
  in 12/12 (the v5 events cell had fabricated "can be in-office as needed"). Closing lines
  must have unambiguous intent — an ask reads as a direct question, a statement as a
  statement (Randall clarified the Ramp note was a grammar/clarity defect that made him
  question the goal, NOT a rule that every close is a question). Example format-matching
  sharpened —
  partial win on the events cell: ZKP dropped, but it chose résumé points (incl. AirCover)
  over the Mozilla tradeshow example Randall pointed at; still the weakest selection cell.
  The closing-clarity rule alone converged 11/12 messages on a stock "Worth a conversation?"
  — Randall: not banned terms, but near-identical closers across messages read as lazy output
  or poor LLM guidance to users; the fix is closers SPECIFIC to the job or evidence (a
  job-specific ask can't repeat) — final roll has 12 varied, direct-question asks. Final corpus 2026-07-14 (later): 12/12, 0 em dashes,
  9/9 links, 0 opener/logistics flags, 10 retried, 6 visible near-misses (4 length 762–846 +
  "dozen" ×4). Length + the "dozen" idiom are now clearly THE systemic residuals →
  recommended v7 lever: target 500–650 and name "a dozen" in the numbers rule.
  Not rule-addressed: "lean on people" diction (one-off).

- `v7` — regression response (v6 averaged 5.09 with four 1-rated cells; Randall: "very
  discouraging"). Root causes were mechanical, not drift: (1) the register-only fingerprint
  PRESCRIBED devices ("use fragments," "easy confidence," "open cold") that beat the prompt's
  rules on every roll — pre-pass revised a second time (qualities only, never devices) and the
  profile regenerated; (2) quality-blind retries (10/12 that roll) selected sloppy-but-compliant
  prose — length target moved to 500–650 and "a dozen" named, cutting retries to 2/12 before the
  new rules, 8/12 after. v7 is a full-text prompt rewrite: rules outrank voice (hedging beats
  voice confidence — the missing "in my experience" markers trace to the old fingerprint);
  fragment cap of ONE per message; prose-quality bar (no sentence-final prepositions, no close
  word repetition, no same-shape sentence stacks, no invented shorthand); domain anti-fabrication
  incl. evidence keeps its actual format (no re-describing digital launches as live events);
  negativity ban ("grind"); respectful prior-employment phrasing + company-familiarity openers.
  Admission/disclaimer framing promoted to a HARD rule (`admissionPresent` detector) after the
  first v7 roll reopened two messages with "I'll be straight: ... not my lane." Also fixed a real
  detector bug: substring grounding let "often" ground "ten" ("ten disconnected docs" had passed);
  number-words now word-boundary checked. Final roll: 12/12, 0 admission/opener/logistics/em-dash
  flags, 9/12 hedged with explicit first-person markers, closers all distinct and specific.
  KNOWN WEAK SPOTS for review: the events cell still self-flags its live-show gap ("show-calling
  craft I'd bring less of on paper" — pattern widened for future rolls; the structural issue is
  the profile has no live-event evidence, so the model oscillates fabricate↔confess on this job
  type); 7/12 messages open "I've spent 15+ years..." (the next cross-message sameness axis);
  GitLab 772 + Databricks 769 kept as visible length near-misses.

- `v7-b3` — same v7 prompt on **job batch 3** (Randall: keep growing sample size and
  variation): 12 new id-keyed jobs, four companies batch 2 never touched (Spotify, Stripe,
  Dropbox, Robinhood) plus fresh roles at Anthropic/Figma/OpenAI/Airbnb/Discord; standing
  sampling rules held (≤2 per company, no language gates, no never-apply padding; 4/5/3 fit
  spread). Two prompt additions shipped with it after QA reads: the **adjacent-seat rule**
  (when the role's core craft isn't this person's, pitch the seat they'd actually fill —
  never contrast against the title, never confess distance; born from the ACD Copy cell
  reaching "I'll be straight" through three rolls) and `MAX_GEN_ATTEMPTS` env override
  (stretch cells needed 5). ADMISSION_PATTERN extended ("I'll admit", "I won't pretend").
  Final roll: 12/12, 0 admissions/logistics/opener/em-dash flags, 0 length overruns, 2
  visible word-grounding near-misses. QA flags for review: Discord says "legal-specific
  tooling would be new ground for me" (mild gap-acknowledgment below the pattern's radar);
  4/12 closers drifted back generic ("Worth a call?"); "ten disconnected docs" passes the
  numbers rule only because a writing sample contains "ten months" — semantic grounding
  (number + what it counts) is future work; opener family still leans "I've spent…".

- `v8` — Randall's b3 notes (b3 averaged 6.81, 10/12 at 7–8 — recovered from v6). Closers
  carry their job-specific referent in the same sentence (bare "Can we talk?" read
  desperate) with the conditional shape offered ("If you're looking for X, we should
  chat."); **same-shape sentence stacking is now a HARD rule** (3+ consecutive "I <verb>"
  openings auto-retry — the Discord cell rated 3s was a 5-attempt retry survivor, and
  detectors guard retry survivors where prose advice can't); prose bar leads with a
  read-aloud test. Generated on batch 3 for direct before/after against the rated v7-b3
  cells. Run 2026-07-14 (night): 12/12 (MAX_GEN_ATTEMPTS=5), **Bot Busters selected for the
  first time ever** (all four Work Examples have now appeared), Discord cell fixed by the
  new detector on-camera (stack flagged at attempt 2, clean by 5), conditional closes
  landed. 3 visible near-misses: "a dozen" ×2 and one logistics false-positive ("onsite
  delivery" on the events job is the event's own vocabulary, not work-location talk —
  detector nuance noted, message reads clean). Also standing: **batch freshness rule** —
  picks must be seen by the most recent scan (3 of batch 3's picks turned out delisted;
  per-company freshness guard added to gen-baseline; PRODUCT GAP flagged under Job batches).

## Next steps

- [x] Build the console (Slice 1 + changelog + historical context). Done 2026-07-13.
- [x] Randall reviewed all 10 v2 messages: six good/medium fits rated; four bad matches excluded.
- [x] Prove current Work Example parity: 4 structured examples = 4 compiled examples, all required
      fields present. Add fail-closed parity + multi-example generation-context regression coverage.
- [x] Generate and verify v3: 10/10 messages, zero unmatched selections, four-example inventory
      present, metrics verified, and console readback confirmed on 2026-07-13.
- [x] Randall reviewed v3 message-by-message. Strong: Business Process Improvement, Luxe Supply,
      Trust & Safety, and Art Director. Failed: Roadmap sendability and Process Strategy evidence
      stretch. Coinbase Infra needs relevance-first adjacency; French/SWE are non-match sampling.
- [x] Build the offline pre-v4 cross-style gate: six frozen voice personas, six controlled jobs,
      28 unique cells, real fingerprint-prepass runner, exact v3 prompt/profile hashes, invariant
      rubric, production-renderer parity, pinned job inputs, fail-closed structural publication,
      sealed-artifact verification, review-visible quality violations, and offline tests. Spec:
      `docs/message-gen-cross-style-validation.md`.
- [x] Claude ran the 34-call style-matrix generation (`6 fingerprints + 28 messages`) on
      2026-07-13 (Codex egress cannot transmit the private base profile — see "Network step:
      Codex cannot run it" below). Complete matrix published: `data/style-matrix-v3.json` (+
      human `style-matrix-v3.md`, sealed manifest verified). Result: 22/28 have no hard contract
      failure, avg length 689 (603–814). Hard failures: `over_750_characters` 4 and
      `q4_quoted_verbatim` 2. Heuristic review flag: `selected_example_not_obvious` 13. Persona
      length target passed 12/28; one invented-number signal and two concession-opener signals
      also require review.
      Surfaced + fixed a harness bug on the way: a single unparseable response hard-aborted the
      whole run with no retry (Codex added bounded retry in 2e475e5). Reviewable in the console
      via the "▦ Cross-style matrix (v3)" entry in the version switcher.
- [x] Make the matrix reviewable end to end: manifest-verified console loading, hard-failure versus
      heuristic-flag separation, persona-target and invention/concession summaries, persisted
      five-category ratings/comments, blind-first voice identification, safe partial autosave
      merging, and responsive verification at 320/375/390/1280/1440. Randall completed the blind
      check on 2026-07-14: 4/8 correct. Labeled review remains 0/28.
- [x] **Fix the #1 issue — Work Example links never reached the message body.** Diagnosed
      2026-07-14: the data path was intact end to end (all 4 examples carry `link: true` in the
      frozen audit; `insertedExample.link` present on every example-bearing v3 message) but 0/5
      bodies contained a URL — the prompt's permissive "at most one link" line never required it,
      and production `outreach-generator.ts` has the identical gap. Fixed as the isolated
      `v3-link` variant + exact `exampleLinkMissing` metric (console meter + scorecard, `n/a` on
      older corpora): 7/7 example-bearing bodies now contain the exact link. Needs Randall's
      console review (link placement quality) before the lever is folded into v4/production.
- [x] **Enforce the no-em-dash rule (standing platform rule, Randall 2026-07-14).** Fixed as
      `v3-nodash` (v3-link + outright ban with restructuring guidance) + exact `emDash` metric:
      0 em dashes across 10/10, no substitute punctuation tics, link compliance intact. Rule
      recorded durably in `AGENTS.md` and this doc's Guardrails; ports to production with the
      winning variant. Needs Randall's console review for how the restructured sentences read.
- [x] **New job batch with real variety (Randall 2026-07-14).** Balanced the evidence pull
      per company (the flat pull was 85% four boards; Notion/Linear/GitLab/Runway never
      surfaced), replaced index picks with 12 id-keyed jobs across 9 companies, excluded
      language-gated and never-apply jobs, and regenerated the current prompt as
      `v3-nodash-b2`. Sampling rules recorded under "Job batches" above.
- [ ] **Complete the human matrix review before authoring v4.** Automated findings identify
      candidate targets, not final prompt requirements:
      1. **Evidence selection independent of expression.** P.H.R.E.D. was the only selected Work
         Example (13 cells); the other 15 used none. Three of six full-matrix jobs varied between
         P.H.R.E.D. and none. Because this is one nondeterministic sample per persona, human review
         must determine relevance before attributing the variation to voice.
      2. **Voice-aware length inside a universal ceiling.** Four messages exceeded 750, but the
         broader portability failure is 16/28 persona-target misses. Minimal/direct missed its
         350–550 target in all six cells, showing the fixed v3 length instruction can override the
         onboarding voice.
      3. **Close the last Q4 leak.** Two verbatim Q4 quotes survived v3's ban, both on the Business
         Process Improvement job under wry/casual and calm/polished.
      4. **Recheck invention.** The wry/casual Databricks cell triggered the invented-number
         detector with "ten docs" and must be evaluated against the frozen evidence.
- [ ] Iterate vN until approved; then port the winning prompt to the production files and
      re-verify from the real prod code path.
- [ ] Later: revise the fingerprint pre-pass itself (over-tuned; source of the tic + frag
      problems); widen the job sample (~18); tune the auto-metric detectors.

## Network step: Codex cannot run it — hand it off (do not retry)

Any script that calls Anthropic (`gen-baseline.mjs`, `gen-style-matrix.mjs`, any future
generator) reads the private base profile + Work Examples off local disk and POSTs them to
`api.anthropic.com`. **Codex's execution environment blocks this** — first the sandbox has no
egress, and when elevated execution is requested the policy reviewer rejects it because the
command transmits private workspace data to an external service. This is an execution-policy
block, not a missing key, a bad command, or a broken workflow. The command and API are valid;
retrying (even with explicit user authorization) will keep being denied. **Codex must not
loop on this.**

The workflow is NOT blocked, because generation is split from authoring:

- **Codex authors offline** (no network): prompt variants, persona configs, metric detectors,
  audit/parse logic, the console. All pure text editing.
- **The network step runs where it's authorized to** — the Claude Code session (which reaches
  Anthropic) or Randall in a plain terminal outside the sandbox. Codex commits its change,
  then asks that runner to execute e.g.
  `PROMPT_VARIANT=v4 node scripts/outreach-quality/gen-baseline.mjs` or
  `node scripts/outreach-quality/gen-style-matrix.mjs`.
- Artifacts land in `data/`; the console at :4137 shows them; Randall reviews.

Codex can validate its own harness offline without any network via the preflight:
`MATRIX_PREFLIGHT_ONLY=1 node scripts/outreach-quality/gen-style-matrix.mjs` (checks config,
hashes, and cell count; prints `"ok": true`). Proven end-to-end on 2026-07-13: Codex authored
the matrix + retry fix offline, Claude ran the 34 calls, the full 28-cell corpus published.

## Handoff → Codex (several sessions; weekly limit resets tonight 2026-07-13)

Codex can make progress on this track WITHOUT touching production. Stay inside the
harness. Guardrails above still apply: **no prod prompt edits** (`outreach-generator.ts`,
`voice-fingerprint.ts`, `profile-markdown.ts`) and **no commit/push** without Randall's
explicit OK. Iterate by adding new `PROMPT_VARIANT` entries + `variantMeta` changelog in
`gen-baseline.mjs`, regenerating (hand the network step off — see above), and reviewing in the
console. Randall reviews in the console and rates/prioritizes; you turn that into the next variant.

Safe-to-do this stretch (harness only):

1. **Complete the pre-v4 cross-style review.** The 28-cell matrix is generated, sealed, and
   available in the console. The blind check is complete at 4/8. Start immediately in the
   **Labeled matrix review (v3)** view, record all five ratings for every cell, and add prescriptive
   comments wherever a message needs to change. When the console reaches `reviewed: 28/28`,
   aggregate the saved feedback against
   `docs/message-gen-cross-style-validation.md` before
   authoring v4.

2. **Work-examples selection bias (Randall flagged 2026-07-13).** All **4** work examples
   ARE compiled into profile.md — this is NOT a data-pull gap. The generator over-selects
   **P.H.R.E.D.** (in ~4/10 bodies) and under-uses the rest: **Bot Busters is never used**,
   Mozilla / Bored Ape only occasionally. Investigate the selection bias and try a prompt
   nudge (harness variant only) to consider ALL work examples and pick the most relevant
   per job, spreading across the corpus instead of defaulting to the AI-flavored hero.
   Measure via the `heroPresent` meter + inserted-example spread across the 10 messages.

3. **Thin résumé/work-experience data (related, deeper).** In profile.md the résumés parse
   as quality "weak" with Strengths / Gaps / Use-when / Avoid-when all "None captured", so
   the generator has little real experience to cite beyond a few highlights. This is likely
   what "expand work experience pulls" points at. Diagnose where the résumé enrichment drops
   off (`lib/public-profile/resume-highlights.ts`, `resume-parse.ts`, the onboarding résumé
   scan) and propose — do NOT implement without scope — how to pull richer, quotable work
   experience into the profile so message gen has more to draw on.

Report findings + proposed variants back here (update Versions + Next steps). Do not port
anything to production or commit without Randall.

## Deferred to a later session (Randall, 2026-07-14 — recorded, do not build yet)

1. **Message generation UX change (design-gated).** Eliminate the current "Generate new
   message" affordance in favor of ONE backup "re-gen": a single regeneration pass that
   produces a much different but still tone-true message. At step 3 of the pursuit flow
   (currently grayed out until drafts generate): on arrival the card itself shows the
   standard loading animation (inside the card, not a popup), then shows the generated
   message. Done — the user can copy the text and that's it.
2. **Saved-pursuits review track (design-gated).** Reviewing saved pursuits and whether
   they were followed up / messaged is the last main built-but-unplanned feature. First
   step: a "Saved Pursuits" button next to "Dashboard" in the top profile card, with a
   hover tooltip "Coming Soon".
3. **External-job link input → apply wizard (Randall, 2026-07-14, design-gated).** A user
   who finds a job OUTSIDE the job scan needs a way to pursue it. Copy direction:
   "Find a job that's not in your scan? drop the job link here:" + link input +
   **[PURSUE]** button. Pressing Pursue cues the exact same pursuit workflow any scanned
   job gets. Per the list-input conventions this is a single-value action input (input +
   button, Enter also commits, no comma handling). Needs: URL fetch/parse of an arbitrary
   posting into a job record, then hand-off to the existing pursue flow.
   → **BACKEND handed to Codex 2026-07-14** (priority item):
   `docs/codex-tasks-external-job-link-2026-07-14.md`. UI remains design-gated.
