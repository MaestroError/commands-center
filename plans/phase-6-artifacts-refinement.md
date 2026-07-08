# Phase 6 — Artifacts Refinement (deliverable URLs)

**Status:** Detailed plan for review (not yet approved). Authored 2026-07-08.
**Parent roadmap:** [public-mcp-tasks-and-token-permissions.md](public-mcp-tasks-and-token-permissions.md) (Phase 6).
**Depends on:**

- **[Phase 3 — Templates as MCP Tools](phase-3-templates-as-mcp-tools.md)** — per-template `mcpConfig.artifacts.{displayableUrlEnabled, downloadableUrlEnabled}` toggles were scaffolded there; Phase 6 consumes them.
- **[Phase 2 — Public MCP Server Foundation](phase-2-public-mcp-server-foundation.md)** — `mcpTaskRunResultSchema` (artifact summary) is enriched here with the two URLs; the sync run-and-wait is the assembly point.

Independent of Phases 4 & 5. See [Dependencies](#dependencies).

**Why this matters:** this phase returns the **actual deliverables** to every external API/MCP caller. It must be reliable (stable, idempotent URLs that survive repeated polling), safe (no inline-serving XSS, no path traversal), and correct (right file, right disposition, right expiry). The design below is built around those three properties.

---

## Decisions locked in (from review)

1. **Two URLs per file/document artifact: displayable + downloadable.** Display serves inline (browser-rendered) or a download page for non-renderable types; download forces `Content-Disposition: attachment`.
2. **Stateless HMAC-signed URLs** (signed with `config.secretKey`) — idempotent, no per-read DB writes, no link-spam across repeated `get_task_result` polls. (Internal mechanism decision; rationale below.)
3. **Display URL gets an owner-session fallback after expiry; download URL hard-expires.** Once the signed window lapses, the display URL is still reachable to an authenticated owner through the UI; the download URL stops working and the operator re-shares from the UI for a fresh link.
4. **Type behavior:** `file` → signed display + download. `document` (markdown in the Documents module) → **also served** (treated as a file deliverable: display + download). `url` → `displayUrl` is the external link **directly**, no download version.
5. **Per-template enable/disable** of each URL (Phase 3 toggles); **configurable validity** reuses the existing artifact-expiry setting.

---

## Current state (verified in codebase)

| Concern                                                                                                                                                                                                                          | Where                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Immutable snapshot (`publishArtifact` copies workspace file → `sessions/artifacts/<id>/<file>`, manifest-tracked, **idempotent**); `resolveArtifactPath`; strict path hardening (`ensureDescendant`, no absolute/`..`); mime map | `packages/backend/src/services/artifact-service.ts` (currently **rejects non-`file`** types) |
| Existing signed download (per-mint random token, revocable, download-count) + validity setting `taskArtifactSignedUrlExpiresInMinutes` (0 = no expiry)                                                                           | `services/artifact-share-link-service.ts`, table `artifact_share_links`                      |
| Existing download route: streams with `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, `escapeHeaderFilename`                                                                    | `routes/public-api.ts` (`/api/public/v1/task-artifacts/download/:shareId`)                   |
| Guard bypass pattern for signed public artifact routes                                                                                                                                                                           | `owner-auth-guard.ts` (`SIGNED_PUBLIC_ARTIFACT_DOWNLOAD_PATTERN`)                            |
| **Server signing secret** + HMAC precedent (`payload.signature`, `timingSafeEqual`)                                                                                                                                              | `config.secretKey` (`runtime-config.ts`); `mcp/cc-managed/auth-token-service.ts`             |
| Owner session validation for the post-expiry fallback                                                                                                                                                                            | `ownerAccessService.validateSession` + `readOwnerSessionCookie`                              |
| Artifact result summary to enrich (Phase 2) + REST run projection (currently omits artifacts)                                                                                                                                    | `mcpTaskRunResultSchema` (Phase 2), `publicTaskRunSchema` in `schemas/public-api.ts`         |
| Documents module root (for `document` artifacts, `link` = path under `Documents/`)                                                                                                                                               | Documents service / config subdirectories                                                    |

---

## Target design

### 1. Stateless signed-URL scheme

Two new routes, both **guard-bypassed** (auth enforced internally):

```
GET /api/public/v1/artifacts/:artifactId/display?exp=<ms>&sig=<b64url>
GET /api/public/v1/artifacts/:artifactId/download?exp=<ms>&sig=<b64url>
```

- `sig = base64url(HMAC_SHA256(config.secretKey, `v1:${artifactId}:${disposition}:${exp}`))`; verify with `timingSafeEqual`.
- `exp` is epoch-ms; `exp === 0` means no expiry (mirrors the existing `0 = no expiry` setting). Otherwise expired when `now > exp`.
- **Idempotent / stable:** `exp` is anchored to the run's `completedAt + validityMinutes` (not "now"), so re-emitting a URL for the same artifact yields the **identical** string across repeated `get_task_result` polls — no link-spam, no divergence.

**Why stateless HMAC over the existing per-mint token row:** the existing `artifact_share_links` token is stored only as a hash — its URL can't be regenerated, so returning URLs on every result read would mint a new row each time. A signed URL is a pure function of `(artifactId, disposition, exp)`, so it regenerates identically with zero writes. The existing share-link table stays for the **operator's manual "Share" UI** (which needs per-link revocation + counts); the signed scheme powers **automated deliverables** (revocation = expiry / `secretKey` rotation). Documented coexistence; unify later if desired.

### 2. Serving + immutable snapshot (file & document)

- On first serve, ensure an immutable snapshot exists (idempotent `publishArtifact`) so a deliverable stays stable even if the agent later overwrites the workspace file; serve from `resolveArtifactPath(storageKey)` via `createReadStream`.
- **Extend `publishArtifact` (or a sibling) to accept `document`:** resolve the `Documents/`-relative `link` to an absolute path (reuse the same `ensureDescendant` hardening against traversal), snapshot it, mime `text/markdown`. `file` keeps its current workspace-relative resolution. `url` never reaches these routes.

### 3. Content-type-aware display

- **Renderable allow-list (inline):** `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `application/pdf`, `text/plain`, `text/markdown`, `text/csv`, `application/json`. Everything else → the **download page** (below). The existing mime map has no `text/html` or `image/svg+xml`, so those resolve to `application/octet-stream` → download page (never inlined).
- **Inline response hardening (critical):** exact allow-listed `Content-Type`; `Content-Disposition: inline; filename="…"`; `X-Content-Type-Options: nosniff`; strict `Content-Security-Policy` (`default-src 'none'; img-src 'self'; object-src 'self'; style-src 'unsafe-inline'; sandbox`); `Referrer-Policy: no-referrer`; `Cache-Control: private, no-store`. Text/markdown/csv/json are served as their text type with `nosniff` (browser shows content; no execution). Markdown renders as source in v1 — a sanitized rendered view is a noted enhancement, not v1.
- **Download page (non-renderable):** a minimal server-rendered HTML page showing the **escaped** filename + human-readable size + a download button linking to the artifact's download URL. Strict CSP; escape all interpolated values. If the template disabled the download URL, the page shows name/size with a "download disabled" note (no button).

### 4. Auth: display owner-fallback, download hard-expiry

- **Download route:** signed URL only. Valid sig + unexpired → stream attachment; else `404` (hard-expire — no owner fallback, per decision).
- **Display route:** valid sig + unexpired → serve. Else check owner session (`readOwnerSessionCookie` → `validateSession`): owner → serve (post-expiry access); non-owner browser (`Accept: text/html`) → redirect to `/login?next=<url>` (the "gate"); otherwise `401`.
- **Guard:** add the two artifact routes to the bypass set (like the existing download pattern) and do all auth inside the handlers. The display route's login redirect leans on the existing browser-nav behavior.

### 5. Per-template toggles + non-template defaults

- Result assembly emits `displayUrl` iff (`file`/`document` and) `template.mcpConfig.artifacts.displayableUrlEnabled`; `downloadUrl` iff `downloadableUrlEnabled`. `url` type: `displayUrl` = the external link, `downloadUrl` = null regardless.
- **Non-template runs** (`task_run`, direct tasks) have no template — default both enabled (or read a global default from the artifact-sharing preferences). Note in the settings copy.

### 6. Validity

- Reuse `taskArtifactSignedUrlExpiresInMinutes` (existing `artifactSharingPreferences`, `0 = no expiry`, already surfaced in `SettingsPage`). The signed `exp` = `completedAt + minutes*60_000` (or `0`). One setting governs both the manual share links and deliverable URLs — no new setting.

### 7. Delivery assembly + result enrichment

- New `artifact-delivery-service.ts`: `buildDelivery(artifact, { displayEnabled, downloadEnabled, baseUrl, expiresAtMs })` → `{ type, title, description?, mimeType?, sizeBytes?, displayUrl, downloadUrl }`. Pure + idempotent (snapshot once, sign; no other writes). `url` → passthrough link.
- **MCP:** enrich `mcpTaskRunResultSchema` artifact items with `displayUrl`, `downloadUrl`, `mimeType`, `sizeBytes`. The sync run-and-wait (Phase 2/4) and `get_task_result` both run artifacts through `buildDelivery` — stable URLs on every call.
- **REST:** add an `artifacts[]` array (same shape) to the public run detail projection (`publicTaskRunSchema` / a run-result projection), so REST callers get the deliverables too. `baseUrl` = `config.security.publicOrigin`.

---

## Task breakdown (implementation order)

1. Signed-URL sign/verify helper (`config.secretKey`, `timingSafeEqual`) + shared URL builders.
2. Extend snapshotting to `document` artifacts (Documents-path resolution + hardening); mime for md.
3. Display + download route handlers (guard bypass; inline allow-list + hardening; download page; owner fallback on display).
4. `artifact-delivery-service` (idempotent build; per-type behavior; toggle honoring).
5. Enrich `mcpTaskRunResultSchema` + wire into sync results & `get_task_result`; add `artifacts[]` to the REST run projection.
6. Consume Phase 3 template toggles; non-template defaults.
7. Tests (below).

---

## Testing

- **Signing:** valid sig serves; tampered `artifactId`/`disposition`/`exp` → `404`; `exp` in the past → expired; `exp = 0` → never expires; `secretKey` rotation invalidates old URLs.
- **Idempotency:** two `get_task_result` calls on the same completed run return **byte-identical** URLs; no new DB rows minted per read.
- **Inline safety (security-critical):** each renderable type serves inline with the exact type + `nosniff` + CSP; a `.zip`/octet-stream/`.html`/`.svg` yields the **download page**, never inline bytes; download-page filename is HTML-escaped.
- **Disposition:** display of a PNG renders inline; download of the same streams `attachment`; non-renderable display shows name/size/button (or "disabled" when download off).
- **Auth:** download after expiry → `404`; display after expiry with owner session → served; display after expiry without session (browser) → redirect to `/login`; non-owner API client after expiry → `401`.
- **Types:** `document` snapshotted + served as markdown; `url` → `displayUrl` is the link, `downloadUrl` null; `file` → both.
- **Toggles:** template with display-only omits `downloadUrl` (and the download page hides the button); non-template run defaults both on.
- **Path safety:** traversal in a document/file link is rejected (reuse `ensureDescendant`); missing source file → `404`.
- **Reliability:** large file streams (no full-buffer); the run result still returns even if one artifact fails to publish (degrade to title/type, don't fail the whole tool).

---

## Edge cases & risks

- **Inline XSS** is the top risk — mitigated by a strict allow-list (no html/svg), `nosniff`, `sandbox` CSP, and routing everything unknown to the download page. Re-audit the allow-list before shipping.
- **Snapshot staleness vs. freshness:** snapshotting at delivery gives a _stable_ deliverable; if a run re-runs and produces a new file with the same artifact id, `publishArtifact` is idempotent on the _first_ snapshot — confirm re-runs create new artifact ids (they do, per-conversation) so no stale reuse.
- **`secretKey` default/rotation:** the dev default (`development-secret-key-change-me`) must be overridden in prod (already surfaced via `secretKeyConfigured`); rotating it invalidates outstanding deliverable URLs — acceptable, document it.
- **Download hard-expiry UX:** an MCP client that stored a download URL loses it after the window; the sync result should note validity, and the display URL (owner-reachable) remains the durable path.
- **One artifact failing** (missing file, unpublishable) must not sink the whole result — degrade that entry to title/type + a note.
- **Guard bypass correctness:** the two artifact routes must bypass owner-auth/CSRF but still enforce signed-or-owner internally; assert an unauthenticated non-signed request cannot read bytes.

---

## Dependencies

- **Phase 3:** per-template artifact toggles (consumed here).
- **Phase 2:** the result schema + sync assembly point (enriched here). `get_task_result` becomes the durable re-fetch of deliverable URLs.
- Reuses existing `artifact-service` (snapshot/publish, path hardening, mime), the validity setting, `config.secretKey`, and owner-session validation — no new settings, no dependency on Phases 4/5.

**Sequencing:** can land any time after Phases 2 & 3. The signing helper + routes (tasks 1–3) are independent of the delivery-service/result wiring (4–5) and can be built in parallel.

---

## Out of scope for Phase 6 (deferred / not doing)

- Per-link revocation for deliverable URLs (expiry + `secretKey` rotation only; the manual-share UI keeps its revocable tokens).
- Rendered (sanitized-HTML) markdown display — v1 serves markdown as source; a rendered viewer is a follow-up.
- Unifying the manual share-link table with the signed scheme (kept separate; revisit later).

---

## Open questions (resolve during build, non-blocking)

1. Final renderable allow-list — include `text/csv` / `application/json` inline, or push them to the download page? (Proposed: inline as text.)
2. Non-template run default: both URLs on unconditionally, vs. a global default in artifact-sharing preferences. (Proposed: both on.)
3. Download-page styling — a bare minimal page vs. reusing an app shell (kept minimal + strict-CSP for safety).
4. Whether to also expose deliverable URLs on the _internal_ task-run detail UI (nice for operators) or keep them to the public API/MCP surface for now.
