#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env.mcp"

if [ ! -f "$ENV_FILE" ]; then
  echo '{}' >&2
  exit 1
fi

CONTEXT7_API_KEY="$(grep -E '^CONTEXT7_API_KEY=' "$ENV_FILE" | cut -d= -f2-)"

if [ -z "$CONTEXT7_API_KEY" ]; then
  echo "CONTEXT7_API_KEY not set in .env.mcp" >&2
  echo '{}'
  exit 1
fi

printf '{"x-api-key": "%s"}\n' "$CONTEXT7_API_KEY"
