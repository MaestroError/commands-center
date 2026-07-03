# Vision

**CommandsCenter (`cc`)** is a single-user, workspace-centric application for creating, managing, and interacting with isolated AI specialists through persistent direct chat. The operator installs it, runs it, and is the sole user — there is no multi-tenancy. Access is protected by a single-owner claim flow (one-time claim code → owner password), not user accounts.

**The app is the orchestrator; OpenCode is the engine.** CommandsCenter creates and manages OpenCode workspaces, routes all chat, prompt execution, tool calls, and terminal sessions through a single `opencode serve` process, and adds its own tools on top via app-managed MCP servers. Refer to OpenCode documentation for workspace configuration format, to `AGENTS.md` for conventions, skill file structure, and MCP permission rules.

## What is a Specialist

A specialist is an **OpenCode workspace**. Each specialist maps 1:1 to a workspace directory containing standard OpenCode files:

- `AGENTS.md` — the specialist's name, role, and instructions (OpenCode reads this as the system prompt)
- `opencode.jsonc` — workspace config: default model, MCP server permissions, tool permissions
- `.opencode/skills/` — copied skill files that OpenCode loads on workspace initialization

The app creates this directory when the user creates a specialist and rewrites the files when the user edits it. Requests are routed to the correct workspace via directory parameter on the shared engine process.

## Portable Workspace Rule (MUST)

> The workspace filesystem (`CC_WORKSPACE_DIR`) is the source of truth for portable configuration and assets. SQLite (`CC_DATA_DIR/cc.db`) is a disposable derived cache — delete it and the app boots as a fully configured instance, restoring specialists, MCP servers, settings, task templates, documents, and the expected secret-key list from workspace files. Runtime history, provider auth state, scheduler state, and secret _values_ are intentionally not portable and must be re-entered on a new machine.

Every feature that persists state must answer: "If I copy the workspace directory to a fresh machine and start the app, does the configured state come back?" If no, redesign. This guarantee is enforced by boot reconcilers and covered by the rebuild-guarantee test suite.

## Product phases

| Phase       | Feature                                                                                                                                      | Status      |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **Phase 1** | **Direct Messages** — specialist CRUD, 1-on-1 chat, tasks, files, terminals, tools, integrations, self-upgrade                               | **Shipped** |
| **Phase 2** | **Group Chat** — multi-specialist conversations with shared context (documents, images, chat history)                                        | Planned     |
| **Phase 3** | **Kanban Orchestration** — multi-specialist task orchestration: specialists assigned to cards/columns working against shared project context | Planned     |

### Phase 1 — Direct Messages (shipped)

- **Specialists** — CRUD with per-specialist model, skills, MCP servers, and tool permissions; workspace files as source of truth.
- **Direct chat** — persistent conversation per specialist; session mechanics stay secondary ("Start Fresh" begins a new session, older conversations remain reachable via a secondary menu). Streaming responses, tool-call rendering, attachments (passed to OpenCode as `FilePartInput`), model selector, auto-approve toggle.
- **Tasks** — a board (backlog → scheduled → queued → failed/review/ready to check → done → archived) plus reusable **templates** with manual, one-time, or recurring timezone-aware schedules. Each run records its fully rendered prompt, outcome, and final message; runs are monitored for stalls, auto-retried within caps, and can fall back through a chain of models. Operator feedback on a task spawns subtasks that re-enter the queue. Specialists can manage tasks themselves through app-provided MCP tools, and an authenticated public task API supports external triggers.
- **Documents** — workspace-stored markdown documents shared with specialists.
- **File manager** — browse and edit workspace and host filesystem with syntax highlighting.
- **Terminals** — a global terminal on the host, plus per-specialist terminals scoped to the workspace directory.
- **Custom tools** — user-configured HTTP request tools (name + description + optional instructions), registered to specialists through the app's MCP servers.
- **Skills library** — curated built-in skills, copied into specialist workspaces.
- **Integrations** — MCP servers with OAuth, and Composio as a built-in MCP suggestion (user's own API key, MCP mode only).
- **Self-upgrade** — update detection and one-command upgrade (see decision 7).

### Phase 2 — Group Chat (planned)

Multi-specialist conversations where all participants share context: documents, images, task description, chat history.

### Phase 3 — Kanban Orchestration (planned)

Task-based orchestration on top of the existing board: specialists (groups) assigned to cards, working concurrently against shared project context. The current board is single-operator task management; Phase 3 makes it a collaboration surface.

# Architecture decisions

## 1. Single-process engine orchestrator

One persistent `opencode serve` daemon serves all specialist workspaces; the orchestrator spawns it, polls its health endpoint, and restarts it within a budget when it crashes.

- **Zero-latency interactions** — no per-message engine startup penalty; state and caches stay warm.
- **Single-process simplicity** — no per-specialist child processes, port allocation, or reverse proxying; workspace routing happens per request.
- **Degraded mode** — the HTTP API stays up even when the engine fails to start; engine startup is best-effort with retries, so the UI can always report status.

Skill discovery loads at workspace initialization, not hot-reload: when skills change for an existing workspace, the app disposes that workspace instance (engine restart is the fallback).

## 2. "Universal local" binary management

`opencode-ai` is a standard npm `dependency`, resolved from `node_modules` in every deployment target (Docker, global npm install, bare metal). This gives batteries-included installation and total version authority — the orchestrator depends on specific engine API behavior, so the version is locked and upgraded deliberately. Power users can point `CC_OPENCODE_PATH` at a custom binary.

## 3. App-provided tools via CC-managed MCP servers

The app exposes its own MCP servers where app-provided tools (task management, artifacts, specialist management, custom-tool management) and user-configured custom tools are registered dynamically per specialist. Tool **auth** is global (delegated to OpenCode's provider and MCP auth flows); tool **access** is per specialist, expressed in each workspace's `opencode.jsonc` `permission` object with glob rules and `allow` / `ask` / `deny` values. Composio integration is deliberately shallow: MCP mode only, no SDK coupling.

## 4. Owner access model

Single operator, no user accounts. First boot prints a one-time claim code and claim URL; claiming sets the owner password, and sessions are cookie-based with CSRF and origin checks. `ccenter claim` / `ccenter claim-code` rotate codes for recovery. This replaced the original "no auth in MVP" assumption once network exposure became a supported deployment.

## 5. Scheduling without a cron library

Task scheduling is a custom interval-tick scheduler (`task-scheduler-service`) backed by SQLite state (`task_scheduler_state`): due tasks are queued, due templates instantiate task occurrences (idempotent via a unique occurrence index), recurrence is timezone-aware with catch-up semantics, and completed tasks auto-archive. A cron library (`bree` was considered) was dropped — the tick loop is simpler, testable, and shares the run pipeline with manual and API triggers.

## 6. Tiered CLI tooling for specialists

Specialists need CLI tools, and containers are ephemeral. Tiered strategy: **Tier 1** — npm ecosystem (`package.json` / `npx`, environment-agnostic, restorable); **Tier 2** — essentials baked into the Docker base image (`git`, `python3`, …); **Tier 3** — a persisted startup script for edge-case tools, re-run on container boot. Bare-metal deployment remains the escape hatch for unrestricted environments.

## 7. Self-updating

The backend checks the npm registry on an interval and exposes `{ current, latest, updateAvailable, installMode }`; the UI shows a non-intrusive banner. Install mode is auto-detected (Docker / npm global / git checkout / npm local). `ccenter upgrade` re-installs via the detected package manager, then the app restarts through the graceful drain protocol: stop accepting connections → stop schedulers and the engine process (SIGTERM with grace period) → close the database → flush logs → exit for the process supervisor to restart. Inside Docker the app never self-updates; the banner directs the operator to pull a new image.

# Distribution

One npm package, **`commandscenter`**, with the **`ccenter`** binary. `ccenter start` serves the API and the pre-built React frontend; `ccenter serve` is API-only for reverse-proxy or headless setups. The CLI bundles the Fastify backend and frontend via esbuild; runtime state lives in the workspace directory, never in the npm install directory. Setup, environment variables, and deployment recipes live in [README.md](README.md).

# Licensing & contribution strategy

Released under **Apache License 2.0**.

- **Adoption first** — permissive licensing maximizes reach, including inside companies that ban copyleft.
- **Patent grant** — Apache-2.0's explicit grant is prudent for a non-trivial orchestration platform.
- **Dependency compliance** — compatible with the MIT-licensed OpenCode engine and the dependency tree.
- **Monetization is operations, not restriction** — a future hosted offering sells convenience and uptime, not code restrictions.
- **Optionality retained** — future versions can adopt different terms; released Apache-2.0 code stays Apache-2.0.

No CLA at launch; a lightweight DCO sign-off may be adopted when external contributions arrive.

# Where to look

| Question                                  | Document                                                         |
| ----------------------------------------- | ---------------------------------------------------------------- |
| Setup, environment variables, deployment  | [README.md](README.md)                                           |
| Coding standards, tech stack, conventions | [AGENTS.md](AGENTS.md)                                           |
| Dev workflow and commands                 | [CONTRIBUTING.md](CONTRIBUTING.md)                               |
| Owner claiming                            | [docs/CLAIM.md](docs/CLAIM.md)                                   |
| Per-workspace MCP configuration           | [docs/mcp-configuration-flow.md](docs/mcp-configuration-flow.md) |
