# U3.6 Session Settings Tab

## Goal

Add a "Settings" tab to the right sidebar that lets users view and edit the core configuration of the current agent — Model, Role, and Instructions — without leaving the chat. The tab is triggered by a gear/settings icon button and presents a compact, read-only view by default. Editing is unlocked by clicking a pencil icon, and changes are saved explicitly via a "Save" button.

## Pre-Conditions

- Sub-Epic 3 (Rich Display & Sidebar) is complete — the right sidebar with `WorkspaceLayout` context pane and tab system is working.
- The agent edit page (`AgentEditorPage`) is fully functional and its hooks (`useAgentQuery`, `useAgentMutations`, `useAgentCatalogQuery`) are stable.

## Architecture

### Data Flow

No new backend endpoints are needed. The settings tab reuses the existing agent data infrastructure:

1. `agentId` (agent slug) is already available in `WorkspaceChatPage` via URL params.
2. Frontend reads agent via `useAgentQuery(agentId)` — same hook used by `AgentEditorPage`.
3. Frontend reads catalog (for model options) via `useAgentCatalogQuery()` — same hook used by `AgentEditorPage`.
4. On save, calls `agentMutations.update.mutateAsync({ id: agent.id, input: payload })` — same mutation used by `AgentEditorPage`.
5. After a successful save, the local React Query cache is updated automatically via existing invalidation logic.

### Editable Fields (Subset of AgentEditorPage)

| Field        | Input Type      | Validation              |
|--------------|-----------------|-------------------------|
| `defaultModel` | `<select>` from `catalog.providerModels` | Required, must be in catalog |
| `role`       | `<input>` text  | Required, non-empty     |
| `instructions` | `<textarea>` (resizable) | Required, non-empty |

Fields intentionally omitted: `name`, `iconPath`, `capabilities` (skills, MCP servers, tool permissions).

### Edit Mode State Machine

```
view-only  ──[click pencil]──▶  editing
editing    ──[click Save]──────▶ saving ──[success]──▶ view-only (with success flash)
editing    ──[click Cancel]────▶ view-only (discard local changes)
saving     ──[error]───────────▶ editing (show inline error)
```

Local form state is held in component state and never persisted until "Save" is clicked.

## Scope

### Frontend — SessionSettingsTab Component

- **New file:** `packages/frontend/src/components/chat/SessionSettingsTab.tsx`
- Accepts `{ agentId: string }` as its only prop.
- Uses `useAgentQuery`, `useAgentCatalogQuery`, `useAgentMutations` — same imports as `AgentEditorPage`.
- Local state:
  - `isEditing: boolean` — false by default
  - `form: { defaultModel, role, instructions }` — initialised from `agent` data on first load and when `agent` changes while not editing
  - `errors: Partial<Record<"defaultModel" | "role" | "instructions", string>>`
  - `saveError: string | undefined`
- Renders three sections in the following order (model first, as specified):

  **1. Model section** (always first)
  - View mode: read-only label showing the model ID / label.
  - Edit mode: `<select>` listing `catalog.providerModels`. If no models, shows a "No connected models — [Manage providers]" note (same pattern as `AgentEditorPage`).

  **2. Role section**
  - View mode: read-only text.
  - Edit mode: `<input type="text">`.

  **3. Instructions section**
  - View mode: pre-wrapped text block (`whitespace-pre-wrap`).
  - Edit mode: `<textarea className="cc-input min-h-48 resize-y">`.

- **Header row:** agent name (read-only display) on the left; pencil (`✏`) icon button on the right when in view mode; "Cancel" link on the right when in edit mode.
- **Footer (edit mode only):** "Save" `<button type="submit" className="cc-button">` + disabled/loading states mirroring `AgentEditorPage`.
- Loading state while `agentQuery.isLoading || catalogQuery.isLoading`.
- Error state if either query errors.

### WorkspaceChatPage — Wire Up New Tab

- **Modified file:** `packages/frontend/src/pages/WorkspaceChatPage.tsx`
- Add a third tab entry for `"settings"` alongside `"files"` and `"media"`.
- Tab trigger: a gear/settings icon (e.g. `SettingsIcon` from the existing icon library) rendered as an icon-only button with an `aria-label="Agent settings"` tooltip — no text label, matching the design brief.
- Render `<SessionSettingsTab agentId={agentId} />` as the tab panel content.

## Component Behaviour Details

### View-Only Mode

- All three fields are rendered as plain text (not inputs).
- Font and spacing match the surrounding sidebar panels for a clean, document-like appearance.
- Pencil button in the header unlocks editing.

### Edit Mode

- Fields become interactive inputs.
- Inline field errors appear below each input on failed save attempt (same pattern as `AgentEditorPage`'s `Field` component).
- `saveError` (API-level error) shown above the Save button as a small danger-coloured message.
- "Cancel" reverts `form` to the last saved `agent` values and sets `isEditing = false` — no confirmation needed since changes are trivially recoverable.

### Save

- Validates that `defaultModel`, `role`, and `instructions` are non-empty.
- Calls `agentMutations.update.mutateAsync({ id: agent.id, input: { ...existingAgent, defaultModel, role, instructions } })` — passes through the existing agent's `name`, `iconPath`, and `capabilities` unchanged so the partial update does not accidentally clear them.
- On success: `isEditing = false`, show a brief "Saved." success flash (fade-out after 3 s, same pattern as `AgentEditorPage`'s `successMessage`).
- On error: stay in edit mode, populate `saveError`.

### Re-initialisation Guard

- Mirrors the `initializedKeyRef` pattern from `AgentEditorPage`: form is re-initialised from server data only when `agent.slug + agent.updatedAt` changes AND `isEditing === false`. This prevents losing in-progress edits if the agent query is refetched in the background.

## Out of Scope

- Editing agent `name` or `iconPath` (use the full agent editor page for that).
- Editing `capabilities` (skills, MCP servers, tool permissions).
- Per-conversation overrides (all changes go to the agent record itself).
- Optimistic updates (save is synchronous from the user's perspective).
- Conflict detection if another user edits the agent concurrently.

## Acceptance Criteria

- A settings/gear icon tab appears in the right sidebar alongside Files and Media.
- Clicking it opens the settings panel showing Model, Role, and Instructions in read-only form.
- Clicking the pencil icon switches all three fields to editable inputs.
- Model is the first field shown, above Role and Instructions.
- Model field is a dropdown limited to connected provider models.
- Clicking "Cancel" discards unsaved changes and returns to view mode.
- Clicking "Save" validates the form; on failure shows inline errors without closing the panel.
- On successful save the panel returns to view-only mode and shows a brief "Saved." confirmation.
- Agent `name`, `iconPath`, and `capabilities` are never altered by this panel.
- Loading and error states are shown while agent/catalog data is being fetched.

## Key Files to Create/Modify

- `packages/frontend/src/components/chat/SessionSettingsTab.tsx` — new component (view/edit form)
- `packages/frontend/src/pages/WorkspaceChatPage.tsx` — add `"settings"` tab wired to `SessionSettingsTab`

## Reference

- Agent form logic: `packages/frontend/src/pages/AgentEditorPage.tsx` — `createInitialForm`, `validateForm`, `handleSubmit`, `resolveInitialModelId`, `initializedKeyRef`, `Field` component
- Agent hooks: `packages/frontend/src/hooks/use-agents-query.ts` — `useAgentQuery`, `useAgentCatalogQuery`, `useAgentMutations`
- Sidebar tab structure: `packages/frontend/src/pages/WorkspaceChatPage.tsx` — existing `"files"` and `"media"` tab wiring
- Media tab (structural reference): `packages/frontend/src/components/chat/MediaTab.tsx`
