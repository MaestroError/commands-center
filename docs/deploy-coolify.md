# Deploying CommandsCenter on Coolify

This guide covers running CommandsCenter behind [Coolify](https://coolify.io/) on a subdomain
with automatic HTTPS. The same principles apply to other Docker PaaS platforms (Dokploy,
Portainer, CapRover): the app is a single container that listens on port `3000`, stores all
state under a mounted `/workspace` volume, and must be told its public origin.

CommandsCenter does not publish a prebuilt Docker image — the image is built from the
[`Dockerfile`](../Dockerfile), which installs the published `commandscenter` npm package. So a
user does **not** need the source repository; the Dockerfile is self-contained (it has no
`COPY` of local files) and can be built from its contents alone.

## What you get

Coolify builds the image, runs it as one container on port `3000`, terminates HTTPS at its own
proxy (Traefik/Caddy) with a Let's Encrypt certificate, and routes your subdomain to the
container.

## Prerequisites

1. A running Coolify instance with a public IP.
2. **DNS first.** Point an `A` record for your subdomain at the Coolify server before
   deploying, or Let's Encrypt cannot issue the certificate:
   ```
   cc.example.com  ->  <coolify-server-ip>
   ```

## 1. Create the resource

1. Coolify dashboard → your Project/Environment → **+ Create New Resource**.
2. Under **Docker Based**, choose **Dockerfile** (deploy without Git).
3. Paste the entire contents of [`Dockerfile`](../Dockerfile) into the editor and create the
   resource.

> **Why "Dockerfile" and not "Docker Image"?** There is no published CommandsCenter image to
> pull, so "Docker Image" does not apply. "Docker Compose Empty" also works but is awkward for a
> single self-built container. Building from the Dockerfile is the direct path.

## 2. Domain and port

- **Domains / FQDN**: `https://cc.example.com` (the `https://` scheme tells Coolify to request a
  certificate and configure the proxy).
- **Ports Exposes**: `3000`.
- **Port Mappings**: leave **empty**. Filling it publishes the port directly on the host,
  bypassing the proxy and TLS.
- **HTTP Basic Authentication**: leave **disabled** — CommandsCenter has its own owner
  authentication.

## 3. Environment variables

| Name               | Value                    | Buildtime | Runtime | Notes                                                   |
| ------------------ | ------------------------ | --------- | ------- | ------------------------------------------------------- |
| `CC_PUBLIC_ORIGIN` | `https://cc.example.com` | off       | on      | **Required.** Exact origin, `https`, no trailing slash. |
| `CC_DOCKER`        | `true`                   | off       | on      | Optional; also auto-detected via `/.dockerenv`.         |

Values baked into the image already default correctly (`NODE_ENV=production`, `CC_HOST=0.0.0.0`,
`CC_PORT=3000`, `CC_WORKSPACE_DIR=/workspace/.cc/workspace`), so you only need the above.

> **`CC_PUBLIC_ORIGIN` is non-negotiable.** In production mode the app does not auto-trust
> localhost or arbitrary origins. If it is unset or mismatched, claiming and every write request
> fail with `Request origin is not allowed.` For multiple origins (e.g. an alias), set the
> comma-separated `CC_ALLOWED_ORIGINS` in addition.

### A note on `CC_SECRET_KEY`

`CC_SECRET_KEY` encrypts stored secrets. On first start CommandsCenter generates it and writes
it into `/workspace/.cc/.env` on the mounted volume, so it survives redeploys as long as the
volume persists.

Setting `CC_SECRET_KEY` explicitly (so the key is independent of the volume) is normally the
safer choice — but there is currently a bug where providing it via the environment on a **fresh**
install prevents the env file from being created, causing a crash loop with
`ENOENT ... /workspace/.cc/.env`. See
[commands-center#107](https://github.com/MaestroError/commands-center/issues/107).

**Until that is fixed, do one of the following:**

- **Simplest:** leave `CC_SECRET_KEY` unset on first deploy. The key is generated and persisted
  on the `/workspace` volume.
- **Keep an explicit key:** deploy once without it (creates the env file), then read the
  generated value and set it as `CC_SECRET_KEY` — because the file now exists, the bug no longer
  triggers:
  ```bash
  docker exec "$(docker ps -a --filter name=<resource> --format '{{.Names}}' | head -1)" \
    sh -c 'grep CC_SECRET_KEY /workspace/.cc/.env'
  ```

## 4. Persistent storage (required)

The Dockerfile declares an anonymous `VOLUME`, which is **not** guaranteed to persist across
redeploys. Add explicit storage:

1. Open the resource's **Storages** tab → **+ Add** → **Volume Mount**.
2. **Name**: `workspace` (anything).
3. **Source Path**: leave **empty** (creates a managed named volume; a value here would be a host
   bind mount).
4. **Destination Path**: `/workspace`.

Without this, every redeploy wipes the secret key, database, owner auth, and all tasks.

## 5. Health check (recommended)

The bundled OpenCode engine takes ~30–90s to warm up on first boot. `/api/health` returns HTTP
`200` even while "degraded", so:

- **Path**: `/api/health`, **port** `3000`.
- Give it a generous start period (90–120s) so the cold start is not flagged unhealthy.

## 6. Deploy, claim, verify

1. Click **Deploy**. Watch **Build logs** (a few minutes — it runs `npm install -g
commandscenter`), then **Application logs**.
2. Wait for `opencode engine is healthy`. On the first boot of an unclaimed workspace, the logs
   also print a one-time **claim code** and claim URL:
   ```
   "authState":"unclaimed","claimCode":"...","claimUrl":"https://cc.example.com/claim"
   ```
3. Open `https://cc.example.com/claim`, enter the claim code, and set your owner password.
4. Verify:
   ```bash
   curl https://cc.example.com/api/health   # -> "status":"ok"
   ```

The claim code is a one-time bootstrap credential for the initial _unclaimed_ window only. If
the container restarts **before** you finish claiming, the code rotates — regenerate one from the
Coolify **Terminal** tab:

```bash
ccenter claim --cc-env-file /workspace/.cc/.env
```

**Once claimed, the owner state persists** in `owner-access.json` on the `/workspace` volume.
Restarts and redeploys do **not** require re-claiming — you simply log in with your owner
password.

## Upgrading

CommandsCenter does not self-update inside a container (this is enforced, not just a default).
Because the image is built from the Dockerfile — which installs the npm package — a plain
redeploy reuses the Docker build cache and will **not** pull a newer version. To upgrade:

- **Force a no-cache rebuild** via Coolify's Redeploy options, so `npm install -g commandscenter`
  re-runs and pulls the latest published version, **or**
- **Pin the version** by setting a build arg / env `CCENTER_PACKAGE_SPEC=commandscenter@X.Y.Z`.
  Changing its value busts the cache and installs exactly that version.

Your `/workspace` volume survives, so it is a clean in-place upgrade.

> The in-app update page shows generic "redeploy the container" guidance for Docker installs — it
> cannot know it is running under Coolify, so follow the steps above rather than any literal
> `docker compose` commands.

## Troubleshooting

| Symptom                                      | Cause                                                                                                       | Fix                                                                         |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Crash loop, `ENOENT ... /workspace/.cc/.env` | `CC_SECRET_KEY` set on a fresh install ([#107](https://github.com/MaestroError/commands-center/issues/107)) | Unset it (or pre-create the env file) — see [§3](#a-note-on-cc_secret_key). |
| `Request origin is not allowed.` on claim    | `CC_PUBLIC_ORIGIN` unset or mismatched                                                                      | Set it to the exact `https://` origin you browse from, no trailing slash.   |
| Health "degraded" for ~1 min after boot      | OpenCode engine cold start                                                                                  | Normal; it becomes healthy within ~90s.                                     |
| Data lost after redeploy                     | No persistent `/workspace` volume                                                                           | Add the Volume Mount in [§4](#4-persistent-storage-required).               |
| SSL not issued                               | DNS not resolving to the server                                                                             | Point the `A` record first, then redeploy.                                  |

To read logs from an exited container (Coolify's Logs tab only attaches to running containers):

```bash
docker logs "$(docker ps -a --filter name=<resource> --format '{{.Names}}' | head -1)" 2>&1 | tail -50
```
