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

Do not say or imply that a handoff is complete unless `git commit` succeeded and produced a commit hash. If there is a reason not to commit, say so before deviating and report the exact repository state.

### Sync

When the user says `sync`, Codex must:
- Complete the full `handoff` protocol.
- Push the resulting commit to the active remote/branch.
- Report the branch, remote, commit hash, and push result.
- Report any remaining dirty or untracked files.

Do not say or imply that work is synced unless the commit and push both succeeded.

### Git Truthfulness

- `Committed` means `git commit` actually succeeded and produced a hash.
- `Pushed` means `git push` actually succeeded.
- `Clean` means `git status --short` returned no files.
- Never silently decide not to commit after a `handoff` or `sync` request.
- Never use vague completion language such as "wrapped", "saved", "done", "handoff complete", or "synced" when the git facts do not prove it.

### Durable Rule Changes

When user feedback implies a new standing workflow rule, Codex must:
- Identify the implied rule explicitly.
- State that the rule belongs in persistent repo instructions.
- Ask for approval to write it into `AGENTS.md` or the appropriate repo instruction file.
- After approval, write the rule and report the exact file changed.

Chat acknowledgement is not durable memory. If a behavioral rule matters, it must be written to the repo.

### Public Product Copy Boundary

Do not put internal implementation reasoning, roadmap sequencing, backend terminology, provider details, agent/tool notes, or recovery-session commentary into public-facing app copy. Translate internal product logic into user-facing language before editing UI text, metadata, onboarding text, dashboard text, or marketing sections.
