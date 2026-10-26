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

| Variable                 | Description                                   | Default         |
| ------------------------ | --------------------------------------------- | --------------- |
| `NODE_ENV`               | Runtime mode                                  | `production`    |
| `CC_HOST`                | HTTP bind host                                | `0.0.0.0`       |
| `CC_PORT`                | HTTP listen port                              | `3000`          |
| `CC_WORKSPACE_DIR`       | Portable workspace state directory            | `.cc/workspace` |
| `CC_DATA_DIR`            | Disposable runtime data directory             | `.cc/data`      |
| `CC_LOG_LEVEL`           | Pino log level                                | `info`          |
| `CC_SECRET_KEY`          | Secret encryption key                         | generated       |
| `CC_OPENCODE_TIMEOUT_MS` | OpenCode request timeout                      | `30000`         |
| `CC_MCP_AUTH_TIMEOUT_MS` | MCP auth timeout                              | `90000`         |
| `CC_DRAIN_TIMEOUT_MS`    | Graceful shutdown timeout                     | `15000`         |
| `CC_UPDATE_CHECK`        | Enable periodic update checks                 | `true`          |
| `CC_UPDATE_INTERVAL_MS`  | Update check interval                         | `21600000`      |
| `CC_AUTO_UPDATE`         | Apply npm updates automatically               | `false`         |
| `CC_UPDATE_REGISTRY_URL` | npm registry latest-version endpoint          | npm latest URL  |
| `CC_DOCKER`              | Force Docker install mode                     | `false`         |
| `CC_MAX_TASKS`           | Maximum configured tasks, 0/unset unlimited   | unset           |
| `CC_BUILTIN_SKILLS_DIR`  | Built-in skills directory override            | unset           |
| `CC_NPM_GLOBAL_ROOT`     | npm global root override for update detection | unset           |
| `CC_DOCKER_ENV_PATH`     | Docker marker path override for tests         | unset           |

## Available Commands

### Root-level (runs across all packages)

| Command                     | Description                                              |
| --------------------------- | -------------------------------------------------------- |
| `pnpm dev`                  | Start all dev servers in parallel                        |
| `pnpm build`                | Build all packages                                       |
| `pnpm test`                 | Run unit/integration tests                               |
| `pnpm test:coverage`        | Run tests with V8 coverage                               |
| `pnpm test:e2e`             | Run Playwright E2E tests                                 |
| `pnpm test:e2e:embedded`    | Build and test the local v2 chat integration in Chromium |
| `pnpm dev:embedded-preview` | Open an isolated v2 chat preview server                  |
| `pnpm lint`                 | Run ESLint across all packages                           |
| `pnpm format`               | Check Prettier formatting                                |
| `pnpm format:fix`           | Auto-fix Prettier formatting                             |
| `pnpm typecheck`            | Run TypeScript type checking                             |
| `pnpm knip`                 | Dead-code analysis (CI gate)                             |
| `pnpm knip:production`      | Stricter, production-only knip scan                      |
| `pnpm design-system:audit`  | Run design-system ratchets and negative fixtures         |
| `pnpm clean`                | Remove build artifacts                                   |
| `pnpm build:cli`            | Build production CLI binary                              |
| `pnpm release:check`        | Run the full publish gate locally                        |

### Local OpenCode v2 chat testing

Run `pnpm test:e2e:embedded` to build the frontend and run Chromium against an
isolated CC server at `http://127.0.0.1:4176`. Install Chromium with
`pnpm exec playwright install chromium` if it is not already available. Use the
same Node major version used to install native dependencies; after changing Node
versions, rebuild it with `pnpm --filter @cc/backend rebuild better-sqlite3`.

This suite uses real owner login, specialist management, workspace generation,
chat HTTP/SSE, SQLite and the embedded SDK. The model provider is a local
deterministic fixture, and external MCP OAuth uses a local test authorization server.
It checks replies, attachments, native configuration, updated instructions, persistence
after page reload, CC-managed tools, custom-tool copies and permissions, MCP OAuth,
manual/scheduled tasks, cancellation, monitor recovery, file search/editor opening
and live workspace-change notifications. It does not intercept
the browser's CC API requests.

For manual exploration, run `pnpm dev:embedded-preview`, open the URL printed in
the terminal, and sign in with `Local-v2-test-password!`. Create a specialist
using the `local-e2e/test` model. Ordinary replies are deliberately fixed. To exercise
a tool, send `CALL:cc_default_get_self_profile` or `CALL:cc_custom_<tool-slug>`.
The fixture requests that tool with empty arguments and reports its actual result. The preview
uses a temporary workspace, prints its location, and removes it on normal exit.
It binds only to loopback and never starts an OpenCode daemon.

The fixture now uses normal `startServerRuntime` and full application route
registration with local model/OAuth providers. MCP management, custom tools,
secrets, task execution and scheduling use the same v2 services as normal startup.
Native integration tests also close and reopen the SDK host against the same workspace
to check completed, queued and interrupted task recovery. Workspace search and
specialist file routes use the embedded file adapter. Standard development/CLI
startup now uses the embedded v2 host. The dedicated suite is excluded from the existing mocked UI suite.

The v2 preview uses the SDK for filename lookup and Git status/diffs, and CC's
existing filesystem service for file reads and editing. Text search uses pinned
`@vscode/ripgrep@1.18.0` because the SDK has no public text-search API. Keep this
package external to esbuild, with its platform binary installed alongside the CLI.
Search respects ignore files, excludes `.git`, `.cc` and `node_modules`, and caps
results at 100 matching lines. Text edits are visible immediately; the SDK's
filename index refreshes on a 10-second interval when queried. Deleted cached
entries are omitted. SDK 2.0.27 needs location plugins initialized before VCS
queries; the adapter uses the public model-list call before status/diff reads.

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

### Integration branches

Until v1.0.0 is released, `codex/opencode-v2-migration` is the development
integration branch. Create new feature/fix branches from its latest head and
target pull requests back to it. The OpenCode v2 migration is complete; upstream
security fixes and release acceptance are tracked separately. This temporary
workflow takes precedence over the ordinary staging workflow below for v1 work.
It does not change the GitHub default branch or existing automation configuration.

Automated maintenance branches start from `staging` and open draft pull requests back to `staging`. After review and required checks, a human merges them into `staging`. A weekly draft promotion pull request integrates `staging` into `main`; a human reviews and merges that promotion. Direct pushes to either protected branch are not part of this workflow.

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
- Testing requirements (95% coverage target)

## Design-System Workflow

Start with the [CC design-system guide](docs/design-system/README.md). It
explains when to use semantic HTML, Tailwind, CC-owned primitives, common
compositions, protected content, or a third-party bridge. Theme work follows
[the theme runbook](docs/design-system/themes.md); exceptional artwork or
controlled palettes follow [the exception workflow](docs/design-system/exceptions.md).

Run the same deterministic audit used by CI:

```bash
pnpm design-system:audit
```

The development-only gallery is available at
`http://localhost:5173/__design-system-baseline`. It is excluded from production
builds. Use the `surface` query parameter documented by the gallery fixture
manifest when reviewing focused states.

## Dead-Code Analysis (knip)

[knip](https://knip.dev) keeps unused files, exports, and dependencies from
piling up. `pnpm knip` runs in CI (the **Static Checks** job) and as part of
`pnpm release:check`; a newly unused file, export, or dependency fails the
build. Run it locally before pushing to catch findings early.

The config lives in [`knip.json`](knip.json). A few things worth knowing:

- **Entry points knip can't infer** are declared explicitly: the CLI binary
  (`packages/cli/src/bin.ts`, which resolves to `dist/bin.mjs`), the root
  `scripts/*`, and the Playwright e2e fixtures. Entry points knip _can_ infer
  from package scripts — `packages/cli/build.ts` (`build`) and
  `packages/backend/src/dev.ts` (`dev`) — are left implicit on purpose.
- **`ignoreDependencies`** covers packages that are used but not through a
  static import knip can trace: `better-sqlite3`, `node-pty`, `@vscode/ripgrep`, `@opencode/sdk` and `pino` (esbuild
  externals in `packages/cli/build.ts`, required at runtime by the bundle) and
  `pino-pretty` (a string transport target in
  `packages/backend/src/lib/logger.ts`).
- **`ignoreExportsUsedInFile`** stops knip from flagging exports that are only
  referenced within their own file.
- The `types` and `duplicates` rules are turned **off** because the codebase leans on two intentional conventions: `export type FooService = ReturnType<typeof createFooService>` companions next to each service factory, and semantic schema aliases (e.g. `activeTaskRunListSchema = taskRunListSchema`). Unused files, dependencies, unlisted binaries, and unused value exports still fail the build.

`pnpm knip:production` runs a stricter, production-only pass (test and dev entry
points excluded). It reports more by design and is a developer aid, not a CI
gate.

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
4. Pushing the version tag (including creating it through the Release UI) triggers `.github/workflows/publish.yml`, which:
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

### OpenCode v2 migration branch

The embedded host foundation uses pinned `@opencode/sdk@2.1.4`. Keep it external
to esbuild and declared in both the backend and CLI runtime dependencies: its
native modules and assets must remain in the installed package tree.

`createEmbeddedOpenCodeHost` owns one active host and binds the process to one
workspace, including after shutdown. It sets XDG and npm cache paths before
dynamically importing the SDK. Do not add runtime static SDK imports or start it
before workspace selection. Its fresh database and global configuration live
under `<workspace>/.cc/opencode-v2/`; specialist configuration remains in each
specialist directory. Changing workspace requires a fresh process.

Normal startup now uses the embedded host. The browser fixture injects only local
provider configuration and test endpoints into that same startup path. There is no runtime engine selector or v1 history conversion. See
`plans/opencode-v2-migration.md` for the remaining cutover gates. Clean package checks cover macOS arm64 and Linux arm64/x64 on Node 24 (Linux x64 under emulation),
including SQLite, bundled ripgrep, node-pty and CLI startup/shutdown/reopen.
Keep Pino external to esbuild alongside `pino-pretty`: its logging worker uses
package-relative assets and cannot run correctly inside the single ESM bundle.

The transitive `@opentui/core@0.5.17` package declares Node >=26.4.0. Ordinary
Node 24 installations warn but the tested embedded runtime works; an
`engine-strict` installation can reject the dependency. Resolve that upstream
metadata compatibility before claiming warning-free installation support.
Windows installation/runtime remains unverified; Linux x64 checks used emulation rather than physical x64 hardware.

Use the same Node executable for installation, native rebuilds and running CC.
If npm reports withheld install scripts, approve the native dependency scripts
in the isolated installation before rebuilding. The migration checks exercise
`better-sqlite3`, `node-pty`, `@parcel/watcher`, `tree-sitter-bash` and
`tree-sitter-powershell`; no workspace-wide modules purge is required.

The chat port is implemented by `createEmbeddedChatService` and
`createEmbeddedChatEvents`. They can be injected into the conversation service
and its HTTP/SSE routes through the `ConversationEngine` boundary. Integration
tests in `packages/backend/test/opencode/embedded-chat.test.ts` exercise those
routes with the real SDK and a local provider, without a daemon or paid requests.
`createEmbeddedProviderService` implements the existing provider controls using
v2 integrations and credentials. `registerProviderServiceRoutes` accepts it
directly. OAuth attempts live in memory; unfinished authorization must be
restarted after CC restarts. Only authentication forms representable by the
current text/select controls are offered; command/external flows and richer v2
forms still need UI support. Environment credentials must be removed at their
source, not through the disconnect control.

`renderEmbeddedWorkspace` renders native v2 configuration. Pass it to
`writeOpenCodeWorkspace` through its `render` dependency to reuse rules and skill
handling. Supply complete native MCP definitions, including unselected servers
so they can be disabled in that specialist. The renderer disables MCP Code Mode
to preserve individual tool permissions. Capability permission patterns must use
v2 action names (for example `shell`, `subagent`, and `edit`); it does not convert
old workspace configuration or credentials. CC task-result tools remain denied
in interactive specialist configuration, after wildcard grants.

The main runtime still needs the MCP/configuration producers and capability
catalog ported, plus terminal and lifecycle cutover, before using these adapters.

The MCP/tool slice adds `buildEmbeddedMcpDefinitions` and
`syncEmbeddedGlobalMcpConfig` for CC's reconciled MCP records, plus
`prepareEmbeddedSpecialistWorkspace` for specialist configuration and tool
snapshots. Managed entries keep their computed default enablement, bearer
headers, and execution timeouts. External servers remain disabled in specialists
that have not selected them. Secret references remain references in generated
files; the host environment must receive resolved CC secrets before startup.

For native custom tools, inject `renderEmbeddedToolTemplate` and
`renderEmbeddedToolEntry` into `createCustomToolService`. Snapshots remain in
`.opencode/tools/`; `.opencode/cc-tools/` is a generated plugin-entry directory
owned by CC. Its relative imports preserve snapshot portability and copied tool
names. V2 requires configured plugin paths to name directories. Native custom
tools use the `cc_custom_` namespace; the embedded host handles their approval
requests and interruption cleanup. No old tool-source conversion is performed.

`host.listTools(directory)` reads the real registry through a supported embedded
plugin, including native permission action names. `createEmbeddedMcpService`
provides runtime statuses, MCP inventory, connection control, and SDK integration
OAuth attempts. MCP catalogs can settle asynchronously after connection; callers
should refresh while initialization is pending. `buildEmbeddedTaskPermissions`
uses native actions, keeps disabled servers denied after tool grants, and denies
unattended question prompts.

Remote MCP OAuth uses `createEmbeddedMcpOAuthCallbacks(publicOrigin)` alongside
`createEmbeddedMcpService(host, callbacks)`. Pass that same callback registry to
`syncEmbeddedGlobalMcpConfig`, `buildEmbeddedMcpDefinitions`, and the specialist
writer's `oauthCallbacks` option. Native configuration then has a stable public
CC `redirect_uri` and a separate runtime-only loopback `callback_port` per server.
The SDK owns client registration, PKCE, issuer validation, token exchange, and
credential storage/refresh. CC forwards only a matching, pending, unexpired,
single-use callback; it never rewrites the registered redirect or forwards to a
request-supplied URL. Attempts cannot survive a CC restart.

At runtime cutover, supply the same registry to `registerMcpServerRoutes` so it
registers `registerEmbeddedMcpOAuthCallbackRoute` in place of the legacy code-only
callback. The existing owner-session guard still applies (cookies use SameSite=Lax
for top-level provider redirects). The callback preserves `state`, `code`, `iss`,
and provider error fields, suppresses request URL logging, and returns plain status
text with no-store/no-referrer headers. It uses one-shot loopback HTTP connections
because SDK listeners are replaced between authorization attempts. Callback
forwarding has a 30-second timeout; expired, cancelled, replaced, and completed
states cannot be reused. Server shutdown aborts in-flight relay requests.

Ports are selected during configuration generation and must be regenerated on
startup using the same registry. A port claimed by another process before OAuth
starts causes the SDK's listener startup to fail; no alternative callback target
is accepted. Tests use a real SDK and a local OAuth/MCP provider, including DCR,
PKCE, issuer checks, and authenticated MCP connection. No external provider account
or deployed VPS was used. The local embedded preview now wires MCP CRUD/auth,
scheduled tasks and tool mutations through the same embedded startup and
reconciliation path used by the CLI. There is no separate daemon or engine switch.

Interactive terminals now run directly in CC through `node-pty`, independently
of the OpenCode daemon or embedded SDK. The terminal API reports `backend: local`.
Sessions default to the workspace directory, remain alive across browser
reconnects, and terminate on deletion or server shutdown. Reconnect resets the
terminal display before replaying up to 262,144 UTF-16 code units from memory;
terminal sessions and their buffers do not survive CC restarts. Slow WebSocket
clients are disconnected once queued output exceeds 1 MiB.

`node-pty` is a direct backend/CLI dependency and stays external to esbuild.
Version `1.2.0-beta.14` is pinned because stable 1.1.0 ships non-executable macOS
helpers (microsoft/node-pty#919); beta.15 has a reported Windows startup regression
(#955). Native prebuilds are used where available; source builds need the upstream
platform build tools. pnpm permits node-pty's installation scripts. Real shell
and WebSocket integration tests cover the local backend; browser terminal tests
exercise the UI with their existing transport fixtures. Clean native checks pass on macOS arm64 and Linux arm64/x64 (x64 under emulation);
Windows installation/runtime validation remains outstanding.

Normal startup reconciles portable manifests before preparing native specialist
configuration, preserves authored AGENTS.md and copied tools, and shares the v2
specialist/tool services across internal routes, public API/MCP and workspace
skills. `createEmbeddedRuntime` is the injectable startup factory for tests.
Startup failures close acquired resources; normal drain stops task scheduling and
monitoring before closing the host and SQLite. The existing engine HTTP status
contract reports `embedded://local`; restart requests reload the host.
