# Task template folders

Status: implemented and verified on `codex/task-template-folders`. Base: `codex/opencode-v2-migration`.

## Intent

Make templates readable and editable by users and agents in Git, with space for
future assets. Preserve existing template IDs, API behavior, model tiers, MCP
exposure, schedules, permissions and generated-task snapshots.

## Agreed storage and editing behavior

`configuration/task-templates/<id>/task.md` contains the prompt currently stored
as `description`. `task.json` contains versioned structured configuration, without
a duplicate prompt. Both task.json and SQLite hold a reference to task.md;
the template prompt content must not be stored in SQLite. Keep stable ID directories. Preserve additional files without executing them or
automatically adding them to task context.

- Read task.md from disk when generating a task, then store its content in the
  generated task snapshot. Later edits never mutate existing task snapshots.
- Read prompt content from disk for template viewing/editing; API responses may
  carry the content without persisting it in the template database row.
- Settings remain UI/tool-first: supported updates write task.json and update
  SQLite immediately. Direct JSON edits may require a restart.
- Direct task.md edits are normal and need no restart or prompt-content cache.
  Settings-only updates must not rewrite task.md from a stale UI payload.
- Keep the current prompt editor. Add Edit as file to open the existing file
  manager and Monaco at task.md in a new tab. Creation must save the template
  before a real file link is available.
- Update management and self-service MCP template tools, including reviewed
  chat variants: use tools for settings, expose the prompt path for direct file
  editing, and keep tool-based prompt creation/update available.

## Path decision

Use workspace-relative promptPath in task.json and API responses; resolve it to
an absolute path in SQLite at reconciliation. Keep stable ID folder names.

## Findings

- Current templates are portable `<id>.json` files mirrored into SQLite at boot.
- Template creation, update, enable/disable and deletion write workspace files.
- Task generation currently reads the database template and copies its contents.
- The template form uses TaskPromptComposer; Documents has LazyMilkdownEditor
  and Files has MonacoFileEditor. Editor choice must preserve prompt-related
  capabilities rather than replacing the composer blindly.
- Boot-only reconciliation is acceptable for direct settings edits. Prompt edits
  must be read from disk at generation time, independently of reconciliation.

## Implementation checklist

- [x] Resolve portable path representation; confirm stable ID directory naming.
- [x] Define versioned folder schema and exact prompt round-trip behavior.
- [x] Add restartable, reversible filesystem migration and rollback tests using
      `skills/write-filesystem-migration/SKILL.md`; retain IDs and unknown metadata.
- [x] Update file-first CRUD and reconciliation, preserving unrecognized assets.
      Define partial-write handling and protect against concurrent UI/file edits.
- [x] Replace template DB prompt storage with its path using a generated Drizzle
      migration; hydrate prompt content only for reads and task creation.
- [x] Read current task.md for all generation paths, including scheduling and MCP.
      Missing/unreadable files must produce an actionable error, never stale snapshots.
- [x] Add Edit as file to existing template forms; preserve current editor and
      guard stale prompt saves after external edits.
- [x] Update MCP tool contracts, descriptions and applicable system prompts to
      guide settings changes through tools and prompt edits through task.md.
- [x] Verify UI/API/MCP/scheduled generation, snapshot semantics, deletion,
      conflict recovery and fresh-database restoration from workspace files.
- [x] Run lint, types, relevant unit/integration/browser checks and update docs.

## Scope exclusions

No script execution, automatic context loading, or retroactive changes to tasks
already generated. Those need separate execution and snapshot semantics later.

## Implementation notes

- New templates publish a fully staged folder by rename. Each subsequent file
  update is atomic; task.md and task.json are separate files, not a cross-file
  transaction. SQLite remains recoverable from their current contents at boot.
- UI prompt writes use a SHA-256 revision and return a conflict for changed
  content. Settings-only saves omit the prompt. MCP callers can supply the same
  expectedPromptRevision; reviewed chat updates add it automatically.
- Filesystem migration 0011 preserves IDs and unknown JSON fields, resumes when
  old/new copies match, and rejects conflicting copies. Rollback refuses to
  discard additional assets. Drizzle migration 0041 drops template description
  and adds the path; boot reconciliation resolves it for the current workspace.
- The file-manager route and existing Monaco editor are reused without changing
  their implementation. No dependencies added.

## Verification

- Package tests: 3,539 passed (backend 1,662; frontend 1,598; shared 234; CLI 45).
- Embedded browser suite: 27/28 passed in the full run; MCP assignment rename
  timed out once and passed on an isolated retry. The new Edit as file → Monaco
  save → generated snapshot flow passed.
- Design-system audit and all 56 design-system Chromium tests passed.
- Typechecks, ESLint --fix, formatting/diff checks and frontend production build
  passed. Build retains the existing large-chunk warnings.
- Verified old populated SQLite upgrade, migration/rollback/idempotency/conflicts,
  workspace relocation, exact prompt whitespace, live prompt reads, snapshot
  preservation, settings-only writes, prompt revision conflicts and MCP paths.
- Live local-workspace browser acceptance passed: create a template, edit and
  save task.md in Monaco, generate a task from the updated prompt, then change
  the template again and verify the existing task snapshot stays unchanged.
  Development servers remain available at http://127.0.0.1:4175.
