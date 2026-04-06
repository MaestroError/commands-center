#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEY_FILE="$SCRIPT_DIR/../.secrets/context7-api-key"

if [ ! -f "$KEY_FILE" ]; then
  echo '{}' >&2
  exit 1
fi

CONTEXT7_API_KEY="$(tr -d '\r' < "$KEY_FILE")"

if [ -z "$CONTEXT7_API_KEY" ]; then
  echo "Context7 API key file is empty: .secrets/context7-api-key" >&2
  echo '{}'
  exit 1
fi

printf '{"x-api-key": "%s"}\n' "$CONTEXT7_API_KEY"
