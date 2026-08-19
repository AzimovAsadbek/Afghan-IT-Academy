#!/usr/bin/env bash
# Blocks reads and writes of secret-bearing files.
#
# Purpose: the remote repository is public. A secret pasted into a diff, a log,
# or a summary is a disclosure even if it is never committed. This hook stops
# the file being opened in the first place, which is cheaper than noticing
# afterwards.
#
# Wired as a PreToolUse hook for Read/Edit/Write in .claude/settings.json.
# Exit code 2 blocks the call; stderr is shown to the model.
set -euo pipefail

input=$(cat)

# The hook payload is JSON; extract the target path without needing jq.
file_path=$(printf '%s' "$input" |
  sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' |
  head -1)

[ -z "$file_path" ] && exit 0

# Normalise separators so Windows paths match the same patterns.
normalised=$(printf '%s' "$file_path" | tr '\134' '/')
basename_only=${normalised##*/}

case "$basename_only" in
  # .env.example is the committed template and contains no real values.
  .env.example) exit 0 ;;
  .env|.env.*)
    echo "BLOCKED: '$basename_only' holds environment secrets and must not be read or modified by an agent." >&2
    echo "Edit it directly, or change .env.example if the variable is part of the template." >&2
    exit 2
    ;;
  *.pem|*.key|*.p12|*.pfx|*.jks|*.keystore)
    echo "BLOCKED: '$basename_only' is a private key or keystore." >&2
    exit 2
    ;;
esac

case "$normalised" in
  */secrets/*|secrets/*)
    echo "BLOCKED: '$file_path' is under a secrets/ directory." >&2
    exit 2
    ;;
esac

exit 0
