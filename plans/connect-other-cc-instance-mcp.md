# Connect another CommandsCenter instance from the Integrations page

## Problem

A CC instance already exposes one Streamable HTTP MCP endpoint at
`<origin>/api/public/mcp`, authenticated with `Authorization: Bearer <API token>`
(`docs/public-mcp-authentication.md`). Today the only way to consume another CC
instance is the generic **Add custom MCP server** dialog: the operator has to
know the endpoint path, pick the transport and auth method, hand-write the
`Authorization: Bearer {env:KEY}` header, and separately create the secret in
Settings. Nothing on the Integrations page says CC can talk to CC.

The credential also cannot be used by the running OpenCode process until it
restarts, which is the same constraint the Composio flow already solves with
disabled-first creation plus explicit restart consent.

## Confirmed product decisions

- A dedicated **Connected CC instances** section on the Integrations page, above
  **Suggested MCPs**, with an **Add** button. Any number of instances can be
  connected, each under its own name.
- The Add form has four fields: **Name**, **Instance URL**, **Secret name**,
  **Secret value**.
- URL handling: `domain.com` and `domain.com/` both become
  `https://domain.com/api/public/mcp`. A URL that already ends in
  `/api/public/mcp` is used as-is (no double append). A proxy sub-path is
  preserved (`https://host/cc` → `https://host/cc/api/public/mcp`).
- Auth is fixed to the public MCP contract: header `Authorization` with value
  `Bearer {env:<SECRET_NAME>}`. The operator names the CC secret-store key and
  supplies the API token value; the value is stored encrypted and never returned
  to the browser.
- Creation is disabled-first and never restarts the AI engine.
- Activation reuses the existing Composio semantics: **Activate** enables
  immediately when no restart is needed, otherwise asks for explicit consent in
  a dialog that reports running task runs; Cancel leaves the instance disabled
  and retryable later.
- Connected instances are identified by their `/api/public/mcp` URL. No schema,
  DB, or `configuration/mcp.json` format change — the portable representation
  stays an ordinary remote MCP server entry.

## Design

### Backend

No backend change is required. The existing primitives already cover this:

| Need                               | Existing mechanism                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Store the token encrypted          | `PUT /api/secrets/:secretKey` with `{ value, restart: false }`                                          |
| Register the server disabled       | `POST /api/mcp-servers` with `enabled: false`                                                           |
| Keep the header a secret reference | `normalizeSecretValue` keeps `{env:KEY}` verbatim and calls `secretService.ensure([KEY])`               |
| Detect a stale engine credential   | `readRequiresEngineRestart` compares the secret's `updated_at` against the orchestrator's `startedAt`   |
| Restart-consented activation       | `POST /api/mcp-servers/:mcpServerId/activate` with `{ restartEngine }`, typed `engine_restart_required` |

Because `mcp-server-service.activate` is already generic (nothing in it is
Composio-specific), the new flow routes through the same endpoint.

### Submit order and partial failure

The dialog performs two mutations in this order:

1. `createMcpServer({ name, enabled: false, config: { transport: "streamable-http", url, authMethod: "headers", headers: [{ key: "Authorization", value: "Bearer {env:KEY}" }] } })`
2. `setSecret(KEY, value, /* restart */ false)`

Server-first is deliberate: step 1 is the one that can legitimately fail (name
collision, invalid URL), and if step 2 fails afterwards the instance is already
visible on the page with the existing **Missing secret values** warning and its
copyable key — a recoverable state the UI already renders. The reverse order
would leave an orphan secret with no owner.

Step 2 never passes `restart: true`; the restart decision belongs to Activate.

### URL normalization

New helper in `integration-helpers.ts`:

```ts
export const CC_INSTANCE_MCP_PATH = "/api/public/mcp";

export function resolveCcInstanceMcpUrl(input: string): string | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return undefined;
  }
  if (!url.hostname) return undefined;

  const path = stripTrailingSlashes(url.pathname);
  url.pathname = path.endsWith(CC_INSTANCE_MCP_PATH) ? path : `${path}${CC_INSTANCE_MCP_PATH}`;
  url.search = "";
  url.hash = "";

  return url.toString();
}
```

It returns `undefined` rather than throwing so the dialog can use one call for
both the live endpoint preview and the field error "A valid instance URL is
required."

Detection for the section:

```ts
export function isCcInstanceServer(server: McpServer): boolean {
  if (server.config.transport === "stdio") return false;

  try {
    return stripTrailingSlashes(new URL(server.config.url).pathname).endsWith(CC_INSTANCE_MCP_PATH);
  } catch {
    return false;
  }
}
```

`IntegrationsPage` filters these out of `customMcpServers` the same way it
already filters Composio, so an instance renders in exactly one place.

### Secret name

The secret name must satisfy the reference grammar the backend scans for
(`/\{env:([A-Za-z_][A-Za-z0-9_]*)\}/`); anything else would be persisted as a
literal header value instead of a reference. The dialog therefore:

- validates `^[A-Za-z_][A-Za-z0-9_]*$` with the message "Secret name must start
  with a letter or underscore and use only letters, digits, and underscores";
- prefills `CC_INSTANCE_<SANITIZED_NAME>_TOKEN` from the Name field until the
  operator edits the secret field themselves;
- shows a hint when the key already exists in `useSecretsQuery()` data: "This
  secret already exists and its value will be replaced."

### Section and cards

New file `packages/frontend/src/pages/integrations/cc-instances-section.tsx`
(the page is already 919 lines; AGENTS.md caps files at ~250):

- Panel titled **Connected CC instances**, one-line description, collapse toggle
  persisted like the other sections, and an **Add** button in the header.
- Empty state: "No CC instances connected yet." with the Add affordance.
- One card per instance: name, status badge (`friendlyStatus` /
  `statusBadgeVariant`), the endpoint URL, missing-secret pills (reusing the
  existing warning block), and actions:
  - **Activate** / **Disable** (Activate when disabled, mirroring Composio),
  - **Edit** — opens the existing generic `McpServerDialog` in edit mode; it
    already edits name, URL, and the `{env:KEY}` header, so no second edit form
    is introduced,
  - **Remove** — existing `window.confirm` + `remove` mutation.
- When `requiresEngineRestart && !enabled`: "Activating this instance requires
  an AI engine restart to load the saved token."

### Generalizing the activation flow

`IntegrationsPage` currently hardcodes Composio in its activation state. Minimal
generalization, no behavior change for Composio:

- `confirmingComposioRestart: boolean` → `restartConsent?: { server: McpServer; label: string }`
  (label is `"Composio"` for the Composio section and the instance name
  otherwise, so the existing dialog title stays byte-identical for Composio).
- `activateComposio(restartEngine)` → `activateServer(server, label, restartEngine)`;
  same 409 `McpEngineRestartRequiredError` fallback, success message
  `` `${label} activated.` ``.
- `composioActivationError?: string` → `activationError?: { serverId: string; message: string }`
  so each section renders only its own failure.

The ConfirmDialog description becomes credential-neutral for instances ("The
saved token for <name> is not loaded by the current AI engine…") while Composio
keeps its current wording.

### Dialog

`CcInstanceDialog` lives next to `ComposioDialog` in `integration-dialogs.tsx`,
reusing `Field`, `Input`, `PasswordInput`, `Button`, and `readError`:

- Fields: Name, Instance URL, Secret name, Secret value (`PasswordInput`).
- Helper text: "Create an API token on the other instance under **API →
  Tokens**, granting only the capabilities it should expose. CC appends
  `/api/public/mcp` and sends the token as `Authorization: Bearer …`."
- Live preview of the resolved endpoint under the URL field.
- Name uniqueness validated client-side against `existingNames` before
  submitting (`validateForm` already has this check to reuse).
- On success: "`<name>` saved. Activate it when you are ready to restart the AI
  engine."

## Implementation touch points

1. `packages/frontend/src/pages/integrations/integration-helpers.ts`
   - `CC_INSTANCE_MCP_PATH`, `buildCcInstanceMcpUrl`, `isCcInstanceServer`,
     secret-name validation, default secret-name suggestion, section storage key.
2. `packages/frontend/src/pages/integrations/integration-dialogs.tsx`
   - `CcInstanceDialog`.
3. `packages/frontend/src/pages/integrations/cc-instances-section.tsx` (new)
   - Section, empty state, and instance card.
4. `packages/frontend/src/pages/IntegrationsPage.tsx`
   - Render the section above Suggested MCPs, filter instances out of the
     configured list, wire `useSecretMutations().set`, generalize the activation
     state and ConfirmDialog, route Edit/Remove through existing mutations.
5. `docs/public-mcp-authentication.md`
   - New "Connect another CommandsCenter instance" section describing the
     Integrations flow, the token permissions to grant, and the restart step.

No changes to `packages/shared`, the backend, the DB, or migrations.

## Test plan

### Frontend unit (`packages/frontend/src/pages/IntegrationsPage.test.tsx`)

Add `vi.mock("@/hooks/use-secrets-query")` coverage for `useSecretMutations`.

- The Connected CC instances section renders before Suggested MCPs.
- Submitting the dialog creates the server disabled with
  `Authorization: Bearer {env:KEY}` and the normalized URL.
- The same submit stores the secret with `restart: false`.
- `domain.com`, `domain.com/`, and a pasted `/api/public/mcp` URL all resolve to
  one endpoint (helper-level assertions).
- A URL with a proxy sub-path keeps the prefix.
- An invalid URL blocks submission and shows the field error.
- An invalid secret name blocks submission and shows the grammar error.
- The secret name is prefilled from the instance name and stops tracking it once
  edited.
- A connected instance renders in its own section and not in Configured MCP
  servers.
- Activate with `requiresEngineRestart: true` opens the consent dialog titled
  with the instance name; Cancel issues no mutation.
- Confirming calls `activate` with `restartEngine: true`.
- Activate with `requiresEngineRestart: false` calls `activate` with
  `restartEngine: false` and shows no dialog.
- A typed 409 restart-required response opens the consent dialog.
- An activation failure renders under that instance's card only, leaving the
  Composio section clean.
- Missing-secret pills render for an instance whose secret has no value.
- Remove asks for confirmation and calls the remove mutation.
- Existing Composio tests must pass unchanged (guards the generalization).

### E2E (`packages/frontend/e2e/integrations.spec.ts`, new)

Critical path only: open Add, fill the four fields, save, see the instance card
in disabled state, Activate, confirm the restart dialog.

## Verification

- `pnpm eslint --fix` on touched files, then `pnpm lint`.
- `pnpm typecheck`.
- Focused `IntegrationsPage` Vitest run, then the full frontend suite; backend
  suite to confirm nothing regressed (expected untouched).
- `pnpm design-system:audit`.
- Manual: connect a second local CC instance with an API token, activate with a
  running task (cancel, then activate after it finishes), confirm the tools
  appear as `<name>_*` in a specialist and that `configuration/mcp.json` plus
  `.cc/workspace/opencode.jsonc` carry the `{env:KEY}` reference rather than the
  token.

## Success criteria

- Multiple CC instances can be connected under distinct names from one Add
  button.
- Saving never writes the token into config files, never restarts the engine,
  and never leaves the instance enabled-but-unauthenticated.
- Activation restarts only with explicit consent and only when the referenced
  secret changed after the current engine started.
- Copying the workspace to another machine restores every connected instance
  definition; only the secret values must be re-entered (Portable Workspace
  Rule).

## Out of scope

- OAuth against another CC instance (the public MCP endpoint supports it, but
  the token flow is the supported path here).
- Testing the connection or listing remote tools from inside the Add dialog.
- Per-specialist tool permissions for instance tools (handled by the existing
  Specialist editor).
- A dedicated edit dialog for instances; Edit reuses `McpServerDialog`.
