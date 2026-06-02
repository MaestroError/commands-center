# Epic 10 — Task Artifact Sharing (Signed URLs for Generated Outputs)

## Overview

Add a safe, explicit way to share task-run result files without exposing private workspace paths through the public task API.

Current public task APIs intentionally omit artifacts and local paths. This epic owns the artifact-sharing model:

- Operators can publish a task-run artifact and receive a signed download URL.
- Signed URLs expire automatically.
- Default expiry is configurable from Settings and persisted in portable workspace settings.
- Signed URL grants are stored in SQLite and are disposable runtime state.
- Download handlers never serve arbitrary filesystem paths.

This epic depends on [Epic 09](./09-public-task-api-tasks.md) for public task/run reads and must not be folded into Epics 08 or 09.

---

## Security Model

Artifact sharing is explicit. A file produced during a task run remains private until the owner publishes it.

Rules:

- Public task/run APIs never expose artifact paths, storage keys, or local filesystem locations.
- A signed URL grants access only to one published artifact file.
- The signed URL token is high entropy, returned once, stored only as a hash, and validated against SQLite state.
- Expired, revoked, missing, or hash-mismatched signed URLs return `404` to avoid confirming whether an artifact exists.
- Download responses set safe headers: `Content-Type`, `Content-Length`, `Content-Disposition`, `X-Content-Type-Options: nosniff`, and conservative cache headers.
- The download endpoint reads only from the artifact storage root after resolving and validating the canonical path.
- No endpoint accepts an arbitrary path to serve.

SQLite can be the source of truth for signed URL grants because share links are runtime state. If the DB is deleted or moved, existing signed URLs stop working. That is acceptable and consistent with the Portable Workspace Rule.

Portable state:

- Artifact files live in the workspace.
- Artifact metadata that should survive moves lives in a workspace-backed artifact manifest, not in the signed URL table.
- The default signed URL expiry setting lives in `configuration/settings.json`.

Disposable state:

- Signed URL token hashes.
- Expiry timestamps for issued URLs.
- Revocation/download audit counters.

---

## Artifact Storage Contract

Generated task artifacts must be represented by an artifact ID and workspace-relative storage key, not by a raw local path in public projections.

For local generated files, publishing copies or snapshots the selected file into a controlled artifact storage directory:

```text
.cc/workspace/task-artifacts/<taskId>/<runId>/<artifactId>/<filename>
```

Durable artifact metadata is stored in a workspace-backed manifest under the artifact storage root, for example:

```text
.cc/workspace/task-artifacts/artifacts.json
```

Acceptance rules:

- The source file must exist and be readable by the owner process at publish time.
- The stored artifact filename is sanitized with `basename`; traversal is rejected.
- The copied artifact is immutable for that artifact ID.
- The artifact manifest stores MIME type, byte size, checksum, original filename, task ID, run ID, storage key, and created timestamp.
- Public download uses only the copied artifact storage key, never the original source path.
- URL artifacts that already point to external systems are not proxied by this epic. They may be shown internally, but public sharing of external URLs is a separate decision.

---

## Settings

Add a Settings control for signed artifact URL expiry.

Suggested setting key:

```json
{
  "taskArtifactSignedUrlExpiresInMinutes": 1440
}
```

Rules:

- Default: `1440` minutes (24 hours).
- Minimum: `5` minutes.
- Maximum: `10080` minutes (7 days).
- The setting is persisted through the existing workspace settings path, not only SQLite.
- Changing the setting affects newly created signed URLs only; existing grants keep their original `expires_at`.

---

## Public API Surface

### Owner-authenticated publish/revoke routes

These routes are UI-facing owner routes, not bearer public API routes:

| Method   | Path                                                                        | Auth                 | Description                                                                          |
| -------- | --------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------ |
| `POST`   | `/api/tasks/:taskId/runs/:runId/artifacts/:artifactId/share-links`          | owner session + CSRF | Create a signed URL using the current default expiry, or an explicit shorter expiry. |
| `GET`    | `/api/tasks/:taskId/runs/:runId/artifacts`                                  | owner session        | List internal artifacts for a run, including share state.                            |
| `DELETE` | `/api/tasks/:taskId/runs/:runId/artifacts/:artifactId/share-links/:shareId` | owner session + CSRF | Revoke one signed URL grant.                                                         |

`POST` response:

```json
{
  "shareId": "01J...",
  "url": "https://cc.example.com/api/public/v1/task-artifacts/download/01J...?token=...",
  "expiresAt": "2026-06-03T10:00:00.000Z"
}
```

The raw token is returned only in this response.

### Signed public download route

This route does not require bearer API tokens or owner cookies. Possession of the signed URL is the authorization.

| Method | Path                                                        | Auth       | Description                                |
| ------ | ----------------------------------------------------------- | ---------- | ------------------------------------------ |
| `GET`  | `/api/public/v1/task-artifacts/download/:shareId?token=...` | signed URL | Download the one file linked to the grant. |

This route streams the artifact file. It never returns artifact metadata that includes a local path.

---

## Database

Add a disposable `task_artifact_share_links` table for issued signed URLs only:

```ts
export const taskArtifactShareLinks = sqliteTable("task_artifact_share_links", {
  id: text("id").primaryKey(),
  artifact_id: text("artifact_id").notNull(),
  task_id: text("task_id").notNull(),
  run_id: text("run_id").notNull(),
  token_hash: text("token_hash").notNull().unique(),
  token_prefix: text("token_prefix").notNull(),
  created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  expires_at: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  revoked_at: integer("revoked_at", { mode: "timestamp_ms" }),
  last_used_at: integer("last_used_at", { mode: "timestamp_ms" }),
  download_count: integer("download_count").notNull().default(0),
});
```

No migration should make signed URLs portable. Rebuilding SQLite invalidates outstanding signed URLs.

The durable artifact registry is not sourced from this table. It is reconciled from the workspace artifact manifest on startup.

---

## Stories

### Story 1 — Exclude artifacts from current public task APIs

Ensure Epics 08 and 09 public projections do not expose artifacts, paths, storage keys, or artifact download URLs.

Acceptance criteria:

- `publicTaskRunStatusSchema` has no artifacts.
- `publicTaskRunSchema` has no artifacts.
- Public feedback projections that embed runs use the artifact-free public run schema.
- Tests verify internal runs with artifacts still serialize to public responses without artifacts.

### Story 2 — Artifact registry and storage service

Add a backend service for registering local task-run artifacts into controlled workspace artifact storage.

Acceptance criteria:

- Publishing a local file snapshots it into `.cc/workspace/task-artifacts/...`.
- Public download never reads the original local path.
- Filename, MIME, size, and checksum are stored and validated.
- Traversal and missing-file cases are rejected.

### Story 3 — Signed URL service

Add a service that creates, validates, revokes, and records use of signed artifact URLs.

Acceptance criteria:

- Tokens are generated with `crypto.randomBytes`, stored only as SHA-256 hashes, and returned once.
- Validation checks `shareId`, token hash, `expires_at`, and `revoked_at`.
- Successful validation updates `last_used_at` and increments `download_count`.
- Expired or revoked links fail closed.

### Story 4 — Settings UI and API

Add a Settings control for default signed artifact URL expiry.

Acceptance criteria:

- Setting persists to workspace settings.
- Values are validated against the 5-minute to 7-day range.
- Existing share links keep their original expiry after the setting changes.

### Story 5 — Owner UI for artifact sharing

Add share controls to task run artifact UI.

Acceptance criteria:

- Internal task run views can show artifacts to the owner.
- Each artifact has a "Create signed link" action.
- Existing active links show expiry and revoke controls.
- Copied links use the configured public origin.

### Story 6 — Signed public download endpoint

Add the public signed download route.

Acceptance criteria:

- A valid signed URL downloads exactly one artifact file.
- Invalid, expired, or revoked links return `404`.
- Response headers prevent MIME sniffing and avoid unintended caching.
- Route tests cover success, expiry, revocation, bad token, and path traversal hardening.

---

## Out of Scope

- Making task/run public APIs include artifact arrays.
- Serving arbitrary workspace files.
- Bearer-token artifact browsing.
- Public directory listings.
- External URL proxying.
- Making signed URLs portable across DB rebuilds.
