# Preserve specialist-local skills during CommandsCenter synchronization

## Goal

Stop CommandsCenter from deleting specialist-authored skills under
`specialists/<slug>/.opencode/skills/` while retaining deterministic install,
refresh, rename, and unassignment behavior for skills managed through specialist
capabilities.

The fix must preserve the existing product distinction:

- assigned built-in and workspace skills are CC-managed copies;
- skills created with `self-skill-authoring` are durable, specialist-local files;
- `.cc/workspace/skills/` remains the portable source of truth for reusable
  workspace skills.

This change prevents future loss. It cannot reconstruct skills that an earlier
sync already deleted; those still require recovery from a backup or another
copy.

## Current behavior and cause

`writeOpenCodeWorkspace` removes the complete `.opencode/skills/` directory and
then copies only the `builtInSkills` and `workspaceSkills` selected in the
specialist capabilities. The same writer is used by specialist create/update
flows and by the startup CC-managed MCP synchronization.

That implementation assumes every entry under `.opencode/skills/` is generated
output. This conflicts with the bundled `self-skill-authoring` contract, which
directs specialists to create durable private skills in the same directory.

## Proposed ownership contract

Add a portable manifest at:

```text
specialists/<slug>/.opencode/skills/.cc-managed.json
```

Use a small versioned shape that records the installed directory slug and its
source kind:

```json
{
  "version": 1,
  "skills": [
    { "slug": "self-skill-authoring", "source": "built-in" },
    { "slug": "release-planning", "source": "workspace" }
  ]
}
```

The manifest is portable workspace metadata, not runtime database state. It
moves with the specialist and lets later syncs distinguish files CC owns from
files the specialist owns.

Ownership rules:

- A directory listed in the previous manifest is CC-managed.
- A desired capability slug is CC-managed after the current sync. Built-in
  aliases are recorded by their normalized installed slug.
- Any other directory is specialist-local and must not be modified or removed.
- If a desired managed slug already exists but is not in a previous manifest,
  the explicit capability assignment wins and CC refreshes that directory from
  its built-in/workspace source. OpenCode cannot load two skills with the same
  slug, so local and assigned versions cannot coexist under that name.
- Specialist-local skills must use slugs that do not collide with assigned
  built-in or workspace skills. Document this in `self-skill-authoring`.

## First-run and failure behavior

The first fixed version will encounter existing workspaces with no manifest.
It must favor preservation:

- Treat currently assigned capability slugs as managed and refresh them.
- Preserve every other existing directory, because CC cannot reliably
  distinguish an old unassigned generated copy from a local authored skill.
- Write the first manifest containing only the current desired managed slugs.
- Accept that an unassigned generated copy present during this one-time adoption
  may remain as an orphan. The operator can remove it manually; silently deleting
  a possible local skill would be worse.

If the manifest is missing, malformed, or has an unsupported version, use the
same preservation-first adoption behavior: do not remove unknown directories,
refresh explicit assignments, and replace the manifest with a valid current
version. The manifest contains no secret values.

Before changing managed directories, validate that every requested source skill
exists and has valid skill metadata. A missing or invalid source must fail the
sync without deleting a previously installed managed skill or changing the
manifest.

## Implementation plan

1. Add a focused managed-skill manifest contract to
   `packages/backend/src/opencode/workspace-contract.ts`.
   - Define the versioned Zod schema and a constant for `.cc-managed.json`.
   - Record normalized installed slugs plus `built-in` or `workspace` source.
   - Read a valid existing manifest when present; treat missing/invalid/future
     versions as an empty ownership set for preservation-first adoption.
   - Keep this internal to the backend workspace writer; no shared API or
     database schema is required.
   - Verify: valid manifests parse deterministically and malformed manifests
     never authorize deletion.

2. Replace whole-directory deletion with ownership-aware reconciliation.
   - Resolve and validate the complete desired skill set before any removal or
     replacement.
   - Reject duplicate installed slugs across built-in aliases and workspace
     assignments with an actionable error rather than letting copy order decide
     which skill wins.
   - Ensure `.opencode/skills/` exists without removing it.
   - Remove only directories listed in the previous valid manifest that are no
     longer desired.
   - Refresh every desired managed directory from its canonical source so
     assigned copies cannot drift.
   - Never enumerate-and-delete untracked directories or files.
   - Write the new manifest only after reconciliation succeeds, using stable
     slug ordering so repeated syncs do not create meaningless file changes.
   - Keep `AGENTS.md` and `opencode.jsonc` rendering behavior unchanged.
   - Verify: syncing the same capabilities twice produces the same managed
     skills and preserves all untracked content byte-for-byte.

3. Define safe replacement sequencing for managed directories.
   - Stage each validated source skill under a temporary sibling name inside
     `.opencode/skills/` before replacing its managed target.
   - Replace only the target slug after staging succeeds, then clean up the
     staging directory.
   - Do not use a broad recursive removal target; every removal must resolve to
     a validated managed slug beneath the skills root.
   - On an interrupted run, a later sync must be able to retry without touching
     local directories. Ignore or clean only CC's exact staging-name pattern.
   - Verify: a copy/validation failure preserves the prior target and previous
     ownership manifest.

4. Align the bundled authoring instructions with the ownership model.
   - Update `self-skill-authoring/SKILL.md` to state that local skill directories
     survive CC synchronization and must not reuse an assigned managed slug.
   - Keep `global-skill-authoring/SKILL.md` clear that assigned workspace skills
     are generated copies and should be edited at `.cc/workspace/skills/`.
   - Update the workspace contract description or nearby internal documentation
     so future code does not reintroduce the assumption that the entire skills
     directory is disposable.
   - Verify: the two authoring skills consistently explain local ownership,
     global ownership, assignment, and collision behavior.

5. Add focused regression coverage.
   - Workspace-contract test: an untracked local skill survives a managed skill
     refresh.
   - Workspace-contract test: an untracked local skill survives removal of an
     assigned managed skill.
   - Workspace-contract test: a previously manifested managed skill is removed
     after it is unassigned.
   - Workspace-contract test: first sync without a manifest preserves unknown
     directories and adopts current assignments.
   - Workspace-contract test: malformed or unsupported manifests preserve
     unknown directories.
   - Workspace-contract test: built-in aliases are tracked under their installed
     normalized slug.
   - Workspace-contract test: colliding desired built-in/workspace slugs fail
     before filesystem mutation.
   - Workspace-contract test: a missing or invalid requested source leaves the
     prior managed directory and manifest unchanged.
   - Startup-sync regression test: forcing an `opencode.jsonc` rewrite preserves
     a specialist-local skill, covering the VPS failure path directly.
   - Keep one behavior per `it()` block.

6. Run required validation after implementation.
   - Run ESLint with `--fix` on touched TypeScript files.
   - Run Prettier on the manifest-related TypeScript, tests, Markdown, and plan.
   - Run the focused workspace-contract and workspace-sync Vitest suites while
     iterating.
   - Run `pnpm typecheck`, `pnpm lint`, and `pnpm test` before reporting the fix
     complete.
   - No design-system audit or Playwright run is required because the plan has
     no frontend appearance or user-flow changes.

## Expected reconciliation examples

| Previous manifest | Existing directory | Current assignment | Result                                 |
| ----------------- | ------------------ | ------------------ | -------------------------------------- |
| none              | `designer-local`   | none               | preserve as local                      |
| none              | `writer`           | built-in `writer`  | refresh and adopt as managed           |
| managed `writer`  | `writer`           | none               | remove managed copy                    |
| managed `writer`  | modified `writer`  | built-in `writer`  | refresh from canonical source          |
| managed `writer`  | `designer-local`   | built-in `writer`  | preserve local; refresh `writer`       |
| malformed         | `designer-local`   | none               | preserve as local and rewrite manifest |

## Acceptance criteria

- Restarting CommandsCenter or rewriting a specialist workspace never removes
  an untracked specialist-local skill.
- Removing an assigned built-in or workspace skill removes its managed copy on
  the next reconciliation.
- Updating the canonical source refreshes its assigned managed copy.
- Existing installations adopt the manifest without deleting ambiguous folders.
- Missing skill sources fail before destructive changes.
- All ownership state remains inside the portable specialist workspace.
- No database migration, new dependency, frontend change, or OpenCode change is
  introduced.

## Out of scope

- Restoring skills already deleted on deployed instances.
- Exposing local skills in the CommandsCenter Skills library or specialist form.
- Promoting a local skill into a global workspace skill automatically.
- Allowing a local and assigned managed skill to share the same slug.
- Refactoring unrelated OpenCode workspace synchronization behavior.
