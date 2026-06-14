# Contributing to CommandsCenter

## Dev Setup

```bash
# 1. Clone the repo
git clone <repo-url> cc
cd cc

# 2. Install pnpm (if not already installed)
npm install -g pnpm

# 3. Install dependencies
pnpm install

# 4. (Optional) Set up MCP secrets — see the "MCP Secrets" section below

# 5. Start development servers
pnpm dev
```

The backend runs on `http://localhost:3000`, the frontend on `http://localhost:5173`.

On first global CLI startup, the app bootstraps `~/.cc/.env`, `~/.cc/workspace/`, and `~/.cc/data/`. Development commands still use the current working directory unless `CC_WORKSPACE_DIR` or `CC_DATA_DIR` is set.

## Runtime Environment

The shared backend and CLI bootstrap path validates these environment variables at startup:

| Variable                          | Description                                   | Default         |
| --------------------------------- | --------------------------------------------- | --------------- |
| `NODE_ENV`                        | Runtime mode                                  | `production`    |
| `CC_HOST`                         | HTTP bind host                                | `0.0.0.0`       |
| `CC_PORT`                         | HTTP listen port                              | `3000`          |
| `CC_WORKSPACE_DIR`                | Portable workspace state directory            | `.cc/workspace` |
| `CC_DATA_DIR`                     | Disposable runtime data directory             | `.cc/data`      |
| `CC_LOG_LEVEL`                    | Pino log level                                | `info`          |
| `CC_SECRET_KEY`                   | Secret encryption key                         | generated       |
| `CC_OPENCODE_HOST`                | OpenCode engine host                          | `127.0.0.1`     |
| `CC_OPENCODE_PORT`                | OpenCode engine port                          | `4100`          |
| `CC_OPENCODE_TIMEOUT_MS`          | OpenCode request timeout                      | `30000`         |
| `CC_OPENCODE_STARTUP_TIMEOUT_MS`  | Max time to wait for engine health on boot    | `30000`         |
| `CC_OPENCODE_SHUTDOWN_TIMEOUT_MS` | Grace period before engine shutdown cleanup   | `15000`         |
| `CC_OPENCODE_HEALTH_POLL_MS`      | Engine health polling interval                | `2000`          |
| `CC_OPENCODE_MAX_RESTARTS`        | Max automatic restarts within restart window  | `3`             |
| `CC_OPENCODE_RESTART_WINDOW_MS`   | Time window used for restart limiting         | `60000`         |
| `CC_OPENCODE_PATH`                | Optional custom OpenCode binary path override | unset           |
| `CC_MCP_AUTH_TIMEOUT_MS`          | MCP auth timeout                              | `90000`         |
| `CC_DRAIN_TIMEOUT_MS`             | Graceful shutdown timeout                     | `15000`         |
| `CC_UPDATE_CHECK`                 | Enable periodic update checks                 | `true`          |
| `CC_UPDATE_INTERVAL_MS`           | Update check interval                         | `21600000`      |
| `CC_AUTO_UPDATE`                  | Apply npm updates automatically               | `false`         |
| `CC_UPDATE_REGISTRY_URL`          | npm registry latest-version endpoint          | npm latest URL  |
| `CC_DOCKER`                       | Force Docker install mode                     | `false`         |
| `CC_MAX_TASKS`                    | Maximum configured tasks, 0/unset unlimited   | unset           |
| `CC_BUILTIN_SKILLS_DIR`           | Built-in skills directory override            | unset           |
| `CC_NPM_GLOBAL_ROOT`              | npm global root override for update detection | unset           |
| `CC_DOCKER_ENV_PATH`              | Docker marker path override for tests         | unset           |

## Available Commands

### Root-level (runs across all packages)

| Command              | Description                       |
| -------------------- | --------------------------------- |
| `pnpm dev`           | Start all dev servers in parallel |
| `pnpm build`         | Build all packages                |
| `pnpm test`          | Run unit/integration tests        |
| `pnpm test:coverage` | Run tests with V8 coverage        |
| `pnpm test:e2e`      | Run Playwright E2E tests          |
| `pnpm lint`          | Run ESLint across all packages    |
| `pnpm format`        | Check Prettier formatting         |
| `pnpm format:fix`    | Auto-fix Prettier formatting      |
| `pnpm typecheck`     | Run TypeScript type checking      |
| `pnpm clean`         | Remove build artifacts            |
| `pnpm build:cli`     | Build production CLI binary       |
| `pnpm release:check` | Run the full publish gate locally |

### Package-specific

| Command                                 | Description                |
| --------------------------------------- | -------------------------- |
| `pnpm --filter @cc/backend dev`         | Start backend only         |
| `pnpm --filter @cc/frontend dev`        | Start frontend only        |
| `pnpm --filter @cc/backend db:generate` | Generate Drizzle migration |
| `pnpm --filter @cc/backend db:migrate`  | Run migrations             |
| `pnpm --filter @cc/backend db:push`     | Push schema to DB          |
| `pnpm --filter @cc/backend db:studio`   | Open Drizzle Studio        |

### CLI

| Command                                        | Description                    |
| ---------------------------------------------- | ------------------------------ |
| `pnpm build:cli`                               | Build CLI (frontend + backend) |
| `node packages/cli/dist/bin.mjs start`         | Run production server          |
| `node packages/cli/dist/bin.mjs start -p 4000` | Run on a custom port           |
| `node packages/cli/dist/bin.mjs --help`        | Show CLI help                  |

## CLI Build Smoke Test

These commands are contributor-only checks for the source-built CLI before publishing. User-facing installs should use `npm install -g commandscenter`.

Build and run the CLI package without publishing:

```bash
pnpm build:cli
mkdir -p /tmp/ccenter-prod-test
cd /tmp/ccenter-prod-test
node /path/to/cc/packages/cli/dist/bin.mjs start --port 3000
```

From this repository root, replace `/path/to/cc` with the absolute repo path.

Test the service installer with a local tarball before npm publish:

```bash
pnpm --filter commandscenter build
cd packages/cli
npm pack
cd ../..
CCENTER_PACKAGE_SPEC="$(ls "$PWD"/packages/cli/commandscenter-*.tgz | tail -n 1)" bash scripts/install-ccenter-service.sh
```

## Git Workflow

### Pre-commit hooks

Husky + lint-staged run automatically on every commit:

- ESLint `--fix` on `*.ts` and `*.tsx` files
- Prettier `--write` on staged files

### Pre-push hooks

TypeScript type checking runs before push.

### Branch naming

Use descriptive branch names: `feat/specialist-chat`, `fix/terminal-resize`, `chore/update-deps`.

## Coding Standards

See [AGENTS.md](AGENTS.md) for the full coding style guide, including:

- TypeScript strict mode conventions
- File and naming conventions
- Error handling patterns
- Database and migration rules
- Testing requirements (90% coverage target)

## MCP Secrets

`.mcp.json` is tracked in git with empty keys. Each MCP server that needs auth has a `headersHelper` script (`scripts/mcp-headers-*.sh`) that reads secrets from files in `.secrets/` at connection time — no shell env setup required.

1. Create the secrets directory: `mkdir -p .secrets`
2. Write each secret into its own file, for example: `printf '%s' 'your-context7-key' > .secrets/context7-api-key`

Keys are loaded automatically by Claude Code when it connects to each MCP server.

OpenCode uses the tracked `opencode.jsonc` project config and reads secret files directly via `{file:...}` substitutions, so plain `opencode web` works without a wrapper.

## Adding a New Feature

1. Define Zod schemas in `@cc/shared` if data crosses the boundary
2. Add or modify Drizzle schema if persistence is needed, then generate migration
3. Implement backend service and route
4. Write backend tests
5. Implement frontend page/component
6. Write E2E test for the critical path
7. Run `pnpm typecheck && pnpm test && pnpm lint`

## Releasing

Only the `commandscenter` CLI package (`packages/cli`) is published to npm. Its `version` field in `packages/cli/package.json` is the single source of truth — the GitHub Release UI never bumps it for you.

### Release flow

1. Open a PR that bumps `packages/cli/package.json` `version` to the new `X.Y.Z`.
2. Merge the PR to `main`.
3. On GitHub, create a new **Release** with tag `vX.Y.Z` (must match the package version exactly) targeting `main`.
4. Publishing the release triggers `.github/workflows/publish.yml`, which:
   - validates the tag matches `^v\d+\.\d+\.\d+$`
   - validates the tag version equals `packages/cli/package.json` version
   - fails if `commandscenter@X.Y.Z` is already on npm
   - runs `pnpm release:check` (typecheck, lint, CLI tests, CLI build)
   - runs `npm publish --access public` from `packages/cli` using npm trusted publishing via GitHub OIDC
   - uploads the generated `commandscenter-X.Y.Z.tgz` as a release asset

### Required configuration

- npm package `commandscenter` must have a trusted publisher configured for this repository and workflow filename (`publish.yml`).
- The workflow already requests `id-token: write`, which npm trusted publishing requires.
- The publish job uses Node.js 24 with `actions/setup-node@v6` and validates Node.js/npm meet npm's trusted publishing minimums before publishing.
- No npm publish token is required for the `npm publish` step.
- `packages/cli/package.json` must define `repository.url`, and it must match the GitHub repository URL exactly for trusted publishing to succeed.

### Local dry run

Before tagging a release you can run the same gate locally:

```bash
pnpm release:check
```

If it passes, the publish workflow should also pass for the same commit.
