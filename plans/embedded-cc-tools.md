# CC tools through the embedded OpenCode SDK

## Delivery and intent

Extend PR #212 on `codex/workspace-gitignore`; the direct-tool replacement and
final gitignore default must ship together. This document is a proposed plan,
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

## Proposed design

### Shared tool definitions and direct execution

Reuse the current definition registry and business handlers through a small
SDK adapter. Separate transport-specific input/result conversion from business
logic only where necessary. Preserve stable group/tool IDs such as
`cc_default_*` and `cc_tasks_management_*`, schemas, structured results and
companion system prompts. Do not move CC business logic into generated plugin files.

Inject the adapter's dependencies through runtime setup, accounting for the
current startup order (SDK host starts before all CC services exist). Register
once per SDK location, dispose subscriptions on reload/shutdown, and prevent
calls until dependencies and caller mappings are ready.

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
route to the calling conversation. Audit each tool's existing context metadata
before turning advisory labels into access gates, so inaccurate labels do not
silently remove legitimate features.

### Access control and parity

Preserve specialist group toggles and per-tool allow/ask/deny, task permission
snapshots/overrides, and existing explicit-deny precedence. Enforce at execution
as well as catalog selection. Tool arguments cannot broaden access. Group
membership alone must not bypass approval requests.

Prove whether the pinned SDK supports session-specific tool availability. If
available, show only applicable tools per session; otherwise expose the permitted
workspace catalog with accurate context descriptions and enforce context checks
at execution. Avoid reloading a shared catalog on every prompt, which would race
between chat and tasks. Document any catalog limitation before implementation.

Preserve cancellation, timeouts, review forms, progress/notifications, secret
requests, artifact links, tool errors and structured results. Public/external MCP
clients retain a transport adapter if they legitimately consume the same handlers;
transport authentication must never manufacture a trusted chat/task session.

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

## Implementation checklist

- [ ] Inventory all internal tool groups, handlers, credentials and public consumers.
- [ ] Prove direct tool execution, context IDs, result conversion and permission
      handling with the installed SDK; resolve session-catalog feasibility.
- [ ] Add trusted session-to-caller resolution with concurrency/restart tests.
- [ ] Adapt the shared registry and handlers; preserve tool names and schemas.
- [ ] Wire direct tools into SDK lifecycle and enforce context/permission policy.
- [ ] Verify all internal groups, review flows, task results and artifact routing.
- [ ] Remove internal MCP token generation/transport and clean generated entries
      without damaging third-party MCP configuration or public API behavior.
- [ ] Change opencode.jsonc rules to the commented defaults above; update docs/tests.
- [ ] Run lint, typechecks, package tests and built-app E2E; document limits.
- [ ] Update PR #212 scope/description, request review and ship as one change.

## Acceptance criteria

- A specialist can chat while running a task; each tool call reaches exactly the
  correct conversation/run, including child sessions and task retries.
- Disabled groups, denied tools, incorrect contexts and spoofed IDs cannot execute;
  ask permissions and operator review flows still behave correctly.
- Task outcomes cannot mutate another task/run; chat cannot impersonate a task.
- Reload, cancellation and restart leave no duplicate tools or stale caller state.
- Internal tools work without internal MCP HTTP connections or bearer tokens.
- Fresh and upgraded active/archived generated configs contain no internal MCP
  tokens; external MCP auth/config and public MCP clients still work.
- Git defaults preserve portable config and local tools/skills, optional credential
  exclusions work, and existing .gitignore files are byte-for-byte untouched.
- Global/specialist text search still finds Git-ignored documents and playgrounds.

## Boundaries

No SDK upgrade or new dependency is assumed. No blanket promise that every engine
restart disappears. No general redesign of third-party provider/MCP auth or public
MCP. Removing an ignored generated config does not remove existing local files,
but Git-only copies omit ignored hand-written settings; the final commented
rules explicitly allow operators to version those settings after review.
