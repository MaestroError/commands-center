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

### Production (CLI)

```bash
npm install -g commandscenter
ccenter start
```

Or build and run locally:

```bash
pnpm build:cli
node packages/cli/dist/bin.mjs start --port 3000
```

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

## License

See [LICENSE](LICENSE) for details.
