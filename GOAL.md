# Goal

Node + Typescript + React

Installable via npm/pnpm, ready for web production and containerisation.

## CLI Distribution

The application is distributed as a single npm package (`commandscenter`) with a `ccenter` binary. The CLI bundles the Fastify backend and pre-built React frontend into one distributable.

### Installation

```bash
npm install -g commandscenter
```

### Commands

| Command                          | Description                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `ccenter start`                  | Start the full application (API server + web UI). Opens on `http://localhost:3000` by default.               |
| `ccenter serve`                  | Start the HTTP API server only, without serving the frontend. For headless/API-only use or custom frontends. |
| `ccenter start --port 4000`      | Start on a custom port.                                                                                      |
| `ccenter start --host 127.0.0.1` | Bind to a specific host (default: `0.0.0.0`).                                                                |
| `ccenter upgrade`                | Upgrade `commandscenter` to the latest version (re-installs globally via the detected package manager).      |
| `ccenter --version`              | Print the installed version.                                                                                 |
| `ccenter --help`                 | Show all available commands and options.                                                                     |

### Modes

- **`start`** — Full mode. Serves the React frontend as static files and the backend API. This is the default for end users.
- **`serve`** — API-only mode. Exposes only the HTTP API and WebSocket endpoints. No static file serving. Useful for:
  - Running behind a reverse proxy with a separately deployed frontend
  - Headless / programmatic access
  - Development setups where Vite dev server handles the frontend

> **Single-User Application** — This is a single-operator tool. There is no user registration, login, or multi-tenancy. The person who installs and runs the app is the sole user with full access to all specialists, workspaces, terminals, and the host filesystem. Authentication may be added in a future phase, but the MVP assumes a trusted, single-user environment.

> **MUST: Portable Workspace Rule** — The workspace directory (`CC_WORKSPACE_DIR`) is the source of truth for portable configuration and assets. SQLite (`CC_DATA_DIR/cc.db`) is a disposable derived cache — delete it and the app boots as a fully configured instance with all specialists, MCP servers, settings, task templates, and expected secret keys restored from workspace files. Runtime history, provider auth state, scheduler state, and secret _values_ are intentionally not portable and must be re-entered on a new machine.

## Features

App manages OpenCode workspaces as specialists, allowing user to add different specialists with different tools and instructions.

### What is a Specialist

A specialist in this app is an **OpenCode workspace** — nothing more. Each specialist maps 1:1 to an OpenCode workspace directory containing standard OpenCode configuration files:

- `AGENTS.md` — the specialist's name, role, and instructions (OpenCode reads this as the system prompt)
- `opencode.jsonc` — OpenCode workspace config: default model, MCP server permissions, tool permissions
- `.opencode/skills/` — copied built-in skill files that OpenCode loads on workspace initialization

The app creates this workspace directory when the user creates a specialist and updates the files when the user edits the specialist. All chat, prompt execution, tool calls, and terminal sessions go through the single `opencode serve` process, routed to the correct workspace via directory parameter. The app additionally provides tools to specialists via its own MCP servers (app-provided tools and user-configured custom tools).

**The app is the orchestrator; OpenCode is the engine.** Refer to OpenCode documentation for workspace configuration format, supported `opencode.jsonc` fields, `AGENTS.md` conventions, skill file structure, and MCP permission rules.

Then, it orchestrates these OpenCode workspaces inside group chats and Kanban board as well as allows direct messages to each specialist.

In case of group chats and kanban board all specialists have shared context such as documents, images, task description, chat history, etc..

At the MVP stage we focus on Direct Messaging only. Let's focus on that.

### Product Phases

The product has three planned feature pillars. We build them sequentially:

| Phase             | Feature             | Scope                                                                                                                                                       |
| ----------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 1 (MVP)** | **Direct Messages** | Specialist CRUD, 1-on-1 chat with each specialist via OpenCode SDK, file manager, terminal, tasks/templates, custom tools, MCP/provider auth, self-updating |
| **Phase 2**       | **Group Chat**      | Multi-specialist conversations with shared context (documents, images, chat history)                                                                        |
| **Phase 3**       | **Kanban Board**    | Task-based orchestration — specialists assigned to cards/columns with shared project context                                                                |

**Current focus: Phase 1 — Direct Messages.** All subsequent sections in this document describe Phase 1 scope unless explicitly noted otherwise.

The user should be able to globally:

- Add any custom skills + Browse curated skill library from us (Founders)
- Add MCPs, including with OAuth + Our built-in integrations
- Auth Integrations from Composio (built-in MCP suggestion with dedicated UI — user provides only a name plus OAuth or API key, CC pre-registers the MCP endpoint globally via OpenCode, per-specialist tool access via workspace config)

Then while creating the specialist, the user specifies what it should have access to, plus the role, name, and instructions. Optionally the icon/image too. See **What is a Specialist** above for what this produces on disk.

### Filesystem

App also should include file manager (preferable using some well-established and documented npm package).

Allowing the user to locate files inside workspace including specialists, read them and edit them from web with syntax highlighting.

The user can also browse the full machine filesystem (since they are the owner/operator).

### Terminal

Global terminal that allows the user to run CLI commands, install apps/bins and everything else, including root access with sudo.

Additionally, each specialist's chat page should have a terminal provided by OpenCode to run commands inside that specialist's workspace (Default location) which is closed by default.

(preferable using some well-established and documented npm package with interactive teminal capabilities).

Terminal can be based on openCode's socket endpoint specifically created for terminal commands (OpenCode web uses the same)

### Tasks and Templates

The user should be able to open the Tasks page and manage board tasks plus reusable task templates. A template may run manually or on a schedule. Each run targets a specialist with a prompt, and the system enriches that prompt with needed context before invoking the specialist. Each invocation is recorded as task run history for later review.

### Direct chat

In sidebar under specialists dropdown (expanded by default), should be rendered 3 latest specialists the user had direct chat with and "See all" button which leads to specialists page.

On specialists page should be rendered all available specialists with image/icon, name, role and action buttons including "chat" (prefferable in grid view 2 or 3 specialists per row) and search input which just filter specialists by name and role

Direct chat should feel persistent per specialist rather than encouraging many separate visible chat threads. Opening a specialist should return the user to that specialist's ongoing conversation by default.

If the user wants to begin with a clean context, the chat UI should expose a `Start Fresh` action. Internally this creates a new session, but session mechanics should stay secondary in the UX.

Previous sessions should not be promoted on the dashboard or in primary navigation. Instead, the direct chat UI may expose a secondary `Previous Conversations` entry (for example in a dropdown or contextual menu) so older conversations remain accessible without becoming the primary mental model.

User preferences and important long-term memories should be persisted inside the workspace as a Markdown file so they survive restarts, workspace moves, and fresh conversation resets.

## Inside chat window

Very similar to what the OpenCode task flow supports:

- input with main configs: model, auto-approve switch. And attachments uploading feature.
  - Attachments are passed directly to OpenCode via the SDK's `FilePartInput` in `session.prompt()`. The app handles the upload UI and temporary storage; OpenCode handles the AI processing. Supported part types: `TextPartInput`, `FilePartInput`, `AgentPartInput`, `SubtaskPartInput`.
- collapsable right panel with tabs
  - Only one tab for now: workspace file tree
    - Supporting option to open folder in terminal or in filesystem view (for reading/editing)
- terminal window openning (toggle) button which is opened on bottom of main chat window and allows creating multiple terminal sessions

Note: Would be great to use some well-established component library for building the UI

# Opencode

## OpenCode Engine Management

**Context:** It orchestrates multiple isolated specialists across varied deployment environments (Docker, global NPM, and bare metal).

The following decisions outline how the application manages the underlying `opencode` binary for maximum performance, stability, and ease of installation.

---

### 1. Execution Strategy: Single-Process Orchestrator

**Decision:** The application runs a **single `opencode serve` process** as a persistent, long-running background daemon (managed by a Node Orchestrator). All specialist workspaces are accessed through this single process — workspaces are switched via HTTP headers or query parameters, not by spawning separate server processes per specialist.

**Rationale:**

- **Zero-Latency Interactions:** Spinning up the engine for every message incurs a 2-5 second startup penalty. A persistent service keeps the models loaded in memory, allowing for instant, snappy chat UI responses.
- **Stateful Context:** Specialists require continuous memory. A long-running process maintains active conversation states, instance-scoped caches/services, and authentication without re-initializing on every request.
- **Single-Process Simplicity:** Instead of spawning one child process per specialist (with dynamic port allocation and reverse proxying), a single `opencode serve` instance handles all workspaces. The Orchestrator routes requests to the correct workspace via HTTP headers or query parameters. This eliminates port management, reduces resource consumption, and simplifies lifecycle management.
- **Active Monitoring:** The Orchestrator polls the single engine's `/health` endpoint, providing the UI with real-time status and graceful error handling if a specialist's MCP script crashes.

**Note:** Skill discovery is loaded as part of workspace instance initialization, not hot-reloaded inside an already initialized instance. When skills are added or changed for an existing workspace, the app should dispose that workspace instance (or restart `opencode serve`) before expecting the new skill set to appear. Disposing the instance is preferred because it reloads workspace state without insfrastructure overhead, keep restarting full opencode serve as a fallback option.

---

### 2. Installation & Binary Management: The "Universal Local" Strategy

**Decision:** The `opencode-ai` CLI will be managed strictly as a standard `dependency` within the project's `package.json`, avoiding complex system-wide binary downloads or `peerDependency` requirements.

**Rationale:**

- **"Batteries Included" Installation:** Relying on standard Node module resolution guarantees a zero-friction setup across all deployment targets:
  - **Docker:** `npm ci` cleanly installs the binary into the container's isolated `/app/node_modules/.bin/`.
  - **Bare Metal (VPS/Local):** Cloning and running `npm install` keeps the binary localized to the project folder, preventing pollution of the host's global `PATH`.
  - **Global NPM:** Running `npm i -g cc` automatically resolves and nests the correct OpenCode dependency under the app's tree.
- **Total Version Authority:** Because the Orchestrator relies on specific OpenCode API endpoints (e.g., `/instance/dispose`, `/health`), the app's stability is paramount. Locking the version as a strict dependency (e.g., `"opencode-ai": "^1.2.0"`) protects users from unexpected upstream breaking changes until the orchestrator is updated and tested.
- **Programmatic Execution:** The Orchestrator uses the **official OpenCode JavaScript SDK** (`opencode-ai`) for all programmatic interactions (session management, message sending, tool registration, health checks, auth flows). The SDK wraps the REST API, providing type-safe methods and event subscriptions. The Orchestrator spawns a single `opencode serve` process for the engine lifecycle:

  ```typescript
  import path from 'path';
  import { spawn } from 'child_process';

  const opencodeBinPath = path.resolve(__dirname, '../node_modules/.bin/opencode');
  const child = spawn(opencodeBinPath, ['serve'], { ... });
  ```

### 2.1 The Escape Hatch (Power User Override)

While the local dependency is the strict default, the Orchestrator will respect an environment variable (e.g., CC_OPENCODE_PATH). If present, the Orchestrator will bypass the node_modules path and use the provided binary. This supports advanced operators who wish to point the application to a custom, globally compiled fork of the OpenCode engine

## Specialist CLI Tool Management

### Context

OpenCode specialists frequently require CLI applications to perform tasks. When orchestrating these specialists via Docker on a cloud VPS, the ephemeral nature of containers creates a challenge: dynamically installed tools are lost whenever the orchestrator is updated and the container is rebuilt.

### Decision

To balance security, container immutability, and specialist autonomy, the OpenCode orchestrator will utilize a **Tiered Dependency Strategy** heavily anchored in the Node.js ecosystem, alongside an optional **Bare Metal** deployment mode.

#### The Tiered Docker Strategy

- **Tier 1: NPM Ecosystem (Primary)**
  - **Mechanism:** Tools are defined in `package.json` or executed on the fly using `npx`.
  - **Rationale:** Keeps state localized to the `node_modules` directory, making installations environment-agnostic (relying only on the Node.js version) and easily restorable without system-level permissions.

- **Tier 2: Base Image (Essentials)**
  - **Mechanism:** Core, non-NPM dependencies (e.g., `git`, `python3`, `ffmpeg`) are baked directly into the orchestrator's Docker `Dockerfile`.
  - **Rationale:** Ensures heavy or universally required system packages are immediately available without slowing down container startup times or requiring complex installations.

- **Tier 3: Startup Scripts (Edge Cases)**
  - **Mechanism:** Users or specialists can write initialization commands to a persisted startup script that runs when the container boots.
  - **Rationale:** Acts as an escape hatch for specific, non-NPM utilities that don't belong in the core base image, restoring them automatically after a container rebuild.

### Bare Metal Option (Non-Docker)

- **Mechanism:** Allowing the orchestrator to run directly on the host system without containerization on VPN or locally
- **Rationale:** Provides an alternative for self-hosting users who prioritize absolute environment freedom, native integrations, and unrestricted specialist capabilities over container isolation.

## Tools

App should expose 2 custom MCP servers where all custom (user-configured) and app-provided tools will be registered and controllered dynamically, per specialist.

> "When an MCP server updates its toolset, it sends this notification and OpenCode publishes a ToolsChanged event" - OpenCode source code

### Custom tools

The user can add custom tools globally, that later can be registered to the specialists. Custom tools are kinda configurable HTTP requests that may go to the n8n or something similar, do something and return the feedback. So, it should have a basic HTTP request building configurations + name, description (Goes to MCP) and optional extra instructions (If set, goes as a part of system message before each session)

### App provided tools

Composio is offered as a built-in MCP server suggestion. The user brings their own Composio API key, CC registers it as a global MCP server via OpenCode's standard auth flow, and per-specialist tool access is controlled through the workspace `opencode.jsonc` permission system — same as any other MCP server. No deep SDK integration; we use Composio's MCP mode exclusively. Enterprise multi-profile Composio integration is planned for a future phase.

And any other interactions with main app will be happen through this MCP (TBD)

## Provider & MCP Authentication

Authentication for both LLM providers and MCP servers is handled via OpenCode's REST API. The app acts as a bridge — it provides the UI for managing credentials globally, then delegates the actual OAuth flows, token exchange, and storage to the running `opencode serve` instance through its HTTP endpoints.

### LLM Provider Auth (Global)

Provider authentication is **global**, not per-specialist. The user configures their LLM providers (OpenAI, Anthropic, etc.) once at the app level, and all specialists share access to those providers.

- The app UI presents a provider auth modal supporting two methods:
  - **OAuth flow** — the app opens a browser-based authorization flow, then completes the exchange via OpenCode's `/provider/oauth/` API endpoints.
  - **API key** — the user pastes a secret key directly; the app stores it via OpenCode's API.
- Tokens and keys are persisted by OpenCode in its configuration directory (`.opencode/`).
- The user selects a **default model** per specialist at creation time. This default can be changed at any time from the chat window's model selector.
- The app may use extended timeouts for OAuth endpoints (up to 5 minutes) to accommodate slow browser redirects or device flows (e.g., OpenAI's headless device flow).

### MCP Server Auth (Global + Per-Specialist Control)

MCP server connections and their OAuth credentials are also configured **globally** through the app, using OpenCode's `/mcp/auth/` API endpoints. However, tool **access** is controlled per specialist.

**Global setup:**

- The user adds and authenticates MCP servers at the app level (e.g., connecting to Jira, Notion, GitHub via OAuth).
- The app triggers OpenCode's MCP auth flow, which handles the browser-based OAuth, token exchange, and secure token storage.
- Extended timeouts (up to 90 seconds) are used for MCP auth callbacks.

**Per-specialist tool access:**

- When creating or editing a specialist, the user explicitly selects which MCP servers (and which specific tools) that specialist is allowed to use.
- The app translates these selections into OpenCode's workspace config using the `permission` object (the legacy `tools` boolean config is deprecated as of v1.1.1):
  - Deny all tools from a server by default: `"servername_*": "deny"`
  - Allow specific servers per specialist: `"servername_*": "allow"`
  - Require approval for specific tools: `"servername_*": "ask"`
- Permission values: `"allow"` (run without approval), `"ask"` (prompt for approval), `"deny"` (block the action).
- This uses OpenCode's native configuration precedence — workspace/specialist-level config overrides global config.
- MCP servers can also be fully disabled at the workspace level using the `enabled: false` flag in the `mcp` config section, which prevents the server connection from being established at all.

**Config format (OpenCode `permission` system):**

- Permissions are controlled via a flat key-value object in the `permission` config section.
- Keys support glob patterns: `*` matches zero or more characters, `?` matches exactly one.
- MCP tools are registered with the server name as prefix, so `"servername_*": "deny"` blocks all tools from that server.

**Flow summary:**

1. User authenticates providers and MCP servers globally via the app UI.
2. App delegates all auth flows to OpenCode's REST API (`/provider/oauth/`, `/mcp/auth/`).
3. OpenCode stores tokens in its config directory.
4. On specialist creation/edit, the app writes the specialist's `opencode.json` with the appropriate `permission` grants/denials.
5. When tools change at runtime, the orchestrator uses MCP's `listChanged` notification to force specialists to refresh their available toolsets without restart.

# Principles

We should adhere to following principles while development and maintenance of this project

## Code Quality

- **DRY (Don't Repeat Yourself):** Extract shared logic into reusable modules, utilities, and components. Duplicated code is a maintenance liability.
- **KISS (Keep It Simple, Stupid):** Prefer straightforward solutions over clever abstractions. Code should be readable by any team member without deep tribal knowledge.
- **YAGNI (You Aren't Gonna Need It):** Do not build features, abstractions, or configurability until there is a concrete, immediate need.
- **Single Responsibility:** Each module, class, and function should have one clear purpose. If it's hard to name, it's doing too much.
- **Composition Over Inheritance:** Favour composing small, focused pieces (hooks, utilities, middleware) over deep inheritance hierarchies.
- **Immutability by Default:** Prefer `const`, readonly types, and pure functions. Mutate state only through well-defined boundaries (stores, reducers, DB transactions).

## Linting & Formatting

- **ESLint** with a strict shared config (e.g. `@typescript-eslint/recommended-requiring-type-checking`) enforced on every file.
- **Prettier** for consistent formatting — no style debates in PRs.
- **Husky + lint-staged** pre-commit hooks to prevent non-compliant code from entering the repo.
- **Zero warnings policy:** Treat ESLint warnings as errors in CI. If a rule isn't useful, disable it explicitly with a comment explaining why — don't suppress broadly.

## TypeScript Discipline

- **Strict mode enabled** (`"strict": true` in `tsconfig.json`) — no implicit `any`, no unchecked index access.
- **Explicit return types** on exported functions and public API boundaries.
- **No `any` unless absolutely necessary** — prefer `unknown` and narrow with type guards.
- **Zod (or similar) for runtime validation** at system boundaries (API inputs, env vars, external payloads). TypeScript types alone are not enough.

## Testing

- **Minimum 95% code coverage** enforced in CI — PRs that drop coverage below threshold are blocked, when it is mandatory, explicitly reduce threshold. Max reduction to 85%, less than that is unacceptible.
- **Unit tests:** Every utility, service, and pure function must have unit tests. Use Vitest (or Jest) with fast, isolated test suites.
- **Integration / Feature tests:** Test service interactions, API routes, middleware chains, and database queries against real (or containerised) dependencies.
- **End-to-End (E2E) tests:** Critical user flows (specialist creation, chat messaging, file management, terminal sessions, cron creation) tested with Playwright.
- **Snapshot tests** for UI components where visual regression matters — but keep them minimal and intentional.
- **Test naming convention:** `describe` the unit, `it('should <expected behaviour> when <condition>')`.
- **No skipped tests in main branch.** `it.skip` / `xit` must be resolved or removed before merge.

## Architecture & Design

- **Separation of Concerns:** Clear boundaries between layers — transport (routes/controllers), business logic (services), data access (repositories), and presentation (React components).
- **Dependency Injection:** Services receive their dependencies explicitly, making them testable and swappable.
- **Configuration via Environment:** All environment-specific values come from `.env` / environment variables, validated at startup with a schema (Zod). Fail fast on misconfiguration.
- **Portable Workspace (MUST):** Portable configuration and assets live in the workspace directory (`CC_WORKSPACE_DIR`) and are fully recovered from files on boot. SQLite (`CC_DATA_DIR/cc.db`) is a disposable derived cache — deleting it and restarting restores all specialists, MCP servers, settings, secret key list, and task templates from workspace files. Secret values and runtime history are intentionally not recovered.
- **Error Handling Strategy:**
  - Domain errors are typed and intentional (custom error classes or result types).
  - Unhandled exceptions trigger structured logging and graceful degradation — never crash silently.
  - API responses use consistent error shapes (`{ error: { code, message, details? } }`).

## Security

- **Input validation on every boundary** — never trust data from the client, external APIs, or user-configured MCPs.
- **Parameterised queries only** — no string interpolation in SQL or shell commands.
- **Least privilege:** Specialists and processes run with the minimum permissions required.
- **Secrets management:** No secrets in code or version control. Use `.env` (gitignored) locally and secure secret stores in production.
- **Dependency auditing:** Run `npm audit` in CI; block merges on critical/high vulnerabilities.
- **CSP, CORS, and rate limiting** configured from day one on all HTTP endpoints.

## Performance & Observability

- **Structured logging** (e.g. Pino) with correlation IDs across requests and specialist interactions.
- **Health checks** on all services — both liveness and readiness probes for containerised deployments.
- **Graceful shutdown:** Handle `SIGTERM` / `SIGINT` properly — drain connections, stop cron schedulers, terminate engine subprocesses.
- **Lazy loading & code splitting** on the frontend — don't ship what the user hasn't requested.

## Git & CI/CD

- **Conventional Commits** (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`) for automated changelogs and semantic versioning.
- **Branch protection:** `main` requires passing CI (lint + typecheck + all tests + coverage gate) and at least one approval.
- **Small, focused PRs** — each PR addresses one concern. Large PRs are split proactively.
- **CI pipeline order:** Install → Lint → Typecheck → Unit tests → Integration tests → E2E tests → Build → Coverage report.
- We should be able to run full CI pipeline locaaly before opening PR.

## Documentation

- **README** kept up to date with setup steps, architecture overview, and contribution guide.
- **Inline comments only where "why" isn't obvious** — code should be self-documenting through naming and structure.
- **API documentation** auto-generated from route schemas (e.g. Swagger / OpenAPI via Zod-to-OpenAPI).
- **ADRs (Architecture Decision Records)** for significant technical choices — stored in `docs/adr/`.

---

# Stack

## Core Language & Runtime

- **Node.js** — Backend runtime and orchestrator
- **TypeScript** — Strict mode across the entire codebase (frontend + backend)

## Project Structure

Fullstack monorepo — single deployable unit. Fastify serves the built React app in production; Vite dev server proxies to Fastify in development. One `ccenter start` command runs everything.

```
cc/
├── packages/
│   ├── backend/       # Fastify backend + orchestrator
│   ├── frontend/      # React frontend (Vite)
│   ├── cli/           # CLI binary (ccenter) — bundles backend + frontend
│   └── shared/        # Shared types, Zod schemas, constants
├── package.json       # Root workspace config
├── tsconfig.base.json
└── pnpm-workspace.yaml
```

## Frontend

| Category              | Technology                                          | Notes                                                                                  |
| --------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Framework**         | React 19                                            | Component-driven UI with TypeScript                                                    |
| **Build Tool**        | Vite                                                | Native ESM dev server, Rollup-based production bundling, code splitting & tree shaking |
| **Styling**           | Tailwind CSS                                        | Utility-first CSS framework                                                            |
| **Component Library** | Shadcn/UI (Radix UI primitives)                     | Ownable component source code, accessible, adaptable for LLM streaming states          |
| **Chat UI**           | assistant-ui                                        | Shadcn/UI-native components for streaming text, tool call displays, generative UI      |
| **File Manager**      | SVAR React File Manager                             | `RestDataProvider`, split-view, breadcrumbs, virtualized directory loading             |
| **Code Editor**       | Monaco Editor (`@monaco-editor/react`)              | VS Code engine — syntax highlighting, IntelliSense, Model-URI virtual file system      |
| **Terminal Emulator** | xterm.js + `xterm-addon-fit` + `xterm-addon-attach` | WebGL renderer, dynamic resize, WebSocket stream attachment                            |
| **Server State**      | TanStack Query (`@tanstack/react-query`)            | API data fetching, caching, polling, optimistic updates for all server-derived state   |
| **Client State**      | Zustand                                             | Lightweight store for UI-only state (active tab, sidebar, selected specialist, theme)  |

## Backend

| Category               | Technology                        | Notes                                                                            |
| ---------------------- | --------------------------------- | -------------------------------------------------------------------------------- |
| **Web Framework**      | Fastify                           | High-performance tree routing, HTTP/2, JSON Schema validation at transport layer |
| **Schema Validation**  | Zod + `fastify-type-provider-zod` | End-to-end type safety, runtime validation at all system boundaries              |
| **Reverse Proxy**      | `@fastify/http-proxy`             | API gateway proxying traffic to the single OpenCode engine process               |
| **WebSockets**         | `ws` or `socket.io`               | Full-duplex communication for terminal and real-time streams                     |
| **Pseudo-Terminal**    | `node-pty`                        | PTY file descriptors for interactive CLI support (ANSI, cursor, color)           |
| **Process Management** | `child_process.spawn()`           | Single OpenCode daemon lifecycle management                                      |
| **Logging**            | Pino                              | Structured JSON logging with correlation IDs                                     |

## Database

| Category       | Technology                | Notes                                                                                               |
| -------------- | ------------------------- | --------------------------------------------------------------------------------------------------- |
| **Runtime DB** | SQLite (`better-sqlite3`) | Lightweight local runtime database for disposable state and derived caches                          |
| **ORM**        | Drizzle ORM               | SQL-first, zero-dependency, TypeScript type-safe SQLite access through `drizzle-orm/better-sqlite3` |
| **IDs**        | ULID                      | Lexicographically sortable, collision-safe identifiers                                              |

> **Portable Workspace:** Workspace files are the source of truth for portable configuration and assets. SQLite (`CC_DATA_DIR/cc.db`) is a rebuildable derived cache. The boot reconciler restores all derived rows from workspace files on startup.

## Background Jobs & Scheduling

| Environment        | Technology | Notes                                                                   |
| ------------------ | ---------- | ----------------------------------------------------------------------- |
| **Local (SQLite)** | `bree`     | Cron syntax parsing + worker threads, paired with SQLite state tracking |

## AI & Integrations

| Category              | Technology                                           | Notes                                                                                                                                                                                       |
| --------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AI Engine**         | `opencode-ai` (binary) + `@opencode-ai/sdk` (JS SDK) | Official JS SDK (`createOpencodeClient`) for type-safe programmatic interaction + single persistent `opencode serve` daemon managed by the orchestrator                                     |
| **Tool Protocol**     | MCP SDK (`@modelcontextprotocol/sdk`)                | `StdioServerTransport` / `SSEServerTransport`, dynamic tool registration, `listChanged` notifications                                                                                       |
| **External API Auth** | Composio (MCP mode)                                  | Built-in MCP suggestion: user-provided API key or OAuth, global auth via OpenCode, per-specialist tool permissions via workspace config. Enterprise multi-profile planned for future phase. |

## Testing & Quality

| Category               | Technology                                                        | Notes                                                                                  |
| ---------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Unit / Integration** | Vitest (V8 coverage provider)                                     | Vite-native test runner, 95% coverage mandate                                          |
| **E2E**                | Playwright                                                        | Multi-pane user flow simulation                                                        |
| **Linting**            | ESLint (`@typescript-eslint/recommended-requiring-type-checking`) | Zero warnings policy                                                                   |
| **Formatting**         | Prettier                                                          | Enforced on all files                                                                  |
| **Pre-commit Hooks**   | Husky + `lint-staged`                                             | Auto-reject non-compliant code                                                         |
| **CI/CD**              | GitHub Actions                                                    | Sequential fail-fast pipeline: install → lint → typecheck → test → coverage gate → E2E |

---

## Self-Updating

### Version Check

On startup and every 6 hours (configurable via `CC_UPDATE_INTERVAL_MS`), the backend queries the npm registry for the latest `cc` version and compares it to the running version. Result is exposed via `GET /api/system/version` → `{ current, latest, updateAvailable, installMode }`. The frontend shows a non-intrusive banner when an update is available.

### Installation Mode Detection

At startup, auto-detect deployment mode:

| Signal                                     | Mode                   |
| ------------------------------------------ | ---------------------- |
| `CC_DOCKER=true` or `/.dockerenv` exists   | Docker                 |
| Global npm path is ancestor of `__dirname` | npm global             |
| `.git` in project root                     | Bare metal (git clone) |
| Fallback                                   | npm local              |

### Update Mechanisms

**npm (global/local):** CLI command `cc update` or UI button (`POST /api/system/update`) spawns `npm install -g cc@latest` / `npm update`. After completion → graceful restart (drain connections, stop crons, SIGTERM the OpenCode engine process with 10s timeout, exit 0). Process manager (PM2/systemd) restarts the new version.

**Bare metal (git):** `cc update` runs `git pull origin main && npm install && npm run build`. Aborts with a warning if local modifications are detected.

**Docker:** The app cannot self-update inside a container. The banner directs the user to pull the new image and restart the container. Recommend Watchtower for automated pulls.

### Graceful Restart Protocol

1. Stop accepting new connections
2. Cancel pending cron jobs
3. SIGTERM the OpenCode engine process (10s grace → SIGKILL)
4. Flush logs and close DB connections
5. Exit 0 — process supervisor restarts

### Rollback & Safety

- Maintain `~/.cc/versions.json` log. `cc update --rollback` reinstalls previous version.
- Pre-update checks: warn on active chat sessions, validate DB migration compatibility, check Node.js `engines` field.

### Env Variables

See the [Environment Variables](#environment-variables) section for `CC_UPDATE_CHECK`, `CC_UPDATE_INTERVAL_MS`, and `CC_AUTO_UPDATE`.

---

# Environment Variables

All runtime configuration is managed through environment variables. Validated at startup with Zod — the app fails fast on missing required values or invalid types.

## Server & Runtime

| Variable       | Default       | Required | Description                                                        |
| -------------- | ------------- | -------- | ------------------------------------------------------------------ |
| `NODE_ENV`     | `development` | No       | Node environment: `development`, `production`, or `test`           |
| `CC_PORT`      | `3000`        | No       | HTTP server bind port                                              |
| `CC_HOST`      | `0.0.0.0`     | No       | Bind address. Use `127.0.0.1` to restrict to localhost             |
| `CC_LOG_LEVEL` | `info`        | No       | Pino log level: `fatal`, `error`, `warn`, `info`, `debug`, `trace` |

## Security & Auth

| Variable                  | Default               | Required       | Description                                                                         |
| ------------------------- | --------------------- | -------------- | ----------------------------------------------------------------------------------- |
| `CC_SECRET`               | —                     | **Yes** (prod) | Secret key for session signing / JWT. App refuses to start without it in production |
| `CC_CORS_ORIGINS`         | `*`                   | No             | Allowed CORS origins (comma-separated). Lock down in production                     |
| `CC_RATE_LIMIT_MAX`       | `100`                 | No             | Max requests per rate limit window per IP                                           |
| `CC_RATE_LIMIT_WINDOW_MS` | `60000`               | No             | Rate limit sliding window in ms (default: 1 min)                                    |
| `CC_CSP_DIRECTIVES`       | _(sensible defaults)_ | No             | Override Content-Security-Policy header directives                                  |

## OpenCode Engine

| Variable                       | Default                      | Required | Description                                                         |
| ------------------------------ | ---------------------------- | -------- | ------------------------------------------------------------------- |
| `CC_OPENCODE_PATH`             | `node_modules/.bin/opencode` | No       | Override path to a custom opencode binary (power-user escape hatch) |
| `CC_OPENCODE_PORT`             | `4100`                       | No       | Port for the single `opencode serve` process                        |
| `CC_AGENT_HEALTH_INTERVAL_MS`  | `10000`                      | No       | Polling interval for the engine's `/health` endpoint                |
| `CC_AGENT_SHUTDOWN_TIMEOUT_MS` | `10000`                      | No       | Grace period before SIGKILL on engine process termination           |
| `CC_AGENT_STARTUP_TIMEOUT_MS`  | `30000`                      | No       | Max time to wait for the engine to become healthy                   |

## Workspace & Storage

| Variable           | Default         | Required | Description                                                                                         |
| ------------------ | --------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `CC_WORKSPACE_DIR` | `.cc/workspace` | No       | Portable workspace directory for configuration and assets. Relative paths are resolved against cwd. |
| `CC_DATA_DIR`      | `.cc/data`      | No       | Disposable runtime data directory for SQLite and cache/state. Relative paths resolve from cwd.      |

## Tasks

| Variable              | Default | Required | Description                                                                                           |
| --------------------- | ------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `CC_MAX_TASKS`        | `0`     | No       | Max active tasks. `0` = unlimited                                                                     |
| `CC_CRON_CONCURRENCY` | `1`     | No       | Max cron jobs executing simultaneously (prevents resource exhaustion from parallel specialist spawns) |

## Integrations

| Variable           | Default | Required | Description                                                                                                                                    |
| ------------------ | ------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `COMPOSIO_API_KEY` | —       | No       | User-provided Composio API key for the built-in MCP suggestion. Stored encrypted in DB, injected into OpenCode's global MCP config at runtime. |

## Auth Timeouts

| Variable                 | Default  | Required | Description                                  |
| ------------------------ | -------- | -------- | -------------------------------------------- |
| `CC_OAUTH_TIMEOUT_MS`    | `300000` | No       | Timeout for LLM provider OAuth flows (5 min) |
| `CC_MCP_AUTH_TIMEOUT_MS` | `90000`  | No       | Timeout for MCP server OAuth callbacks (90s) |

## Self-Updating

| Variable                | Default    | Required | Description                                                   |
| ----------------------- | ---------- | -------- | ------------------------------------------------------------- |
| `CC_UPDATE_CHECK`       | `true`     | No       | Enable/disable periodic update checks                         |
| `CC_UPDATE_INTERVAL_MS` | `21600000` | No       | Update check interval in ms (default: 6h)                     |
| `CC_AUTO_UPDATE`        | `false`    | No       | Auto-apply updates when detected (npm/git only, never Docker) |

## Deployment

| Variable    | Default         | Required | Description                                                                          |
| ----------- | --------------- | -------- | ------------------------------------------------------------------------------------ |
| `CC_DOCKER` | _(auto-detect)_ | No       | Force Docker mode when `/.dockerenv` auto-detection fails (e.g. rootless containers) |

---

# Setup & Deployment

## Prerequisites (All Methods)

| Dependency  | Version  | Notes                                                            |
| ----------- | -------- | ---------------------------------------------------------------- |
| Node.js     | ≥ 24 LTS | Required runtime. Enforced via `engines` field in `package.json` |
| npm or pnpm | Latest   | Package manager                                                  |
| Git         | Any      | Required for bare-metal updates and specialist workflows         |

The app runs on SQLite — zero additional database infrastructure needed.

---

## 1. Local (Personal / Development)

The fastest path. Install globally via npm and run from any directory.

### Quick Start

```bash
# Install globally
npm i -g cc

# Create a workspace directory (becomes your portable state folder)
mkdir my-workspace && cd my-workspace

# Start (auto-initializes on first run)
cc start
```

The app launches at `http://localhost:3000`. All state lives inside the current directory under `.cc/`.

### What `cc start` does on first run

1. Creates `.cc/` data directory
2. Generates `.env` with documented defaults (edit as needed)
3. Initializes SQLite database at `.cc/data/cc.db`
4. Creates `workspaces/` directory for specialist folders
5. Starts the server

### Development mode (contributors)

```bash
git clone https://github.com/<org>/cc.git
cd cc
npm install
cp .env.example .env          # Edit with your values
npm run dev                    # Starts backend + frontend with hot reload
```

### Updating

```bash
cc update
# or from the UI: Settings → Update banner → Apply
```

---

## 2. VPS / Bare Metal (Production)

For self-hosting on a Linux server with full system access. The app runs directly on the host — no containers, no restrictions.

### Server Preparation

```bash
# Install Node.js 24+ (via nvm or NodeSource)
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs git build-essential
```

### Installation

```bash
# Option A: Global install (recommended for operators)
sudo npm i -g cc
mkdir /opt/cc && cd /opt/cc
cc start

# Option B: Git clone (recommended for contributors / custom builds)
git clone https://github.com/<org>/cc.git /opt/cc
cd /opt/cc
npm ci
npm run build
cp .env.example .env
```

### Configuration

Edit `.env` in the workspace root:

```bash
NODE_ENV=production
CC_PORT=3000
CC_HOST=0.0.0.0
CC_SECRET=<generate-a-strong-random-secret>
CC_CORS_ORIGINS=https://yourdomain.com
```

### Process Management (systemd)

```ini
# /etc/systemd/system/cc.service
[Unit]
Description=CommandsCenter Orchestrator
After=network.target

[Service]
Type=simple
User=cc
WorkingDirectory=/opt/cc
ExecStart=/usr/bin/cc start
Restart=on-failure
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=30
EnvironmentFile=/opt/cc/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable cc
sudo systemctl start cc
```

### Reverse Proxy (Nginx)

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # WebSocket support (terminal, chat streams)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Long-running connections for SSE / specialist streams
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

### Updating

```bash
# Global install
cc update

# Git clone
cd /opt/cc && cc update
# Executes: git pull origin main && npm ci && npm run build → graceful restart
```

### Security Checklist (VPS)

- [ ] Run as a dedicated non-root user (`cc`)
- [ ] Set `CC_SECRET` to a cryptographically random value (≥ 32 chars)
- [ ] Lock `CC_CORS_ORIGINS` to your domain
- [ ] Enable UFW/iptables: expose only ports 443 (HTTPS) and 22 (SSH)
- [ ] Set up automatic security updates (`unattended-upgrades`)
- [ ] Configure log rotation for Pino JSON logs

---

## 3. Docker (Containerized Production)

For isolated, reproducible deployments. The recommended approach for teams and CI/CD pipelines.

### docker-compose.yml

```yaml
services:
  cc:
    image: ghcr.io/<org>/cc:latest
    ports:
      - "3000:3000"
    volumes:
      # Persist the entire workspace (Portable Workspace Rule)
      - ./workspace:/app/workspace
      # (Optional) Custom startup scripts for Tier 3 tools
      - ./startup.sh:/app/.cc/startup.sh:ro
    environment:
      - NODE_ENV=production
      - CC_PORT=3000
      - CC_SECRET=${CC_SECRET}
      - CC_CORS_ORIGINS=https://yourdomain.com
    restart: unless-stopped
```

### Minimal SQLite Runtime

```yaml
services:
  cc:
    image: ghcr.io/<org>/cc:latest
    ports:
      - "3000:3000"
    volumes:
      - ./workspace:/app/workspace
    environment:
      - NODE_ENV=production
      - CC_SECRET=${CC_SECRET}
    restart: unless-stopped
```

### Dockerfile (Reference)

```dockerfile
FROM node:24-alpine AS base
RUN apk add --no-cache git python3 make g++

FROM base AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --production=false
COPY . .
RUN npm run build

FROM base AS runtime
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Tier 2: Bake essential non-NPM tools into the image
RUN apk add --no-cache curl jq

EXPOSE 3000
USER node
CMD ["node", "dist/main.js"]
```

Multi-stage build keeps the final image lean (~200MB). The `opencode` binary is included via `node_modules/.bin/` automatically.

### Startup Scripts (Tier 3 Tools)

Mount a `startup.sh` to install edge-case tools that persist across rebuilds:

```bash
#!/bin/sh
# .cc/startup.sh — runs on container boot before the app starts
apk add --no-cache ripgrep
pip install some-python-tool
```

### Updating

The app **cannot** self-update inside a container. Two approaches:

**Manual:**

```bash
docker compose pull && docker compose up -d
```

**Automated (Watchtower):**

```yaml
services:
  watchtower:
    image: containrrr/watchtower
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - WATCHTOWER_POLL_INTERVAL=21600 # 6h, matches CC_UPDATE_INTERVAL_MS
      - WATCHTOWER_CLEANUP=true
```

### Security Checklist (Docker)

- [ ] Never run the container as root (Dockerfile sets `USER node`)
- [ ] Set `CC_SECRET` via Docker secrets or `.env` file (not inline in compose)
- [ ] Lock `CC_CORS_ORIGINS` to your domain
- [ ] Place behind a reverse proxy (Nginx/Traefik) with TLS termination
- [ ] Use read-only mounts where possible (`:ro`)
- [ ] Pin image tags in production (`ghcr.io/<org>/cc:1.2.3` not `:latest`)

---

## Portability Verification

Regardless of deployment method, the Portable Workspace Rule guarantees:

```bash
# On Machine A
rsync -avz /opt/cc/workspace/ user@machine-b:/opt/cc/workspace/

# On Machine B
cd /opt/cc/workspace && cc start
# → Same portable configuration and assets; runtime history/auth state may need recreation
```

This works because portable configuration and assets live in the workspace volume/directory. SQLite runtime data lives in `CC_DATA_DIR` and is treated as disposable cache/runtime state.

---

# Licensing & Contribution Strategy

**Decision:** The application is released under the **Apache License 2.0**.

## Rationale

- **Adoption first:** The primary goal is reach, trust, and authority. A permissive license maximizes adoption — including inside companies that ban copyleft licenses — which is the foundation for any later commercial path.
- **Patent grant:** Apache-2.0 includes an explicit patent grant, which is prudent for a non-trivial orchestration platform.
- **Dependency compliance:** Apache-2.0 is fully compatible with the MIT-licensed `opencode` engine and the rest of the dependency tree.
- **Monetization is operations, not restriction:** A future paid hosted offering does not require a restrictive license — the copyright holder can always offer their own code as a service. The hosted business sells convenience, uptime, and brand, not code restrictions.
- **Optionality retained:** The project can choose different terms for future versions, but previously released Apache-2.0 code cannot be retroactively relicensed; relicensing third‑party contributions requires the necessary rights (e.g., contributor agreement/assignment).

## Contributions

No Contributor License Agreement (CLA) is required at launch. A lightweight **DCO** (Developer Certificate of Origin) sign-off may be adopted if/when external contributions arrive. A CLA would only become relevant if the project later pursues a dual-license model that requires relicensing third-party contributions.

---
