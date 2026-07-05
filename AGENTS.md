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

### Parallel Session Workflow

When more than one session is active at the same time, Codex must treat each session as an independent workstream.

- Every session must work on its own branch; do not commit directly to `main` during parallel work.
- Use a branch name that clearly identifies the workflow and date, for example:
  - `design/onboarding-2026-07-04`
  - `feat/legal-pages-2026-07-04`
  - `fix/auth-flow-2026-07-04`
- Keep each session scoped to one workflow and one branch.
- Before editing, report the active branch, workflow focus, and the files expected to change.
- If two sessions touch the same files, pause and coordinate before proceeding.
- Keep the session-to-branch map current in [docs/session-branch-map.md](docs/session-branch-map.md).

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

### Git Truthfulness

- `Committed` means `git commit` actually succeeded and produced a hash.
- `Pushed` means `git push` actually succeeded.
- `Clean` means `git status --short` returned no files.
- Never silently decide not to commit after a `handoff` or `sync` request.
- Never use vague completion language such as "wrapped", "saved", "done", "handoff complete", or "synced" when the git facts do not prove it.

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
