export const DEFAULT_WORKSPACE_GITIGNORE = `# CommandsCenter runtime state and credentials
/.cc/
/auth/
/database/
/sessions/
/.cc-migrations/
/tmp/
/update-history.json
/configuration/secrets.json

# CC writes literal MCP bearer tokens into generated specialist configs.
# Root config may also contain literal MCP headers; env references are not universal.
# CC-managed specialist settings are regenerated from portable configuration.
# Review credentials before tracking hand-written overrides in these files.
/opencode.jsonc
/specialists/**/opencode.jsonc

# Operator and specialist content that may contain private context
/Documents/
/specialists/**/Documents/
/specialists/**/memory/
/specialists/**/conversation_log/
/specialists/**/playground/

# Generated per-specialist OpenCode and browser state
/specialists/**/.opencode/cc-tools/
/specialists/**/.playwright-mcp/

# Local secrets
.env
.env.*
!.env.example
*.pem
*.key
*.p12
*.pfx

# Dependencies, build output, caches, and test artifacts
node_modules/
.venv/
venv/
__pycache__/
.cache/
dist/
build/
.next/
coverage/
playwright-report/
test-results/

# Logs and operating-system noise
*.log
*.log.*
.DS_Store
Thumbs.db
`;
