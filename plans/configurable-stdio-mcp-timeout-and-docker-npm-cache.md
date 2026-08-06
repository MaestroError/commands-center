# Configurable stdio MCP timeout and persistent Docker npm cache

## Problem

OpenCode gives local stdio MCP processes 30 seconds to initialize by default.
Cold `npx -y <package>` execution in the Docker image can spend longer than that
downloading and preparing a package, so OpenCode reports
`Operation timed out after 30000ms` even though `npx` is installed.

Docker persists `/workspace`, while npm's default cache lives under
`/home/node/.npm`. Container recreation therefore discards the warm cache and
repeats the slow first launch.

## Confirmed product decisions

- Default the stdio MCP timeout to **120 seconds**.
- Default Docker's npm cache to **`/workspace/.cc/npm-cache`** so the existing
  workspace volume preserves it across container recreation.
- Make both values configurable through CC environment variables and generated
  `.env` files.
- Do not add a Settings UI in this change.
- Do not preinstall suggested MCP packages.

## Configuration design

### `CC_MCP_STDIO_TIMEOUT_MS`

- Add `CC_MCP_STDIO_TIMEOUT_MS`, parsed as a positive integer with a default of
  `120000`.
- Expose it as `config.timeouts.mcpStdioMs`.
- Render it as OpenCode's `timeout` property on every managed **local/stdio** MCP
  entry.
- Leave remote MCP entries unchanged; `CC_MCP_AUTH_TIMEOUT_MS` continues to own
  browser authentication timing and is not repurposed.
- Document that OpenCode uses this single timeout for the stdio connection
  handshake, tool discovery, and MCP requests/tool calls. The name is therefore
  scoped to stdio rather than promising a startup-only control OpenCode does not
  expose.

The timeout is installation runtime policy rather than portable MCP
configuration. A copied workspace receives the safe 120-second default on the
new installation without persisting a machine-specific override in
`configuration/mcp.json`.

### `CC_NPM_CACHE_DIR`

- Add optional `CC_NPM_CACHE_DIR` path handling.
- Resolution rules:
  - explicit absolute paths are used as-is;
  - explicit relative paths resolve against CC's runtime `cwd`, matching other
    CC path settings;
  - when unset and `CC_DOCKER=true`, use `/workspace/.cc/npm-cache`;
  - when unset outside Docker, inject nothing and preserve npm's native
    `$HOME`-based cache behavior.
- Expose the resolved value as `config.opencode.npmCacheDir?: string` (or an
  equivalently scoped runtime field).
- Create the directory recursively before starting OpenCode.
- Inject `NPM_CONFIG_CACHE=<resolved path>` into the managed OpenCode child
  environment **after** ambient variables and stored secrets so the documented
  CC setting wins. Stdio MCP children and OpenCode-hosted terminals inherit it.
- Do not set `CC_NPM_CACHE_DIR` or `NPM_CONFIG_CACHE` directly with Dockerfile
  `ENV`: shell/container variables override generated `.env` values, which would
  prevent an operator from changing this setting in `/workspace/.cc/.env`.
  Derive the Docker default in runtime configuration instead.

The npm cache is disposable runtime state. Keeping it under the mounted
`/workspace` volume improves rebuild behavior but does not make it portable
configured state and does not need filesystem migration coverage.

## Why environment configuration is sufficient

These controls are installation-wide process policy, are changed rarely, and
take effect only after CC/OpenCode restarts. A Settings UI would need another
workspace preference layer, precedence rules against `.env`, validation, and a
restart flow without enabling a meaningful per-workspace user workflow yet.

For this change:

- document both keys in `.env.example`, `.env.prod.example`, README, and Docker
  deployment guidance;
- include them in the generated production env template allowlist;
- state clearly that editing the env file requires restarting the CC service or
  container, not merely refreshing the Integrations page.

A Settings UI can be considered later if operators need frequent runtime tuning.

## Implementation touch points

1. `packages/backend/src/lib/runtime-config.ts`
   - parse/default `CC_MCP_STDIO_TIMEOUT_MS`;
   - resolve `CC_NPM_CACHE_DIR` and the Docker fallback;
   - expose both runtime values.
2. `packages/backend/src/opencode/opencode-env.ts`
   - extend the child-environment helper, or add a focused package-runtime helper,
     that injects `NPM_CONFIG_CACHE` and ensures the cache directory exists.
3. `packages/backend/src/lib/start-server-runtime.ts`
   - create the configured cache directory before orchestration;
   - apply the cache environment override with explicit precedence.
4. `packages/backend/src/services/mcp-server-service.ts`
   - render `timeout: config.timeouts.mcpStdioMs` for local MCP entries only.
5. `.env.example` and `.env.prod.example`
   - document defaults, units, scope, path resolution, and restart requirement.
6. `README.md` and `docs/deploy-coolify.md`
   - document the persistent Docker default and optional overrides;
   - explain that `/workspace` storage now also retains downloaded npm packages.

## Test plan

### Runtime configuration

- `CC_MCP_STDIO_TIMEOUT_MS` defaults to `120000`, accepts a positive override,
  and follows the existing positive-integer timeout validation behavior for
  invalid values.
- Docker plus an unset cache variable resolves to
  `/workspace/.cc/npm-cache`.
- An explicit cache path overrides the Docker default; relative paths resolve
  against `cwd`.
- Non-Docker plus an unset cache variable leaves npm cache injection undefined.

### OpenCode environment and MCP rendering

- The configured npm cache directory is created recursively before OpenCode
  starts.
- `NPM_CONFIG_CACHE` reaches the OpenCode child and wins over an ambient value.
- Unset non-Docker configuration leaves the child environment unchanged.
- Generated local MCP entries include `timeout: 120000` by default and the env
  override when configured.
- Remote MCP entries do not receive the stdio timeout.
- The portable `configuration/mcp.json` remains unchanged by this runtime-only
  policy.

### Verification

- Run ESLint with `--fix` on touched packages, then `pnpm lint`.
- Run `pnpm typecheck` and focused runtime-config, OpenCode-env, MCP-service, and
  boot tests.
- Run the full backend test suite and CLI build/tests because the production env
  template is bundled by the CLI.
- Build the Docker image and manually smoke-test a cold suggested `npx` MCP:
  first initialization may be slow but must complete inside 120 seconds; a new
  container with the same `/workspace` volume must reuse
  `/workspace/.cc/npm-cache` and initialize warm.
- Confirm an explicit `.env` override changes the rendered timeout/cache path
  after a container restart.

## Success criteria

- A cold `npx` stdio MCP has 120 seconds to initialize by default.
- Docker container recreation with the same `/workspace` volume reuses npm's
  downloaded package cache.
- Operators can override both values through `.env` and apply them by restarting
  the service/container.
- Bare-metal installs keep npm's native cache location unless explicitly
  configured.
- No suggested MCP package is preinstalled or added as a CommandsCenter
  dependency.

## Out of scope

- A Settings-page editor for these environment-backed runtime controls.
- Per-MCP timeout overrides in the Integrations UI.
- Separate OpenCode startup, discovery, and tool-call timeouts (OpenCode exposes
  one timeout on the MCP entry).
- Preinstalling, pinning, or otherwise managing suggested MCP npm packages.
- Cache eviction, size limits, or a “clear npm cache” action.
