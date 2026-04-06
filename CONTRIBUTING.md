# Contributing to CommandsCenter

## Dev Setup

```bash
# 1. Clone the repo
git clone <repo-url> cc
cd cc

# 2. Install pnpm (if not already installed)
npm install -g pnpm

# 3. Install dependencies
pnpm install

# 4. Set up MCP secrets
cp .env.mcp.example .env.mcp   # then fill in your API keys
source scripts/load-env-mcp.sh

# 5. Start development servers
pnpm dev
```

The backend runs on `http://localhost:3000`, the frontend on `http://localhost:5173`.

## Available Commands

### Root-level (runs across all packages)

| Command              | Description                       |
| -------------------- | --------------------------------- |
| `pnpm dev`           | Start all dev servers in parallel |
| `pnpm build`         | Build all packages                |
| `pnpm test`          | Run unit/integration tests        |
| `pnpm test:coverage` | Run tests with V8 coverage        |
| `pnpm test:e2e`      | Run Playwright E2E tests          |
| `pnpm lint`          | Run ESLint across all packages    |
| `pnpm format`        | Check Prettier formatting         |
| `pnpm format:fix`    | Auto-fix Prettier formatting      |
| `pnpm typecheck`     | Run TypeScript type checking      |
| `pnpm clean`         | Remove build artifacts            |
| `pnpm build:cli`     | Build production CLI binary       |

### Package-specific

| Command                                 | Description                |
| --------------------------------------- | -------------------------- |
| `pnpm --filter @cc/backend dev`         | Start backend only         |
| `pnpm --filter @cc/frontend dev`        | Start frontend only        |
| `pnpm --filter @cc/backend db:generate` | Generate Drizzle migration |
| `pnpm --filter @cc/backend db:migrate`  | Run migrations             |
| `pnpm --filter @cc/backend db:push`     | Push schema to DB          |
| `pnpm --filter @cc/backend db:studio`   | Open Drizzle Studio        |

### CLI

| Command                                        | Description                    |
| ---------------------------------------------- | ------------------------------ |
| `pnpm build:cli`                               | Build CLI (frontend + backend) |
| `node packages/cli/dist/bin.mjs start`         | Run production server          |
| `node packages/cli/dist/bin.mjs start -p 4000` | Run on a custom port           |
| `node packages/cli/dist/bin.mjs --help`        | Show CLI help                  |

## Git Workflow

### Pre-commit hooks

Husky + lint-staged run automatically on every commit:

- ESLint `--fix` on `*.ts` and `*.tsx` files
- Prettier `--write` on staged files

### Pre-push hooks

TypeScript type checking runs before push.

### Branch naming

Use descriptive branch names: `feat/agent-chat`, `fix/terminal-resize`, `chore/update-deps`.

## Coding Standards

See [AGENTS.md](AGENTS.md) for the full coding style guide, including:

- TypeScript strict mode conventions
- File and naming conventions
- Error handling patterns
- Database and migration rules
- Testing requirements (90% coverage target)

## Screen Specifications

UI requirements and acceptance criteria live in `design/screens/<screen-name>/`:

- `description.md` — what the screen does
- `acceptance_criteria.md` — what must be true for it to be complete

See [design/list_screens.md](design/list_screens.md) for the full screen inventory.

## MCP Secrets

`.mcp.json` is tracked in git and uses `${VAR}` interpolation for API keys — no secrets in the repo.

1. Copy the example: `cp .env.mcp.example .env.mcp`
2. Fill in your keys in `.env.mcp` (gitignored)
3. Load into your shell: `source scripts/load-env-mcp.sh`

To auto-load every session, add to `~/.zshrc`:

```bash
[ -f ~/Projects/cc/.env.mcp ] && { set -a; source ~/Projects/cc/.env.mcp; set +a; }
```

## Adding a New Feature

1. Read the relevant `design/screens/` acceptance criteria
2. Define Zod schemas in `@cc/shared` if data crosses the boundary
3. Add or modify Drizzle schema if persistence is needed, then generate migration
4. Implement backend service and route
5. Write backend tests
6. Implement frontend page/component
7. Write E2E test for the critical path
8. Run `pnpm typecheck && pnpm test && pnpm lint`
