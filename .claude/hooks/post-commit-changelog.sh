#!/bin/bash
# Post-tool hook: remind Claude to update CHANGELOG after git commit/push

input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // empty')

if echo "$command" | grep -qE 'git (commit|push)'; then
  echo "CHANGELOG reminder: A git commit/push was detected. Run /changelog to update CHANGELOG.md [Unreleased] section if needed."
fi

exit 0
