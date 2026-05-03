# CommandsCenter (cc)

A single-user, workspace-centric application for creating, managing, and interacting with isolated AI agents through persistent direct chat. Built with Node.js, TypeScript, React, and the OpenCode AI engine.

No auth, no multi-tenancy. You install it, you run it, you own it.

## Tech Stack

| Layer    | Technologies                                        |
| -------- | --------------------------------------------------- |
| Frontend | React 19, Vite, Tailwind CSS v4, Shadcn/UI          |
| Backend  | Fastify, Drizzle ORM, Zod 4, Pino                   |
| Database | PostgreSQL (cloud) / SQLite (local)                 |
| AI       | OpenCode engine, MCP SDK, Composio                  |
| Testing  | Vitest, Playwright                                  |
| Tooling  | pnpm workspaces, ESLint, Prettier, Husky, GitHub CI |

## Prerequisites

- Node.js >= 22
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

CommandsCenter production use is centered on the `ccenter` binary. Runtime state is portable and lives in the workspace directory, not in the npm package install directory.

### Environment Files

`ccenter` loads environment variables in this order:

1. Existing process environment variables win.
2. `--env-file <path>` loads values from an explicit file.
3. If no `--env-file` is passed, `.env` in the current working directory is loaded when present.
4. Built-in defaults are used for optional settings.

Recommended workspace layout:

```bash
/opt/commandscenter/
├── .env
└── .cc/
    └── workspace/
```

Minimal production `.env`:

```bash
NODE_ENV=production
CC_HOST=0.0.0.0
CC_PORT=3000
CC_WORKSPACE_DIR=/opt/commandscenter/.cc/workspace
CC_SECRET_KEY=replace-with-a-long-random-secret
CC_CORS_ORIGINS=https://your-domain.example
```

SQLite is used by default at `$CC_WORKSPACE_DIR/database/local.db`. Set `DATABASE_URL` only when you want PostgreSQL as the primary database.

### Global NPM Install

```bash
npm install -g commandscenter
mkdir -p ~/commandscenter
cd ~/commandscenter
ccenter start
```

Useful commands:

```bash
ccenter --version
ccenter start --host 127.0.0.1 --port 3000
ccenter start --env-file /opt/commandscenter/.env
ccenter serve --env-file /opt/commandscenter/.env
ccenter upgrade
ccenter upgrade --rollback
```

Version status is also exposed over HTTP:

```bash
curl http://127.0.0.1:3000/api/system/version
```

### VPS With Systemd

Use a global npm install plus a systemd service. Keep runtime files and `.env` in `/opt/commandscenter`.

```bash
sudo mkdir -p /opt/commandscenter
sudo chown -R "$USER":"$USER" /opt/commandscenter
cd /opt/commandscenter
npm install -g commandscenter
```

Create `/opt/commandscenter/.env`:

```bash
NODE_ENV=production
CC_HOST=127.0.0.1
CC_PORT=3000
CC_WORKSPACE_DIR=/opt/commandscenter/.cc/workspace
CC_SECRET_KEY=replace-with-a-long-random-secret
CC_CORS_ORIGINS=https://your-domain.example
```

Create `/etc/systemd/system/commandscenter.service`:

```ini
[Unit]
Description=CommandsCenter
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/commandscenter
EnvironmentFile=/opt/commandscenter/.env
ExecStart=/usr/bin/env ccenter start --env-file /opt/commandscenter/.env
Restart=on-failure
RestartSec=5
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

Upgrade on VPS:

```bash
cd /opt/commandscenter
ccenter upgrade --env-file /opt/commandscenter/.env
sudo systemctl restart commandscenter
```

`ccenter upgrade` exits after a successful package update. A process supervisor such as systemd should restart the service.

### Docker Compose

Docker installations do not self-update from inside the container. The app reports update guidance from `/api/system/version` and `/api/system/update`; the operator pulls a new image and restarts the container.

Build the image locally:

```bash
docker build -t commandscenter:local .
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
      CC_SECRET_KEY: ${CC_SECRET_KEY}
      CC_CORS_ORIGINS: https://your-domain.example
    restart: unless-stopped
```

Run and verify:

```bash
docker compose up -d
docker compose logs -f commandscenter
curl http://127.0.0.1:3000/api/health
curl http://127.0.0.1:3000/api/system/version
```

Update Docker deployment:

```bash
docker compose pull
docker compose up -d
```

### Local Production Build Test

Build and run the CLI package without publishing:

```bash
pnpm build:cli
mkdir -p /tmp/ccenter-prod-test
cd /tmp/ccenter-prod-test
node /path/to/cc/packages/cli/dist/bin.mjs start --port 3000
```

From this repository root, replace `/path/to/cc` with the absolute repo path.

## Project Structure

```
cc/
├── packages/
│   ├── frontend/     # React 19 + Vite app
│   ├── backend/      # Fastify + Node.js server
│   ├── cli/          # CLI binary (ccenter) — bundles backend + frontend
│   └── shared/       # Shared Zod schemas, types, constants
├── design/           # Screen specs, layout, themes
├── .cc/              # Runtime workspace data (portable)
└── examples/         # Reference repositories (gitignored)
```

## Documentation

| File                                 | Purpose                                   |
| ------------------------------------ | ----------------------------------------- |
| [GOAL.md](GOAL.md)                   | Product vision, features, phases          |
| [AGENTS.md](AGENTS.md)               | Coding standards, tech stack, conventions |
| [CONTRIBUTING.md](CONTRIBUTING.md)   | Dev setup, commands, workflow             |
| [PRD.md](PRD.md)                     | Product requirements                      |
| [tech-research.md](tech-research.md) | Architecture blueprint                    |

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

See [LICENSE](LICENSE) for details.
