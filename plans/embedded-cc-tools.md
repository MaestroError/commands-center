# CC tools through the embedded OpenCode SDK

## Delivery and intent

Implement the tools update on `codex/embedded-cc-tools`, branched from
`codex/workspace-gitignore`, with a separate PR targeting `codex/workspace-gitignore`
for independent review. The combined work will ship through PR #212; the direct-tool
replacement and final gitignore default must ship together. This document is a proposed plan,
not a claim that the transport replacement is implemented. Keep the current
credential exclusions active until the replacement passes acceptance.

Replace the internal specialist-to-CC MCP round trip with in-process SDK tools.
Preserve current product features, tool names, permissions and portable settings.
External MCP integrations, their OAuth flows, and the public MCP API remain in
scope for regression checks, not replacement.

## Evidence from the current code

- The installed SDK exposes plugin `tool.transform` / `editor.add`, and tool
  execution context includes session, message and call IDs plus cancellation.
  `embedded-host.ts` already installs an in-process plugin; custom tools already
  use this registration API.
- `server-registry.ts` contains reusable definitions and handlers. Its current
  execution context contains only agentSlug, and tool chat/task metadata is
  advisory in `tool-access-service.ts`.
- Conversations and task runs persist their OpenCode session IDs. These are the
  basis for trusted caller attribution, not model-provided IDs or a lookup for
  whichever run happens to be active for a specialist.
- `workspace-entry-service.ts` issues literal internal MCP bearer tokens;
  `embedded-workspace-config.ts` serializes them to specialist opencode.jsonc.
  Root config can also contain third-party MCP headers or OAuth client settings.
- SDK tool transforms are location-scoped. Per-session catalog filtering has not
  yet been verified and must not be promised merely because execution context
  includes a session ID.

## Phase 1: Direct SDK tools and deterministic context

### Shared tool definitions and direct execution

Reuse the current definition registry and business handlers through a small
SDK adapter. Separate transport-specific input/result conversion from business
logic only where necessary. Preserve stable group/tool IDs such as
`cc_default_*` and `cc_tasks_management_*`, schemas, structured results and
substantive companion system instructions. Remove only the obsolete context
workarounds described below. Do not move CC business logic into generated plugin files.

Inject the adapter's dependencies through runtime setup, accounting for the
current startup order (SDK host starts before all CC services exist). Register
once per SDK location, dispose subscriptions on reload/shutdown, and prevent
calls until dependencies and caller mappings are ready.

### Tool groups in the UI

Keep the current logical groups, group names/IDs, specialist group toggles and
per-tool controls. Decouple grouping from MCP transport: internal SDK tools must
remain grouped in the UI as they are today, rather than becoming a flat list or
requiring an MCP server to represent each group. Preserve portable group settings
and distinguish internal CC tool groups from external MCP integrations.

### Trusted caller context

Resolve a discriminated chat/task context from SDK session ID, canonical
workspace directory and persisted CC ownership. Include specialist ID/slug,
conversation ID or task/run ID, message/call IDs and AbortSignal. Resolve child
sessions through their parent chain to the owning CC session. Reject unknown,
ambiguous, cross-specialist or no-longer-authorized sessions.

Persist task session attribution before starting a prompt. Cover restored chats,
resumed tasks, retries and simultaneous chat/task activity for one specialist.
Do not accept caller identity from tool arguments, and do not fall back to the
specialist's latest conversation or currently running task.

Update handlers that infer caller context to consume this trusted context.
Task outcomes and artifacts must target the calling run; chat review tools must
route to the calling conversation. Inventory and preserve every tool's existing
`context` value exactly: `chat`, `task_run` or `both`. Turn those existing labels
into enforced availability rules; do not reclassify tools during this migration.

### Access control and parity

Preserve specialist group toggles and per-tool allow/ask/deny, task permission
snapshots/overrides, and existing explicit-deny precedence. Enforce at execution
as well as catalog selection. Tool arguments cannot broaden access. Group
membership alone must not bypass approval requests.

Require session-specific tool availability: `task_run` tools must be absent from
chat catalogs, `chat` tools must be absent from task catalogs, and `both` tools
are eligible in both, subject to permissions. Enforce the same context rules at
execution to reject forged or stale calls; execution rejection alone does not
satisfy the catalog requirement.

Prove this behavior with the pinned SDK before implementing the replacement.
This is a feasibility and acceptance gate. Do not fall back to a shared catalog
with context caveats in descriptions, change existing context values, or reload
a shared catalog per prompt (which would race between chat and tasks). If safe
session-specific filtering is unavailable, report the blocker and discuss a
concrete alternative before proceeding with dependent implementation.

Preserve cancellation, timeouts, review forms, progress/notifications, secret
requests, artifact links, tool errors and structured results. Public/external MCP
clients retain a transport adapter if they legitimately consume the same handlers;
transport authentication must never manufacture a trusted chat/task session.

### Remove advisory context workarounds

Inventory global instructions, group companion prompts and tool descriptions
that compensate for MCP's inability to identify the caller deterministically.
Remove instructions asking the model to infer whether it is in chat or a task,
avoid tools belonging to the other context, or supply caller identity that CC
can now resolve from the session. Availability and trusted caller routing must
enforce those rules without relying on model compliance.

Preserve substantive tool usage instructions, business rules, permissions,
operator review requirements and unrelated prompts. Update prompt/description
tests to verify obsolete workarounds are absent and retained instructions still
reach the appropriate sessions. Do not change existing tool context values as
part of this cleanup.

### Remove internal MCP configuration and credentials

Inventory every CC-managed route/token consumer before deleting code. Stop
issuing internal specialist MCP credentials and stop generating local CC MCP
URLs/headers in opencode.jsonc. Remove obsolete internal transports, keepalives
and auth wiring once all internal groups use SDK tools.

Clean only known CC-generated entries from active and archived specialist configs
and any generated root entries; preserve external MCPs and unrelated manual
settings. Revoke obsolete internal credentials after confirming no retained
consumer uses them. Use the filesystem migration skill if a durable configuration
migration is needed. This cleanup is separate from .gitignore: never migrate or
rewrite an existing workspace .gitignore.

### Final .gitignore default and documentation

Once internal token generation and leftover generated credentials are addressed,
replace the two active rules in the default template with:

```gitignore
# uncomment it if you use credentials in opencode.jsonc
# /opencode.jsonc
# /specialists/**/opencode.jsonc
```

Explain that external MCP headers, OAuth client secrets and hand-written values
can still contain credentials: direct tools do not automatically sanitize those
settings. Environment-variable references can keep secret values out of config,
but users must review their own files. The disabled rules are an intentional
operator choice, not a guarantee that every config is credential-free.

Update real Git tests to verify both config locations (including archived
specialists) are trackable by default and ignored when these lines are enabled.
Retain local .opencode skills/tools, generated-wrapper exclusions, the independent
application search behavior, and the documented tracked-files/history limitation.
Only newly created workspace directories receive this new default.

### Phase 1 implementation checklist

- [x] Create `codex/embedded-cc-tools` from `codex/workspace-gitignore`; use the
      latter as the tools PR base.
- [x] Add a deterministic SDK probe for concurrent session catalogs, native tool
      caller IDs and rejected calls before wiring production handlers.
- [x] Inventory all internal tool groups, handlers, existing context values,
      advisory context instructions, credentials and public consumers.
- [x] Prove direct tool execution, context IDs, result conversion and permission
      handling with the installed SDK; prove strict session-catalog separation
      as a prerequisite, including concurrent chat/task sessions.
- [x] Add trusted session-to-caller resolution with concurrency/restart tests.
- [x] Adapt the shared registry and handlers; preserve tool names, schemas and
      every existing context value.
- [x] Preserve UI groups and specialist group/per-tool controls independently of MCP.
- [x] Wire direct tools into SDK lifecycle and enforce context/permission policy.
- [x] Remove obsolete context workarounds from global/group instructions and tool
      descriptions; verify substantive instructions remain active.
- [x] Verify all internal groups, review flows, task results and artifact routing.
- [x] Remove internal MCP token generation/transport and clean generated entries
      without damaging third-party MCP configuration or public API behavior.
- [x] Change opencode.jsonc rules to the commented defaults above; update docs/tests.
- [x] Run lint, typechecks, package tests and built-app E2E; document limits.
- [ ] Update PR #212 scope/description, request review and ship as one change.

### Phase 1 progress (2026-10-19)

Implementation is complete on `codex/embedded-cc-tools`, based on
`codex/workspace-gitignore`. The registry is wired into runtime startup and SDK
location reloads. CC tool names, context values and grouped specialist controls
are preserved. Per-session catalogs and execution checks enforce chat/task
separation, specialist rules and task permission snapshots; autonomous inherited
ask remains allow, while explicit deny wins.

Caller identity comes from persisted chat/run ownership, including parent
sessions. Artifact routing, review forms and task outcomes use that trusted
identity. Cancellation reaches pending reviews and tool waits. Native registration
includes input/output schemas and converts existing structured results/errors.
The registry/handler reuse refactor was explicitly approved by the operator.

Production no longer registers internal MCP routes or creates their credentials.
The old transport exists only in test fixtures to retain handler regression
coverage. Migration 0012 removes generated internal server entries and signing
state, preserves external/manual configuration, supports restart and rollback,
and never changes existing `.gitignore` files. New-workspace defaults leave
`opencode.jsonc` tracked with the requested optional credential exclusion.
Obsolete tool context advice is removed; substantive global instructions remain.
Public MCP and third-party MCP retain their existing paths.

Validation includes the complete backend suite (160 files / 1,737 tests), plus
36 native adapter/SDK tests after final result-schema and import corrections;
frontend (1,598), shared (234) and CLI (45) tests, ESLint with fixes, typechecks, design-system audit
and the production CLI build. Browser acceptance also exposed repeated whole-host
reloads during MCP assignment changes; the embedded batch now writes all affected
specialists before the existing final reload. All 51 focused MCP regression tests
pass after that correction. All 28 built-app browser acceptance tests pass in
1.8 minutes, including the formerly timing-out MCP rename (4.9 seconds).
SDK tests cover concurrent catalogs, denied calls, structured results, child
session ownership and chat approval. Browser acceptance uses a deterministic
local provider with the real SDK; it is not a new live-provider OAuth audit.

PR creation/review and the combined PR #212 delivery
remain separate delivery steps. Phases 2 and 3 have not been implemented.

## Phase 2: Task and template overrides for CC tools

Build on Phase 1's session-scoped catalogs and trusted caller context. Let the
operator override the specialist's default CC-tool permissions for an individual
task or task template, using the existing JSON permission matrix and its semantics
instead of introducing a second permission system. This phase covers only
CC-provided tools. Phase 3 extends the controls to third-party MCP tools. Custom
script tools remain outside these phases; do not change their current behavior.

### Create and edit UI

Add a **Change available tools** toggle to task and task-template create/edit
pages. Off means inherit the specialist's CC-tool defaults. On reveals the same
grouped, granular tool-selection and permission components used by specialist
create/edit pages, limited to CC-provided tools. Initialize a new override from
the selected specialist's defaults so the operator can adjust them. Turning the
toggle off removes the override from the saved configuration and restores
inheritance. Show task-eligible CC tools from every group, including groups or
tools disabled in specialist defaults. Grouping organizes the controls; a
specialist group default must not prevent an explicit task-level tool grant.

Reuse existing components and permission serialization. Inspect them before
implementation; if extracting reusable components requires refactoring, describe
the narrow refactor and obtain confirmation under the repository reuse rule.
Follow the CC design system. Chat-only tools must not be selectable for task use;
preserve every tool's existing context value.

### Resolution, persistence and session isolation

An enabled override is the task's explicit CC-tool permission matrix, replacing
the specialist defaults for that scope rather than merely intersecting with them.
The operator can therefore enable a CC tool disabled in specialist defaults for
one task, or restrict a tool normally enabled. Task and template controls offer
**allow/deny only** for CC-provided tools: autonomous runs must not ask the operator
for tool permission. Specialist defaults retain allow/ask/deny. Resolve inherited
`ask` to `allow` for autonomous runs, preserving the existing automatic approval
behavior, and display that mapping in the editor. An explicit task-level `deny`
still takes precedence. Apply the same normalization to legacy task profiles at run resolution;
new task/template overrides reject `ask` at API/MCP boundaries.

Build a complete effective task matrix so inherited group denies do not override
explicit task tool grants; disabled tools remain denied regardless of a broad
auto-approve policy. Context restrictions remain mandatory and cannot be overridden.
This permission policy does not remove intentional business tools that create
review requests or mark a task as needing human review.

Templates store the optional override in their portable `task.json` settings.
Generating a task copies the override into the task snapshot; later template
edits do not alter existing tasks. A task can edit or remove its own copied
override independently. With no override, resolve specialist defaults when a run
starts. Snapshot the effective permissions for each run so edits affect future
runs, not an already-running session; resumed runs retain their snapshot.

Apply the effective matrix only to that task run's session and its authorized
child sessions, both when exposing tools and executing calls. Do not mutate the
specialist configuration, another task's permissions, chat catalogs, or a shared
SDK location catalog. Preserve the unrelated third-party MCP/custom-tool parts
of existing permission profiles when reading or saving the CC-only override.

Inspect existing task permission snapshots, template settings, schemas and MCP
create/edit tools before extending them. Reuse their persistence and validation
paths, preserve portable template recovery from workspace files, and keep task
runtime snapshots consistent with the existing workspace portability contract.
Update API/MCP contracts and tool descriptions for the optional override so UI
and agent-created tasks/templates follow the same rules. Any needed database or
filesystem migration must follow the respective repository migration guidance.

### Phase 2 implementation checklist

- [x] Map the current JSON permission matrix, task snapshots, template settings
      and specialist editor components; settle the minimal schema/UI changes.
- [x] Add optional CC-tool overrides to shared schemas and existing persistence
      paths, including portable task-template settings and task generation.
- [x] Implement effective-matrix resolution and immutable run snapshots; enforce
      them through Phase 1's catalog and execution checks.
- [x] Add the toggle and reused grouped controls to task/template create/edit
      pages, including save/reopen and restore-inheritance behavior.
- [x] Update task/template API and MCP tools and relevant documentation.
- [x] Run ESLint with fixes, typechecks, relevant unit/integration tests, built-app
      E2E and the design-system audit for the UI changes.

### Phase 2 implementation decisions (2026-10-19)

- Reuse `permissionProfile.appToolPermissions` as an explicit CC-tool matrix;
  absence inherits defaults, an empty array denies all CC tools. Unlisted tools
  in an explicit matrix are denied. Task-specific grants override specialist group
  defaults; chat-only tools remain unavailable.
- Keep stored/runtime schemas tolerant of legacy ask values, but reject ask in
  CC-tool fields of new task/template create/update inputs. Other permission
  fields retain their existing contracts.
- Resolve every known CC tool at run start and store exact allow/deny rules in the
  existing effective-permission snapshot. No database or filesystem migration is
  needed; existing template file persistence already includes permissionProfile.
- Task editors preserve unrelated profile fields when enabling/removing the CC
  override. The operator approved extracting the existing specialist controls for reuse in
  task and template editors.
- No new files are written inside user workspaces, so .gitignore defaults do not
  change in this phase.

### Phase 2 progress

Implementation and feature acceptance are complete. The
operator approved extracting `CcToolGroups` from the specialist form. Task and
template create/edit pages reuse it in task mode through `TaskToolPermissions`,
show all task-eligible tools from the complete CC catalog (including system-managed
groups), and offer allow/deny only. Toggle removal preserves unrelated permissions.

Backend validation and the advertised API/tool JSON schemas both restrict new CC
overrides to allow/deny. Stored legacy ask values remain readable and normalize to
allow. Full per-run matrices deny newly registered tools absent from the snapshot.
Existing persistence handles portable template recovery and task copying without
a migration. README and schema descriptions document the contract.

Validation so far: 1,747 backend tests, 248 shared tests, 1,603 frontend tests plus
the added complete-catalog component regression (6 controls tests), typechecks,
ESLint with fixes, design-system audit, and production CLI build pass. All 33 built-app acceptance tests pass, including five new browser tests for all
four create/edit flows and executing a grant from a specialist-disabled group.
The broader design browser suite had intermittent failures in unchanged shell
focus and folder-dialog dismissal tests (55/56 on each full run, different failed
tests); both passed in isolated reruns. No unrelated design-system code was changed.

The database enforces one active task per specialist. Isolation acceptance uses
successive tasks with different snapshots alongside a concurrent chat rather than
relaxing that constraint; different specialists can still run concurrently.

Phases 1–2 are complete on `codex/embedded-cc-tools`. Phase 3 is next.

### Phase 2 acceptance criteria

- All four create/edit flows expose **Change available tools**, save granular
  CC-tool settings and restore specialist inheritance when switched off.
- An override can both enable and restrict CC tools relative to specialist
  defaults across every CC group, while existing context restrictions remain enforced.
- Task/template tool permissions accept only allow/deny. Inherited or legacy `ask`
  resolves to allow unless explicitly denied by the task; no CC-tool permission
  approval prompt occurs in autonomous runs. Specialist chat still asks.
- Template generation copies the override; task edits do not change its template,
  and subsequent template edits do not change previously generated tasks.
- Runs without overrides snapshot current specialist defaults; existing runs and
  resumed sessions retain their original effective permissions after edits.
- Concurrent tasks with different overrides and a chat for the same specialist
  each expose and execute only their own permitted tools, including child sessions.
- Portable template export/recovery preserves overrides without relying on SQLite.
- Third-party MCP/custom-script settings and specialist defaults remain unchanged
  by saving or removing a CC-tool override.

## Third-party MCP feasibility assessment

Source inspection of installed SDK 2.0.27 and the current CC adapters establishes
the following; this is an assessment, not an expansion of Phase 2's implementation
scope or a completed concurrency acceptance test.

- **Tool discovery is available today.** The plugin `context.tool.list()` exposes
  registered tool IDs, descriptions, schemas and namespace options. CC already
  bridges this through `embedded-host.ts` and `embedded-mcp-service.ts`:
  `listMcpToolIds()` associates registered tools with connected MCP servers, and
  `mcp-server-service.ts` includes those tool IDs in server responses. The bridge
  currently returns less metadata than the SDK supplies. Disconnected, unauthenticated
  or failed servers do not provide a reliable live catalog; distinguish unavailable
  discovery from a successfully discovered empty tool list.
- **Per-tool session permissions are supported in the engine.** SDK session
  context combines agent defaults with session permissions. Tool snapshots omit
  tools whose effective permission is a whole-tool deny (`resource: "*"`),
  including the Code Mode inventory. MCP execution separately asserts permission
  using the calling session ID. Session rules follow agent rules, with the last
  matching rule winning. CC must construct an explicit effective matrix and
  preserve its own disabled-server precedence, rather than rely on incidental
  rule order or a broad auto-approve rule.
- **Connections remain independent of permissions.** A session allow rule cannot
  register tools from a disconnected server. Connection/disconnection is
  location-scoped. This plan deliberately excludes task-level server activation
  or deactivation; Phase 3 only controls tools already available through connected
  servers in the selected specialist's execution location.

Existing MCP integration tests passed (29 tests across MCP tools, MCP service and
task permission service). They do not yet prove the new per-task isolation flows;
Phase 3 must test advertised catalogs and execution with concurrent sessions.

## Phase 3: Third-party MCP tool permissions

### Specialist defaults and task overrides

On specialist create/edit pages, show third-party MCP servers as groups containing
their discovered tools, with **allow/ask/deny per tool** for specialist defaults.
Reuse the grouped permissions UI and existing JSON matrix. These are tool
permission controls, not new server connect/disconnect or server-wide permission
controls. Existing MCP connection management remains in its existing flow.

Extend **Change available tools** on task/template create/edit pages with the same
server-grouped list, offering **allow/deny only** per MCP tool. Only tools from
servers connected in the selected specialist's execution location are editable;
a connection in the global workspace alone is not sufficient. Do not offer task
controls to connect an unconnected server or disconnect a connected server.
A task may allow a discovered tool denied by specialist defaults, or deny an
allowed tool, without altering the specialist or MCP connection. Denying all
listed tools does not disconnect the server.

Use Phase 2's override inheritance, template-to-task copying, portable template
settings and immutable run snapshots. Normalize inherited/legacy `ask` to `allow`
for autonomous runs, matching existing automatic approval behavior; explicit task
denies still take precedence. Reject
`ask` in new task/template overrides. Specialist chat retains normal ask behavior.
Keep CC and MCP override settings distinct when saving either section so edits do
not erase the other section or unrelated custom-script settings.

### Discovery and enforcement

Use the SDK registry and canonical server/tool identifiers to populate the list.
Retain names and descriptions and handle unavailable discovery separately from
an empty catalog. Preserve saved rules when a server becomes unavailable; show
those entries as unavailable instead of dropping permissions or reconnecting it.
Refresh discovery when connections/catalogs change. Validate editable selections
against the connected catalog at save time, without preventing existing unavailable
rules from being preserved or removed.

Enforce the resolved per-tool matrix both in the session catalog and at execution.
Neither connection changes nor a broad task auto-approve policy may bypass it.
Tools newly discovered after a run snapshot must not automatically gain access
in that run; resolve them for future runs under the applicable defaults/override.
Verify namespace normalization and collisions so one server's rule cannot apply
accidentally to another server. A saved permission never guarantees availability:
if a server disconnects, report unavailable tools without silently reconnecting.

### Phase 3 implementation checklist

- [ ] Extend connected MCP tool discovery metadata and grouped specialist controls
      with per-tool allow/ask/deny; persist through existing portable settings.
- [ ] Extend task/template tool controls and schemas with connected MCP tool
      allow/deny overrides, preserving the separate CC-tool settings.
- [ ] Reuse Phase 2 run resolution/snapshots and enforce MCP catalog/execution
      permissions without any task-triggered connection changes.
- [ ] Handle unavailable and changed catalogs without losing saved rules or
      granting newly discovered tools to an existing run.
- [ ] Update API/MCP contracts, descriptions and documentation for both scopes.
- [ ] Test specialist and all task/template create/edit flows, persistence and
      portable recovery; run ESLint with fixes, typechecks, relevant tests,
      built-app E2E and the design-system audit.

### Phase 3 acceptance criteria

- Specialist create/edit pages display discovered MCP tools grouped by server and
  save allow/ask/deny defaults; specialist chat still requests approval for ask.
- Task/template pages expose only allow/deny for connected MCP tools and never
  connect or disconnect servers when overrides are created, edited or executed.
- Per-task allow can override a specialist tool deny for an already connected MCP;
  denied tools are absent from catalogs and cannot execute through alternate paths.
- Concurrent chat/tasks, child sessions and resumed runs respect their own
  snapshots without permission leakage; autonomous runs never ask for MCP-tool
  permission. Inherited/legacy ask is automatically allowed unless the task
  explicitly denies the tool; specialist chat still asks.
- Disconnection, reconnection and catalog updates preserve saved settings, expose
  availability accurately and cannot expand an existing run's allowed tool set.
- Template recovery and task generation preserve MCP overrides; editing them does
  not change CC-tool overrides, specialist defaults or custom-script permissions.

## Boundaries

No SDK upgrade or new dependency is assumed. No blanket promise that every engine
restart disappears. No general redesign of third-party provider/MCP auth or public
MCP. Removing an ignored generated config does not remove existing local files,
but Git-only copies omit ignored hand-written settings; the final commented
rules explicitly allow operators to version those settings after review.
