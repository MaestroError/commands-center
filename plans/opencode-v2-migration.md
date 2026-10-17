# OpenCode v2 migration assessment

Date: 2026-10-13

Current status (2026-10-17): migration implementation and acceptance are complete.
Development continues on `codex/opencode-v2-migration` as the temporary integration
branch: create feature/fix branches from it and merge them back into it until v1.
Public v1 release remains a separate milestone, blocked on upstream fixes for
both MCP client and braces, followed by Node 26 and refreshed release acceptance.
Security checks are scheduled for November 8 and conditional release work for
November 9, 2026. Earlier sections retain historical implementation/check results.

## Scope

Start the CC rebuild on `codex/opencode-v2-migration`. Assess an embedded
OpenCode host while preserving Node.js, Fastify, existing user flows, and the
workspace filesystem as the portable configuration source of truth. This first
step prepares the reference checkout and inventories integration changes; it
does not replace the production engine before runtime feasibility is verified.

## Tasks

- [x] Inspect the clean CC checkout and create the migration branch from its current HEAD.
- [x] Fetch OpenCode v2 into `examples/opencode` and record the exact revision.
- [x] Review upstream SDK, runtime, configuration, session, and event contracts.
- [x] Map CC integration points to v2 APIs and identify migration blockers.
- [x] Record an ordered implementation sequence and acceptance checks.
- [x] Run repository lint with `--fix` and tests; record baseline limitations.

## Acceptance gates for implementation

1. Published SDK boots and closes under Node 24 and the packaged CC CLI.
2. State stays in the active workspace and specialist configurations remain isolated.
3. Chat, scheduling, permissions, questions, provider/MCP auth, files, and terminals retain their behavior.
4. Fresh v2 sessions survive restart; no v1 history or backward compatibility is required.
5. Sustained concurrent sessions and repeated host shutdown leave no leaked resources.

## Baseline

CC began with a clean working tree on
`cc/commands-center/issue-164-restore-missed-reconnect-messages`.
The older `plans/proposals/opencode-v2-api-opportunities.md` concerns the v2 API
inside OpenCode 1.17; it is historical context, not a migration specification for
the released OpenCode 2 packages.

CC base revision: `95b51be45c5f8b6fded3490e93a0e8a4b2af4f28`.
Reference: `examples/opencode`, fetched from `https://github.com/anomalyco/opencode.git`
branch `v2`, detached at `4617210822bdbb31e5749751afbfb4584ccedac8`.
The SDK manifest at this revision says `2.0.26`; it is a branch snapshot, not a
verified published 2.0.27 package. The reference directory remains gitignored.

## Findings from the reference source

Paths below are relative to `examples/opencode/` unless prefixed with `CC:`.

### Runtime and persistence

- `packages/core/package.json` selects Node implementations for SQLite, PTY,
  filesystem search, image processing, and shell parser assets. Node support is
  intentional; published-package and esbuild compatibility still need execution tests.
- The freshly fetched `packages/sdk/script/build.ts` targets Node, and
  `script/verify-package.ts` runs a packed-package import check under Node as well
  as Bun. This is stronger evidence than the older web-indexed source inspected
  during the initial assessment, but it is not a full Node host lifecycle test.
- `packages/core/src/database/sqlite.node.ts` uses `node:sqlite`. This is separate
  from CC's `better-sqlite3` database; do not combine their schemas or replace CC's ORM.
- `packages/core/src/pty/pty.node.ts` loads `@lydell/node-pty` through
  `createRequire`. Native binaries and dynamic assets need packaging checks.
- `packages/sdk/src/internal/host.ts` defaults `database.path` to `:memory:`.
  CC must supply an explicit workspace-local persistent database path.
- `packages/server/src/options.ts` exposes database and config options, including
  `config.directory`, `project`, `file`, and `content`. These are useful controls,
  but do not by themselves prove that every cache and credential path is isolated.
- `packages/util/src/global-roots.ts` captures XDG roots at module evaluation;
  `global.ts` derives paths and sets a global lock directory. Setting environment
  variables after a static SDK import is too late for those defaults. Investigate
  supported host overrides first, or a controlled bootstrap before dynamic import;
  verify esbuild does not move initialization ahead of workspace selection.
- The Promise SDK owns a host and provides `close()` and `Symbol.asyncDispose`.
  `internal/fetch.ts` tracks requests and cancels them before runtime disposal.
  Startup seeds plugins before resuming suspended sessions. Verify this ordering
  against CC's task recovery to avoid duplicate execution.

### Integration map

V2 targets below are observed in
`packages/client/src/promise/generated/client.ts`. They are candidate mappings,
not claims that request/response or behavioral parity has been established.

| CC integration            | Existing files under `packages/backend/src/`                                                                                  | V2 assessment                                                                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine ownership          | `lib/start-server-runtime.ts`, `orchestrator/opencode-orchestrator.ts`, `lib/opencode-binary.ts`                              | One explicitly owned SDK host per CC runtime; drain work before `close()`. Remove daemon restart/port machinery only after parity.                                                    |
| Client construction       | `lib/opencode-client.ts`, `services/opencode-service.ts`                                                                      | Inject the Promise host; replace directory-scoped v1 clients with explicit `location` inputs where required. Keep CC's service boundary.                                              |
| Session lifecycle         | `services/conversation-service.ts`, `services/opencode-service.ts`                                                            | Map create/get/remove, prompt/command/shell, compact, interrupt, inbox, view/log/message APIs. Verify completion and queue semantics rather than renaming methods mechanically.       |
| Chat streaming            | `services/opencode-event-service.ts`, `lib/message-mapper.ts`, `routes/conversation-events.ts`                                | Replace raw v1 SSE parsing with typed async events; map into existing CC events. Preserve reconnect reconciliation, ordering, and descendant interaction handling.                    |
| Approvals and questions   | `services/opencode-service.ts`, `services/task-permission-service.ts`                                                         | V2 exposes permission request/reply and session form APIs. Audit IDs, choices, pending lists, and cancellation against CC's contracts.                                                |
| Providers and credentials | `services/provider-service.ts`, `routes/providers.ts`                                                                         | Model/provider discovery plus integration connect/OAuth and credential APIs replace v1 auth calls. Preserve CC's secret ownership and disconnect behavior.                            |
| MCP                       | `services/mcp-server-service.ts`, `mcp/cc-managed/`, `opencode/workspace-contract.ts`                                         | Audit MCP list/connect/disconnect and integration authentication; preserve CC-managed callback URLs and task-tool restrictions.                                                       |
| Specialist configuration  | `opencode/workspace-contract.ts`, `services/specialist-capability-sync.ts`, `services/custom-tool-service.ts`                 | Audit generated settings, tools, plugin loading, skill discovery, and location reload. CC currently emits enabled-only MCP entries; v2 does not support those entries without a type. |
| Files and search          | `services/file-manager-service.ts`, `routes/search.ts`                                                                        | Compare file read/list/find and VCS status/diff outputs; retain CC path validation and frontend contracts.                                                                            |
| Terminal                  | `services/terminal/node-pty-backend.ts`, `routes/terminal.ts`                                                                 | Implemented CC-owned node-pty behind the existing authenticated HTTP/WebSocket routes; interactive terminals no longer depend on an OpenCode daemon or SDK socket transport.          |
| Scheduled work            | `services/task-execution-service.ts`, `services/task-run-monitor-service.ts`, `services/interactive-chat-watchdog-service.ts` | Retain durable task state, recovery, timeout, abort, and completion evidence. Embedding does not replace these responsibilities.                                                      |
| Health and shutdown       | `services/health-service.ts`, `routes/health.ts`, `lib/start-server-runtime.ts`                                               | Report host readiness/errors rather than child health; preserve shutdown deadlines and CC's drain protocol.                                                                           |
| Archives/history          | `services/session-archive-service.ts`, database conversation/task references                                                  | Use a fresh v2 database; validate archives for newly created v2 sessions only.                                                                                                        |
| Distribution              | `CC:packages/cli/build.ts`, backend/CLI manifests, root pnpm build allowlist                                                  | Prove packed Node installation, conditional exports, WASM/native assets, and shutdown before removing `opencode-ai`.                                                                  |

### Documentation reviewed

- Local `services/www/src/docs/content/build/sdk/index.mdx` and SDK implementation.
- [Embedded SDK](https://opencode.ai/v2/docs/build/sdk/).
- [Client and event semantics](https://opencode.ai/v2/docs/build/client/): subscriptions
  are live-only and do not reconnect or replay automatically. Retain reconciliation.
- [V1 migration](https://opencode.ai/v2/docs/migrate-v1/): plugin/server contracts
  change; supported file definitions remain compatible, with documented exceptions.
- Native v2 permissions use ordered action/resource/effect rules; MCP timeout and
  agent/provider fields change. Verify generated configuration against source schemas.
- LSP configuration is accepted but LSP execution is absent in v2. Any CC capability
  relying on diagnostics must be identified before declaring parity.

## Ordered implementation backlog

- [ ] **1. Published-package feasibility:** pin a released SDK in an isolated scratch
      consumer; boot under Node 24 with a temporary persistent DB, create/read/reopen a
      session, subscribe/cancel, and close repeatedly. Package it with CC's esbuild settings.
      Verify native PTY, parser/image assets, configuration paths, and outbound callbacks.
      No credentials or production workspace should be used for this first probe.
- [ ] **2. Resolve transport and storage decisions:** prove PTY attach without a daemon;
      choose a supported host transport or CC-owned PTY implementation if needed. Verify
      all state paths using fresh v2 data; do not implement v1 history conversion.
- [ ] **3. Introduce the owned host:** wire startup/shutdown and dependency injection
      through the existing runtime/service boundaries. Keep existing CC HTTP contracts.
- [ ] **4. Port chat end to end:** create/list/resume/prompt, incremental output,
      attachments, command/shell turns, cancellation, errors, permissions, questions,
      and descendant sessions. Test concurrent specialists and reloads.
- [ ] **5. Port supporting integrations:** provider/MCP OAuth, secret changes, generated
      configs, custom tools, skills, file APIs, terminal, and health UI contracts.
- [ ] **6. Port scheduling and archives:** verify queued/running tasks across restart,
      interrupted prompts, duplicate prevention, and timeout recovery for new v2 sessions.
- [ ] **7. Cut over:** document fresh v2 setup; update installation/docs/env guidance;
      remove unused daemon dependencies and code once parity tests pass.

The target is one host with specialist locations, not one engine per specialist.
Keep portable configuration in workspace files. SDK runtime tables remain derived
or runtime state; do not move CC specialist definitions into SDK-only storage.
Use a pinned SDK revision during the migration. No runtime switch to Bun is assumed.

## Validation

- `pnpm exec eslint . --fix`: passed; no source changes.
- Initial `pnpm test` under Node 24.21.0: shared 234 tests and CLI 45 tests passed;
  backend failed because installed `better-sqlite3` targets ABI 141 (Node 25), while
  this runtime requires ABI 137. This predates the migration; no engine code changed.
- A rerun using the already-installed Node 25.8.1 is used to separate that dependency
  mismatch from other baseline failures. Node 24 embedded feasibility remains a gate.
- The Node 25 sandbox run passed 1,528 backend tests, with 26 failures and 5 skipped
  tests associated with loopback socket restrictions/timeouts. Retried with socket access.
- Final `PATH=/opt/homebrew/opt/node@25/bin:$PATH pnpm test` with socket access:
  **passed**, 316 files / 3,421 tests (backend 1,559; frontend 1,583; shared 234;
  CLI 45). Log: `/tmp/cc-v2-assessment-tests-unrestricted.log`.
- Prettier and `git diff --check` passed. No production source or dependency changes
  were made during this assessment; no commits were created.

## Published package feasibility — 2026-10-13

The user explicitly waived old history and backward compatibility. Use fresh v2
data; do not build v1 importers, dual-engine support, or old-config compatibility.
Existing user workflows remain acceptance targets. Never delete existing state as
part of the probe.

- [x] Resolve and install an exact published SDK version in an isolated scratch directory.
- [x] Boot/close under Node 24 with isolated XDG paths and an explicit SQLite file.
- [x] Create sessions in two locations, reopen the database, and verify isolation.
- [x] Exercise event cancellation, prompt/approval behavior with a local test provider, and PTY feasibility.
- [x] Test CC-style esbuild packaging and document native/asset requirements.
- [x] Record results and run lint/tests for retained probe code.

### Measured results

Tested published `@opencode/sdk@2.0.27` on macOS arm64 / Node 24.21.0.
Installed in `/tmp/cc-opencode-v2-probe`; CC manifests and lockfile are unchanged.
All probe databases/configs are new temporary directories. No v1 data is imported.

| Check                             | Result                                                                                                                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Import, host startup and shutdown | Pass on Node 24; explicit persistent SQLite path.                                                                                                                                               |
| Restart persistence               | Two sessions remain readable after closing and recreating the host.                                                                                                                             |
| Location isolation                | Directory-filtered session lists exclude the other specialist. Distinct permission configs load for both locations.                                                                             |
| Instruction isolation             | Local provider requests include their own specialist's AGENTS.md marker and exclude the other marker.                                                                                           |
| Permissions                       | Session-level deny evaluates to deny; ask appears in pending requests, accepts a once reply, and disappears. This is an API-level approval check, not a model-generated tool approval test.     |
| Event cancellation                | Connected event received; abort terminates iteration. Normal end or transport error is accepted.                                                                                                |
| Prompt/stream                     | A local OpenAI-compatible test server streams a response; the resulting text is persisted in the session. No real provider credentials or charges.                                              |
| Interrupt                         | Interrupting a held prompt closes the provider stream and the session settles.                                                                                                                  |
| PTY lifecycle                     | Native `/bin/sh` PTY creates and removes successfully through the embedded host.                                                                                                                |
| PTY interactive attach            | Unresolved: public Promise API exposes CRUD/token operations; server attach requires WebSocket upgrade. No interactive terminal round trip was demonstrated.                                    |
| Current esbuild strategy          | Fails resolving a transitive native `ffi-rs` `.node` file with no loader.                                                                                                                       |
| External SDK packaging            | Pass: bundling the lifecycle probe with CC's platform/target/format/external settings plus `--external:@opencode/sdk` preserves imports and runs the lifecycle/approval/PTY/persistence checks. |

The external-SDK result is a bundled prototype, not a completed CC CLI package.
The chat probe also passes after bundling with the SDK external, including
instruction isolation and prompt interruption.
Ship the SDK as a runtime dependency with its installed package tree; do not copy
only its JavaScript into CC's single output file. This also preserves late SDK
initialization after XDG setup. Verify a clean packed CC install in a later gate.
Native file search, watcher behavior, image processing, shell-parser assets,
provider OAuth, MCP OAuth, and sustained resource usage still need dedicated tests.
The probes disable file watching/FFF and model-catalog fetching to isolate host
behavior; their success does not validate those disabled subsystems.

npm reported an engine warning for transitive `@opentui/core@0.5.17`
(`node >=26.4.0` or Bun). The headless SDK probes nevertheless pass on Node 24.
Treat this as a distribution/support issue to investigate before pinning the CC
dependency graph. The installed temporary node_modules occupied approximately
402 MB; this is a local installed-tree measurement, not compressed release size.

### Reproduce

From the CC repository under Node 24, use an isolated directory. These scripts
resolve the SDK relative to their location, so copy them next to the temporary
installation. Each script creates its own fresh state directory and has a
30-second failure deadline. The chat probe requires loopback socket access.

```sh
mkdir -p /tmp/cc-opencode-v2-probe
npm install --prefix /tmp/cc-opencode-v2-probe --save-exact --no-audit --no-fund @opencode/sdk@2.0.27
cp scripts/opencode-v2-lifecycle-probe.mjs /tmp/cc-opencode-v2-probe/probe.mjs
cp scripts/opencode-v2-chat-probe.mjs /tmp/cc-opencode-v2-probe/chat.mjs
node /tmp/cc-opencode-v2-probe/probe.mjs
node /tmp/cc-opencode-v2-probe/chat.mjs
pnpm --filter commandscenter exec esbuild /tmp/cc-opencode-v2-probe/probe.mjs --bundle --platform=node --target=node22 --format=esm --external:@opencode/sdk --external:better-sqlite3 --external:pino-pretty --external:fsevents --outfile=/tmp/cc-opencode-v2-probe/bundled.mjs
node /tmp/cc-opencode-v2-probe/bundled.mjs
```

### Decision

Proceed with a Node embedded-host implementation for a first CC chat flow.
Use fresh v2 storage, explicit workspace paths, delayed SDK initialization,
and an external runtime SDK dependency. Resolve interactive PTY transport before
removing the daemon from the complete product. Do not use private Effect services
as a shortcut without an explicit architectural decision.

### Implementation slice: owned host foundation

The external SDK is an ordinary CLI runtime dependency. npm/pnpm installs its
native modules and assets alongside the esbuild output; no additional user command
or engine daemon is required by this packaging choice.

- [x] Pin SDK 2.0.27 in backend and CLI; exclude it from the CLI bundle.
- [x] Add a CC-owned host factory with delayed import, explicit fresh workspace
      storage, one active host, and deterministic shutdown. Reuse the XDG helpers.
- [x] Exercise the factory against the real SDK: sessions, persistence, specialist
      isolation, streamed local-provider chat, and shutdown.
- [x] Run type checks, ESLint with `--fix`, tests, and a CLI build.

This slice provides the tested host boundary for the chat port. It does not wire
an incomplete v2 engine into the application or add a runtime engine selector.
The existing runtime is replaced when the service ports are ready together.

Implemented `packages/backend/src/opencode/embedded-host.ts`, using the existing
XDG/npm helpers. Storage is rooted at `<workspace>/.cc/opencode-v2/`, with an
explicit `engine.db`. The factory rejects concurrent hosts and workspace changes
within a process because the SDK captures global paths on first import. Shutdown
is idempotent and reopening the same workspace is supported. It deliberately
leaves the process bound to that workspace after shutdown.

Validation of this slice:

- Eight integration tests pass on Node 24.21.0 and Node 25.8.1, using the real
  SDK and a loopback streaming provider. They check database location, response
  persistence, specialist instructions/session filtering, duplicate-host rejection,
  restart persistence, and workspace binding. Session listing takes `directory`,
  while session creation takes `location.directory`.
- `pnpm typecheck`, `pnpm exec eslint . --fix`, and CLI build pass.
- Repository test run: shared 234, CLI 45, backend 1,567, frontend 1,556 passed.
  One frontend suite initially failed to import Zustand because the filtered
  dependency installation left its optional-peer link stale. After a full
  `pnpm install --frozen-lockfile`, that suite passed all 27 tests. Total verified:
  317 files / 3,429 tests. Typecheck/build/lint were also rerun after relinking.
- Built and packed `commandscenter` locally, then installed the tarball into
  `/tmp/cc-v2-cli-install/consumer` with npm on Node 24. CLI `--help` passes.
  Separately bundled the new CC host factory with the SDK external and ran it
  against that installation: create, close, reopen, and read pass without repo
  dependency resolution. The current CLI does not yet call this factory.
- The clean installation repeats the OpenTUI engine warning. Its dependency
  chain includes `@opencode/server -> @opencode/simulation -> @opentui/core`;
  this is a runtime package dependency, not merely our development tooling.
  npm/pnpm also report unapproved watcher/parser install scripts. Native asset
  workloads and other platforms remain unverified; this is not a full release gate.
- Logs: `/tmp/cc-v2-foundation-tests.log`, `/tmp/cc-v2-frontend-relink-tests.log`,
  `/tmp/cc-v2-host-node24.log`, `/tmp/cc-v2-foundation-typecheck.log`,
  `/tmp/cc-v2-lint.log`, `/tmp/cc-v2-foundation-build.log`,
  `/tmp/cc-v2-cli-install.log`, `/tmp/cc-v2-packed-host.log`.

Next tasks:

### Chat port

- [x] Define the conversation service's chat dependency boundary and implement it
      with the embedded host: sessions, pagination, prompts, instruction entries,
      model/agent selection, attachments, commands, shell, compaction, and interrupt.
- [x] Map v2 messages, tool results/errors, permissions, and question forms to CC's
      existing chat contracts. Preserve media sanitization and specialist scoping.
- [x] Implement typed SDK event subscriptions with incremental output, descendant
      interactions, cancellation, and reconnect reconciliation.
- [x] Verify the actual conversation service and event flow against the real SDK
      and local test provider, plus focused mapping/interaction tests.
- [x] Run lint with `--fix`, type checks, and repository tests; document limits.

This ports the chat boundary for later runtime composition. Do not start a second
engine beside the current daemon. Provider/configuration and terminal cutover
remain separate required steps before replacing the main runtime.

Implementation:

- `ConversationEngine` narrows the service dependency to chat operations. The
  conversation HTTP and SSE route contexts now accept that boundary without
  requiring unrelated engine, scheduler, or provider-auth services.
- `embedded-chat-service.ts` implements it with the owned Promise host. Model and
  agent selection precede submission; CC's composed instructions use the named
  `cc-system` instruction entry, replaced or removed on subsequent prompts.
  Attachments use v2 file URIs. Native permission action names are expected;
  generated specialist/task configuration still needs its separate v2 port.
- `embedded-message-mapper.ts` produces the existing CC message/part contract,
  including tool output, media, provider errors, shell turns, and compaction
  results. Internal model/agent/instruction records are not chat messages.
  Media continues through CC's existing sanitization and download extraction.
- `embedded-interactions.ts` maps native permissions and the built-in question
  tool's forms to existing controls. Other generic v2 forms are outside this chat
  contract. Replies resolve the pending request again; CC verifies conversation
  ancestry before accepting a reply.
- `embedded-chat-events.ts` translates the typed live stream to CC events. It
  preserves cancellation, reconnect readiness callbacks, title updates, text and
  reasoning deltas, tool updates, errors, and descendant interaction filtering.
  Reconnect reconciliation remains owned by CC's existing connected-event flow;
  the SDK stream itself has no replay. Text and reasoning use separate ordinal
  namespaces, with matching stable IDs in streamed and persisted messages.

Integration evidence uses a real SDK with a local OpenAI-compatible provider,
CC's SQLite conversation service, Fastify HTTP routes, and the actual SSE route.
It covers synchronous/asynchronous prompts, instruction snapshots, uploaded text,
interrupting a held generation, shell output, commands, successful compaction,
provider failures, permission scoping, question replies/rejection, and reloading
saved chat after a host restart. A model-generated question tool call also pauses
and resumes generation through CC's reply API. A deliberately interrupted SDK
stream verifies that reconnect announces readiness again.

Two SDK details verified during integration: compare canonical filesystem paths
when checking specialist ownership, and send only the opaque cursor (plus the
required session ID for message lists) on subsequent pages. Reusing the original
order/filter arguments with a cursor is rejected by v2.

Chat validation:

- ESLint with `--fix`, repository type checks, Prettier, and `git diff --check` pass.
- All 37 new chat/mapping tests pass. Tests use Node 25.8.1 to match this
  checkout's existing `better-sqlite3` binary; the separate host foundation was
  already tested on Node 24.
- Repository regressions verified: shared 234, CLI 45, backend 1,604, frontend
  1,583; total 319 files / 3,466 tests across the full run and targeted reruns.
  The full run's new-test failure assumed an unknown agent would be rejected
  immediately. V2 accepts that selection at submission, so the rejection test
  now uses a deleted session, which definitively fails before acceptance.
  The final 37-test chat rerun passes; the frontend suite was run separately
  after the initial recursive run stopped at the backend failure.
- Logs: `/tmp/cc-v2-chat-full-tests.log`, `/tmp/cc-v2-chat-final-focused.log`,
  `/tmp/cc-v2-chat-frontend-tests.log`, `/tmp/cc-v2-chat-lint.log`,
  `/tmp/cc-v2-chat-all-types.log`.
- No main-runtime or browser end-to-end cutover is claimed. Provider OAuth/MCP,
  specialist config generation, native image/parser workloads, task recovery,
  and terminal integration retain their existing migration gates.

### Remaining cutover tasks

- [ ] Resolve the Node engine warning and verify native workloads across supported
      platforms; the clean local packed-install check passed in the host slice.
- [x] Choose and test terminal attachment: CC-owned PTY under the existing Fastify
      WebSocket boundary, or an officially supported in-process OpenCode adapter.
- [ ] Validate all state paths (including caches, locks, credentials, and spawned
      tool environments) against the Portable Workspace Rule.
- [ ] Port provider/auth and generated specialist configuration, then wire the
      owned host and chat adapters into runtime startup/drain with supporting
      services. Verify the full application cutover together.

Probe logs: `/tmp/cc-opencode-v2-probe-run.log`, `/tmp/cc-opencode-v2-chat.log`,
`/tmp/cc-opencode-v2-probe-build.log`, `/tmp/cc-opencode-v2-probe-bundled-run.log`.

### Feasibility validation

- Both retained probes pass under Node 24.21.0, directly and as esbuild bundles
  with the SDK external. They cover host startup/reopen/shutdown, configuration,
  session isolation, API approvals, PTY lifecycle, event abort, local streamed
  generation, instruction isolation, and prompt interruption.
- `pnpm exec eslint . --fix`: passed.
- Prettier and `git diff --check`: passed.
- Repository `pnpm test`: 316 files / 3,421 tests passed under Node 25.8.1 with
  loopback access, matching the existing CC SQLite native binary. This does not
  replace the independent Node 24 SDK results above.
- Test log: `/tmp/cc-v2-feasibility-tests.log`.
- The broader implementation gate remains open for terminal attach, native
  asset exercises, clean CC packaging, OAuth/MCP, and resource soak tests.

## Provider authentication and specialist configuration slice

- [x] Add an embedded provider service for CC's existing provider controls: catalog,
      API keys, OAuth attempt lifecycle, and credential removal. Verify with SDK-backed
      catalog/key tests and deterministic OAuth doubles (no real credentials).
- [x] Generate native v2 specialist configuration with ordered permissions and
      complete MCP server definitions; validate it using the installed SDK. Reuse the
      existing rules/skill writer through an injected renderer for staged integration.
- [x] Run ESLint with fixes, type checks, and tests; record remaining cutover work.

This slice remains staged with the embedded host/chat adapters. The running v1
application continues using its existing services until the coordinated runtime
cutover; there is no selectable dual-engine mode or history migration.

### Provider/configuration implementation evidence

- Added the SDK-backed provider service and injectable provider HTTP routes. The
  chat adapter shares the model catalog reader. Catalog reads wait for plugin
  activation via model APIs before reading providers: `provider.list` itself can
  return before activation and only lists available providers. Disconnected
  providers are resolved from registered authentication integrations, excluding
  integrations that have no matching provider.
- API keys use integration connect; disconnect removes credentials belonging to
  that integration and cancels pending attempts. No keys enter CC response bodies
  or generated specialist configuration. Environment-based connections cannot be
  removed through the SDK credential store and return an explicit actionable error.
- OAuth uses stable SDK method IDs internally and explicit attempt status. Auto
  mode polls status; code mode submits a code (including pasted callback URLs).
  Restarting authorization cancels its previous attempt. OAuth tests use doubles;
  no real provider account was connected. Attempts are disposable in-memory state.
- Native configuration uses `providers`, `permissions`, and `mcp.servers`, complete
  local/remote definitions, native timeout objects, and `disabled` flags. MCP Code
  Mode is disabled to retain per-tool grants. The existing managed-skill writer
  accepts the native renderer and shares AGENTS.md rendering.
- Real SDK tests cover catalog loading from a fresh workspace, credential
  persistence across host restart, removal, model availability refresh, the CC
  provider HTTP route, and parsing generated provider/permission/MCP configuration.

Remaining before runtime cutover: connect MCP definition producers and native
capability/action catalogs to this renderer, port scheduled-task permission and
configuration producers, then wire the staged host/chat/provider services into
startup and shutdown. Rich v2 authentication forms, command/external auth methods,
and disconnected providers whose integration ID differs from their provider ID
need explicit catalog/UI support; the current service exposes matching registered
providers and existing text/select OAuth controls. Terminal attach and packaging
release gates remain as recorded above. No old-history or credential conversion
was introduced.

### Provider/configuration validation

- `pnpm exec eslint . --fix` passed.
- `pnpm typecheck` passed in all four packages.
- `pnpm test` passed: 321 files / 3,495 tests (shared 234, CLI 45,
  backend 1,633, frontend 1,583), including 29 new provider/config tests.
- Prettier and `git diff --check` passed.
- Tests ran on Node 25 to match the repository's installed better-sqlite3 ABI.
  No production OAuth login or browser E2E of a cut-over runtime was performed.

## MCP and tools slice

- [x] Produce complete v2 MCP definitions from CC's portable MCP configuration
      and managed app entries, preserving secret references, auth, and timeouts.
- [x] Connect these producers to the specialist writer; preserve default-enabled
      app servers and isolate unselected external servers.
- [x] Port custom-tool creation/loading to native plugins through injectable
      rendering; reuse existing portable tool snapshots without v1 conversion.
- [x] Add native task permissions and SDK MCP lifecycle/auth handling. Investigate
      the missing public tool-inventory API without inventing empty inventories.
- [x] Verify real MCP/custom-tool calls and permission enforcement, then run
      ESLint fixes, typechecking, and the test suite. Record cutover limitations.

### MCP/tool implementation evidence

- Complete native local/remote definitions are generated from the existing
  reconciled MCP records. Global config writes are atomic, preserve other native
  settings, and refuse malformed input. Specialist writes reuse the skill/rules
  writer and existing tool snapshot service. Managed server defaults and long
  tool execution timeouts are retained; unselected external servers are disabled.
- Custom-tool templates are native plugin factories. Per-copy wrappers preserve
  renamed tool identity; generated `.opencode/cc-tools/<slug>/index.ts` entrypoints
  load existing snapshots with relative imports. Directory entrypoints are required
  by the published SDK; file paths in the `plugins` array are ignored upstream.
- The embedded host registers a supported plugin to expose the live tool registry
  and its native permission actions. This resolves the missing public tool-ID
  endpoint without private SDK APIs or a second MCP client.
- CC custom tools use `cc_custom_` names. Their execution hook creates approvals,
  waits for the decision event, rejects denied calls, and clears pending approvals
  on `session.execution.interrupted`. SDK `permission.create` alone does not wait
  for approval or clean the pending request on interruption.
- Real SDK tests run copied native tools, stdio MCP tools with environment secret
  references, and authenticated HTTP MCP tools. They cover allow/deny/ask, user
  rejection, interruption, pending-request cleanup, and disconnect inventory.
- Native task permissions preserve native action names and enforce disabled MCP
  server denials after per-tool grants. Scheduled-task service wiring remains part
  of runtime cutover.
- MCP OAuth uses integration IDs supplied by the SDK, explicit pending/completed
  attempt state, cancellation, and credential removal scoped to one integration.
  Attempt lifecycle tests use doubles; no external account was connected.

### Remaining MCP/tool cutover work

The producers and adapters are staged and verified independently. Runtime
startup/reconciliation and MCP CRUD must call the native global/specialist writers;
custom-tool mutations must regenerate plugin entrypoints before reloading the
location; task execution must use the native permission builder. The running v1
services are unchanged until the coordinated cutover.

The current CC remote/VPS OAuth redirect cannot be reused directly. V2 owns a
loopback listener and completes browser authorization there; its generic
code-completion API does not substitute for the MCP callback. Configure native
OAuth without CC's redirect URL for now. A remote callback adapter remains a
cutover gate; exposing only a code-completion shim would be incorrect.

### MCP/tool validation

- ESLint with `--fix` passed; all-package typechecking passed. The final explicit
  MCP-service return type was also checked with backend typechecking and ESLint.
- Full `pnpm test` passed: 324 files / 3,529 tests (shared 234, CLI 45,
  backend 1,667, frontend 1,583), including 34 new MCP/tool tests.
- `git diff --check` passed. Tests ran on Node 25 to match CC's installed SQLite
  binary; this slice does not expand the previously verified Node 24 packaging
  claim to all native/plugin workloads. Browser E2E of the runtime cutover remains
  outstanding because production startup still uses v1.
- Logs: `/tmp/cc-v2-mcp-full-tests.log`, `/tmp/cc-v2-mcp-all-types.log`,
  `/tmp/cc-v2-mcp-lint.log`, `/tmp/cc-v2-mcp-cleanup-tests.log`.

## CC-owned terminal implementation

- [x] Add the approved node-pty runtime dependency and keep it external in CLI builds.
- [x] Replace the daemon terminal backend with local PTY ownership, bounded replay,
      detach/reconnect, resize, process exit, and server shutdown cleanup.
- [x] Connect existing authenticated routes and update the terminal backend contract.
- [x] Test real shell/WebSocket interaction and lifecycle; run ESLint fixes,
      typechecking, tests, and CLI packaging checks. Update developer docs.

Terminal sessions are disposable runtime state. Their cwd defaults to the active
workspace. Disconnecting the browser keeps the shell alive; deleting a terminal
or stopping CC terminates it. No history migration or backend selector is needed.

## Terminal feasibility checks (before local implementation)

- [x] Inspect the published SDK transport and CC's terminal attachment contract.
- [x] Exercise real native PTYs through the embedded CC host: working directory,
      location isolation, resize, natural exit, explicit removal, host shutdown.
- [x] Determine whether browser input/output and reconnect can use supported
      embedded APIs; record any missing transport rather than substitute mocks.
- [x] Run ESLint fixes, typechecking, and tests; record the supported integration
      path and remaining terminal cutover work.

Scope: test the pinned SDK's feasibility before changing production terminal
ownership. CC's current backend needs a daemon WebSocket URL; the published SDK
exposes PTY CRUD and connection tickets but no public embedded stream attachment.

### Terminal result

The native lifecycle works through `createEmbeddedOpenCodeHost` on macOS arm64,
on both Node 24.21.0 and Node 25. Seven integration tests cover actual child cwd,
TTY allocation, location isolation, observed viewport resize, natural exit code,
process termination on removal, and process termination on host close. Test
children report observations into temporary workspace files; this does not
exercise terminal stream attachment.

The pinned SDK 2.0.27 cannot directly replace CC's current terminal backend.
Its public `pty.connect` only exposes `token`; neither the Promise host interface
nor its public creation options expose a socket upgrade or stream attachment.
The reference server's `handlers/pty.ts` requires an HTTP request upgrade for
`/api/pty/:ptyID/connect`, while the embedded host dispatches Fetch requests
internally. A ticket alone supplies no listening endpoint. Existing CC code
depends on `config.opencode.baseUrl` for its WebSocket, so pointing at an embedded
host is insufficient. Browser input/output and reconnect remain unverified and
blocked on selecting an attachment implementation.

Recommended next implementation: CC owns the interactive terminal through the
already approved `node-pty` technology and serves its existing authenticated
Fastify/WebSocket boundary. This needs a direct package dependency (currently only
OpenCode's transitive `@lydell/node-pty` fork is installed), a terminal backend,
bounded replay/reconnect handling, and shutdown cleanup. Keep OpenCode's internal
agent shell facilities separate. No private SDK imports or additional daemon
were introduced in this feasibility check. The production terminal remains v1.

Validation: 42 terminal tests across six files passed on Node 25, including the
seven new embedded-host tests. The seven also passed separately on Node 24.
Repository ESLint `--fix`, all-package typechecking, and `git diff --check`
passed. The full suite and browser E2E were not rerun for this test-only slice.
Logs: `/tmp/cc-v2-terminal-regression.log`, `/tmp/cc-v2-terminal-node24.log`,
`/tmp/cc-v2-terminal-lint.log`, `/tmp/cc-v2-terminal-types.log`.

## Local terminal implementation evidence

- The production terminal routes now instantiate the CC-owned backend. The old
  daemon proxy/factory and their obsolete mocked tests were removed. Terminal
  sessions report `backend: local`; frontend fixtures and the tab label match.
- Real shells use the requested working directory, defaulting to the workspace,
  and inherit the CC environment. The browser receives raw UTF-8 output over its
  existing authenticated WebSocket. Resize uses the existing validated HTTP API.
- Browser detachment preserves the shell. Reconnect resets the display and
  replays the bounded in-memory tail (262,144 UTF-16 code units). The obsolete
  OpenCode cursor-frame filter was removed so valid JSON output is preserved.
- Natural exits remove sessions; deletion and server shutdown wait for shell
  exit, escalating to SIGKILL after one second if needed. Socket attachments are
  detached on close/error, and shutdown terminates connected sockets before
  waiting for the HTTP server to close. Slow clients are disconnected at 1 MiB
  of queued WebSocket output; inbound messages are limited to 64 KiB.
- `node-pty@1.2.0-beta.14` is a direct backend and CLI runtime dependency, external
  to esbuild and approved for pnpm installation scripts. Stable 1.1.0's macOS
  helper packaging bug (#919) and beta.15's reported Windows regression (#955)
  motivated this pin. The native dependency works from an isolated packed-CLI
  installation without relying on the repository's node_modules.
- This closes the terminal transport gate for the migration. Runtime AI startup
  still uses v1; embedded AI lifecycle cutover and remote MCP OAuth remain open.
  Native terminal behavior is verified on macOS arm64, not Linux/Windows.

### Local terminal validation

- Full `pnpm test`: 323 files / 3,532 tests passed (shared 234, CLI 45,
  backend 1,669, frontend 1,584), on Node 25 to match installed SQLite.
- All-package typechecking and repository ESLint `--fix` passed.
- 27 real local-terminal backend/route tests also passed separately on Node 24.
- Eight Chromium terminal browser checks passed using the existing UI transport
  fixtures. Real shell I/O, reconnect, resize, exit, and shutdown are covered by
  backend WebSocket integration tests. No full v2 application E2E is claimed.
- CLI build passed; an isolated consumer installed the packed CLI and resolved
  its own node-pty dependency to execute a real shell successfully. CLI help loaded.
- Design-system audit and `git diff --check` passed. No commit was made.
- Logs: `/tmp/cc-node-pty-full-tests.log`, `/tmp/cc-node-pty-node24.log`,
  `/tmp/cc-node-pty-types.log`, `/tmp/cc-node-pty-lint.log`,
  `/tmp/cc-node-pty-e2e.log`, `/tmp/cc-node-pty-build.log`,
  `/tmp/cc-node-pty-install.log`, `/tmp/cc-node-pty-packed-help.log`.

## Remote MCP OAuth callback integration

- [x] Verify native `redirect_uri` plus `callback_port` using a real OAuth/MCP test server.
- [x] Implement a state-bound, expiring, single-use CC callback relay to the SDK's
      private loopback listener; preserve code/error/issuer and reject unknown callbacks.
- [x] Connect callback configuration and attempt cleanup to the staged MCP adapters;
      provide the injectable callback route for coordinated runtime cutover.
- [x] Verify PKCE/token exchange, denial, wrong state/issuer, replay, cancellation,
      and expiry. Run ESLint fixes, typechecking, and tests; document limitations.

The public redirect remains under CC's configured public origin. Only an active,
validated attempt may select a preconfigured loopback callback destination. Never
accept a callback target URL from the request or rewrite the provider's registered
redirect URI after authorization starts. OAuth attempts are disposable runtime
state. Existing production v1 auth stays wired until the coordinated AI cutover.

### Remote MCP OAuth implementation evidence

- A shared runtime callback registry generates the public CC redirect plus a
  separate private callback port for each MCP server. Global and specialist
  native config producers accept this registry; no portable configuration or
  database schema was changed.
- The MCP adapter tracks the SDK authorization URL's state and expiry, checks
  native attempt status before forwarding, and revokes callback state on
  cancellation/replacement/completion. SDK OAuth still owns DCR, PKCE, issuer
  validation, token exchange, and stored credentials.
- The injectable CC callback route sends only validated callback fields to the
  registered loopback target; no browser-provided destination is accepted. It
  consumes state before forwarding, retains SDK issuer checks, suppresses URL
  logging, and returns fixed plain-text status with no-store/no-referrer headers.
  Existing owner-session authentication remains in force when wired at cutover.
- Real OAuth tests use an HTTPS public redirect on `cc.example.test` delivered
  through Fastify injection, a separate real local provider, and the SDK's real
  callback listener. The provider checks registered redirect URI and PKCE verifier
  at exchange. A successful flow connects to the bearer-protected MCP endpoint.
  Tests also cover denial, bad code/state/issuer, replay, wrong server, cancelled
  and replaced attempts; registry tests cover expiry and shutdown boundaries.
- The replacement test exposed HTTP connection reuse against closed SDK listeners.
  Loopback forwarding now sends `Connection: close`; the regression passes with
  the real SDK. No arbitrary delay or retry was added.
- The integration design gate is resolved. Production v1 OAuth remains wired
  until the coordinated runtime cutover; one registry must be shared across
  config generation, the MCP adapter, and route registration. No live external
  OAuth account or actual VPS deployment was tested. A callback-port collision
  before listener startup is reported by the SDK, never bypassed by forwarding
  to a different destination.

### Remote MCP OAuth validation

- Full `pnpm test` passed: 325 files / 3,552 tests (shared 234, CLI 45,
  backend 1,689, frontend 1,584). The slice adds 20 tests, including 10 real SDK
  OAuth/MCP integration cases, nine callback-boundary cases, and native config
  generation coverage.
- All-package typechecking, repository ESLint `--fix`, and `git diff --check`
  passed. The 19 OAuth integration/boundary tests also passed on Node 24 LTS;
  the full suite used Node 25 to match the installed CC SQLite binary.
- Logs: `/tmp/cc-mcp-oauth-full-tests.log`, `/tmp/cc-mcp-oauth-node24.log`,
  `/tmp/cc-mcp-oauth-types.log`, `/tmp/cc-mcp-oauth-lint.log`.
- Next: coordinated embedded runtime startup/shutdown and service wiring, followed
  by task recovery and full application E2E. No commit was made.

## Embedded runtime cutover

- [x] Map remaining daemon consumers and define the native runtime/service boundary.
- [x] Wire one embedded host into startup/drain, health, configuration reconciliation,
      secret reloads, providers, MCP callbacks, tool inventory, and file operations.
- [x] Wire specialist/task workspace generation and native task permissions; verify
      scheduling/recovery against new v2 sessions without history conversion.
- [x] Exercise the real application runtime and chat flow, then run lint fixes,
      typechecking, regression tests, packaging checks, and update setup documentation.

Production will use one embedded SDK host and the existing CC-owned terminal
backend. Preserve portable workspace configuration and existing CC HTTP contracts;
remove obsolete daemon paths as their consumers move. No runtime engine selector.

### Runtime boundary implementation

- [x] Compose chat, events, provider, MCP, and OAuth adapters around one host.
- [x] Own injected environment values through host startup, reload, and shutdown;
      restore removed secrets and ambient values without changing unrelated keys.
- [x] Serialize reload/shutdown, expose lifecycle status, and verify the same services
      see updated configuration and credentials with the real SDK.
- [x] Run lint fixes, typechecking, and regression tests before application wiring.

Inspection: production still has daemon assumptions in health/restart, provider
construction, MCP config reconciliation, specialist/tool workspace generation,
file/search routes, task permissions, and session status inventory. The new
boundary must be verified before these consumers switch together.

The runtime now requires configuration preparation before startup/reload. It
passes the same OAuth callback registry to preparation and MCP services, ensuring
generated redirect settings and callback routing agree. This is necessary because
SDK 2.0.27 logs and skips malformed configuration instead of rejecting reload;
CC must enforce its portable configuration validation before calling the SDK.
Lifecycle status alone is not a configuration validator or a provider health probe.

Real SDK tests verify rotated credentials on subsequent provider requests,
removed secrets in reloaded configuration, changed provider models, stable session
identity, active chat completion across reload, failed preparation/reload recovery,
queued reload shutdown, and environment restoration. Existing real MCP OAuth
tests now exercise the composed runtime and its configuration preparation hook.

Application startup remains on v1. No engine selector was added. Remaining work:
switch boot reconciliation and workspace/tool writers to native configuration;
replace file/search and status-inventory consumers; wire provider/MCP routes and
task permissions/recovery; then change startup/drain and run application E2E.

Validation: full regression suite passed, 326 files / 3,568 tests (shared 234,
CLI 45, backend 1,705, frontend 1,584). The 26 composed runtime/OAuth tests also
passed on Node 24 LTS. ESLint `--fix`, all-package typechecking, CLI build, and
`git diff --check` passed. The full suite ran on Node 25 for the installed SQLite
ABI. Logs are `/tmp/cc-runtime-{full-tests,node24,types,lint,build}.log`.
No application E2E cutover claim: production startup is still v1. No commit made.

## Local v2 browser E2E

- [x] Wire specialist creation/update to injectable native workspace generation
      and the existing provider catalog boundary.
- [x] Add a local E2E application fixture using real CC services/routes, SQLite,
      embedded runtime and a deterministic local model provider. Do not mock CC
      chat HTTP/SSE or the browser's API requests.
- [x] Exercise specialist creation, streamed chat, attachments and page reload
      persistence in Chromium; keep the workspace isolated from the user's data.
- [x] Run lint fixes, typechecking and regression tests; document the local command
      and the explicitly covered scope. Production deployment remains deferred.

Implemented `pnpm test:e2e:embedded` and `pnpm dev:embedded-preview`. The browser
suite builds CC's frontend and uses real owner login, specialist management,
workspace file listing, provider and chat HTTP/SSE routes with the embedded SDK.
The specialist service now accepts a workspace preparer and only depends on the
engine methods it uses. Shared provider model mapping and route registrations
serve both the existing runtime and the native integration fixture.

Five Chromium tests pass: streamed response, updated specialist instructions after
reload, page reload persistence, native workspace configuration, and a text
attachment delivered to the model provider. The model provider is deterministic;
CC API requests are not intercepted. The preview uses loopback port 4175, a fresh
temporary workspace, and the documented test password. Managed MCP servers are
disabled in this fixture; it is not the complete application cutover.

Validation: all 3,568 regression tests (326 files), five browser E2E tests,
all-package typechecking, ESLint `--fix`, formatter checks on the new fixture,
frontend build and `git diff --check` passed. Rebuilt the existing backend SQLite
native dependency for the default Node 24.21 runtime; both the complete regression
suite and the documented E2E command now pass on Node 24 without a PATH override.
Logs: `/tmp/cc-local-e2e-{node24,regression-node24,types,lint}.log`.

Next local lane: managed MCP/custom-tool execution through the running application,
then scheduled task execution/recovery. File/search and remaining application
service consumers still need native wiring before changing default startup.

## Local MCP and tools application wiring

- [x] Reuse MCP/custom-tool/managed-MCP routes with injectable services and native
      config/workspace writers (narrow reuse refactor approved by the user).
- [x] Compose portable MCP CRUD, secrets, specialist regeneration, tool mutations,
      OAuth callbacks, and CC-managed MCP endpoints in the local embedded preview.
- [x] Exercise real tool execution and permission decisions through chat, plus MCP
      mutations and native configuration refresh; add focused regression coverage.
- [x] Run ESLint `--fix`, typechecking, regression and embedded browser tests;
      update local preview scope and record remaining migration limitations.

This slice retains the existing portable configuration formats and single embedded
host. Scheduled task execution and the normal CLI runtime switch remain later steps.

The embedded preview now registers MCP/custom-tool/secret routes and real CC-managed
MCP endpoints. Native workspace writers refresh plugins after copying, renaming or
removing tools and regenerate external MCP selections after configuration changes.
MCP assignment changes also update portable `specialist.json` files. Reserved
CC-managed server names are rejected before persistence. Polling pending OAuth
authorization no longer reloads the host and cancels its callback listener.

SDK 2.0.27 publishes MCP connected status before a 100 ms deferred tool-registry
update. The host waits 200 ms on each location's first catalog read after startup
or reload, then refreshes the registry. Subsequent reads avoid that delay. This is
a pinned-SDK timing workaround, not a public upstream readiness guarantee; revisit
it when the SDK exposes a catalog-ready operation. SDK location inputs retain the
same directory identity used by chat/MCP calls; canonical paths only key the CC
plugin reader map. Native tests no longer retry discovery to hide startup races.

Browser coverage now includes managed-tool execution, custom-tool creation and
allow/deny decisions, renamed copies, deletion, OAuth callback completion, portable
MCP rename, disabling an MCP tool in an existing conversation, and reserved names.
The local deterministic provider selects tools; actual SDK/MCP code executes them.

Validation: the full 3,568-test regression suite passed; after the final catalog
initialization changes, all 185 native SDK adapter tests and all 14 Chromium
embedded tests passed again. ESLint `--fix`, all-package typechecking, formatting
checks, frontend build and `git diff --check` passed. Logs are
`/tmp/cc-mcp-tools-{regression-final,native-final,e2e-final,types-final,lint-final}.log`.
No commit made. Next: scheduled task execution/recovery and task-dependent managed
tools, then file/search and remaining consumers before default startup cutover.

## Local scheduled-task execution and recovery

- [x] Reuse task route registration and execution services with injectable native
      permission mapping; narrow reuse refactor approved by the user.
- [x] Wire task permissions, attachments, execution, scheduler lifecycle and
      task-dependent managed tools into the embedded preview.
- [x] Verify real task execution, unattended permission handling, cancellation,
      scheduled dispatch and recovery without duplicate prompts against the SDK.
- [x] Run ESLint `--fix`, typechecking, relevant regression and browser checks;
      document evidence and remaining cutover limitations.

Keep the current portable task configuration and existing scheduler semantics.
No history conversion or default CLI startup switch is part of this slice.

Assessment: the existing execution/monitor services already consume the shared
conversation boundary. Remaining wiring includes task routes, native permission
mapping, runtime-health deferral, scheduler start/stop and startup recovery, and
task-dependent managed MCP definitions. Review SDK idle outcomes during recovery:
the current adapter maps every inactive session to idle and drops idle markers,
whereas the task monitor distinguishes interrupted work from completed turns.
Baseline: 15 lifecycle, recurrence and permission tests pass
(`/tmp/cc-v2-task-baseline.log`). Task-route reuse confirmation received.

Implemented task route service injection, native session permission mapping and
runtime health checks. The embedded preview runs the existing scheduler and task
monitor, registers task-dependent managed MCP tools, and stops scheduling/monitoring
before shutdown. Portable task definitions and the existing SQLite runtime records
retain their established formats.

Recovery now drains persisted queued runs as well as monitoring running ones.
The SDK adapter maps interrupted idle markers to an interrupted session status and
preserves interruption on the current assistant turn so the monitor cannot treat
an aborted partial answer as success. Native tests close and reopen the SDK host
against the same workspace: completed work finalizes without another prompt,
queued work starts, and interrupted work receives the existing cancellation policy.
This tests host reconstruction, not an OS crash or kill-and-restart deployment.

Six added browser checks cover manual task results on the task page, scheduled
dispatch, task-dependent tools, denied tools, cancellation of an active provider
request, and monitor recovery without duplicate provider requests. Existing
recurrence/policy tests remain part of the regression suite; exhaustive recurring
template and external-provider testing is not claimed by this fixture.

Validation: all 3,571 regression tests passed (327 files), all 20 embedded Chromium
tests passed, and the final 31 chat/recovery integration tests passed after the
last interrupted-turn adjustment. All-package typechecking, ESLint `--fix`,
formatting checks, frontend build and `git diff --check` passed. A concurrent
browser/regression run exceeded the existing permission-dialog assertion timeout;
the complete browser suite passed when run independently. Logs:
`/tmp/cc-v2-task-{full,browser-final,native-final,types-final,lint}.log`.

Next local integration: file/search and the remaining application consumers,
followed by normal startup/reconciliation and shutdown cutover. Production/default
startup remains v1. No commit made.

## Local file and search integration

- [x] Add a native file lookup/read/status adapter and reuse existing route injection.
- [x] Resolve the missing public SDK text-search API with user-approved bundled
      `@vscode/ripgrep@1.18.0`, external to the CLI bundle.
- [x] Wire workspace search and specialist file endpoints into the preview, retaining
      CC filesystem editing and workspace-change notifications.
- [x] Verify file/search contracts, path containment, binary content and live changes
      against the real SDK and browser; run lint fixes, typechecks and regressions.

The existing file manager already uses CC-owned filesystem operations. Normal
startup cutover and v1 dependency removal remain outside this slice.

Implemented `createEmbeddedFileService` using native filename lookup and VCS,
with existing CC file-manager reads for text/binary content. Real paths prevent
specialist read/search symlinks from escaping the directory. Git status paths are
translated from repository-relative to specialist-relative, including nested
workspaces. SDK 2.0.27 requires plugin initialization before VCS queries; a public
model-list call initializes the location first. Workspace SSE flushes response
headers immediately, allowing the browser to establish its subscription before
the first filesystem event.

Bundled ripgrep preserves regex matches and UTF-8 byte offsets without requiring
a system command. Searches are bounded to 100 matches, 1 MiB files and 10 seconds;
runtime/dependency folders and directory symlinks are excluded. Content edits are
visible immediately. Native filename indexing refreshes on a 10-second query
interval; deleted cached entries are filtered, and eventual new-file discovery
is covered by a real-SDK test. This indexing delay remains an upstream limitation.

Validation: all **3,593** repository tests pass, including **22** new native
file/text-search tests. Typechecks and targeted `eslint --fix` pass. Three new
Chromium flows pass (search-to-editor, specialist filename lookup, live workspace
events). An esbuild smoke bundle successfully invokes ripgrep through the CLI's
external dependency. The full embedded Chromium suite passes **23/23** tests.
Logs: `/tmp/cc-files-{regression,browser-full,types,lint}.log`. The updated
local preview is running on port 4175 (`/tmp/cc-v2-files-preview.log`).

Next: integrate the remaining application consumers and normal startup lifecycle
(reconciliation, health, drain/shutdown), then remove v1 dependencies and complete
fresh-workspace/packaged startup validation. No commit made.

## Normal startup cutover — completed locally

- [x] Audit normal startup and remaining route-local v1 service construction.
- [x] Add the native session-status listing required by the normal chat watchdog;
      verify busy/idle handling and cross-workspace isolation independently.
- [x] Confirm extending service injection to the remaining routes and replacing
      the orchestrator factory test seam with an embedded-runtime factory.
- [x] Compose the existing v2 chat/file/MCP adapters and provider service into
      normal startup; use shared v2 specialist/custom-tool services in internal
      routes, CC-managed MCP, public API/MCP, and workspace skills.
- [x] Reconcile active specialist configuration using v2 writers after portable
      manifests are loaded; preserve authored instructions and local tool copies.
      Do not convert old runtime history or introduce an engine selector.
- [x] Wire embedded health/reload and secret reloads; stop scheduler/monitors before
      closing the host, flush archives, and close SQLite even on startup failure.
- [x] Replace daemon-specific startup tests with fresh-workspace embedded boot,
      native configuration reconciliation, health/reload, listen-failure cleanup,
      shutdown and restart/recovery checks. Use local model/MCP fixtures.
- [x] Run the existing browser suite through normal startup, then ESLint fixes,
      typechecks, all repository tests and CLI packaging checks. Update setup docs.

Audit findings:

- `start-server-runtime.ts` still constructs the daemon, HTTP client and v1 task
  permissions; `server.ts` registers the full route inventory.
- Specialist/custom-tool factories inside `specialists`, `custom-tools`,
  `cc-managed-mcp`, `public-api`, `public-mcp`, and `workspace-skills` need the shared
  v2 service instances. Provider and MCP routes already expose injectable service
  registration, but normal route registration does not use it yet.
- The boot-time managed-MCP synchronizer renders v1 config. Its replacement must
  use the existing native writers, retain missing skill copies, and avoid rewriting
  authored AGENTS.md on every restart.
- The current shutdown handler closes HTTP before stopping task scheduling and
  groups all cleanup in one phase. Verify scheduling is stopped before SDK close,
  and that failed startup cannot leave an active SDK host or open SQLite handle.
- Existing runtime boot tests inject `createOrchestrator`; these must move to the
  new lifecycle seam. Ordinary route tests can retain lightweight injected doubles.
- Existing archive services are CC-owned filesystem code and can be reused.
- No new library or filesystem migration is currently planned. Removal of unused
  v1 packages/configuration remains the final cleanup after normal startup works.

Startup prerequisite completed: the embedded chat adapter now exposes the native
session-status list used by the watchdog. It reports active sessions as busy,
omits inactive sessions, and filters by canonical specialist directory. Three
real-SDK tests cover these cases. The chat, runtime lifecycle and watchdog suites
pass **64/64** tests; all-package typechecks, targeted ESLint fixes and diff checks
pass. Logs: `/tmp/cc-startup-{watchdog-tests,types,lint}.log`.

The user approved the broader service-injection/startup-factory refactor.

### Normal startup verification

Normal development and CLI startup now construct one embedded SDK host. The full
route inventory reuses native specialist/tool services, provider authentication,
MCP callbacks and file/search adapters. Health reports `embedded://local`, engine
restart reloads configuration/secrets, and startup reconciliation preserves
locally authored instructions and tool copies. The browser fixture now delegates
to `startServerRuntime` instead of assembling a parallel application.

Startup failure cleanup closes acquired resources in reverse order. Normal drain
stops scheduling and monitoring before HTTP/SDK shutdown; archives flush and SQLite
closes. The task watchdog uses the native active-session map. Legacy daemon startup
and its environment overrides are no longer on the normal startup path.

Verified locally on macOS arm64 / Node 24:

- **3,599** repository tests pass (backend 1,736; frontend 1,584; shared 234; CLI 45).
- **23/23** Chromium tests pass through normal startup, including chat, attachments,
  file search, filesystem events, task dispatch/recovery, tools and MCP OAuth.
- All-package typechecks, changed-file `eslint --fix`, and `git diff --check` pass.
- CLI build passes. The built CLI boots a fresh temporary workspace in production
  mode, reports embedded health, drains on SIGTERM, and successfully reopens the
  same workspace. Engine SQLite stays in `.cc/opencode-v2/`.
- A preliminary test-mode CLI smoke exposed the existing missing `pino-pretty`
  dependency in the CLI package; production-mode smoke passes. Development source
  startup has that dependency. Packaging/dependency cleanup should resolve this
  before claiming all install modes are release-ready.
- Logs: `/tmp/cc-cutover-{regression,browser,types-final,lint,build,cli-smoke}.log`.

Next slice: remove unused v1 daemon/client dependencies and obsolete configuration
knobs, finish installation/deployment documentation, and validate clean packaged
installs/native assets on the supported target platforms. No v1 history conversion,
engine selector, commit, deployment or release was performed.

## Persistent local acceptance testing

- [x] Inspect deployment supervision and current local workspace configuration.
- [x] Prepare an ignored persistent local workspace with normal provider/MCP support.
- [x] Replace the temporary preview on port 4175, verify health and owner claim flow.
- [x] Document the startup command and CC/SDK responsibility boundaries.

Use `.artifacts/v2-local/` for this acceptance environment; leave the configured
`/Users/revazgh/cc-dev/` workspace untouched. No test model or OAuth fixtures.
Systemd/launchd still supervise CC. The later cleanup pass removes the obsolete
separate OpenCode-port cleanup from the stop script.

The built CLI is running on `http://127.0.0.1:4175` with workspace
`.artifacts/v2-local/workspace` and CC data under `workspace/.cc/data`.
Health reports a healthy embedded engine and running scheduler; auth status is
`unclaimed`, ready for the operator to choose a password at `/claim`. Real provider
and MCP acceptance checks await operator credentials. Logs are in
`.artifacts/v2-local/server.log`; the ignored environment file has mode 0600.

Restart from the repository root after stopping the current instance:

```sh
node packages/cli/dist/bin.mjs start --cc-env-file /Users/revazgh/Projects/cc/.artifacts/v2-local/.env
```

The SDK owns provider authentication and inference, sessions, MCP client execution
and OAuth token handling. CC owns portable workspace configuration, specialist/tool
management, owner login, scheduling, archives, secrets injection and HTTP/UI
bridges (including the MCP OAuth callback). Terminal PTYs and text search are
CC-owned replacements; existing file-manager operations remain CC-owned. Filename
search and VCS queries still use the SDK. Embedded host lifecycle and native
custom-tool plugin/permission adapters replace the previous daemon integration.

## Migration review and cleanup

- [x] Trace startup, chat/tasks, providers, MCP/OAuth, tools/skills, files, terminal and shutdown against the embedded runtime.
- [x] Remove unreachable v1 daemon/client code and dependencies while retaining CC API contracts.
- [x] Remove obsolete daemon configuration and deployment cleanup; retain CC service supervision.
- [x] Correct built-in tool-authoring guidance and any migration flow regressions discovered.
- [x] Run changed-file ESLint with fixes, typechecks, regression tests, embedded E2E and CLI packaging checks.
- [x] Record remaining platform verification limits and review findings.

Scope is feature preservation. Native CC tools, programmatic configuration and targeted reload redesigns are deferred. Preserve the running acceptance workspace and its provider credentials.

### Findings and changes (2026-10-16)

- Normal startup injects embedded chat/events, provider auth, MCP/OAuth, specialist and custom-tool services. Reviewed task recovery, secret reload, file adapters, terminal lifecycle and shutdown wiring.
- Removed the unused daemon implementation, binary resolver, v1 HTTP client/service implementation, v1 SSE transport, best-effort daemon startup, obsolete workspace boot sync and their implementation-specific tests. Retained the CC service/event/health contracts consumed by current routes and tests.
- Removed `opencode-ai` and `@opencode-ai/sdk` dependencies, the install-script allowlist entry and completed feasibility probe scripts. Native dependencies supplied transitively by the v2 SDK remain intentional.
- Removed daemon host/port/binary/state/cache/restart knobs. Engine state is workspace-owned. Stop scripts no longer inspect or kill the old engine port; systemd/launchd still manage CC. Updated Docker files, deployment docs and architecture notes.
- Custom-tool default scaffolding and built-in authoring skills now describe native v2 plugins. A real SDK regression exercises specialist-local plugin discovery and execution.
- Secret update/delete and secret activity completion now await reload failures rather than leaving an unhandled rejected promise. Added a failed-reload route regression.
- Added the already-used `pino-pretty` runtime dependency to the CLI manifest, matching its external build entry. An attempted offline relink declined to purge the live checkout's modules; no purge was forced while the acceptance server was running.
- Isolated embedded browser tests now use port 4176; the user's authenticated real workspace on 4175 was left running.

### Remaining migration review work

- [x] Retire legacy default configuration writers in `workspace-contract.ts` and `mcp-server-service.ts`, and the provider facade fallback, with their legacy fixture assumptions. Normal startup and fallback writers now use v2 implementations, including MCP filesystem reconciliation.
- [x] Validate clean packed CLI installation on macOS arm64 and Linux arm64/x64 (x64 under emulation). Windows remains unverified; see final evidence below.
- [x] Restart the user's acceptance instance on the final rebuilt artifact; credentials and workspace retained.

Verification logs use `/tmp/cc-v2-cleanup-*`. Full regression: 3,478 tests pass
(backend 1,615; frontend 1,584; shared 234; CLI 45). The reduction from 3,599 is
from deleting obsolete v1 implementation tests, with new v2 regressions added.
Embedded browser suite: 23/23 pass. Typechecks, package lint, changed-file
`eslint --fix`, knip, shell syntax checks and diff checks pass. CLI build passes;
its fresh boot, graceful SIGTERM and workspace reopen smoke pass in a temporary
workspace on port 4186. No commit, deployed service change or real workspace reset.

Final contract-focused verification: 53/53 tests pass after replacing obsolete
runtime validation schemas with type-only CC contracts. Final CLI rebuild and
`npm pack --ignore-scripts` pass; tarball is `/tmp/commandscenter-0.28.2.tgz`.
Packing used an isolated temporary npm cache. Subsequent clean-install results
are recorded below.

## Final fallback retirement and clean-install validation

- [x] Replace remaining v1 provider facade with an injected v2 provider contract; retain route behavior coverage.
- [x] Make all specialist/MCP default writers emit v2 configuration and remove v1 rendering/validation helpers.
- [x] Update configuration fixtures and verify boot reconciliation, edits, permissions and OAuth.
- [x] Build/pack and install into an isolated directory, verifying native dependencies, startup, shutdown and reopen.
- [x] Run lint with fixes, typechecks, tests and browser regressions; record platform limits.

The existing approval for service injection applies. No user input is needed for local validation; other OS deployment checks depend on available runtimes, not credentials.

Clean installation exposed a bundled Pino worker failure (`__dirname` in ESM) in
non-production logging. The existing Pino dependency is now an external CLI
runtime package; repeated packaged production/test-mode checks pass on macOS and Linux.

### Final cleanup evidence

The v1 provider facade, workspace renderer/validator and global MCP writer are
removed. Provider routes receive the native service; specialist and MCP mutation
and boot-reconciliation defaults now emit v2 configuration. Tests retain CC file
formats (`enabled` selections) while asserting engine-native `mcp.servers`,
`disabled`, structured timeouts and ordered `permissions` rules. Native OAuth
callback coverage remains in the real SDK and browser suites.

Full regression: 3,472 tests (backend 1,609; frontend 1,584; shared 234; CLI 45).
All 23 embedded browser regressions pass. Typechecks, ESLint with fixes, package
lint, knip and diff checks pass. The obsolete provider/config implementation
checks were replaced by native service and route coverage.

Clean installation used the published-layout tarball in `/tmp/cc-v2-clean-install`
with a separate npm cache. Native SQLite queries, ripgrep execution and a real PTY
pass. The installed CLI boots, drains on SIGTERM and reopens the workspace in
both production and test mode on macOS arm64 / Node 24.21.0. The installed binary
hash matches the final build. Pino and pino-pretty stay external runtime packages.
The same native/startup checks run as the unprivileged `node` user in a disposable
Linux arm64 and emulated Linux x64 containers on Node 24.19.0. Both pass native
dependency checks and production/test-mode startup, shutdown and workspace reopen.

An upstream metadata caveat remains: `@opentui/core@0.5.17` declares Node >=26.4.0,
causing an EBADENGINE warning on Node 24 and potentially preventing engine-strict
installs. The tested headless SDK paths run on Node 24; this does not waive the
upstream requirement or establish Windows support. No dependency override was
introduced to hide the warning.

Logs: `/tmp/cc-final-{regression,browser,types2,lint-all,knip2,install-fixed,native-smoke,installed-smoke,installed-testmode,linux-fixed,linux-amd64-smoke}.log`.

## Final local acceptance build

- [x] Rebuild the CLI and frontend from the verified migration checkout.
- [x] Gracefully restart port 4175 using the existing local environment and workspace.
- [x] Verify health and static UI serving; provide prioritized manual acceptance paths.

Final acceptance build completed on 2026-10-16. Previous process drained cleanly;
the rebuilt CLI is serving port 4175 with the same environment/workspace. Health
reports healthy embedded engine and scheduler; frontend returns HTTP 200. Build
log: `/tmp/cc-acceptance-build.log`. No source changes since the verified build.

Manual acceptance priority: provider/model chat and streaming; specialist MCP/custom
tool selection and permissions; one autonomous task; file search/edit/upload and
terminal; refresh/reopen persistence. Include one real MCP OAuth connection.

## Acceptance follow-up: prompts and MCP assignment

- [x] Trace chat/task tool availability using actual configuration and execution evidence.
- [x] Audit all CC system prompt definitions through composition and SDK delivery; add regressions for gaps.
- [x] Reproduce and fix MCP modal assignment if it differs from specialist editing.
- [x] Run affected tests, eslint --fix and typechecks; report verified behavior and remaining manual checks.

Acceptance audit results (2026-10-16):

- SDK instruction-state catalogs show 35 Code Mode tools in chat and 80 in task
  runs; Playwright is present in both. The extra desktop browser namespace is
  denied by OpenCode's browser plugin by default. Task auto-approval adds a
  session allow-all rule that overrides that denial. A recorded task browser
  call fails with `browser.disconnected`, so catalog visibility does not imply
  a connected browser. No browser integration/policy redesign in this fix.
- All eight CC prompt definitions are exercised at the provider boundary, with
  customized chat prompt bodies, task run identity, and specialist AGENTS.md.
  Existing override/replacement/removal and capability gate tests pass. Five
  real session snapshots match SDK cc-system entries exactly. This verifies
  delivery, not guaranteed model compliance.
- Fixed MCP modal re-enabling a disabled server while retaining action=deny.
  Enabling now restores allow unless an ask policy exists. Existing per-tool
  rules remain intact. Added helper and modal regression coverage.
- 177 targeted tests pass (91 prompt/conversation/SDK, 81 frontend, 5 MCP prompt
  gates); eslint --fix, typechecks, final build and diff checks pass. Restarted the local
  server with the same workspace to refresh cached static routes. The served
  JavaScript matches the rebuilt asset and embedded engine health is healthy.
- Manual remaining: retry modal assignment, files, and terminal. Desktop browser
  connection remains unavailable in CC; Playwright is a separate MCP capability.

Logs: `/tmp/cc-prompt-audit-{tests,lint,types}.log`,
`/tmp/cc-mcp-modal-tests.log`, `/tmp/cc-prompt-gates-tests.log`,
`/tmp/cc-acceptance-fixes-build.log`.

## Browser acceptance: files and terminal (2026-10-16)

- [x] Open a real local terminal from the UI and verify workspace cwd.
- [x] Create/read a disposable file through the terminal; reconnect after reload.
- [x] Search by partial/exact filename and content; regex matched the expected second line.
- [x] Open search result in Monaco, edit/save, and verify saved contents via terminal.
- [x] Remove disposable file and exit terminal; UI returns to no sessions.
- [x] Confirm Ctrl+C with physical keyboard (operator confirmed 2026-10-16): automated modifier attempts did not
      interrupt `sleep 30`; commands queued until natural completion. Not marked passed.

Initial stale browser bundle produced a dynamic-import error; refresh recovered.
The first filename search missed the newly shell-created file, but later exact
and partial searches returned it. Content search returned the fixture immediately.
No source changes in this testing pass. Screenshot evidence:
`/tmp/cc-browser-search-proof.png`, `/tmp/cc-browser-terminal-proof.png`.

## Runtime decision (2026-10-16)

Keep Node 24 for the current release per operator decision. Defer the Node 26 LTS
upgrade to 2026-11-08. TickTick task created on ⚡AgileAI (CC):
`6ad21d918f08baf7cb99624e` (all day, Asia/Tbilisi).
The upgrade covers runtime declarations, Docker, CI, installers, build targets,
documentation, native rebuilds and clean-install/regression verification.
The OpenTUI engine warning/engine-strict limitation remains documented; this
scheduling decision does not establish full dependency support on Node 24.

## Close acceptance gates and prepare deployment validation

- [x] Verify Ctrl+C against a real PTY and browser input; operator physical-keyboard confirmation closes the automation gap.
- [x] Measure filename-index refresh after external file changes and fix stale-result behavior if needed.
- [x] Run relevant lint/tests and document the installer/service plus portable-workspace validation plan.

### Acceptance follow-up results (2026-10-16)

- [x] Real node-pty regression interrupts a foreground `sleep 30` with byte 0x03 and verifies the shell responds within three seconds. Backend PTY/filesystem suites: 29/29 passed.
- [x] Traced filename freshness to OpenCode's ten-second fallback-index refresh; a search after that interval starts a background refresh and initially returns the old index.
- [x] Search dialog now retries file queries every two seconds while enabled and visible. This prevents unchanged queries remaining stale indefinitely; it does not remove upstream indexing latency.
- [x] Search UI behavior tests: 14/14 passed. Targeted ESLint --fix, frontend typecheck, and production build passed.
- [x] Physical Ctrl+C confirmation: operator confirmed it interrupts immediately (2026-10-16).

### #3 — Installer, services, and portable workspace validation plan

1. Build and pack the candidate CLI. Use `CCENTER_PACKAGE_SPEC` pointing to that exact tarball so installer checks cannot accidentally install the published older release. Record version, package checksum, and Node 24 version.
2. Run installer in disposable OS environments. The installer uses fixed service names (`commandscenter` / `com.commandscenter.app`), so use a disposable host/account rather than overwriting a real installation. Verify Node provisioning, env/workspace generation, first boot, claim flow, health, and packaged native dependencies.
3. Exercise Ubuntu systemd and macOS launchd separately: start, stop, restart, process crash/recovery, logs and shutdown. Confirm only the CC service is required and no separate OpenCode daemon is launched. A plain Docker process is insufficient evidence of systemd behavior; use a systemd-capable VM/container. If unavailable, record that platform gate explicitly.
4. Test reinstall/restart of the same candidate and failure handling with a disposable workspace. Verify installation failure leaves the previous service usable; never point a pre-v2 release at the v2 workspace.
5. Create a representative portable fixture (specialist, instructions, skills, custom tool, MCP definition, task/template, documents/settings), stop it, copy its workspace to a different absolute path, and boot the candidate with the original unavailable. Verify configured assets recover and relative references work. Recreate runtime history, provider auth, secrets and scheduler state where required by the workspace contract; these are not portability guarantees.
6. Smoke-test chat/tool invocation, MCP connection, filename/content search and terminal in the relocated installation. Use local test providers/MCP fixtures where possible; real credential entry stays with the operator.
7. Record OS/runtime/package evidence and pass/fail results, remove disposable services, and list release blockers before version bump/tag/publication. No commit or publication in this step.

Evidence logs: `/tmp/cc-final-acceptance-backend.log`,
`/tmp/cc-search-refresh-tests.log`, `/tmp/cc-acceptance-types.log`,
`/tmp/cc-final-acceptance-build.log`.

Live browser follow-up: kept `cc-freshness-proof` unchanged in the search dialog,
created an empty matching file externally, and observed its filename result appear
automatically. Screenshot: `/tmp/cc-search-auto-refresh-proof.png`. Removed the
fixture and closed the disposable terminal. Rebuilt CLI is running on the existing
acceptance workspace at port 4175.

## Installer/service acceptance execution (2026-10-16)

Operator confirmed physical Ctrl+C works. Browser terminal acceptance is passed.

- [x] Pack candidate and record SHA-256/runtime versions.
- [x] Clean install exact tarball in isolated macOS npm prefix and Linux container.
- [x] Verify generated services, start/stop/restart/crash recovery and native dependencies.
- [x] Clean up test services and report before starting portability tests.

Use a test-only copy of the macOS installer with a unique launchd label and plist
path inside the acceptance artifact directory; keep runtime/install logic unchanged.
Linux uses its real fixed service name only inside the disposable container.
Do not run portability testing until reporting back to the operator.

### Installer/service results

- [x] Candidate built and packed: `.artifacts/v2-service-acceptance/commandscenter-0.28.2.tgz`.
      Version remains 0.28.2 until the separate release-version step; this is the migration candidate, not the registry release.
      SHA-256: `34db7af9bcbe4a60c30fb47348b6d0a96eb0717b1f2bd9653dcc590f54a40259`.
- [x] macOS arm64 / Node 24.21.0: clean isolated global-prefix installation, generated env/workspace, first-owner claim and session cookie, SQLite query, bundled ripgrep and real PTY passed.
- [x] Ubuntu 24.04 arm64 / Node 24.19.0: same clean installation checks passed in a disposable container with real systemd PID 1. Installer was unmodified. Container had no published ports or real workspace mount.
- [x] Both launchd and systemd: stop, start, restart, SIGKILL crash recovery, shutdown via SIGTERM fallback, remaining stopped, and manual restart passed. Engine health reports `embedded://local`; generated service runs only CC.
- [x] launchd test label unloaded; systemd test service stopped/disabled. Original app on port 4175 remained healthy.
- [x] CLI tests 45/45, installer/stop-script shell syntax checks, production build and diff whitespace checks passed. No product code changed during this pass.

Caveats and findings:

1. The shutdown script's HTTP request receives 401 because the owner-session guard blocks the secret-header-only request. Its existing SIGTERM fallback works and drains cleanly on both platforms. Record a focused auth-contract fix before treating the HTTP shutdown path as accepted; do not weaken authentication as part of testing. This behavior exists in the pre-migration route allowlist/script too.
2. The first launchd test attempted restart after the port closed but before the old process fully exited. Waiting for the PID to disappear and using explicit GUI-domain `kickstart` resolved the test-harness race. The generated installer start path itself passed.
3. Both test environments already had Node 24. Automatic Node installation/upgrade on a machine without Node was not exercised. Linux lifecycle coverage here is arm64; prior package smoke covered Linux amd64 under emulation, not systemd on amd64.
4. The previously accepted OpenTUI Node >=26.4 engine warning remains on Node 24. Default npm installation and the tested native operations passed; engine-strict is still outside that acceptance.
5. macOS installer test changed only fixed launchd label/plist location in an artifact copy to avoid installing over a real service. No repository installer modification was needed.

Logs: `/tmp/cc-service-build.log`, `/tmp/cc-service-pack.log`,
`/tmp/cc-macos-installer.log`, `/tmp/cc-macos-lifecycle.log`,
`/tmp/cc-linux-installer.log`, `/tmp/cc-linux-lifecycle.log`,
`/tmp/cc-service-cli-tests.log`. Installer logs contain disposable claim codes;
do not publish those raw logs. Test scripts and generated service definitions are
under `.artifacts/v2-service-acceptance/`.

**Stopped before portability testing, as requested.** Next step is selecting and
copying a representative workspace fixture and testing with the original path
unavailable. No workspace copy or relocation test has been performed this turn.

## Portability verification (2026-10-16)

- [x] Seed a disposable production-package workspace through CC APIs with a specialist, instructions, skill, custom tool, MCP configuration, task/template and document.
- [x] Stop the source, copy only workspace files to a different absolute path, remove disposable runtime/engine/auth state from the copy, and make the source path unavailable.
- [x] Boot with a fresh database and secret; verify portable records and specialist assignments are rebuilt from files.
- [x] Verify relocated chat/tool/MCP execution, file search and terminal paths using local fixtures without real provider credentials.
- [x] Record failures or limits, clean up processes and report results. Preserve the live workspace at port 4175.

### Portability results (2026-10-16)

**Portable configuration acceptance passed on macOS relocation and macOS → Linux
arm64. Full task-state portability did not pass when SQLite was deliberately omitted.**

Method:

- Used the exact candidate from installer acceptance, with a disposable source seeded through real authenticated CC APIs. No live workspace files or credentials were copied.
- Stopped the source; copied its workspace; removed destination `.cc` engine/cache state and `auth`; booted with fresh external SQLite data, a new secret and a fresh owner claim. The original source pathname no longer existed.
- Repeated with that macOS-created source fixture copied into a Linux container with no host directory mounts. Only the mock provider endpoint was updated to the new local fixture server; no portable specialist/tool/MCP definitions were repaired.

Passed in both environments:

- Specialist ID, role, custom instructions and workspace path recovery.
- Skill/custom-tool assignments and enabled MCP selection.
- Global custom tool and skill files, MCP configuration and task-template recovery.
- Custom session-archive setting (77-minute materialization interval).
- Document content and filename/content search.
- Real terminal WebSocket command verified `pwd` resolves to the relocated workspace.
- Chat with a local model fixture, namespaced custom-tool invocation returning `PORTABLE_TOOL_OK`, and stdio MCP invocation returning `PORTABLE_MCP_OK`.
- Captured model request includes specialist system instructions.
- Fresh owner claim and clean server shutdown. Destination engine configuration contained no old source-path references in the macOS check.

Observed limitation:

- A standalone task created via `/api/tasks` was present in source SQLite (one matching row) and absent from the fresh destination SQLite (zero matching rows). Templates survived via `configuration/task-templates/*.json`.
- Current standalone task creation writes to SQLite only. This is pre-existing storage behavior, not evidence of a v2 execution regression. A workspace-only move with a fresh database does not preserve the standalone task board. Preserve/recreate runtime task state separately, or scope a file-backed task configuration change if that must become a portability guarantee. Do not silently claim complete task portability.
- Real provider credentials, OAuth tokens and secrets were intentionally not transferred; re-entry/re-authentication remains outside portable configuration guarantees. Provider execution used a local fixture, not a paid/external provider.
- This pass used arm64 macOS and arm64 Linux; it does not add Windows acceptance.

Evidence: `/tmp/cc-portability-run3.log`, `/tmp/cc-portability-linux.log`,
`.artifacts/v2-portability/verify.mjs`, `.artifacts/v2-portability/verify-linux.mjs`,
`.artifacts/v2-portability/run3/{seed,recovered}.json`,
`.artifacts/v2-portability/linux-recovered.json`. Earlier run failures were harness
assertions: standalone task recovery expectation and missing `cc_custom_` tool
namespace; both are explicitly resolved or recorded above. No product code was
changed during verification.

Final checks: existing specialist-file, MCP service and workspace reconciler suites
passed 55/55 (`/tmp/cc-portability-regressions.log`); `git diff --check` passed.
All fixture servers stopped; Linux test container removed; live app on 4175
remained healthy. Product source was unchanged, so no source lint fixes were needed.

## Shutdown secret authentication fix

- [x] Reproduce shutdown 401 with the owner guard enabled in production mode.
- [x] Allow only POST /api/system/shutdown with the exact runtime secret to bypass browser-session/CSRF authentication; retain route-level secret validation and normal protection for every other endpoint.
- [x] Verify valid/missing/incorrect keys and adjacent endpoint protection; run ESLint --fix, targeted tests, typecheck and build.
- [x] Run the actual stop script against an isolated production instance and confirm HTTP 202 with no SIGTERM fallback. Leave the live workspace alone.

Shutdown fix result: production owner-guard regression failed with 401 before the
change and passes after it. Guard exception is limited to the exact POST path
and matching shutdown secret; route-level secret validation remains intact.
Missing/incorrect keys, a different method and use of the key on another protected
endpoint remain rejected. Targeted suites passed 28/28; ESLint --fix, backend
typecheck, CLI build and diff checks passed. Actual stop script on a disposable
claimed production workspace received HTTP acceptance and the server exited 0
without SIGTERM fallback. Logs: `/tmp/cc-shutdown-{before,tests,types,build,smoke}.log`.
Live instance on port 4175 was not restarted; it will load the fix on its next
restart. The earlier HTTP shutdown limitation is resolved in the new build.

## v1.0.0 release preparation

- [x] Set the published CLI package version to 1.0.0 and write operator-facing breaking-change release notes.
- [x] Run ESLint --fix, release gate, all package tests and embedded E2E; resolve failures within migration scope.
- [x] Build/pack v1.0.0 and verify package version/content plus shutdown smoke.
- [x] Record results and pending approval for commit/tag/publication. Do not commit, tag, push or publish.

Operator confirmed standalone tasks are explicitly outside portability scope.

### Release preparation results

- CLI package version is 1.0.0. Release notes: `docs/release-notes/v1.0.0.md`.
- `pnpm release:check` passed (Node consistency, design-system audit, typechecks,
  lint, knip, CLI tests and production build). Required ESLint --fix completed.
- All package tests passed: backend 1,623; frontend 1,587; shared 234; CLI 45
  (3,489 total). Repository formatting and diff checks passed.
- Candidate: `.artifacts/v1-release/commandscenter-1.0.0.tgz`, 424 entries.
  SHA-256: `0a5fb3409b8897d45dbb2107d3813c540c8293a1259b03cb1b62834cff6331a4`.
  Package metadata and CLI report 1.0.0; frontend assets present; no runtime .env
  files included. Real stop-script smoke on the new build passes without fallback.
- npm returned E404 for commandscenter@1.0.0 at preparation time; no local v1.0.0
  tag exists. Recheck before publication to avoid a race.
- **Publication blocked:** production dependency audit reports 1 critical and
  14 high advisories (66 total across severities). Findings and remediation plan:
  `plans/v1-release-security-audit.md`. No audit ignores were added. The existing
  release:check command does not include this audit, so a green gate alone does
  not resolve these findings. Candidate is for review, not approved publication.
- No commit, tag, push or npm publication performed. Dependency remediation must
  be followed by fresh acceptance/build/packing before publication.

Logs: `/tmp/cc-v1-{eslint,release-check,all-tests,embedded-e2e,format-final,audit,pack,shutdown-smoke}.log`.

Embedded browser acceptance also passed 23/23 (2.4 minutes). Security audit remediation remains the only new publication blocker found in this preparation pass.

### Security remediation follow-up (2026-10-17)

Compatible dependency fixes are applied and verified by the release gate and
all package tests. Workspace audit now reports 0 critical / 1 high; actual npm
installation reports 0 critical / 2 high. The difference is OpenCode's pinned
MCP client: the workspace override does not propagate to published npm users.
A shrinkwrap approach failed actual local/global installation verification and
was removed. Publication remains blocked on this MCP packaging issue plus the
unpatched braces decision. See `plans/v1-release-security-audit.md` for evidence
and next steps. Native dependency and installed startup/reopen smoke passed.
The prior tarball hash above is superseded by the diagnostic candidate hash in
the security plan. No commit, tag, push or publication occurred.

Final embedded browser rerun passed 23/23 after builds completed. Formatting,
ESLint --fix and diff checks passed. The two installed-package high advisories
remain the release blockers.
