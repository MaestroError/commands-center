# GitHub Review Comments Skill Plan

1. Add a `github-review-comments` built-in skill under `packages/backend/resources/builtinSkills/`.
2. Instruct the skill to inspect every unresolved GitHub PR review comment or thread, classify it as relevant, not relevant, or ambiguous, and act accordingly.
3. Update catalog tests so the new skill appears in sorted order.
4. Run formatting, lint, and targeted backend tests before reporting completion.
