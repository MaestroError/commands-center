# I3 Custom Tools Platform

## Outcome

The user can manage a portable global library of custom OpenCode tools, copy selected tools into agent workspaces, inspect both global and agent-local tools from CC, and use the file manager as the editing surface for tool implementation.

## Why this is a separate PR

This is a complete capability area with its own portable file contract, discovery/indexing rules, backend management flows, agent assignment flows, and management UI.

## Blockers

- C2 Agent Workspace Lifecycle
- U4 File Manager and Terminals
- I2 Integrations and MCP Management (for agent editor permission patterns and save flows)

## Unblocks

- No hard blockers downstream. Extends the agent editor and adds a reusable workspace tool library.

## Decision

- Do not build a dedicated CC-managed custom-tools MCP server for MVP.
- Do not build a wrapper system for MVP.
- Do not add custom-tool dependency installation management for MVP.
- Use OpenCode's native custom tool loading model instead: OpenCode discovers JavaScript/TypeScript tools from `.opencode/tools/` inside the active workspace.
- Store reusable global custom tools under `.cc/workspace/custom-tools/` so they remain portable with the workspace.
- Treat global tools as reusable source assets and agent tools as copied snapshots.
- Use the file manager as the editing surface for custom tool code; the custom tools page is a discovery, creation, assignment, and inspection surface.

## Approach

### Global Source Of Truth

- Store reusable global custom tools under `.cc/workspace/custom-tools/`.
- Each global custom tool lives in its own directory under `.cc/workspace/custom-tools/<slug>/`.
- Each tool directory contains the tool entry file and a lightweight CC metadata file used for discovery and rendering.
- Persist tool metadata in DB for search, assignment, and API usage, but keep the portable filesystem copy under `.cc/workspace/custom-tools/` as the durable source of truth.

### Tool Directory Contract

- Each tool directory must contain a CC-owned metadata file such as `cc-tool.json`.
- The metadata file should include at minimum:
  - tool name
  - slug
  - entry file name
  - short description
  - optional notes/status fields needed for UI rendering
- The metadata file should also include a content fingerprint for the global tool snapshot so CC can detect whether copied agent versions still match the source.
- The metadata file exists so CC can render tools safely without importing arbitrary user code at list time.
- MVP should standardize on one tool entry file per tool directory.
- MVP should avoid CC-managed multi-export authoring support; one tool maps to one entry file and one primary tool name.

### Fingerprint And Drift Contract

- CC should compute a deterministic fingerprint from the tool snapshot contents.
- The fingerprint should cover the entry file and any CC-managed adjacent support files that are part of the copied tool snapshot.
- The fingerprint should not depend on file mtimes or absolute paths.
- When a global tool is copied into an agent workspace, CC should write CC-owned metadata alongside the copied version so the agent copy records:
  - source global tool slug
  - source fingerprint at copy time
  - copied-at timestamp
  - ownership marker indicating the copy was created by CC
- Drift status should be derived from fingerprints:
  - if source fingerprint equals copied fingerprint, the agent copy is `matching`
  - if the global fingerprint changed after copy and the agent copy fingerprint still matches the old copied fingerprint, the agent copy is `outdated`
  - if the current agent copy fingerprint differs from both the source fingerprint and the recorded copied fingerprint, the agent copy is `modified`
  - if required metadata is missing, the status is `unknown` and CC should avoid destructive assumptions
- The tools page and agent editor should use these statuses to explain the relationship between global and agent-local copies.

### Editing Model

- The custom tools page is not a full code editor.
- Creating a tool from the custom tools page asks for a tool name, creates a starter directory and template files, then redirects the user to the file manager with that tool opened.
- Editing an existing tool from the custom tools page redirects the user to the file manager for that tool directory.
- The file manager remains the primary surface for editing tool source, helper files, and any adjacent assets.

### Agent Assignment Model

- Assigning a global custom tool to an agent copies the current global tool snapshot into the agent workspace using an OpenCode-compatible layout.
- The agent workspace must receive a top-level entry file directly under `.opencode/tools/`, such as `.opencode/tools/<slug>.ts`, because OpenCode discovers tool entry files from that path.
- If a tool has helper files, CC may copy adjacent support files under a matching folder such as `.opencode/tools/<slug>/`, while keeping the executable entry file at the top level.
- Removing a custom tool from an agent removes the CC-managed copied entry file and any adjacent CC-managed support files for that tool.
- Agent tools are snapshots, not live-linked wrappers.
- Global tool changes do not automatically fan out to already-assigned agents in MVP.
- Agent-local edits do not automatically update the global library in MVP.

### Tools Page Responsibilities

- Show the global custom tools library.
- Support search, inspection, and quick metadata review.
- Support creating a new tool from a starter template.
- Support opening a global tool in the file manager.
- Support copying a global tool into one or more agents.
- Support importing or moving agent-local tools back into the global library.
- Show whether a tool is global-only, agent-only, or exists in both places.

### Agent Editor Responsibilities

- Show global custom tools as assignable items.
- Show agent-local custom tools currently present in the agent workspace.
- Allow adding a global tool to the agent by copying it into the workspace.
- Allow removing a CC-managed copied tool from the agent workspace.
- Warn when adding a tool would overwrite an existing tool with the same name in the agent workspace.

### Move And Copy Flows

- **Copy global to agent:** copy the current global tool snapshot into the chosen agent workspace using the OpenCode-compatible agent layout.
- **Copy agent to global:** copy an agent-local tool into the global library so it becomes reusable elsewhere.
- **Move agent to global:** copy an agent-local tool into the global library, then remove it from the agent workspace after confirmation.
- **Replace existing version:** when the destination already contains a tool with the same name or slug, require explicit overwrite confirmation.
- CC should block duplicate tool creation in the same scope.

### Divergence Awareness

- Because global and agent tools are copied snapshots, CC should make divergence visible instead of hiding it.
- When a global tool has been copied into one or more agents, the tools page should communicate that those agents may now be using older copies.
- When an agent-local tool differs from the global tool with the same name/slug, CC should surface that the agent version has diverged.
- The user should see enough status to understand whether they are viewing:
  - only a global tool
  - only an agent-local tool
  - matching global and agent copies
  - outdated agent copy
  - modified agent copy
  - unknown relationship
- MVP does not need automatic merge or sync. It only needs clear status, timestamps or revision hints, and explicit actions such as `Copy to agent`, `Copy to global`, `Move to global`, or `Replace existing`.

### Duplicate And Collision Rules

- There cannot be two global tools with the same CC tool name or slug.
- There cannot be two CC-managed copies of a tool with the same name or slug inside the same agent workspace.
- There cannot be two agent entry files that would produce the same OpenCode tool name.
- CC should warn when a custom tool name collides with a known built-in OpenCode tool name because custom tools can override built-ins.
- Overwrite operations must always be explicit.

### Reload Behavior

- Assume local custom tool changes require agent workspace disposal/reload.
- After tool assignment changes, removal, import, move, or overwrite into an agent workspace, dispose the affected OpenCode instance so the next session load re-reads the workspace tool files.
- Do not depend on MCP `listChanged` behavior for local tool files.

### Built-In Guidance Skill

- Provide a built-in skill that teaches agents how to create and maintain OpenCode custom tools in this project.
- The skill should describe the required file layout, metadata file contract, naming constraints, and the difference between global library tools and agent-local copied tools.
- This allows the user to ask an AI agent to author tools instead of always creating them manually.

## Scope

### Global Tool Library

- Add a portable global custom-tools library under `.cc/workspace/custom-tools/`
- Define the `cc-tool.json` metadata contract for discovery and rendering
- Add backend discovery/indexing for global custom tools
- Persist metadata in DB for search and assignment flows
- Define the agent-side copy layout so global tool directories become valid `.opencode/tools/*.ts|js` entries after assignment
- Define deterministic fingerprint generation for tool snapshots and agent-copy metadata for drift detection

### Custom Tools Page

- Build a custom tools screen for discovery, search, and inspection
- Support creating a new tool by collecting a name, creating a starter template, and redirecting to the file manager
- Support opening an existing global tool in the file manager
- Support copying a global tool into selected agents
- Support copying or moving agent-local tools into the global library
- Surface overwrite warnings and duplicate-name conflicts
- Surface status that explains when agent copies may differ from the global version

### Agent Tool Assignment

- Add a custom tools section to the agent editor
- Show global tools available to add
- Show agent-local tools currently present in the workspace
- Copy selected global tools into `.opencode/tools/` on save using top-level entry files compatible with OpenCode discovery
- Remove deselected CC-managed tool copies on save
- Leave non-CC-managed user-authored tool files untouched where ownership is ambiguous
- Dispose/reload affected OpenCode instances after agent tool changes

### File Manager Integration

- Open tool directories directly in the file manager from the custom tools page
- Redirect to the newly created tool folder after tool creation
- Reuse the file manager as the editing experience instead of building a dedicated custom-tools code editor in this epic

### Drift And Status Visibility

- Show which agents currently have copies of a global tool
- Show when an agent-local tool has diverged from the matching global tool
- Distinguish at least `matching`, `outdated`, `modified`, and `unknown` states using CC fingerprints and copy metadata
- Provide explicit user actions to replace agent copies from global or promote agent copies to global
- Inform the user that copied tools do not sync automatically in MVP

### Built-In Tool Authoring Skill

- Add a built-in skill that explains how to author custom tools for CC/OpenCode using the supported folder contract

## Acceptance Criteria

- The user can create a global custom tool from the custom tools page by entering a name, generating starter files, and being redirected to the file manager
- The user can inspect and search global custom tools from the custom tools page
- The user can open a global custom tool in the file manager for editing
- Global custom tools are stored under `.cc/workspace/custom-tools/` so they move with the workspace
- The user can copy a global custom tool into one or more agents
- The agent editor shows global custom tools as assignable items and shows currently available agent-local tools
- Saving an agent copies selected global tools into that agent workspace and removes deselected CC-managed copies
- The user can copy or move an agent-local tool back into the global library from the custom tools page
- When a copy or move would overwrite an existing tool with the same name or slug, the user is warned and must confirm before proceeding
- The UI clearly informs the user when global and agent tool copies may differ, shows fingerprint-based relationship status, and explains that changes do not sync automatically in MVP
- A built-in skill exists that explains how to create custom tools that fit this platform's contract
- The custom tools screen and agent editor custom tools section adapt correctly to mobile viewports

## References

- `design/screens/custom-tools/acceptance_criteria.md`
- `design/screens/custom-tools/description.md`
- `development/product-ux-surfaces/02-agents-and-agent-editor.md`
- `development/core-data-state/02-agent-workspace-lifecycle.md`
- `development/product-ux-surfaces/04-file-manager-and-terminals.md`
- `examples/opencode/packages/opencode/test/tool/registry.test.ts` — confirms OpenCode loads tools from `.opencode/tools/`
- `https://opencode.ai/docs/custom-tools/` — OpenCode custom tools documentation

## Non-Goals

- Dedicated CC-managed custom-tools MCP server for MVP
- Live-linked wrapper-based tool propagation from global library to agents
- Automatic synchronization or merge between global and agent-local tool copies
- CC-managed dependency installation for custom tools in MVP
- Dedicated custom-tools code editor outside the file manager
- Scheduling or cron execution (owned by I4)
