# Skill Tool Name Audit Plan

1. Inspect built-in skill instructions and backend MCP tool definitions for stale custom tool management names.
2. Update `task-planner` to require the specialist to use its generic todo list tool and follow/update the plan during execution.
3. Replace outdated global tool authoring references with the current `cc_app_create_custom_tool` flow and fix any related stale instructions.
4. Run formatting, lint, tests, and review the diff.
