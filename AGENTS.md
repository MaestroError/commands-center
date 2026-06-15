# Coding Instructions

## Project Identity

**CommandsCenter (`cc`)** is a single-user, workspace-centric application for creating, managing, and interacting with isolated AI specialists through persistent direct chat. The operator installs it, runs it, and is the sole user — there is no auth, no multi-tenancy. All application state lives inside the active workspace directory so the entire system can be moved to another machine without losing context.

---

# Important notes

- Before starting editing code, always Plan changes as todo tasks and implement them one by one
- Always run linters (`eslint --fix`) and tests after finishing changes, before reporting task as done.
- Always try to use CSS classes influenced by our themes, so that changing colors inside the theme doesn't skip any component in codebase
- Before writing filesytem migration, always check `skills/write-filesystem-migration/SKILL.md` to learn how.
- Plans should be persisted as .md filesx under "plans/" directory

---

## Portable Workspace Rule

This is the single most important architectural constraint. Every feature must comply:

> The workspace filesystem is the source of truth for portable configuration and assets. SQLite is the current runtime database and may contain disposable cache/runtime state. If a user copies the workspace directory to another machine and runs the installation command, the portable configured state must be recoverable from workspace files; runtime history, provider auth state, scheduler state, and secret values may need to be recreated or re-entered.

Before implementing any feature that persists state, ask yourself: "If I copy this entire folder to a fresh machine, does everything still work?" If no, redesign.

---

## Tech Stack

These are the chosen technologies. Do not introduce alternatives without explicit approval.

### Frontend

| Concern      | Technology                                                             |
| ------------ | ---------------------------------------------------------------------- |
| Framework    | React 19, TypeScript strict mode                                       |
| Build tool   | Vite (dev: native ESM HMR, prod: Rollup code-splitting)                |
| Styling      | Tailwind CSS v4 (CSS-native config via `@theme {}`, no JS config file) |
| Components   | Shadcn/UI (copy-owned, Radix primitives underneath)                    |
| Chat UI      | `assistant-ui` (streaming text, tool calls, generative UI)             |
| File manager | SVAR React File Manager (`RestDataProvider`)                           |
| Code editor  | Monaco Editor (`@monaco-editor/react`)                                 |
| Terminal     | `xterm.js` + `xterm-addon-fit` + `xterm-addon-attach`                  |
| State        | React context + hooks (no external state library in MVP)               |

### Backend

| Concern      | Technology                                                     |
| ------------ | -------------------------------------------------------------- |
| Runtime      | Node.js (LTS)                                                  |
| Framework    | Fastify with `fastify-type-provider-zod`                       |
| Validation   | Zod 4 (all system boundaries)                                  |
| ORM          | Drizzle ORM (SQL-first, zero-dependency)                       |
| Database     | SQLite via `better-sqlite3`                                    |
| WebSockets   | `ws` (terminal streams, real-time events)                      |
| PTY          | `node-pty` (pseudo-terminal for shells)                        |
| Logging      | Pino (structured JSON, correlation IDs)                        |
| AI engine    | `opencode-ai` (npm dependency, single `opencode serve` daemon) |
| MCP          | `@modelcontextprotocol/sdk` (stdio + SSE transports)           |
| Integrations | Composio (`composio-core`) for managed OAuth                   |

### Scheduling

| Environment    | Technology                     |
| -------------- | ------------------------------ |
| Local (SQLite) | `bree` + SQLite state tracking |

### CLI Distribution

| Concern        | Technology                                                   |
| -------------- | ------------------------------------------------------------ |
| Package name   | `commandscenter` (binary: `ccenter`)                         |
| Bundler        | esbuild (single-file ESM output, `better-sqlite3` external)  |
| Static serving | `@fastify/static` (serves pre-built React app, SPA fallback) |

The CLI bundles backend + frontend into `packages/cli/dist/`. The backend exposes a `createServer()` factory; the CLI entry point (`bin.ts`) creates the server, registers static file serving, and calls `listen()`.

### Testing & Quality

| Concern            | Technology                                                                |
| ------------------ | ------------------------------------------------------------------------- |
| Unit + integration | Vitest (V8 coverage provider)                                             |
| E2E                | Playwright                                                                |
| Linting            | ESLint flat config (`eslint.config.ts`, `typescript-eslint` type-checked) |
| Formatting         | Prettier                                                                  |
| Git hooks          | Husky + `lint-staged`                                                     |
| CI                 | GitHub Actions                                                            |

---

## Development Principles

### Hierarchy of Priorities

1. **Correctness** — Does it work as specified in GOAL.md?
2. **Portability** — Does it satisfy the Portable Workspace Rule?
3. **Simplicity** — Is this the simplest solution that works?
4. **Readability** — Can another agent (or human) understand this in 30 seconds?
5. **Performance** — Is it fast enough? (Optimize only when measured)

### KISS, DRY, SOLID — Applied Pragmatically

- **KISS**: Do not over-engineer. Three similar lines are better than a premature abstraction. No helper functions for one-time operations. No feature flags or config options that nobody asked for.
- **DRY**: Extract shared logic only after it appears in 2+ places with the same shape. Premature deduplication creates coupling worse than duplication.
- **SOLID** (the parts that matter at MVP scale):
  - **Single Responsibility**: One file, one concern. A route handler should not contain business logic. A service should not construct SQL.
  - **Dependency Inversion**: Services receive their dependencies (DB client, logger, external clients) through constructor injection. This enables testing.
  - **Open/Closed**: Prefer composition over inheritance. Extend behavior by wrapping, not modifying.
  - Interface Segregation and Liskov Substitution are relevant but don't force them — apply when the design naturally calls for it.

### What NOT to Do

- Do not add comments that explain what code does. Write self-documenting code with strict types and intention-revealing names instead.
- Do not add JSDoc/TSDoc to internal functions. Only document public API surfaces of `@cc/shared` or abstraction interfaces.
- Do not add `// TODO` or `// FIXME` without a linked issue or concrete action.
- Do not add error handling for scenarios that cannot happen (e.g. validating data that was already validated by Zod at the route boundary).
- Do not introduce new dependencies without checking if an existing dependency or the standard library already solves the problem.
- Do not use `any`. Use `unknown` and narrow with type guards or Zod.
- Do not use `enum`. Use `as const` objects or Zod union literals.
- Do not use `class` unless there is a clear lifecycle to manage (e.g., the orchestrator). Prefer plain functions and modules.
- Do not use default exports. Use named exports everywhere for refactoring safety.
- Do not use inline SVG icons in React components. Always use `lucide-react` for icons — it is already installed in the frontend package.

---

## Coding Standards

### TypeScript

- Strict mode enabled (`strict: true` in tsconfig)
- No `any`, no `@ts-ignore`, no `@ts-expect-error` without an adjacent comment explaining why
- Prefer `type` over `interface` unless declaration merging is needed
- Use `satisfies` for type-checked object literals where inference should be preserved
- All function parameters and return types must be explicitly typed for public/exported functions
- Internal/private functions can rely on inference if the types are obvious

### Naming

| Thing                 | Convention                    | Example                   |
| --------------------- | ----------------------------- | ------------------------- |
| Files                 | `kebab-case.ts`               | `specialist-service.ts`   |
| React components      | `PascalCase.tsx`              | `AgentCard.tsx`           |
| Variables, functions  | `camelCase`                   | `getActiveAgent()`        |
| Types, interfaces     | `PascalCase`                  | `AgentConfig`             |
| Constants             | `SCREAMING_SNAKE`             | `MAX_RETRY_COUNT`         |
| Database tables       | `snake_case`                  | `specialist_configs`      |
| Database columns      | `snake_case`                  | `created_at`              |
| Zod schemas           | `camelCase` + `Schema` suffix | `agentConfigSchema`       |
| Route paths           | `kebab-case`                  | `/api/specialist-configs` |
| Environment variables | `SCREAMING_SNAKE`             | `CC_WORKSPACE_DIR`        |

### File Organization

- One concept per file. If a file exceeds ~250 lines, consider splitting.
- Co-locate tests next to source in the backend: `src/services/specialist-service.ts` → `test/services/specialist-service.test.ts`
- Co-locate Playwright tests in the frontend under e2e directory: `packages/frontend/e2e/`
- Group by domain, not by type. Prefer `services/specialist-service.ts` over `services/index.ts` re-exporting everything.
- No barrel files (`index.ts` that re-export) unless the package has an explicit public API (like `@cc/shared`).

### Imports

- Absolute imports within a package using tsconfig `paths` (e.g., `@/services/specialist-service`)
- Cross-package imports use the package name (e.g., `@cc/shared/schemas`)
- Order: node builtins → external packages → workspace packages → relative imports
- Let the linter enforce import order — don't manually sort

### Error Handling

- Validate at system boundaries (route handlers, WebSocket messages, env vars, LLM outputs) using Zod
- Internal code trusts validated data — no redundant validation
- Use typed error responses from Fastify's `setErrorHandler`
- Never swallow errors silently. Log them with Pino at the appropriate level
- For async operations: let errors propagate to the Fastify error handler. Do not wrap every `await` in try/catch

### Security

- Parameterized queries only (Drizzle handles this, never concatenate SQL)
- No string interpolation in shell commands (`child_process` args must be arrays)
- Zod validation on every external input before processing
- Secrets in `.env`, never in code or committed files. Maintain `.env.example` with comments to keep required secrets clear.
- `npm audit` in CI — block merges on high/critical vulnerabilities

---

## Database & Migrations

### Schema Location

All database code lives in `packages/backend/src/db/`:

```
db/
├── schema/
│   ├── agents.ts          # Internal specialist table definition
│   ├── conversations.ts   # Conversation + message tables
│   ├── tools.ts           # Custom tool definitions
│   ├── providers.ts       # Provider connections
│   ├── settings.ts        # User preferences
│   └── index.ts           # Re-exports all schemas
├── migrations/            # Generated SQL migration files
│   ├── 0001_initial.sql
│   └── meta/
├── client.ts              # SQLite DB client factory
└── seed.ts                # Development seed data
```

### Rules

- One schema file per domain entity
- Use Drizzle's SQLite schema definitions
- All tables use ULIDs as primary keys (not auto-increment) for portability
- Critical tables (conversations, audit logs) are append-only
- Every schema change produces a migration via `drizzle-kit generate`
- Do not manually add migration SQL without also updating Drizzle metadata snapshots and `_journal.json`
- If `drizzle-kit generate` repeats old changes, stop and fix stale migration metadata instead of committing the duplicate migration
- For Drizzle rename prompts, choose rename only when the same persisted data moved to a new column name; otherwise choose create/drop
- Migrations are committed to version control
- Never modify a migration that has been applied — create a new one
- `client.ts` uses `drizzle-orm/better-sqlite3` and the configured local SQLite path

### Drizzle Conventions

```typescript
// Use snake_case for table and column names
export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(), // ULID
  name: text("name").notNull(),
  role: text("role").notNull(),
  instructions: text("instructions").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

---

## Testing

### Coverage Target

**95% minimum** on statements, branches, and functions for all packages. The CI pipeline enforces this as a merge gate.

### Unit & Integration Tests (Vitest)

- Every service, utility, and non-trivial function must have tests
- Test files mirror the source structure: `src/services/foo.ts` → `test/services/foo.test.ts`
- Test the actual implementation — avoid mocks wherever possible
- When mocks are necessary (external APIs, filesystem), prefer lightweight test doubles over mocking libraries
- Use dependency injection to swap real services for test doubles
- Each test must be independent — no shared mutable state between tests
- Name tests descriptively: `it("returns empty array when specialist has no conversations")`
- **One behavior per test** — each `it()` block must test exactly one thing. If the test name contains "and" or commas listing multiple behaviors, split it into separate tests. This keeps failures precise: when a test breaks you immediately know which behavior regressed without reading the test body.
- Use `beforeAll`/`afterAll` to share expensive setup (DB, server) across tests in a `describe` block — this keeps each `it()` focused on a single assertion while avoiding redundant setup cost.

```typescript
// Bad: tests multiple behaviors in one block — if prompting fails you
// lose visibility into whether listing or start-fresh work.
it("supports opening, prompting, listing, and starting fresh", async () => {
  const opened = await server.inject({ method: "GET", url: activeUrl });
  // ... resolve assertions ...
  const prompted = await server.inject({ method: "POST", url: promptUrl, payload });
  // ... prompt assertions ...
  const listed = await server.inject({ method: "GET", url: listUrl });
  // ... list assertions ...
  const fresh = await server.inject({ method: "POST", url: freshUrl });
  // ... start-fresh assertions ...
});

// Good: one behavior per test, shared setup via beforeAll.
describe("conversation routes", () => {
  let server, specialistId;
  beforeAll(async () => {
    /* create DB, server, specialist */
  });
  afterAll(async () => {
    /* close server, cleanup DB */
  });

  it("resolves the active conversation for a specialist", async () => {
    const response = await server.inject({ method: "GET", url: activeUrl });
    expect(response.statusCode).toBe(200);
    expect(response.json().current.id).toBeDefined();
  });

  it("persists prompt request and response in the session", async () => {
    // ... setup: resolve active conversation ...
    const response = await server.inject({ method: "POST", url: promptUrl, payload });
    expect(response.statusCode).toBe(200);
    expect(response.json().messages).toHaveLength(2);
  });

  it("lists all conversations for a specialist", async () => {
    /* ... */
  });

  it("start-fresh creates a new session and preserves the previous one", async () => {
    /* ... */
  });
});
```

### E2E Tests (Playwright)

- Cover every MVP screen's critical paths
- Test real user flows: create specialist → open chat → send message → see response
- Use `data-testid` attributes for stable selectors (not CSS classes or text content)
- E2E tests run against a fully built app with a real database (SQLite for CI speed)
- Keep E2E tests focused on user flows, not implementation details

### What to Test

| Layer              | What to test                             | Tool                        |
| ------------------ | ---------------------------------------- | --------------------------- |
| Zod schemas        | Validation edge cases, error messages    | Vitest                      |
| Services           | Business logic, DB interactions          | Vitest                      |
| Route handlers     | Request/response contracts, status codes | Vitest + Fastify `inject()` |
| React components   | Rendering, user interaction, state       | Vitest + Testing Library    |
| WebSocket handlers | Message flow, connection lifecycle       | Vitest                      |
| Full user flows    | Multi-page interactions, persistence     | Playwright                  |

### What Not to Test

- Drizzle schema definitions (the ORM is the test)
- Simple type aliases or re-exports
- Third-party library behavior
- Private implementation details that are covered by higher-level tests

---

## Performance Targets

| Metric                 | Target          |
| ---------------------- | --------------- |
| First Contentful Paint | < 500ms         |
| Time to Interactive    | < 1s            |
| Animation frame rate   | 60fps           |
| Interaction latency    | < 100ms         |
| JS bundle (gzipped)    | < 200KB initial |

Heavy dependencies (Monaco, xterm.js, SVAR) must be lazy-loaded — only fetch them when the user navigates to a screen that needs them.

---

## Reference Projects

Two reference repositories are cloned in `examples/` (gitignored). Use these for learning patterns, not as direct copy sources.

### OpenWork — `examples/openwork/`

**Source:** https://github.com/different-ai/openwork

| Pattern                | Location                                | Why it matters                                                |
| ---------------------- | --------------------------------------- | ------------------------------------------------------------- |
| Orchestrator lifecycle | `apps/orchestrator/`                    | How to spawn, manage, and kill the opencode process           |
| Server architecture    | `apps/server/src/`                      | Flat Bun-based API server — study the filesystem API patterns |
| MCP integration        | `apps/server/src/mcp.ts`                | MCP server setup and tool registration                        |
| Session management     | `apps/server/src/session-read-model.ts` | How to model persistent conversations                         |
| Workspace files API    | `apps/server/src/workspace-files.ts`    | Filesystem operations exposed via REST                        |
| Event streaming        | `apps/server/src/events.ts`             | SSE event streaming to frontend                               |

### OpenCode — `examples/opencode/`

**Source:** https://github.com/anomalyco/opencode

| Pattern                | Location                                              | Why it matters                                                  |
| ---------------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| Drizzle ORM setup      | `packages/opencode/drizzle.config.ts`, `src/storage/` | Database schema design with Drizzle                             |
| Conditional DB drivers | `package.json` `"imports"` field (`#db`)              | Runtime-switched SQLite/PG — study for our dual-engine approach |
| Tool implementation    | `packages/opencode/src/tool/`                         | Paired `.ts` + `.txt` pattern for tools                         |
| Provider abstraction   | `packages/opencode/src/provider/`                     | Unified provider interface over 15+ AI providers                |
| MCP protocol           | `packages/opencode/src/mcp/`                          | Client-side MCP integration                                     |
| PTY management         | `packages/opencode/src/pty/`                          | Pseudo-terminal handling patterns                               |
| Server (Hono)          | `packages/opencode/src/server/`                       | API server with routes + middleware                             |
| Session model          | `packages/opencode/src/session/`                      | Conversation persistence                                        |

---

## Maintenance Guidelines

### Adding a New Feature

1. Define the Zod schema in `@cc/shared` if data crosses the boundary
2. Add or modify the Drizzle schema if persistence is needed → generate migration
3. Implement the backend service and route
4. Write backend tests (aim for the service layer, test routes via `inject()`)
5. Implement the frontend page/component
6. Write E2E test for the critical path
7. Run `pnpm typecheck && pnpm test && pnpm test:e2e`
8. Verify the Portable Workspace Rule is not violated

### Adding a New Dependency

1. Check if the standard library or an existing dependency solves the problem
2. Evaluate bundle size impact (use bundlephobia or similar)
3. Check maintenance status (last publish, open issues, license)
4. Add to the most specific package (not root unless it's a dev tool)
5. If it's a heavy frontend dep (editor, terminal, file manager), ensure lazy loading

### Updating the Database Schema

1. Modify the schema file in `packages/backend/src/db/schema/`
2. Run `pnpm --filter @cc/backend db:generate`
3. Review the generated migration SQL
4. Check that the generated migration does not repeat old migration changes; repeated changes mean Drizzle metadata snapshots are stale
5. If a manual migration is required, update the matching Drizzle snapshot metadata and `_journal.json` in the same change
6. Test the migration against SQLite
7. Commit the schema change, migration SQL, and migration metadata together
8. Never edit a migration that has been applied to any environment

### Updating Documentation

When making changes that affect the developer experience, update the relevant docs:

- **README.md** — Update if: quick start steps change, tech stack changes, project structure changes, prerequisites change.
- **CONTRIBUTING.md** — Update if: new commands are added, git workflow changes, new packages are added, dev setup steps change.
- **AGENTS.md** (this file) — Update if: coding conventions change, new patterns are established, tech stack entries are added/removed/replaced.
- **.env.example** — Update if: new environment variables are introduced.

### Debugging Specialist Issues

- Check Pino logs — every request has a correlation ID
- For opencode process issues, check the orchestrator's lifecycle logs
- For MCP issues, inspect the stdio/SSE transport layer
- For WebSocket issues, check both connection establishment and message flow
- Use the `examples/opencode/` repo to understand upstream API behavior

---

## Quick Reference: File → Responsibility

| You need to...               | Go to...                                                       |
| ---------------------------- | -------------------------------------------------------------- |
| Add an API endpoint          | `packages/backend/src/routes/`                                 |
| Add business logic           | `packages/backend/src/services/`                               |
| Add a DB table               | `packages/backend/src/db/schema/`                              |
| Add a migration              | `pnpm --filter @cc/backend db:generate`                        |
| Add a shared type/schema     | `packages/shared/src/schemas/` or `packages/shared/src/types/` |
| Add a UI page                | `packages/frontend/src/pages/`                                 |
| Add a UI component           | `packages/frontend/src/components/`                            |
| Add a custom hook            | `packages/frontend/src/hooks/`                                 |
| Add WebSocket logic          | `packages/backend/src/ws/`                                     |
| Add MCP server/tool          | `packages/backend/src/mcp/`                                    |
| Add orchestrator logic       | `packages/backend/src/orchestrator/`                           |
| Modify CLI entry point       | `packages/cli/src/bin.ts`                                      |
| Modify CLI build             | `packages/cli/build.ts`                                        |
| Add an E2E test              | `packages/frontend/e2e/`                                       |
| Add a unit test              | `packages/backend/test/` (mirroring `src/`)                    |
| Check product vision & scope | `GOAL.md`                                                      |
| Check dev setup & commands   | `CONTRIBUTING.md`                                              |

# Important rules for writing code

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. Reuse over code duplication

**Don't create features that already exist.**

Before writing a new feature or creating a new component, check:

- Is there any code that already does the same thing you are trying to achive?
- Can this code be reused as it is now?

If code can be reused - reuse it. If it needs some type of refactoring before reuse, ask user for confirmation explaining what type of refactoring is needed to make that chunk of code reusable.
