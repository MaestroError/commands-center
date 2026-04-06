#!/usr/bin/env bash
# Load MCP environment variables from .env.mcp into the current shell.
# Usage: source scripts/load-env-mcp.sh

set -euo pipefail

ENV_FILE="${BASH_SOURCE[0]%/*}/../.env.mcp"

if [ ! -f "$ENV_FILE" ]; then
  echo "No .env.mcp found — copy .env.mcp.example and fill in your keys." >&2
  return 1 2>/dev/null || exit 1
fi

set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

echo "Loaded MCP env vars from .env.mcp"
