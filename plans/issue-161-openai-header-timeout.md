# Issue 161: Managed OpenAI Header Timeout

## Goal

Give every managed specialist a portable, bounded 60-second OpenAI response-header timeout and reconcile existing workspaces that are missing or drifting from that value.

## Plan

1. Extend the strict managed `opencode.jsonc` schema in `packages/backend/src/opencode/workspace-contract.ts` with the CC-owned OpenAI provider options shape and render `provider.openai.options.headerTimeout` as `60000` for every specialist while leaving model, MCP, and permission rendering unchanged.
2. Extend the workspace-contract renderer and validation test in `packages/backend/test/opencode/workspace-contract.test.ts` to assert the exact provider configuration and successful strict validation.
3. Update `packages/backend/src/mcp/cc-managed/workspace-sync-service.ts` so a workspace is current only when that exact OpenAI provider header timeout is present; the existing rewrite path will then restore missing or stale values without changing specialist-local skills.
4. Add focused synchronization tests in `packages/backend/test/mcp/cc-managed/workspace-sync-service.test.ts` for initial rendering, missing/stale-value rewrite, preserved config, and an idempotent current-config check.
5. Add concise diagnosis and recovery instructions to `docs/runbooks/opencode-task-reliability.md`: model switching and restarting retain both the OpenAI provider timeout and session context until the rendered config is updated; recover by applying the configuration, restarting or reloading OpenCode, compacting if possible, or starting a fresh chat.
6. Run Prettier, backend-focused Vitest suites, type checking, lint with fixes, and feasible broader tests. Inspect the full diff before committing and opening a draft PR.

## Non-Goals

- Do not change retry or Stop rendering, other provider/request/chunk/task-monitor timeouts, automatic compaction, task-run behavior, or issue #160 chat-status work.
- Do not introduce a dependency or operator-facing setting.
