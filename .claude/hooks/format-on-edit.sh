#!/usr/bin/env bash
# Formats a file immediately after it is edited.
#
# Purpose: keeps every diff free of formatting noise, so `pnpm verify` never
# fails on `format:check` and code review is about the change rather than
# whitespace.
#
# Wired as a PostToolUse hook for Edit/Write. Never fails the tool call: a
# formatting problem must not block work, and CI checks it anyway.
set -uo pipefail

input=$(cat)

file_path=$(printf '%s' "$input" |
  sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' |
  head -1)

[ -z "$file_path" ] && exit 0
[ -f "$file_path" ] || exit 0

case "$file_path" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.mts|*.json|*.css|*.md|*.yml|*.yaml) ;;
  *) exit 0 ;;
esac

# --ignore-unknown so files covered by .prettierignore are skipped quietly.
pnpm exec prettier --write --ignore-unknown "$file_path" >/dev/null 2>&1 || true

exit 0
