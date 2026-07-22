# Deploying CommandsCenter on Coolify

This guide covers running CommandsCenter behind [Coolify](https://coolify.io/) on a subdomain
with automatic HTTPS. The same principles apply to other Docker PaaS platforms (Dokploy,
Portainer, CapRover): the app is a single container that listens on port `3000`, stores all
state under a mounted `/workspace` volume, and must be told its public origin and that Coolify's
proxy is trusted.

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

In the Coolify resource, open **Environment Variables** and add the entries
below. For each entry, turn **Buildtime** off and **Runtime** on. Save the
variables, then redeploy the resource so the running container receives them.
Do not add these as Dockerfile build arguments.

| Name               | Value                    | Buildtime | Runtime | Notes                                                       |
| ------------------ | ------------------------ | --------- | ------- | ----------------------------------------------------------- |
| `CC_PUBLIC_ORIGIN` | `https://cc.example.com` | off       | on      | **Required.** Exact origin, `https`, no trailing slash.     |
| `CC_TRUST_PROXY`   | `true`                   | off       | on      | **Required on Coolify.** Its proxy terminates public HTTPS. |
| `CC_DOCKER`        | `true`                   | off       | on      | Optional; also auto-detected through the container runtime. |

Values baked into the image already default correctly (`NODE_ENV=production`, `CC_HOST=0.0.0.0`,
`CC_PORT=3000`, `CC_WORKSPACE_DIR=/workspace/.cc/workspace`). Set the two required values above;
`CC_DOCKER` is optional.

> **`CC_PUBLIC_ORIGIN` is non-negotiable.** In production mode the app does not auto-trust
> localhost or arbitrary origins. If it is unset or mismatched, claiming and every write request
> fail with `Request origin is not allowed.` For multiple origins (e.g. an alias), set the
> comma-separated `CC_ALLOWED_ORIGINS` in addition.

> **`CC_TRUST_PROXY=true` is required on Coolify.** MCP users connect to Coolify over HTTPS,
> then Coolify's Traefik/Caddy proxy forwards a private HTTP request to the container. Proxy trust
> lets CommandsCenter recover the original HTTPS domain and users' addresses. Keep **Port
> Mappings** empty so users cannot bypass Coolify's trusted proxy and reach port `3000` directly.

### A note on `CC_SECRET_KEY`

`CC_SECRET_KEY` encrypts stored secrets. If you leave it unset, CommandsCenter generates one on
first start and writes it into `/workspace/.cc/.env` on the mounted volume, so it survives
redeploys as long as the volume persists.

Setting `CC_SECRET_KEY` explicitly (add it as an environment variable) makes the key independent
of the volume: if the volume is ever lost or recreated, the same key still decrypts your stored
secrets. Generate one with `openssl rand -hex 32`, keep it in your password manager, and set it
as `CC_SECRET_KEY`. When provided this way it is also written into the generated env file, so the
environment and the file never drift.

## 4. Persistent storage (required)

The Dockerfile declares an anonymous `VOLUME`, which is **not** guaranteed to persist across
redeploys. Add explicit storage:

1. Open the resource's **Storages** tab → **+ Add** → **Volume Mount**.
2. **Name**: `workspace` (anything).
3. **Source Path**: leave **empty** (creates a managed named volume; a value here would be a host
   bind mount).
4. **Destination Path**: `/workspace`.

Without this, every redeploy wipes the secret key, database, owner auth, and all tasks.

The image also sets `CC_OPENCODE_STATE_DIR=/workspace/.cc/opencode`, so the OpenCode engine's
global state — provider connections, MCP auth, sessions, and its SQLite db — lands on this same
volume and survives redeploys. Without the volume (or if you clear `CC_OPENCODE_STATE_DIR`), you
must reconnect providers after every rebuild.

> **Migrating an existing deployment.** If you already have a running instance from before this
> variable existed, its OpenCode state lives at `~/.local/share/opencode` inside the old container
> and is not on the volume. Provider connections will need to be re-added once after upgrading to
> the image that sets `CC_OPENCODE_STATE_DIR`. To preserve them instead, copy the old state onto
> the volume before the first restart:
> `mkdir -p /workspace/.cc/opencode/data && cp -a /home/node/.local/share/opencode /workspace/.cc/opencode/data/`.

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

## Preinstalled tools, and adding your own

The provided [`Dockerfile`](../Dockerfile) bakes a base toolchain into the image:

- **Node.js 24** and **npm** (from the `node:24-bookworm-slim` base)
- **git** and **gh** (GitHub CLI)
- **curl**, **ca-certificates**, **openssh-client**
- **Python 3** (`python3`, with `python` aliased to it)
- Build tooling: **g++**, **make**
- `commandscenter` (the `ccenter` CLI) and the bundled OpenCode engine

> **The container is immutable — tools you install at runtime do not survive.** Anything you add
> inside a running container with `apt-get`, `pip`, `npm install -g`, `uvx`, etc. lives only in
> that container's writable layer. It is discarded on the **next redeploy or rebuild**, which
> happens on every upgrade and on many config changes. Only the mounted `/workspace` volume
> persists.

If your agents need extra tooling (a package manager, a language runtime, a CLI), **add the
install commands to the Dockerfile** so they are baked into the image — reproducibly, and
surviving every future upgrade. Add them before the `USER node` line, where the build still runs
as root:

```dockerfile
# Add before `USER node` in the Dockerfile.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3-pip jq ripgrep \
  && rm -rf /var/lib/apt/lists/* \
  && pip install --no-cache-dir --break-system-packages uv \
  && npm install -g your-cli
```

Then redeploy so Coolify rebuilds the image with your tools included.

## Troubleshooting

| Symptom                                   | Cause                                  | Fix                                                                       |
| ----------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------- |
| `Request origin is not allowed.` on claim | `CC_PUBLIC_ORIGIN` unset or mismatched | Set it to the exact `https://` origin you browse from, no trailing slash. |
| OAuth sees HTTP or clients share limits   | `CC_TRUST_PROXY` is unset or `false`   | Set `CC_TRUST_PROXY=true` and redeploy.                                   |
| Health "degraded" for ~1 min after boot   | OpenCode engine cold start             | Normal; it becomes healthy within ~90s.                                   |
| Data lost after redeploy                  | No persistent `/workspace` volume      | Add the Volume Mount in [§4](#4-persistent-storage-required).             |
| SSL not issued                            | DNS not resolving to the server        | Point the `A` record first, then redeploy.                                |

To read logs from an exited container (Coolify's Logs tab only attaches to running containers):

```bash
docker logs "$(docker ps -a --filter name=<resource> --format '{{.Names}}' | head -1)" 2>&1 | tail -50
```
