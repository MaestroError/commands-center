# Composio disabled-first activation with explicit restart consent

## Problem

The Composio connect dialog currently creates an enabled MCP server. A pasted API
key is encrypted into the secret store and the generated MCP header becomes an
`{env:...}` reference, but the already-running OpenCode process cannot see the
new value until it restarts. CC immediately attempts the connection anyway, so
the first status commonly becomes `401`.

Restarting automatically while saving the key would fix the credential loading
race, but it could interrupt active specialist sessions and task runs without the
operator's informed consent.

## Confirmed product decisions

- Keep Composio For You as the supported product. The key from **Composio For
  You → Settings → Sessions & API Keys** works with the existing
  `https://connect.composio.dev/mcp` endpoint and `x-consumer-api-key` header.
- Saving a Composio key creates the MCP server **disabled** and does not restart
  OpenCode.
- Activating Composio restarts OpenCode only when a referenced secret value has
  actually changed since the current engine process started.
- A required restart must be confirmed in a dialog that explains the
  consequences and reports currently running task runs. The operator may cancel;
  Composio remains disabled and the same Activate action can be used later.
- If the operator restarted the AI engine elsewhere after saving the key,
  activation no longer asks for another restart.

## Design

### Secret-change detection

1. Add a secret-service write operation that returns whether the plaintext value
   actually changed.
   - Compare against the decrypted current value inside `SecretService`; never
     expose plaintext outside the service.
   - When the value is unchanged, do not re-encrypt it and do not advance
     `updated_at`.
   - New values and changed values retain the current encrypted-at-rest behavior
     and advance `updated_at`.
2. Add a secret-service query for the newest `updated_at` among a bounded list of
   referenced secret keys.
3. Derive `requiresEngineRestart` for an MCP server at runtime:
   - `true` when a set referenced secret changed after the current OpenCode
     engine `startedAt`;
   - `false` when every referenced secret was already present when that engine
     started;
   - missing secrets remain governed by the existing `missingSecrets` state.
4. Expose `requiresEngineRestart` on `McpServer` as runtime metadata. Do not
   persist a second pending flag: the secret timestamp plus engine start time is
   the source of truth and naturally clears after any successful engine restart.

This comparison is runtime state, not portable configuration. The disabled MCP
definition and its secret-key reference remain portable in
`configuration/mcp.json`; secret values still have to be re-entered on a fresh
machine under the existing workspace contract.

### Disabled-first creation

- Change only the dedicated Composio submit flow to create with `enabled: false`.
  Generic custom MCP creation keeps its current enabled-state behavior.
- After saving, show a success message such as: “Composio API key saved.
  Activate Composio when you are ready to restart the AI engine.”
- Update the dialog help text to identify the supported key location as
  **Composio For You → Settings → Sessions & API Keys**. Do not direct users to
  Composio Platform or require an AI Clients key.
- The configured Composio card should show its existing disabled state plus a
  clear restart-required message when `requiresEngineRestart` is true.

### Activation contract

Add an explicit activation operation instead of teaching the generic enabled
toggle to restart implicitly.

1. Add `POST /api/mcp-servers/:mcpServerId/activate` with a validated body such
   as `{ restartEngine: boolean }`.
2. The backend re-evaluates `requiresEngineRestart` on every activation request;
   frontend metadata is advisory and cannot bypass consent.
3. If a restart is required and `restartEngine` is false, return a typed
   `409 engine_restart_required` response and leave the server disabled. This
   also covers stale frontend state.
4. If a restart is required and consent is true:
   - keep the Composio MCP server disabled;
   - await `orchestrator.restart("Composio activation approved")` so the child
     environment reloads secrets;
   - only after a successful restart, enable the server, sync global MCP config,
     dispose OpenCode's global instances, and read the resulting runtime status.
5. If restart fails, return the failure and leave Composio disabled so CC never
   exposes a misleading enabled-but-unauthenticated state.
6. If no restart is required, enable and refresh Composio without showing the
   dialog or restarting the engine.
7. Disabling remains the existing non-restarting enabled-state update.

The activation operation may be usable by any MCP server with fresh referenced
secrets, but this change only routes the dedicated Composio UI through it. Avoid
changing custom MCP interaction semantics as part of this fix.

### Confirmation interaction

- Reuse `@/components/common/ConfirmDialog`; do not add another modal or import
  Radix outside `components/ui/`.
- Disabled Composio uses the action label **Activate** rather than **Enable**.
- When `requiresEngineRestart` is true, clicking Activate opens a dialog with:
  - title: “Restart the AI engine and activate Composio?”;
  - the existing warning that active specialist sessions are interrupted and
    the instance is unavailable until restart completes;
  - a count-specific warning when `useActiveTaskRunsQuery()` reports running
    task runs;
  - confirm label: “Restart and activate”;
  - Cancel, which performs no mutation and returns focus to Activate.
- Do not disable confirmation solely because task runs are active. The warning
  supplies informed consent; Cancel lets the operator wait and retry later.
- While restart/activation is pending, prevent duplicate actions and show an
  accurate pending label.
- Follow the CC design system: existing Button, Badge, ConfirmDialog, semantic
  utilities, and no new authored CSS or design-system exception.

## Implementation touch points

1. `packages/backend/src/services/secret-service.ts`
   - value-aware secret write result;
   - newest-update lookup for referenced keys.
2. `packages/backend/src/services/mcp-server-service.ts`
   - retain which normalized inputs actually changed a secret;
   - derive `requiresEngineRestart`;
   - implement restart-aware activation while keeping failed attempts disabled.
3. `packages/backend/src/routes/mcp-servers.ts`
   - pass the orchestrator dependency;
   - register the activation route and typed restart-required response.
4. `packages/shared/src/schemas/mcp.ts`
   - runtime `requiresEngineRestart` field;
   - activation request/result or typed error schemas.
5. `packages/frontend/src/lib/api/integrations.ts` and
   `packages/frontend/src/hooks/use-mcp-servers-query.ts`
   - activation API and query invalidation.
6. `packages/frontend/src/pages/IntegrationsPage.tsx` and the existing
   integration dialog/helper modules
   - disabled-first creation, corrected key-source copy, restart-required state,
     active-run warning, and ConfirmDialog flow.

## Test plan

### Backend

- Saving a new literal Composio key stores it encrypted, creates the MCP server
  disabled, and reports that an engine restart is required.
- Saving the same plaintext key does not change its timestamp and does not create
  a new restart requirement.
- Changing the key after engine startup creates a restart requirement.
- A successful engine restart clears the derived requirement.
- Activation without consent returns the typed conflict and leaves the server
  disabled.
- Confirmed activation awaits restart and enables only after restart succeeds.
- Restart failure leaves the server disabled.
- Activation with no pending secret change enables without restarting.
- Disable remains restart-free.
- File-first persistence keeps `configuration/mcp.json` and the DB cache aligned
  through success and failure paths.

### Frontend

- Connecting Composio submits `enabled: false` and renders the saved/disabled
  state.
- Activate opens ConfirmDialog only when restart metadata requires it.
- The dialog uses singular/plural active-run copy, Cancel makes no request, and
  focus returns to Activate.
- Confirmation sends explicit restart consent and displays pending/error states.
- A typed stale-state conflict also opens the confirmation dialog.
- With no restart requirement, Activate enables immediately.
- The key-source instructions name Composio For You → Settings → Sessions & API
  Keys.

### Verification

- Run ESLint with `--fix` on touched packages, then `pnpm lint`.
- Run `pnpm typecheck` and focused backend/frontend Vitest suites.
- Run the full backend and frontend test suites.
- Run `pnpm design-system:audit` and the focused Integrations Playwright flow.
- Manually verify: save key → disabled; activate with running task → cancel;
  finish task → activate → confirm → connected; save the same key again → no
  unnecessary restart.

## Success criteria

- Saving a Composio key never attempts a connection and never restarts OpenCode.
- Composio cannot become enabled with a newly changed secret unless the operator
  explicitly approved the required restart.
- Cancel leaves Composio disabled and retryable after active work finishes.
- A restart performed elsewhere satisfies the pending requirement.
- Re-entering the same key does not create a false restart requirement.
- A failed restart cannot leave Composio appearing activated.

## Out of scope

- Composio Platform-specific setup or AI Clients keys.
- Pre-connecting individual Composio apps from CC.
- Changing generic custom MCP creation/activation UX beyond shared backend
  primitives required by this flow.
- Automatically cancelling, draining, or rescheduling active task runs.
