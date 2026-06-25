# Dumpster Fire Match Tuning Plan

## Purpose
The tuning surface is an internal operator workflow for improving a profile-scoped matcher after enough real feedback exists. It should help Randall review role fit, explain the rationale, and turn feedback into safer matcher changes without turning the candidate experience into another pile of knobs.

This is not a public candidate dashboard, not automatic ML training, and not a universal judgment about roles. Every recommendation is scoped to a profile, compiled matcher config version, and search mode if modes are added later.

Dumpster Fire's broader mandate is a private job-search operating system for Randall: source roles, judge fit against his actual experience and constraints, generate outreach/application copy, manage contacts, track submissions, and preserve the application workflow. The broken area right now is sourcing/matching/review logic, but tuning must not break the Apply Wizard, outreach generation, contacts, submissions, saved applications, or dashboard workflow.

## Product Principles
- Keep tuning internal until a candidate-safe explanation pattern is proven.
- Prefer explicit human approval over automatic rule changes.
- Keep every scan cheap by tuning deterministic matcher config, not rerunning LLM analysis per job.
- Treat hard exclusions as match-context exclusions only, never as universal role labels.
- Make broad or risky changes harder to apply than narrow, evidence-backed changes.
- Always show before/after impact before writing a new active config.
- Treat blank manual-review reasons as cluster-inherited signal when repeated similar roles already have explicit rationale.
- Flag company-skewed review batches before applying matcher changes; a batch dominated by one source/company is directional evidence, not enough to generalize alone.
- Use exactly four human fit verdicts in review: `Match`, `Good`, `Stretch`, and `Not a Match`.
- Treat rationale chips as reasons for the selected verdict, not separate fit categories or alternate labels.
- Keep stretch generous during learning. The system is not trusted to define the `Good` versus `Stretch` boundary without Randall's input.
- Any stretch cap is a serving/display throttle only. It is not learning truth, match truth, or production-quality judgment.
- Do not let internal terms such as `near_miss`, `matchQuality: bad`, `reviewReady`, or `stretchCap` create competing user-facing fit states.

## Human Review Model

### Verdicts

The review UI should ask for one primary verdict:

- `Match`
- `Good`
- `Stretch`
- `Not a Match`

The meaning is inherent in the label. Do not add separate label chips that restate the verdict. A short description can exist in implementation notes or helper copy if needed, but the control itself should stay simple.

### Rationale Chips

Rationale chips explain why Randall chose the verdict. They are not fit categories, not serving buckets, and not matcher states.

Green positive evidence:
- `Experience match`
- `Seniority match`
- `Seniority acceptable`
- `Adjacent`

Amber concerns or mismatch reasons:
- `Seniority mismatch`
- `Salary too low for scope / comp`
- `Location (different timezone or country)`
- `Hybrid acceptable`
- `Hybrid not acceptable`
- `In-Office`
- `Wrong title / position`
- `Wrong function`
- `Wrong industry`
- `Wrong Domain`
- `Too Technical`
- `Data / IT / Infra`
- `People / Recruiting / HR`
- `Security / Legal / Compliance`

Red scrape or source issues:
- `Missing available salary`
- `Missing available responsibilities`
- `Missing available Req'd Experience`
- `Missing available Description`

### Comment Box

The comment box sits under the verdict and rationale chips. It captures context that the four verdicts and chips cannot represent, especially nuanced stretch boundaries, why a role is strategically worth attention, or why a superficially similar role is actually wrong.

### Stretch Learning Rule

During calibration, include more plausible stretch roles rather than fewer. The system has already shown it is not reliable enough to define the edge cases alone. Stretch candidates should be filtered only for obvious trash, duplicates, scrape/source failures, and hard constraints. Any later production serving cap must happen after learning and must not erase stretch feedback opportunities.

### Internal State Boundary

Internal data may still track source status, duplicate status, parsing quality, model/config version, and serving policy. Those fields must not become competing human review categories. If an internal field is useful, map it into the four verdicts, the rationale chips, diagnostics, or non-user-facing telemetry.

## Visual Direction
- Use the existing Dumpster Fire/Gotham layout language, but keep this internal route in night mode.
- Surfaces should be near-black with white/near-white hierarchy.
- Amber should be minimal and reserved for interactive controls, counts, status accents, and review chips.
- Green can remain as the ambient background identity, but panel borders and cards should not feel green-forward.
- Avoid decorative UI flourishes, hover lift, generic SaaS widgets, and raw percentage sliders.

## Entry Point
- Route: private admin route such as `/scans/admin/tuning`.
- Navigation: not shown in candidate/public navigation.
- Access: same Dumpster Fire authentication gate at minimum; future public version should require admin/operator role.
- Data readiness: if fewer than 10 completed scans after first feedback, show a waiting state with current counts and no tuning actions.

## Data Inputs
- `job_search_match_feedback`: rating, short reason, match version, job ID.
- `job_search_match_decisions`: included/excluded decisions, score, bucket, role family, positives, risks, evidence, rules version.
- `job_search_near_miss_reviews`: internal false-negative review decisions, title signals, reviewer reasons, and repeated blank-reason decisions for cluster inheritance.
- `job_search_scan_logs`: completed scan count and error context.
- `job_search_compiled_profiles`: active compiled search profile and matcher config.
- `job_search_jobs`: persisted included jobs and user actions/statuses.

## Decision Groups

### 1. Profile-Scoped Exclusions
Purpose: reduce roles that are wrong for this candidate/search context.

Controls:
- Approve suggestion.
- Reject suggestion.
- Edit phrase/pattern before approval.
- Scope selector: title only, description only, company/industry only, or all job text.

No sliders. Exclusions are too dangerous for fuzzy percentages.

Required evidence:
- At least one low rating or repeated exclusion evidence.
- Example jobs affected.
- Proposed phrase/pattern.
- Why it is wrong for this profile, not why the role is inherently bad.

Copy framing:
- Use “Exclude for this profile” or “Wrong for this search.”
- Do not use “bad job,” “invalid role,” or “trash role.”

Danger rules:
- Broad industry terms require extra confirmation.
- Generic words like “manager,” “director,” “creative,” “operations,” or “program” cannot become hard exclusions without edit.
- Exclusions that would remove all current A/B matches are blocked unless manually overridden in a future advanced mode.

### 2. Title Families
Purpose: improve recall by allowing valid target-role families that the matcher is missing.

Controls:
- Approve.
- Reject.
- Edit title phrase.
- Add to existing family or create a new family.

No numeric weight control in V1. A title family either qualifies for gated review or it does not.

Required evidence:
- Strong rating or saved/applied action on a related role.
- Examples of included or excluded jobs using the phrase.
- Suggested family name and target titles.
- If manual review reasons are blank on repeated similar roles, inherit the cluster rationale from the closest explicit reason rather than dropping those decisions.
- If one company dominates the reviewed examples, require broader-company confirmation before making a broad family rule.

### 3. Positive Signals
Purpose: boost jobs that mention responsibilities, environments, or industries that consistently predict good matches.

Controls:
- Approve.
- Reject.
- Edit signal.
- Strength: low, medium, high.

Strength mapping:
- Low: small scoring lift only.
- Medium: normal scoring lift.
- High: stronger lift, but cannot bypass title-family gate.

This is the only V1 group that should use a simple three-level strength control. No `% +/-` sliders.

### 4. Negative Signals
Purpose: reduce noisy matches without fully excluding them.

Controls:
- Approve.
- Reject.
- Edit signal.
- Strength: low, medium, high.

Strength mapping:
- Low: risk flag only.
- Medium: scoring penalty.
- High: strong penalty, but not a hard exclusion unless promoted into Profile-Scoped Exclusions.

Use this group when the signal is suspicious but not always wrong.

### 5. Threshold Adjustments
Purpose: tune how strict buckets feel after enough evidence.

Controls:
- Preset choices only:
  - Make stricter.
  - Keep current.
  - Make more permissive.

No free sliders in V1. Percent controls invite fake precision and make outcomes hard to reason about.

Required preview:
- Count of A/B/C/monitor/skip changes.
- List of jobs that would move into or out of visible results.
- Warning if more than a small batch of jobs changes buckets.

## Suggested Workflow

### Step 1. Readiness Summary
Show:
- Feedback count.
- Completed scans since first feedback.
- Current matcher config version.
- Whether the 10-scan threshold is met.
- Top repeated low-rating reasons.
- Current active match count by bucket.

Primary action:
- If not ready: “Keep collecting feedback.”
- If ready: “Review tuning suggestions.”

### Step 2. Review Suggestions
Group suggestions by the five decision groups above.

Each suggestion card shows:
- Proposed change.
- Why the system suggests it.
- Evidence count.
- Example jobs affected.
- Risk level.
- Approve / Reject / Edit controls.

### Step 3. Preview Impact
Before applying:
- Run the proposed config against recent decision/job evidence.
- Show added, removed, upgraded, downgraded, and unchanged counts.
- Show the most important examples in each direction.
- Flag dangerous changes.
- Current V1 backend status: `app/scans/tuning-preview.ts` generates this as a read-only snapshot from persisted matcher decisions plus saved near-miss reviews. It also flags company-skewed review evidence and blocks apply when approved recall drafts are too OpenAI-heavy or single-company-heavy.
- Current V1 dashboard status: `/scans/admin/tuning` includes a preview panel for selecting saved review-cluster draft signals and calling `POST /scans/api/tuning-preview`. The panel previews selected impact only; it does not save draft edits, apply matcher configs, or enable rollback.
- Current scan-test safeguard: batch connector previews and batch write scans cap stretch-heavy served results at three stretch matches per company/source while preserving all good matches. This is intentionally conservative because current manual-review evidence is OpenAI-heavy and the next matcher changes need careful preview, not blind application.

Primary actions:
- Back to edit.
- Save draft.
- Apply new config version.

### Step 4. Apply Version
Applying creates a new compiled matcher config version. It does not mutate historical decision rows.

Store:
- Previous config version.
- New config version.
- Approved suggestions.
- Rejected suggestions.
- Edited suggestions.
- Preview impact snapshot.
- Operator notes, if provided.

### Step 5. Rollback
The tuning surface must show recent applied versions and allow rollback before broad public use.

Rollback should:
- Reactivate the previous matcher config.
- Preserve tuning history.
- Not delete feedback, jobs, or match decisions.

## Candidate-Facing Boundary
Candidate-facing result cards should remain simple:
- Short match reason.
- Short risk/weird-fit reason when useful.
- `Weird match` label for odd-but-possible C-bucket matches.
- Rating and short low-rating reason input.

Do not show:
- Excluded-job firehose.
- Raw rules, weights, or thresholds.
- “The model learned” claims.
- Universal labels implying a role is bad.

## Internal Tuning Output
The internal report can include:
- Likely false positives.
- Possible false negatives from excluded decisions.
- Suggested profile-scoped hard exclusions.
- Suggested title-family additions.
- Suggested positive/negative signals.
- Suggested threshold preset.
- Confidence and risk level for each suggestion.

## Validation Plan

### Before Build
- Review this plan with Randall.
- Confirm route name and access expectation.
- Confirm whether tuning history needs a new table before V1 or can start as generated preview only.

### During Build
- Add deterministic tests for suggestion generation.
- Add tests that hard exclusions are profile-scoped and do not alter global role validity.
- Add tests that dangerous broad terms are blocked or require edit.
- Add tests that a preview is required before apply.

### After Build
- Run TypeScript and focused fixture tests.
- Run build.
- Use screenshots for the admin UI flow before declaring the UI done.
- Verify no tuning route appears in public/candidate navigation.

## V1 Recommendation
Build V1 as a read-only report plus approve/reject/edit draft state first. Preview-impact generation now exists as a scriptable backend snapshot and selectable dashboard panel, but matcher changes still must not be applied until durable draft decisions, tuning history, and rollback are implemented and validated.
