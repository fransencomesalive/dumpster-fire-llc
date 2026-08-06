#!/usr/bin/env bash
# Narrow design-edit confirm gate for Claude Code.
#
# When an edit targets a DESIGN file, this returns a PreToolUse permissionDecision
# of "ask", which surfaces a confirm prompt to Randall BEFORE the edit happens.
# Mechanical (Claude cannot proceed without an answer), but an ask, not a hard deny:
# Randall decides. Scope is design files ONLY -- logic files and the dev server are
# never touched.
#
# ONCE PER SESSION (Randall 2026-08-05). The gate used to fire on every single design
# file, which made a legitimate approved bulk pass (a 17-card copy sweep) cost ~40
# identical confirmations and pushed Claude toward scripting around the gate entirely.
# Now the FIRST design edit in a session asks; once one is actually approved, the rest
# of that session's design edits pass without prompting.
#
# The marker is written by the PostToolUse half of this hook (see .claude/settings.json),
# which only runs when the tool actually executed -- i.e. only after Randall ALLOWED it.
# A denial writes nothing, so the next attempt asks again. The marker is keyed to the
# session id and lives in the temp dir, so a new session starts gated again.
set -uo pipefail

input=$(cat)
tool=$(printf '%s' "$input" | jq -r '.tool_name // empty')
fp=$(printf '%s' "$input"   | jq -r '.tool_input.file_path // empty')
sid=$(printf '%s' "$input"  | jq -r '.session_id // empty')
event=$(printf '%s' "$input" | jq -r '.hook_event_name // empty')

# Only Write/Edit/MultiEdit on a design file is in scope.
case "$tool" in
  Write|Edit|MultiEdit) ;;
  *) exit 0 ;;
esac

printf '%s' "$fp" | grep -qE '(/design-system/|\.module\.css$|/app/(ds|globals)\.css$)' || exit 0

marker="${TMPDIR:-/tmp}/claude-design-guard-approved-${sid:-nosession}"

# PostToolUse: the edit already ran, which means it was approved. Record that.
if [ "$event" = "PostToolUse" ]; then
  : > "$marker" 2>/dev/null || true
  exit 0
fi

# PreToolUse: stay silent if this session already has an approved design edit.
[ -n "$sid" ] && [ -f "$marker" ] && exit 0

reason='Design file edit (first one this session). Is this a 1:1 implementation of design already approved in Claude Design, or new design that should be built there first?  Allow = approved in Claude Design, implement it locally; the rest of this session'"'"'s design edits will not re-prompt.  Deny = take it to Claude Design first.'
jq -n --arg r "$reason" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:$r}}'
exit 0
