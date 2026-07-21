#!/usr/bin/env bash
# Narrow design-edit confirm gate for Claude Code.
#
# When an edit targets a DESIGN file, this returns a PreToolUse permissionDecision
# of "ask", which surfaces a confirm prompt to Randall BEFORE the edit happens.
# Mechanical (Claude cannot proceed without an answer), but an ask, not a hard deny:
# Randall decides each time. Scope is design files ONLY -- logic files and the dev
# server are never touched.
set -uo pipefail

input=$(cat)
tool=$(printf '%s' "$input" | jq -r '.tool_name // empty')
fp=$(printf '%s' "$input"   | jq -r '.tool_input.file_path // empty')

# Only Write/Edit/MultiEdit on a design file gets a confirm prompt.
case "$tool" in
  Write|Edit|MultiEdit) ;;
  *) exit 0 ;;
esac

if printf '%s' "$fp" | grep -qE '(/design-system/|\.module\.css$|/app/(ds|globals)\.css$)'; then
  reason='Design file edit. Is this a 1:1 implementation of design already approved in Claude Design, or new design that should be built there first?  Allow = approved in Claude Design, implement it locally.  Deny = take it to Claude Design first.'
  jq -n --arg r "$reason" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:$r}}'
  exit 0
fi

exit 0
