# CommandsCenter (cc)

A single-user, workspace-centric application for creating, managing, and interacting with isolated AI specialists through persistent direct chat. Built with Node.js, TypeScript, React, and the OpenCode AI engine.

No auth, no multi-tenancy. You install it, you run it, you own it.

## Tech Stack

| Layer    | Technologies                                        |
| -------- | --------------------------------------------------- |
| Frontend | React 19, Vite, Tailwind CSS v4, Shadcn/UI          |
| Backend  | Fastify, Drizzle ORM, Zod 4, Pino                   |
| Database | SQLite via `better-sqlite3`                         |
| AI       | OpenCode engine, MCP SDK, Composio                  |
| Testing  | Vitest, Playwright                                  |
| Tooling  | pnpm workspaces, ESLint, Prettier, Husky, GitHub CI |

Frontend contributors should start with the
[CC design-system guide](docs/design-system/README.md).

## Prerequisites

- Node.js >= 24
- pnpm (`npm install -g pnpm`)

## Quick Start

```bash
git clone <repo-url> cc
cd cc
pnpm install
pnpm dev
```

This starts both the backend (port 3000) and frontend (port 5173) dev servers.

The backend manages a single persistent `opencode serve` engine process in the background.

### OpenCode Engine

```bash
opencode serve --hostname=127.0.0.1 --port=4096
```

In CommandsCenter this command is started and monitored by the backend orchestrator.

## Production Usage

CommandsCenter production use is centered on the globally installed `ccenter` binary from the `commandscenter` npm package. Runtime state is portable and lives in the workspace directory, not in the npm package install directory.

### Environment Files

`ccenter` loads environment variables in this order:

1. Existing process environment variables win.
2. `--cc-env-file <path>` loads values from an explicit file. `ccenter start` and `ccenter serve` create the file from `.env.prod.example` first when it is missing.
3. If no `--cc-env-file` is passed, `~/.cc/.env` is loaded. `ccenter start` and `ccenter serve` create it from `.env.prod.example` on first run when missing.
4. Built-in defaults are used for optional settings.

`ccenter claim` and `ccenter claim-code` require an existing env file. Start the instance first, then use the same env file and workspace context to rotate claim/reclaim codes.

Default global layout:

```bash
~/.cc/
├── .env
└── workspace/
```

Minimal production `.env`:

```bash
NODE_ENV=production
CC_HOST=0.0.0.0
CC_PORT=3000
CC_WORKSPACE_DIR=/home/commandscenter/.cc/workspace
CC_DATA_DIR=/home/commandscenter/.cc/data
CC_SECRET_KEY=replace-with-a-long-random-secret
```

SQLite is stored at `$CC_DATA_DIR/cc.db` (default: `~/.cc/data/cc.db`). Set `CC_DATA_DIR` to move disposable runtime data to a different location. PostgreSQL primary mode is not part of the current runtime.

Set `CC_OPENCODE_STATE_DIR` to persist the managed OpenCode engine's global state (provider connections, MCP auth, sessions, and its SQLite db). When set, CommandsCenter redirects the `opencode serve` child's XDG data/config/cache/state directories under that root; leave it empty to use OpenCode's default `$HOME`-derived paths (`~/.local/share/opencode`, etc.). Docker deployments default it to `/workspace/.cc/opencode` so connections survive container rebuilds. Note that CommandsCenter terminals and task runs are children of the OpenCode process, so tools launched inside them (e.g. `gh`) also see the redirected XDG paths.

Local/stdio MCP servers use a 120-second timeout by default. Set `CC_MCP_STDIO_TIMEOUT_MS` to a positive millisecond value to override the initialization, discovery, and request timeout. Docker deployments also default npm's cache to `/workspace/.cc/npm-cache`, so cold `npx -y <package>` downloads are reused after container recreation when `/workspace` is mounted. Set `CC_NPM_CACHE_DIR` to override that location; non-Docker installs leave npm's native cache unchanged when it is unset. Restart CommandsCenter or the container after changing either value.

### Global NPM Install

```bash
npm install -g commandscenter
ccenter start
```

On first start, `ccenter` creates `~/.cc/.env` from `.env.prod.example`, generates a secure `CC_SECRET_KEY`, and stores runtime state in `~/.cc/workspace`. The web UI shows a one-time notice reminding you to save that key.

Useful commands:

```bash
ccenter --version
ccenter start --host 127.0.0.1 --port 3000
ccenter start --cc-env-file /opt/commandscenter/.env
ccenter serve --cc-env-file /opt/commandscenter/.env
ccenter claim --cc-env-file /opt/commandscenter/.env
ccenter claim-code --cc-env-file /opt/commandscenter/.env
ccenter claim --cc-env-file /opt/commandscenter/.env --format json --yes
ccenter filesystem-migrate --cc-env-file /opt/commandscenter/.env
ccenter filesystem-rollback --cc-env-file /opt/commandscenter/.env
ccenter upgrade
ccenter upgrade --rollback
```

On first start for an unclaimed workspace, startup logs print a one-time claim code and the `/claim` URL. After the workspace is claimed, startup logs do not print old claim codes. If you miss or rotate the code, run `ccenter claim` or `ccenter claim-code` with the same env file/workspace context.

Filesystem migrations upgrade portable workspace files when a new CommandsCenter version needs a new workspace structure. `ccenter start` and `ccenter serve` run pending filesystem migrations automatically before rebuilding SQLite from workspace files. Use `ccenter filesystem-migrate` for manual intervention while the service is stopped. Use `ccenter filesystem-rollback` to roll back the latest applied filesystem migration by one step, then run it again only if another rollback is needed.

Remove the global install:

```bash
npm uninstall -g commandscenter
```

Remove the workspace data too:

```bash
rm -rf ~/.cc
```

The npm uninstall removes the `ccenter` binary, but it does not delete your workspace state unless you remove the workspace directory yourself.

Version status is also exposed over HTTP:

```bash
curl http://127.0.0.1:3000/api/system/version
```

### Automatic Service Installer

The repository includes a cross-platform installer for Ubuntu/Linux with systemd and macOS with launchd. It checks for Node.js, installs missing requirements when possible, installs CommandsCenter globally, lets `ccenter` generate the production `.env` file on first service start, starts the app as a background service, generates the first owner claim code, and prints the app URLs plus filesystem locations.

Any `CC_*` variable you set when running the installer is injected into the service unit and persisted into the generated `.env` file, so a domain or other runtime setting can be configured in the one-liner itself — no manual editing and restart afterward. Pick the tier that matches your deployment.

**1. Quick (localhost):** good for trying it out, or when you will add a reverse proxy later.

```bash
curl -fsSL https://raw.githubusercontent.com/MaestroError/commands-center/main/scripts/install-ccenter-service.sh | bash
```

**2. Domain:** sets `CC_PUBLIC_ORIGIN` so login works through your domain immediately (point DNS and run a reverse proxy with HTTPS first — see [Public Domain And Reverse Proxy](#public-domain-and-reverse-proxy)).

```bash
curl -fsSL https://raw.githubusercontent.com/MaestroError/commands-center/main/scripts/install-ccenter-service.sh \
  | CC_PUBLIC_ORIGIN=https://cc.example.com bash
```

**3. Production (recommended):** dedicated system user, `/opt/commandscenter` layout, and public origin in one command.

```bash
curl -fsSL https://raw.githubusercontent.com/MaestroError/commands-center/main/scripts/install-ccenter-service.sh \
  | CCENTER_CREATE_USER=true \
    CCENTER_SERVICE_USER=commandscenter \
    CCENTER_INSTALL_DIR=/opt/commandscenter \
    CC_WORKSPACE_DIR=/opt/commandscenter/workspace \
    CCENTER_ENV_FILE=/opt/commandscenter/.env \
    CC_PUBLIC_ORIGIN=https://cc.example.com \
    bash
```

Or clone the repo first and run locally:

```bash
bash scripts/install-ccenter-service.sh
```

Gracefully stop the local runtime described by `~/.cc/.env`:

```bash
bash scripts/stop-ccenter-service.sh
```

Use a different env file when needed:

```bash
bash scripts/stop-ccenter-service.sh --env-file /opt/commandscenter/.env
```

Once the service is installed you can also manage it directly without the scripts.

macOS (launchd):

```bash
# Check whether it is running
launchctl print gui/$(id -u)/com.commandscenter.app

# Stop until the next login
launchctl stop com.commandscenter.app

# Disable auto-start at login
launchctl disable gui/$(id -u)/com.commandscenter.app

# Re-enable auto-start at login
launchctl enable gui/$(id -u)/com.commandscenter.app
```

Linux (systemd):

```bash
# Check status
sudo systemctl status commandscenter

# Stop
sudo systemctl stop commandscenter

# Disable auto-start at boot
sudo systemctl disable commandscenter

# Re-enable auto-start at boot
sudo systemctl enable commandscenter
```

Contributor-only local tarball testing is documented in [CONTRIBUTING.md](CONTRIBUTING.md#cli-build-smoke-test).

Configuration variables fall into two groups:

| Variable                                                                                                                        | Purpose                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CC_*` (e.g. `CC_HOST`, `CC_PORT`, `CC_WORKSPACE_DIR`, `CC_DATA_DIR`, `CC_PUBLIC_ORIGIN`, `CC_ALLOWED_ORIGINS`, `CC_LOG_LEVEL`) | App runtime settings. Any `CC_*` you set is injected into the service unit and written into the generated `.env`. These match the `.env` file names exactly. |
| `CCENTER_INSTALL_DIR`                                                                                                           | Install/runtime base dir (default `~/.cc`).                                                                                                                  |
| `CCENTER_ENV_FILE`                                                                                                              | Env file path (default `<install-dir>/.env`).                                                                                                                |
| `CCENTER_SERVICE_USER` / `CCENTER_SERVICE_GROUP`                                                                                | Dedicated service account to run under.                                                                                                                      |
| `CCENTER_CREATE_USER=true`                                                                                                      | Create the service user (a system account) if it does not exist, and fix ownership of the runtime dirs.                                                      |
| `CCENTER_PACKAGE_SPEC`                                                                                                          | npm spec to install (e.g. pin `commandscenter@0.8.1`).                                                                                                       |
| `CCENTER_NODE_MAJOR`                                                                                                            | Minimum Node.js major version to ensure (default `24`).                                                                                                      |

`CCENTER_HOST`, `CCENTER_PORT`, and `CCENTER_WORKSPACE_DIR` are still accepted as deprecated fallbacks for `CC_HOST`, `CC_PORT`, and `CC_WORKSPACE_DIR`.

On Ubuntu, the script writes `/etc/systemd/system/commandscenter.service`. On macOS, it writes `~/Library/LaunchAgents/com.commandscenter.app.plist`.

After the service starts and creates the env file, the installer prints the owner claim code. Keep that code and enter it on the claim screen to unlock the instance. On Linux, the installer runs the systemd unit as the installing user by default; if you override `CCENTER_SERVICE_USER`, the installer also runs the claim command as that user and passes the same `CC_WORKSPACE_DIR` used by the service. On macOS, launchd runs under the current user and `CCENTER_SERVICE_USER` is not used.

### VPS With Systemd

> For most VPS setups, the [Automatic Service Installer](#automatic-service-installer) above covers this entire flow with a single `curl | bash` command. The manual steps below are for operators who need full control over each step.

Use a global npm install plus a systemd service. Keep runtime files and `.env` in `/opt/commandscenter`.

```bash
sudo useradd --system --create-home --home-dir /opt/commandscenter --shell /usr/sbin/nologin commandscenter
sudo mkdir -p /opt/commandscenter
sudo chown -R commandscenter:commandscenter /opt/commandscenter
cd /opt/commandscenter
npm install -g commandscenter
```

The first service start creates `/opt/commandscenter/.env` from `.env.prod.example`, generates `CC_SECRET_KEY`, and stores workspace state in `/opt/commandscenter/workspace`.

Create `/etc/systemd/system/commandscenter.service`:

```ini
[Unit]
Description=CommandsCenter
After=network.target

[Service]
Type=simple
User=commandscenter
Group=commandscenter
WorkingDirectory=/opt/commandscenter
Environment=CC_HOST=127.0.0.1
Environment=CC_PORT=3000
Environment=CC_WORKSPACE_DIR=/opt/commandscenter/workspace
Environment=CC_DATA_DIR=/opt/commandscenter/data
ExecStart=/usr/bin/env ccenter start --host 127.0.0.1 --port 3000 --cc-env-file /opt/commandscenter/.env
Restart=on-failure
RestartSec=5
SuccessExitStatus=75
RestartForceExitStatus=75
KillSignal=SIGTERM
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```

Start and inspect it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable commandscenter
sudo systemctl start commandscenter
sudo systemctl status commandscenter
journalctl -u commandscenter -f
curl http://127.0.0.1:3000/api/health
```

Generate the owner claim code as the service user so the `0600` auth file remains writable by the service:

```bash
sudo -u commandscenter env CC_WORKSPACE_DIR=/opt/commandscenter/workspace ccenter claim --cc-env-file /opt/commandscenter/.env
```

Upgrade on VPS:

```bash
cd /opt/commandscenter
ccenter upgrade --cc-env-file /opt/commandscenter/.env
sudo systemctl restart commandscenter
```

When an update is applied from the running web app, CommandsCenter exits with code `75` after the package update. The service treats that as an intentional update restart: systemd records it as a successful exit and starts the service again. For manual `ccenter upgrade` runs, restart the service with `systemctl` as shown above.

Settings and CLI upgrades preflight the global npm install before mutating it. If stale npm staging directories such as `/usr/lib/node_modules/.commandscenter-*` are present, or if the active Node.js version is too old for the target package, the update is refused with cleanup instructions. Rerun the automatic service installer after cleanup if the global npm prefix needs repair.

> To expose this instance publicly over HTTPS, see [Public Domain And Reverse Proxy](#public-domain-and-reverse-proxy).

### Docker Compose

Docker images install the same global `commandscenter` npm package inside the container and run `ccenter start`. Docker installations do not self-update from inside the container. The app reports update guidance from `/api/system/version` and `/api/system/update`; the operator pulls a new image and restarts the container.

Build the image from the published npm package:

```bash
docker build -t commandscenter:local .
```

That default image stays lean and contains the CommandsCenter runtime and base development tools.
For MCP-heavy installations, the recommended opt-in Full image additionally includes `uv`/`uvx`,
a pinned Playwright CLI, and Playwright's Chromium build with its Debian runtime dependencies:

```bash
docker build -f Dockerfile.full -t commandscenter:full .
```

The Full image lets browser-based MCPs run headlessly as the unprivileged `node` user and Python
MCPs launch through `uvx` without runtime customization. Its browser runtime makes it substantially
larger than the Basic image. When using the Compose or `docker run` examples below, set their image
to `commandscenter:full` if you built this variant.

Pin a specific published version when needed:

```bash
docker build --build-arg CCENTER_PACKAGE_SPEC=commandscenter@0.2.6 -t commandscenter:0.2.6 .
```

`Dockerfile.full` pins the uv image directly in its named build stage for compatibility with Docker
builders that do not preserve global build-argument scope. Its `PLAYWRIGHT_VERSION` build argument
keeps the installed browser aligned with the global Playwright CLI. The Full image also exposes
that browser as `/usr/local/bin/chromium` so Playwright MCP releases can use it even when their
bundled Playwright version differs. Change either pinned version only after testing it.

```yaml
services:
  commandscenter:
    image: commandscenter:local
    ports:
      - "127.0.0.1:3000:3000"
    volumes:
      - ./workspace:/workspace
    environment:
      NODE_ENV: production
      CC_DOCKER: "true"
      CC_HOST: 0.0.0.0
      CC_PORT: "3000"
      CC_WORKSPACE_DIR: /workspace/.cc/workspace
      CC_DATA_DIR: /workspace/.cc/data
      # Exact browser origin you open the UI from. Required with NODE_ENV=production.
      CC_PUBLIC_ORIGIN: http://127.0.0.1:3000
      # Optional extra origins that serve the same instance (e.g. the localhost alias).
      CC_ALLOWED_ORIGINS: http://localhost:3000
      # Direct localhost access does not use a reverse proxy.
      CC_TRUST_PROXY: "false"
    restart: unless-stopped
```

> **Set `CC_PUBLIC_ORIGIN` or claims and other write requests are rejected with `Request origin is not allowed.`** With `NODE_ENV=production` the container does not auto-trust localhost; only the origins listed in `CC_PUBLIC_ORIGIN` plus `CC_ALLOWED_ORIGINS` are accepted. Origins must match exactly — `http://127.0.0.1:3000` and `http://localhost:3000` are distinct, and the scheme (`http` vs `https`) and port matter too. Set `CC_PUBLIC_ORIGIN` to the primary origin you browse from and use the comma-separated `CC_ALLOWED_ORIGINS` for aliases (for example, to accept both `127.0.0.1` and `localhost`, or a reverse-proxy alias). When exposed publicly, set `CC_PUBLIC_ORIGIN` to the exact `https://` origin.

The Compose example above is for direct localhost access. For a public company
domain behind Caddy, nginx, or another trusted reverse proxy, make these changes:

```yaml
services:
  commandscenter:
    ports:
      # Keep the container port private to the host's reverse proxy.
      - "127.0.0.1:3000:3000"
    environment:
      CC_PUBLIC_ORIGIN: https://cc.company.com
      CC_TRUST_PROXY: "true"
```

For the public-domain setup, both values are required: the origin tells CC which
URL users open, and proxy trust lets CC recover that HTTPS request and the
user's address from the trusted proxy. Do not set `true` while publishing
port 3000 on an untrusted network interface.

Prefer plain Docker without a compose file? The image built above runs the same way with `docker run`:

```bash
docker run -d --name commandscenter \
  -p 127.0.0.1:3000:3000 \
  -v "$PWD/workspace:/workspace" \
  -e CC_DOCKER=true \
  -e CC_PUBLIC_ORIGIN=http://127.0.0.1:3000 \
  -e CC_ALLOWED_ORIGINS=http://localhost:3000 \
  -e CC_TRUST_PROXY=false \
  --restart unless-stopped \
  commandscenter:local
```

That command is also for direct localhost access. For a public company domain
behind a reverse proxy, use the private host bind and enable proxy trust:

```bash
docker run -d --name commandscenter \
  -p 127.0.0.1:3000:3000 \
  -v "$PWD/workspace:/workspace" \
  -e CC_DOCKER=true \
  -e CC_PUBLIC_ORIGIN=https://cc.company.com \
  -e CC_TRUST_PROXY=true \
  --restart unless-stopped \
  commandscenter:local
```

The image already sets `NODE_ENV`, `CC_HOST`, `CC_PORT`, and the workspace/data
paths as defaults ([`Dockerfile`](Dockerfile)). Direct access needs the volume
mount and `CC_PUBLIC_ORIGIN`; a public-domain reverse-proxy deployment must also
set `CC_TRUST_PROXY=true`. With `CC_DOCKER=true`, npm packages downloaded by
`npx` are cached under `/workspace/.cc/npm-cache` on the same volume. Override
that path with `CC_NPM_CACHE_DIR` and the 120-second local MCP timeout with
`CC_MCP_STDIO_TIMEOUT_MS`, then restart the container to apply either change.

The suggested Playwright and Mermaid MCPs require the Full image in Docker. Playwright explicitly
selects Chromium and runs headlessly because Docker has no display server; the Full image supplies
its executable through `PLAYWRIGHT_MCP_EXECUTABLE_PATH`. Mermaid skips its package's runtime
`postinstall`, because Chromium and its system dependencies are already installed at image-build
time while the runtime `node` user cannot elevate privileges. Existing Mermaid configurations
created before this image should use the following Environment values, or be removed and added
again from the updated suggestion:

```text
npm_config_cache=/workspace/.cc/npm-cache
npm_config_ignore_scripts=true
PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
```

On first container start, `ccenter` creates `/workspace/.cc/.env` on the mounted volume and generates `CC_SECRET_KEY` there.

Run and verify:

```bash
docker compose up -d
docker compose logs -f commandscenter
curl http://127.0.0.1:3000/api/health
curl http://127.0.0.1:3000/api/system/version
```

Generate the owner claim code from inside the running container so it writes to the same mounted `/workspace/.cc/workspace/auth/owner-access.json` file as the server:

```bash
docker compose exec commandscenter ccenter claim --cc-env-file /workspace/.cc/.env
```

On first startup for an unclaimed mounted workspace, the container logs also print claim instructions and a one-time claim code. The code is generated at runtime from the mounted volume state; it is never baked into the Docker image.

If rotating an existing claim/reclaim code from automation, add `--yes`:

```bash
docker compose exec commandscenter ccenter claim --cc-env-file /workspace/.cc/.env --yes
```

Update Docker deployment:

```bash
docker compose pull
docker compose up -d
```

Contributor-only source-build smoke tests are documented in [CONTRIBUTING.md](CONTRIBUTING.md#cli-build-smoke-test).

### Public Domain And Reverse Proxy

When exposing CommandsCenter publicly, put it behind HTTPS and set the exact public browser origin:

```bash
CC_PUBLIC_ORIGIN=https://commands.example.com
CC_HOST=127.0.0.1
CC_PORT=3000
CC_TRUST_PROXY=true
```

Keep `CC_PUBLIC_ORIGIN` stable: it is also the OAuth issuer origin for public
MCP clients. Changing it invalidates existing OAuth client registrations and
tokens, so reset OAuth connections from the API screen and reconnect every MCP
client after an origin change.

Recommended setup sequence:

1. Start CommandsCenter on a private bind address.
2. Read the startup claim code from logs, or run `ccenter claim --cc-env-file <path>` in the same workspace context.
3. Open `https://commands.example.com/claim` and claim the workspace.
4. Use normal login afterward.

Caddy example ([install Caddy](https://caddyserver.com/docs/install)):

```caddyfile
commands.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

nginx example:

```nginx
server {
  listen 443 ssl http2;
  server_name commands.example.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

CommandsCenter still enforces owner sessions, CSRF, and origin checks even if the proxy has its own access control. In production, browser cookies are marked `Secure`; serve the public origin over HTTPS. Use `CC_ALLOWED_ORIGINS` only for additional trusted aliases, for example `https://commands-alt.example.com`.

#### What proxy trust changes

Use this rule:

- Keep `CC_TRUST_PROXY=false` when you open CommandsCenter directly using its
  own host and port, such as `http://127.0.0.1:3000`.
- Set `CC_TRUST_PROXY=true` for the normal company deployment where MCP users
  open `https://cc.company.com` and Caddy, nginx, a trusted tunnel, ingress, or
  load balancer forwards requests to CommandsCenter.

For that company deployment, the request path looks like this:

```text
MCP user browser -> HTTPS https://cc.company.com -> trusted proxy -> private HTTP -> CommandsCenter
```

Use `true` because CommandsCenter otherwise sees only the last connection: the
proxy's IP address and its private HTTP request. With `true`, CommandsCenter can
use the proxy-provided original values: the user's IP address, the public
`https` scheme, and `cc.company.com`. OAuth needs the public HTTPS information,
and OAuth rate limits should distinguish users instead of treating the
whole company as one proxy client.

It does not matter whether the site is internet-accessible, VPN-only, or
protected by company SSO. What matters is whether an HTTP reverse proxy sits
between the browser and CommandsCenter and terminates HTTPS. If it does, use
`true`. If users connect directly to CommandsCenter, use `false`.

The default is `false` because forwarded headers are just request headers and
can be faked by a client. They become trustworthy only when a known proxy is
the sole route to CommandsCenter and overwrites them. Defaulting to `false`
prevents a directly connected client from choosing its own apparent IP,
protocol, or hostname.

`CC_TRUST_PROXY` does not enable HTTPS, configure a proxy, or define the public
URL. `CC_PUBLIC_ORIGIN` remains the source of advertised browser and OAuth URLs.

| Value             | CommandsCenter behavior                                                                                                                           | Use it when                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `false` (default) | Ignores forwarded headers and uses the direct socket, request `Host`, and direct peer IP.                                                         | Users connect directly to CommandsCenter, typically for loopback or private development access. |
| `true`            | Uses forwarded protocol/host information for proxy-aware request and OAuth handling, and uses the forwarded client address for OAuth rate limits. | A trusted proxy terminates HTTPS and is the only way to reach the CommandsCenter backend.       |

With `true`, the last proxy that connects to CommandsCenter must:

- prevent untrusted networks from reaching the CommandsCenter port directly;
- preserve the public `Host` header, such as `commands.example.com`;
- overwrite `X-Forwarded-For`, `X-Forwarded-Proto`, and
  `X-Forwarded-Host`—never pass through values supplied by the original client;
- send a forwarded host and protocol that match `CC_PUBLIC_ORIGIN`.

The nginx example above deliberately sets `X-Forwarded-For` to
`$remote_addr`, replacing any client-supplied chain. If another trusted proxy
sits in front of nginx, configure nginx to accept that proxy's verified client
address safely; do not blindly preserve an arbitrary incoming
`X-Forwarded-For` chain. Boolean proxy trust means CommandsCenter trusts the
whole forwarded chain it receives—it does not maintain its own proxy-IP
allow-list.

Changing the value requires a CommandsCenter restart:

- `false` → `true`: CC begins seeing the forwarded public HTTPS scheme, host,
  and client address. This is normally required for OAuth behind a
  TLS-terminating proxy and prevents all users from sharing the proxy's rate
  limit identity.
- `true` → `false`: CC ignores forwarded headers again. This is correct for
  direct access, but behind an HTTP reverse proxy CC will see the proxy as the
  client and the private hop as HTTP, which can break OAuth browser interactions
  and make rate limits apply to the proxy rather than individual clients.

Changing only `CC_TRUST_PROXY` does not invalidate OAuth registrations or
tokens. Changing `CC_PUBLIC_ORIGIN` does.

### Public MCP Authentication

Public MCP supports automatic OAuth for interactive clients and a static
`Authorization: Bearer <API_TOKEN>` header for clients that can configure
headers. API-token revocation and permission changes apply immediately to both
methods. Credentials in URL query parameters are rejected, with no compatibility
flag to restore them. Rotate any API token that was previously stored in a URL.

See [Public MCP Authentication](docs/public-mcp-authentication.md) for client
setup, OAuth reset recovery, proxy requirements, and token-rotation guidance.

## Project Structure

```
cc/
├── packages/
│   ├── frontend/     # React 19 + Vite app
│   ├── backend/      # Fastify + Node.js server
│   ├── cli/          # CLI binary (ccenter) — bundles backend + frontend
│   └── shared/       # Shared Zod schemas, types, constants
├── docs/             # Setup and configuration guides
├── .cc/              # Runtime workspace data (portable)
└── examples/         # Reference repositories (gitignored)
```

## Documentation

| File                                                                   | Purpose                                        |
| ---------------------------------------------------------------------- | ---------------------------------------------- |
| [VISION.md](VISION.md)                                                 | Product vision, phases, architecture decisions |
| [AGENTS.md](AGENTS.md)                                                 | Coding standards, tech stack, conventions      |
| [CONTRIBUTING.md](CONTRIBUTING.md)                                     | Dev setup, commands, workflow                  |
| [docs/CLAIM.md](docs/CLAIM.md)                                         | Owner claiming and setup                       |
| [docs/mcp-configuration-flow.md](docs/mcp-configuration-flow.md)       | Per-workspace MCP configuration                |
| [docs/public-mcp-authentication.md](docs/public-mcp-authentication.md) | Public MCP OAuth and Bearer authentication     |
| [docs/deploy-coolify.md](docs/deploy-coolify.md)                       | Deploying on Coolify / Docker PaaS             |

## Releases

Releases are published to npm as the `commandscenter` package. The version in `packages/cli/package.json` is the source of truth; publishing a GitHub Release with tag `vX.Y.Z` triggers `.github/workflows/publish.yml`, which validates the tag, runs the publish gate, and runs `npm publish --access public --provenance`. See the [Releasing section in CONTRIBUTING.md](CONTRIBUTING.md#releasing) for the full flow.

## Dev Debug Panel

A floating panel available in development mode to test UI components that are hard to trigger manually (tool renderers, TodoDock, error cards, etc.).

**Toggle:** `Ctrl+Shift+D` on any chat page.

| Button        | What it injects                                                       |
| ------------- | --------------------------------------------------------------------- |
| Inject Todos  | 3 todo items — TodoDock appears above composer                        |
| Clear         | Removes all todos                                                     |
| Bash          | Completed shell command with sample output                            |
| Context Group | 3 consecutive read/glob/grep parts — collapsed "Gathered context" row |
| Error         | Bash tool with error status — red error card                          |
| Question      | Completed Q&A tool with 2 questions and answers                       |
| Task          | Explore subagent task card                                            |

Tool part buttons require at least one assistant message (they attach to the latest). Dev-only via `import.meta.env.DEV` — zero bundle impact in production.

**Source:** `packages/frontend/src/components/dev/DevDebugPanel.tsx`

## License

Licensed under the Apache License 2.0. See [LICENSE](LICENSE) for the full text.
