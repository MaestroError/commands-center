# Plan: Public Debugging MCP Server

**Status:** Draft for review (not yet approved). Authored 2026-06-30.
**Owner:** revaz.
**Goal:** A first-class **public HTTP MCP server** that lets an external AI agent (Claude Code, Codex, Cursor, VS Code, or any HTTP-MCP client) connect to a self-hosted CC instance and inspect/debug it: SQLite, terminal, workspace files, conversations/sessions, tool failures, tasks, task runs, and runtime state. Modeled on the remote MCP servers shipped by GitHub / Atlassian (Jira) — token-authenticated, scoped, operator-controlled.

## Motivating case

See [plans/investigations/cc-app-draft-live-request-not-found.md](../investigations/cc-app-draft-live-request-not-found.md). That investigation was solved by _inference_ because there was no way to query the running VPS — "is there a live_request record?" (it's in-memory), "did the process restart?", "what's in the task_run row?". A debug MCP turns that guessing into direct queries. The read-only `dump_runtime_state` tool below is designed to answer exactly those questions.

## Decisions locked in (from review)

1. **Public, standard HTTP MCP server** — connectable from any MCP client that supports HTTP MCP servers, like the GitHub/Jira remote MCP servers. Not a CC-internal loopback server.
2. **Token required for ALL tools, including read-only.** No anonymous access. A valid scoped bearer token gates every call.
3. **Read-only tools enabled by default** (once authenticated). **Raw primitives** (terminal, SQL writes, file writes) sit behind an operator-controlled **Debug Mode** toggle (on/off, default OFF).
4. **Secrets handling (IMPORTANT):** Do **NOT** add any tool that reads CC secret/variable **values**. Only secret/variable **names (keys)** may be listed/read. The secret store is otherwise off-limits to this MCP.

## Existing foundation (reuse — do not rebuild)

| Need                                                 | Already in codebase                                                                                                                                                                            |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public bearer-token auth + scopes + revocation       | `apiTokenService`, `validatePublicApiBearer` in `packages/backend/src/lib/owner-auth-guard.ts:79`. Scope enum today: `["templates", "tasks"]` in `packages/shared/src/schemas/api-tokens.ts:3` |
| MCP-over-HTTP serving                                | `packages/backend/src/services/mcp-server-service.ts`, `packages/backend/src/routes/cc-managed-mcp.ts`                                                                                         |
| Terminal primitive (PTY)                             | `packages/backend/src/services/terminal-backend.ts` (`createTerminalBackendFactory`, opencode PTY backend)                                                                                     |
| Per-action operator confirmation (human-in-the-loop) | `liveRequestService` (`packages/backend/src/services/live-request-service.ts`) — the draft/Apply flow                                                                                          |
| Audit                                                | `activityService`                                                                                                                                                                              |
| Path-traversal hardening                             | Existing document path validation (rejects backslashes, Windows drive-letter absolute paths) — reuse for file/SQL tools                                                                        |

This is mostly **wiring existing services behind a new public endpoint + a new scope + a toggle**, not greenfield.

## Architecture

### Transport

- Standalone public endpoint, e.g. `POST /mcp` (or `/api/mcp/debug`), using **MCP Streamable HTTP** (the transport Claude Code / Codex / Cursor / VS Code all speak).
- A **sibling** to the cc-managed MCP servers — different trust boundary (external, not `127.0.0.1` loopback) and different auth (public `apiTokenService` bearer, not the per-specialist HMAC tokens). Do **not** fold it into the cc-managed registry.

### Auth — PAT

- **Phase 1: bearer token (PAT).** Extend the API token scope enum with `debug:read` and `debug:write`. Operator mints a scoped token in CC settings; client sends `Authorization: Bearer <token>`. This is the GitHub/Jira-PAT model and matches the existing `apiTokenService`.

### Debug Mode gate — two independent keys

A raw/write tool executes only if **both**:

1. the calling token carries `debug:write` scope, **and**
2. the global **Debug Mode** toggle is ON (operator-controlled, default OFF; ideally auto-expires after N hours).

Read-only tools require only a valid token with `debug:read`. Defense in depth: a leaked `debug:write` token is inert while Debug Mode is off.

## Tool surface

### Read-only (requires `debug:read` token; enabled by default)

- **Conversations/sessions:** list/get conversations, sessions, messages, and **tool calls + failures**.
- **Tasks:** list tasks, task runs, run outputs/artifacts, schedules, run status/failures.
- **Specialists:** list, get profile/config.
- **Database:** `query_db` — SELECT-only, opened against a **readonly** SQLite handle, parameterized, hard row cap.
- **Workspace files:** `read_workspace_file`, `list_workspace` (path-validated; reuse document path hardening).
- **Logs:** `tail_logs` / `get_logs(since, level)`.
- **Runtime state:** `get_runtime_health`, `dump_runtime_state` — exposes **in-memory** state (live_requests, opencode sessions, in-flight tool calls). Directly serves the motivating investigation.
- **Secret/variable names only:** `list_secret_names` — returns keys/names of stored secrets and variables. **Never returns values.** (See decision #4.)

### Raw primitives (requires `debug:write` token AND Debug Mode ON)

- `run_terminal` — wraps the PTY `terminal-backend` factory.
- `run_sql` — write/DDL allowed.
- `write_workspace_file`.

## Security & safety model

- **Token required everywhere** (decision #2). No unauthenticated tool discovery or calls. `.well-known` metadata may be public; tool list/call may not.
- **Secrets:** no value-reading tool exists; only names (decision #4). Audit any access to `list_secret_names`.
- **Egress awareness:** read-only still streams conversations/task context to a third-party LLM client. Mitigations:
  - Token is the gate (per decision, no extra per-resource opt-in required for v1).
  - Optionally a secret-value redaction pass on payloads as a safety net, since conversation text could contain pasted secrets even though there's no secret-reading tool. (Open — see below.)
- **Terminal blast radius:** PTY runs as the backend OS user (near-root on many VPS). Mitigations to combine: run debug terminals as a **restricted user**, jail the `cwd`, optional command allow/deny list, and/or route through `liveRequestService` so the operator Applies each command. Recommend restricted user + confirm-gate.
- **Injection hardening:** `query_db`/`run_sql` parameterized + readonly handle for reads; `read/write_workspace_file` reuse existing path validation (no traversal, no absolute/drive-letter paths).
- **Audit everything** via `activityService`; surface a live activity feed in the CC UI so the operator can watch what a connected agent does.
- **Public attack surface:** rate limiting, auth on every request, generic error messages (no unauthenticated info disclosure).
- **Token lifecycle:** create/scope/revoke/expire debug tokens in CC settings; per-token audit; Debug Mode auto-expiry.

## Reliability note (the paradox)

A server hosted _inside_ the backend cannot report on a backend that is crash-looping — the exact case you'd most want it for. Mitigations:

- Bias tools toward **disk-durable sources** (the SQLite file, log files) so they answer even when the runtime is degraded.
- Accept that in-memory introspection (`dump_runtime_state`) needs a live process.
- Keep external process/uptime monitoring for the "is it even up" question.

## Phasing

- **MVP (Phase 1):** Streamable-HTTP endpoint + `debug:read` scope + read-only toolset (incl. `dump_runtime_state` and `list_secret_names`) + audit. Token required. Low risk, immediately useful.
- **Phase 2:** Debug Mode toggle + `debug:write` raw primitives behind confirm-gate + restricted terminal user.

## Open decisions (resolve before/while building)

1. **PAT-only for v1, or invest in OAuth 2.1/DCR sooner?** (Recommend PAT-first.)
2. **Terminal sandboxing depth:** restricted user vs full confirm-gate vs both; allow/deny command list?
3. **Redaction safety net:** even without a secret-reading tool, should payloads run through a secret-value redaction pass (since conversations may contain pasted secrets)? (Recommend yes, as defense in depth.)
4. **Endpoint path & naming:** `/mcp` vs `/api/mcp/debug`; server display name.
5. **Reliability:** is a fully separate diagnostic process worth it, or is "read durable sources from the same process" good enough for v1? (Recommend the latter for v1.)
