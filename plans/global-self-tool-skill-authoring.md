# Global And Self Authoring Skill Plan

1. Rename global authoring built-in skills from `custom-*` to `global-*` so their scope is explicit.
2. Add `self-tool-authoring` for specialist-local OpenCode tools under the current specialist workspace without touching global CommandsCenter tools.
3. Update built-in catalog tests and any skill cross-references to use the new names.
4. Run formatting, `eslint --fix`, and tests, then review the diff.
