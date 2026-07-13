# OpenCode patch-version range

## Assumptions

- CommandsCenter Docker deployments intentionally install the latest CommandsCenter release.
- OpenCode patch releases within `1.16.x` should be eligible for fresh installs.
- OpenCode `1.17.x` and later minor releases require an explicit dependency update.

## Todo

- [x] Replace OpenCode caret ranges with tilde ranges in package manifests.
- [x] Refresh pnpm lockfile importer metadata without changing unrelated dependencies.
- [x] Run `eslint --fix`, typecheck, and tests.
- [x] Review and commit the complete provider-model error handling and version-range change.

## Success criteria

- Fresh installs resolve `opencode-ai` and `@opencode-ai/sdk` within `1.16.x` only.
- The repository lockfile remains consistent with the manifests.
- Validation passes and the scoped changes are committed.
