# CommandsCenter (cc)

A single-user, workspace-centric application for creating, managing, and interacting with isolated AI agents through persistent direct chat. Built with Node.js, TypeScript, React, and the OpenCode AI engine.

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
ccenter upgrade
ccenter upgrade --rollback
```

On first start for an unclaimed workspace, startup logs print a one-time claim code and the `/claim` URL. After the workspace is claimed, startup logs do not print old claim codes. If you miss or rotate the code, run `ccenter claim` or `ccenter claim-code` with the same env file/workspace context.

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

Run directly from GitHub (recommended for VPS setup):

```bash
curl -fsSL https://raw.githubusercontent.com/MaestroError/commands-center/main/scripts/install-ccenter-service.sh | bash
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

Useful overrides (works with both the `curl` and local forms):

```bash
curl -fsSL https://raw.githubusercontent.com/MaestroError/commands-center/main/scripts/install-ccenter-service.sh \
  | CCENTER_INSTALL_DIR=/opt/commandscenter \
    CCENTER_WORKSPACE_DIR=/opt/commandscenter/workspace \
    CCENTER_ENV_FILE=/opt/commandscenter/.env \
    CCENTER_HOST=127.0.0.1 \
    CCENTER_PORT=3000 \
    bash
```

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

> To expose this instance publicly over HTTPS, see [Public Domain And Reverse Proxy](#public-domain-and-reverse-proxy).

### Docker Compose

Docker images install the same global `commandscenter` npm package inside the container and run `ccenter start`. Docker installations do not self-update from inside the container. The app reports update guidance from `/api/system/version` and `/api/system/update`; the operator pulls a new image and restarts the container.

Build the image from the published npm package:

```bash
docker build -t commandscenter:local .
```

Pin a specific published version when needed:

```bash
docker build --build-arg CCENTER_PACKAGE_SPEC=commandscenter@0.2.6 -t commandscenter:0.2.6 .
```

```yaml
services:
  commandscenter:
    image: commandscenter:local
    ports:
      - "3000:3000"
    volumes:
      - ./workspace:/workspace
    environment:
      NODE_ENV: production
      CC_DOCKER: "true"
      CC_HOST: 0.0.0.0
      CC_PORT: "3000"
      CC_WORKSPACE_DIR: /workspace/.cc/workspace
      CC_DATA_DIR: /workspace/.cc/data
    restart: unless-stopped
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
```

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
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

CommandsCenter still enforces owner sessions, CSRF, and origin checks even if the proxy has its own access control. In production, browser cookies are marked `Secure`; serve the public origin over HTTPS. Use `CC_ALLOWED_ORIGINS` only for additional trusted aliases, for example `https://commands-alt.example.com`.

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

| File                                                             | Purpose                                   |
| ---------------------------------------------------------------- | ----------------------------------------- |
| [GOAL.md](GOAL.md)                                               | Product vision, features, phases          |
| [AGENTS.md](AGENTS.md)                                           | Coding standards, tech stack, conventions |
| [CONTRIBUTING.md](CONTRIBUTING.md)                               | Dev setup, commands, workflow             |
| [docs/CLAIM.md](docs/CLAIM.md)                                   | Owner claiming and setup                  |
| [docs/mcp-configuration-flow.md](docs/mcp-configuration-flow.md) | Per-workspace MCP configuration           |

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
