# U6 Custom Skills Library

## Outcome

The user can create reusable workspace-local custom skills, browse them alongside curated built-in skills, assign them to agents, and have CC materialize the selected skills into each agent workspace the same way built-in skills and custom tools are materialized today.

## Why this is a separate PR

This extends the existing skills system from a code-owned curated library into a user-authored portable workspace capability. It adds its own data model, CRUD UI, workspace storage rules, and agent editor integration.

## Blockers

- U2 Agents and Agent Editor
- C2 Agent Workspace Lifecycle
- E5 OpenCode Workspace Contract

## Unblocks

- Better direct-chat slash-command customization per agent
- Reusable project-specific instructions that should travel with the workspace

## Decision

- Keep curated built-in skills exactly as they are today: code-owned assets shipped with CC.
- Add a second skill source for user-authored skills stored inside `.cc/workspace/skills/`.
- At agent create/edit time, materialize both selected built-in skills and selected workspace skills into the agent's `.opencode/skills/` directory.
- Do not register skills through `opencode.jsonc`; skills remain file-based OpenCode workspace assets.

## Approach

### Two Skill Sources

- Curated built-in skills remain in the codebase and are discovered exactly as they are today.
- Workspace skills are user-authored assets stored inside `.cc/workspace/skills/`.
- The agent editor should present a unified skills selection experience, but preserve source metadata so CC knows whether a skill comes from the built-in catalog or the workspace catalog.

### Workspace Skill Storage

- Store each custom skill in its own directory under `.cc/workspace/skills/<slug>/`.
- Follow the same OpenCode skill directory shape as built-in skills, including `SKILL.md` and any additional skill files needed by OpenCode.
- Validate workspace skills using the same contract rules already applied to built-in skills where possible.
- Treat `.cc/workspace/skills/` as the portable source of truth for user-authored skills.

### Agent Materialization

- On agent create/edit, CC rewrites the agent's `.opencode/skills/` directory.
- Copy in only the selected skills for that agent.
- Materialize built-in skills from the curated code-owned skill root.
- Materialize workspace skills from `.cc/workspace/skills/`.
- Keep the existing ownership model: CC owns the generated `.opencode/skills/` directory contents and can safely regenerate them on each save.

### Why This Matches The Existing Model

- Skills are already file-based OpenCode assets.
- CC already rewrites `.opencode/skills/` for built-in skills.
- Extending the same pattern to workspace skills avoids introducing a second runtime or registration model.
- The same portability guarantees naturally apply because the user-authored skills live inside `.cc/workspace/`.

## Scope

### Workspace Skill CRUD

- Add CRUD for user-authored workspace skills
- Persist workspace skills under `.cc/workspace/skills/`
- Validate required skill structure and frontmatter
- Support editing `SKILL.md` content and any metadata surfaced in the UI

### Skills Browser Update

- Update the skills browser to show both curated built-in skills and workspace-authored skills
- Clearly label the skill source (`Built-in` vs `Workspace`)
- Support search/filter across both sources
- Preserve the existing built-in skills browsing experience

### Agent Editor Integration

- Allow selecting both built-in and workspace skills in the agent editor
- Persist selected workspace skill identifiers alongside selected built-in skill identifiers
- Regenerate `.opencode/skills/` on save using both sources
- Dispose/reload the affected OpenCode instance after skill changes so the next session load sees the updated workspace state

## Acceptance Criteria

- The user can create, edit, and delete workspace-local custom skills
- Workspace skills are stored under `.cc/workspace/skills/` and move with the workspace
- The skills browser shows both curated built-in skills and workspace skills with clear source labeling
- The agent editor allows selecting workspace skills in the same flow as built-in skills
- Saving an agent rewrites `.opencode/skills/` with the selected built-in and workspace skills only
- Existing curated built-in skills continue to work unchanged
- Workspace skill updates are picked up after affected OpenCode instances are disposed/reloaded
- Mobile layouts work for the skills browser, workspace skill CRUD UI, and agent editor skill selection UI

## Non-Goals

- Replacing or moving curated built-in skills into `.cc/workspace/`
- Registering skills through MCP or `opencode.jsonc`
- Custom tools (covered by I3)
- Slash command UX redesign beyond exposing the newly available skills
