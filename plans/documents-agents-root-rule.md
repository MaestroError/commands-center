# Documents AGENTS Root Rule Plan

1. [ ] Inspect the existing Documents AGENTS migration and confirm how seeded guide updates should reach existing workspaces.
2. [ ] Update the seeded Documents AGENTS guide text to require documents inside at least one folder under `Documents/`.
3. [ ] Add a follow-up workspace migration that updates unchanged seeded `Documents/AGENTS.md` files in existing workspaces without overwriting user edits.
4. [ ] Add or update migration tests for fresh workspaces, existing seeded guides, custom guides, reruns, and rollback behavior.
5. [ ] Run `eslint --fix` and the relevant tests before reporting completion.
