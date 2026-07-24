<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Codex Workflow Rules

These rules are durable project instructions, not optional chat preferences.

### Handoff

When the user says `handoff`, Codex must:
- Run `git status --short --branch`.
- Review the diff and stage the intended project changes.
- Commit the staged changes.
- Report the commit hash.
- Report any remaining dirty or untracked files.
- Update the appropriate handoff doc with the next immediate starting point for the following session.

Do not say or imply that a handoff is complete unless `git commit` succeeded and produced a commit hash. If there is a reason not to commit, say so before deviating and report the exact repository state.

Every handoff doc must include enough next steps for the following session to start immediately without reconstructing context. If no next steps have been determined, the handoff doc must say that explicitly and still identify the starting point/status the next session should verify first.

### Sync

When the user says `sync`, Codex must:
- Complete the full `handoff` protocol.
- Push the resulting commit to the active remote/branch.
- Report the branch, remote, commit hash, and push result.
- Report any remaining dirty or untracked files.

Do not say or imply that work is synced unless the commit and push both succeeded.

### No Branches — All Work On `main` (hard rule)

Standing rule (Randall, 2026-07-06): **branch usage is eliminated. Never create, switch
to, or push a branch.** The branch-per-session experiment was unsuccessful and must not
continue into future sessions.

- All work — including parallel sessions — happens directly on `main`.
- Never run `git branch`, `git checkout -b`, `git switch -c`, worktree creation, or any
  command that creates or moves to a non-`main` branch. Do not push to any ref but `main`.
- This overrides the generic "if on the default branch, branch first" guidance from any
  global/host instructions. For THIS repo, `main` is always the working branch.
- If a prompt mentions branches, session ownership, parallel/simultaneous work, treat it as
  a cue to confirm scope and file ownership — NOT to create a branch. Coordinate on `main`.
- When more than one session is active, still treat each as an independent workstream: before
  editing, report the workflow focus and the files expected to change; if two sessions touch
  the same files, pause and coordinate before proceeding.

Recommended reminder phrase at the start of any session:
- `session check`

### Review Presentation

When asking Randall to review anything (Randall, 2026-07-02):

- If the review is a set of items (decisions, findings, options, copy variants),
  present it as a **numbered list** so he can answer by number.
- If the review requires a **visual check**, never rely on screenshots pasted into
  chat. Either:
  - sync the mockup/component to the **Claude Design** project, or
  - serve it on a **running localhost page** (updated in place) and tell him the
    URL and where to look.
- State explicitly which review method is being used and what feedback is needed.

### Visual QA Geometry

When verifying visual spacing or overlap, DOM border-box measurements alone are not sufficient.
Measure the visible painted edges, including borders, box shadows, pseudo-elements, sticky offsets,
and the pseudo-element containing block. Confirm the result in a rendered browser capture at every
required breakpoint before reporting the visual state as verified.

### Git Truthfulness

- `Committed` means `git commit` actually succeeded and produced a hash.
- `Pushed` means `git push` actually succeeded.
- `Clean` means `git status --short` returned no files.
- Never silently decide not to commit after a `handoff` or `sync` request.
- Never use vague completion language such as "wrapped", "saved", "done", "handoff complete", or "synced" when the git facts do not prove it.

### Proactive Completion Reporting and Continuation

After every implementation or verification pass, Codex must immediately report:

- What is working and the evidence that verifies it.
- What remains incomplete or unverified.
- Every known blocker, risk, failed check, and production-readiness gap.
- The next concrete action.

Codex must not wait for Randall to ask whether anything remains, ask for status, or force
disclosure of material findings. Passing focused tests is not a stopping point when release
gates, integration failures, dirty files, deployment steps, or known risks remain.

When safe work remains within the approved scope, Codex continues without waiting for another
prompt. Codex stops only when the requested outcome is complete, a decision or authorization is
genuinely required, or further action would conflict with concurrent file ownership. When it
stops, the reason and exact next action must be reported immediately.

### Project Operating State

Before doing implementation work after a restart, handoff, sync, or "pick up where we left off" request, Codex must read `docs/project-operating-state.md` and follow its Session Start Protocol. Handoff, roadmap, audit, and design docs are context, not authorization to edit. If the requested next step is ambiguous, Codex must report the ambiguity and wait for explicit scope instead of choosing creatively.

### Durable Rule Changes

When user feedback implies a new standing workflow rule, Codex must:
- Identify the implied rule explicitly.
- State that the rule belongs in persistent repo instructions.
- Ask for approval to write it into `AGENTS.md` or the appropriate repo instruction file.
- After approval, write the rule and report the exact file changed.

Chat acknowledgement is not durable memory. If a behavioral rule matters, it must be written to the repo.

### Public Product Copy Boundary

Do not put internal implementation reasoning, roadmap sequencing, backend terminology, provider details, agent/tool notes, or recovery-session commentary into public-facing app copy. Translate internal product logic into user-facing language before editing UI text, metadata, onboarding text, dashboard text, or marketing sections.

### Public Product Vocabulary & Positioning

These are standing copy rules for all user-facing surfaces (Randall, 2026-06-26):

- **Not a beta, not a phased rollout.** Never use "beta", "rollout", "open now", "limited", "coming soon", or availability-announcement framing. The Access section is a **pricing structure** with three ascending tiers named **Good / Gooder / Goodest**.
- **No "proof" vocabulary.** Never use the word "proof" (proof, Proof Library, proof object, proof selection, "what this proves", etc.) in user-facing copy. The user-facing concept is **work examples / portfolio** — text-only examples used as context for outreach-message generation.
- **No "improve the profile / improve matching" framing.** Matches are rated by the system to provide better matching; the user maintains/keeps their profile current, they do not "improve matching."
- **Brand voice: anti-corporate-speak.** Dumpster Fire is not a tool for corporate-speak lovers. The positioning is about bringing the user's personality to the table when pursuing a job. Copy should sound human and specific, never generic corporate boilerplate.
- **No em dashes in generated messages (Randall, 2026-07-14).** No message generated on Dumpster Fire's platform may ever contain an em dash. Use alternate punctuation or sentence structure instead: commas, parentheses, semicolons, colons, or a new sentence. This is a hard generation rule (prompt-enforced, measured by the outreach-quality harness `emDash` meter), extending the no-em-dash rule already applied to static product copy.
- **No logistics talk in generated outreach (Randall, 2026-07-14).** Outreach messages never discuss, volunteer, or make claims about location, remote, hybrid, in-office, relocation, time zones, or availability — regardless of the user's remote-preference setting or the job's stated location. Outreach sells the fit; logistics belong to later conversations. Hard generation rule (prompt-enforced + `logisticsMention` detector).

### Human Path Result Mix (Randall, 2026-07-22)

Human Path must return a useful mix of up to five verified contacts rather than collapsing
the result to one supposedly best person.

- Search, verify, and rank **Hiring Manager**, **Recruiter**, and **Functional Leader** as
  independent result lanes. One lane must never suppress discovery or display of another.
- When credible matches can be found, always include both a Hiring Manager and a Recruiter.
  Include Functional Leaders when credible matches are available, then use any remaining
  capacity for other useful, clearly classified contacts up to the five-contact maximum.
- Classification variety is part of the product value. Preserve each contact's honest role
  in the hiring path so the user can decide whom to approach; do not reduce a varied set to
  a single contact merely because that person ranks highest overall.
- Filtering exists to improve truthfulness within each lane, not to erase lanes. Company or
  function adjacency alone is not evidence that someone manages the opening or belongs in
  its hiring chain. A displayed classification must be supported by evidence appropriate to
  that classification.
- If a required lane has no credible result after its own search and verification pass,
  return the other credible lanes and retain auditable diagnostics for the missing lane.
  Never fill a lane with an unrelated person just to satisfy the desired mix.
- Prompt wording alone is insufficient enforcement. Production implementation must encode
  lane-aware discovery, verification, result assembly, and regression tests that prove one
  contact category cannot crowd out another.

### Input Conventions — List-Like Fields (Randall, 2026-07-10)

Every user-facing input that collects a LIST of values must behave identically, on
current surfaces and anything built later (onboarding, dashboard, scan page):

- **Short values (titles, companies, tags, industries) = token/chip input.** Chips render
  above the input; Enter, comma, and blur all commit; a typed or pasted comma splits into
  one chip per segment; × removes; dedupe is case-insensitive. Catalogue-backed fields
  keep their type-ahead + custom-add on top of the same gestures.
- **Prose-length entries (fit signals, skill evidence) = newline-separated textarea** —
  one entry per line. NEVER split prose fields on commas; sentences contain commas.
- **Single-value action inputs (e.g. paste-a-URL + Add) = input + button, Enter also
  commits.** No comma handling.
- Instructional copy must state the gesture ("Enter or comma adds it" / "one per line").
  Never ship a list input whose saved values are invisible to the user.

New list inputs map to the shared token-input primitive in the design system; do not
invent a fourth interaction pattern.

### Universal Contact Discovery & Relevance (Randall, 2026-07-22)

Contact discovery and ranking must work for every user's experience, industry, job,
and target company. Never turn evidence from one user, company, industry, named team,
or job family into a global matching rule or default mapping.

- Derive the target dynamically from the current user's profile and the specific job:
  function, discipline, career level, business area, industry, and relevant location
  constraints.
- Determine a contact's remit from current public evidence, not employer and title
  alone. Compare contacts using universal dimensions such as career stage, function,
  discipline, business or product area, role type, geography when relevant, evidence
  strength, and evidence freshness.
- Treat explicit contradictions differently from missing evidence. A contradictory
  remit can reduce or eliminate relevance; an unknown remit must remain unknown and
  must not be presented as confirmed alignment.
- Overindex on returning and ranking potentially useful contacts rather than filtering
  them out. Preserve variety across recruiters, hiring managers, and functional leaders.
  Do not discard plausible contacts merely to satisfy a category quota.
- Result counts are elastic. "Up to 5" is a presentation preference, not a hard product
  cap. If discovery produces 10 useful contacts, retain and expose the useful results;
  reduce volume only when evidence shows that doing so improves the experience.
- Rank by likely outreach usefulness and explain uncertainty. Do not fill a category
  with a clearly conflicting contact, but do not require requisition-level certainty
  before a potentially useful contact can appear.
- Direct-search output is candidate discovery, not a reason to add a second aggressive
  filtering stage. Prefer lightweight ranking, retain unknown-but-plausible contacts,
  and use the person's LinkedIn profile as the final current-profile validation surface.
  A separate paid web-verification stage requires a concrete failure and explicit approval.

This rule is advisory: agents are required to follow it, but no mechanical hook blocks
an agent from ignoring it.

### Action Color Roles (Randall 2026-07-23)

Standing color semantics for every action control, app-wide. `--role-action` is **teal**.

- **Teal = affirmative / proceed / done.** Every proceed CTA (Pursue, Run scan, Resume, Add,
  primary CTAs) is teal. Every "done" state is teal: **Saved AND Skipped both render as solid
  teal fill + white checkmark, identically.**
- **Tomato = negative / destructive ONLY** (Skip, the remove/circled-X, Not a match). Tomato is
  never a proceed CTA and never a generic accent. The circled-X remove control is tomato at rest
  (not only on hover).
- **Mustard = Save + utility actions** (the Save button, View Saved Pursuits, all Edit buttons)
  plus new/weird flags. Solid mustard fill carries **ink text**, not paper.
- **Open posting = ink text with a mustard underline.** Never mustard text (fails contrast on
  cream), never a turquoise/teal tint, never a ghost button. Hit area padded to full font height.
- **The old "red + yellow never co-star" rule is RETIRED.** By direction, solid mustard Save sits
  directly beside tomato Skip in the action row.

This rule is advisory. It is codified in `docs/design-canon.md` §1 and the `--role-*` token
comments in `app/globals.css` + `design-system/tokens/tokens.css`; keep all three in sync.

### Design Authority

Codex must not invent UI, layout, CSS, visual hierarchy, component structure, or public-facing presentation from its own judgment.

Before touching any UI, CSS, design, layout, component, copy-bearing, or visual presentation file, Codex must:
- Identify the exact approved design source being followed.
- Identify the exact existing component, card, or primitive being mapped.
- List the exact files proposed for editing.
- Wait for explicit approval for that design scope.

Product behavior approval is not design approval. A request to add behavior, remediation, validation, guidance, or data wiring does not authorize new layout, new CSS, new cards, new panels, new visual treatments, new component structure, or public copy changes.

If no approved design source exists for the requested UI change, Codex must stop and ask for design direction instead of creating a reasonable-looking interface.

Docs, roadmaps, audits, handoffs, and recommended-next-step notes are context only. They are never authorization to make design changes.

For protected surfaces, Codex may inspect and report, but must not edit without explicit scoped approval:
- Homepage layout or copy.
- Onboarding layout or CSS.
- Dashboard layout or CSS.
- Global CSS, design tokens, fonts, or design-system foundations.
- Public product copy.

If a needed implementation touches any protected surface, Codex must report the conflict and wait.

### Design-Edit Confirm Gate — MECHANICAL (an ask, not a block) (Randall 2026-07-20)

Design Authority above was, for weeks, enforced only by advisory reminders (hook
`additionalContext`, AGENTS.md text, memory). Those are Post-it notes: the model reads them
and can proceed anyway. They failed repeatedly. This gate is mechanical instead: Claude
cannot edit a design file without Randall answering a prompt first.

- **Mechanism (ASK):** `.claude/hooks/design-guard.sh`, wired as a PreToolUse hook in
  `.claude/settings.json`, returns `permissionDecision: "ask"` when a `Write|Edit|MultiEdit`
  targets a **design file** — `design-system/**`, `*.module.css`, `app/ds.css`,
  `app/globals.css`. That surfaces a confirm prompt to Randall BEFORE the edit runs:
  Allow = design already approved in Claude Design, implement it locally; Deny = take it to
  Claude Design first.
- **Scope is design files ONLY.** Logic files, the dev server, and everything else are never
  touched. It is an ask, not a hard deny — Randall decides each time.
- **Known ceilings (stated honestly):** only as strong as the path matcher. `.tsx` design
  edits are NOT covered (matching every `app/**/*.tsx` would prompt on all logic work); they
  remain on the advisory canon hook. Changing the gate requires editing `settings.json` in the
  open, with Randall's approval.

### Rule Enforcement Honesty — ADVISORY (Randall 2026-07-20)

Whenever Claude describes a rule, hook, guardrail, gate, or safeguard — its own or the
project's — it must state that rule's ENFORCEMENT CLASS in the same breath: **blocking** (a
deny hook or `permissions.deny` that actually refuses the action) or **advisory** (text the
model is trusted to follow and CAN override). Never call something "hard", "enforced",
"wired", or "guardrail" when it only injects context or lives in an instruction file — those
are advisory. When Claude writes or updates a rule, it must tell Randall in the same message
whether Claude can ignore it. Presenting an advisory reminder as a hard block is a trust
violation, not a shortcut.

This rule is itself **advisory** — no script can verify Claude's honesty in prose. Saying so,
here and every time, is how Claude complies with it.

### No Gates Without Approval (hard rule, Randall 2026-07-16)

Never create a gate — anything that locks, disables, hides, or sequences access to fields,
sections, pages, or features until some condition is met — without Randall's explicit,
per-gate approval. This applies even when a design card or doc appears to show one: the
gating behavior itself must be called out and approved separately, never inferred. Decisions
that block a user's progress are Randall's to make, never the agent's. (Origin: the Card 1
onboarding gate shipped 2026-07 grayed out the entire form for new users with no explanation
and made the app unusable.)

If an existing gate is discovered in the codebase, report it; do not extend or replicate it.

### Design System ↔ Production Parity

The design system (`design-system/`) and the live production surfaces are two views of the
same design and must stay in parity (Randall, 2026-07-04). A change to one is not done until
the other matches.

- Any change to a shared component (footer, header, nav, cards, buttons, form controls,
  tokens) must land in BOTH the DS card under `design-system/` AND the corresponding live
  surface in the same pass — never one side without the other.
- Before closing out a component change, diff the DS card against the live implementation
  (markup, link targets, labels, layout, tokens) and reconcile any divergence.
- When a divergence is found (one side was corrected and the other was not), bringing the
  two back into parity IS the fix: update the stale side to match the correct side and
  re-sync the DS card to the Claude Design project.
- Across parallel sessions this is shared responsibility: if one session changes a live
  surface and another owns the DS card, the change is incomplete until both are updated —
  coordinate on `main` (see "No Branches — All Work On `main`").

### Full Design-Sync Checklist (hard rule, Randall 2026-07-09)

Pushing a card file alone is NOT a design sync. EVERY design change — including parity
edits to existing cards — must run ALL of these steps before it can be called synced:

1. Update the card HTML; the first line keeps its `<!-- @dsCard group="…" -->` marker.
2. Ensure the card has an entry in `_ds_manifest.json`'s cards array; push the manifest
   together with the card.
3. `register_assets` for every touched card (name + subtitle noting what changed +
   viewport) so the Design System pane actually refreshes and the update shows up.
4. Mirror the same files into the repo's `design-system/` and commit, so repo ↔ Claude
   Design project stay in parity (remote-only cards are how stale drift happens).
5. When a product change ships (fields removed, copy changed, limits changed), sweep ALL
   cards that show the affected surface — not just the card that prompted the change.
