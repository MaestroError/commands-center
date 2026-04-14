# U3.2 Composer Enhancements & Shell Mode

## Goal

Make the composer full-featured: model selection, auto-approve, attachments, file mentions, slash commands, shell mode, and prompt history. After this sub-epic, the user has full control over how prompts are sent and can use all the advanced input mechanisms.

## Pre-Conditions

- Sub-Epic 1 (Core Chat Loop) is complete — basic chat, streaming, composer, question/permission docks all work.

## Scope

### Model Selector

- Add a model selector dropdown to the composer toolbar area.
- Populate it with connected provider models from the I1 Provider Connections integration (`GET /api/providers` or equivalent).
- Selected model is sent with the prompt request.
- Default to the agent's configured model; allow per-prompt override.

### Auto-Approve Control

- Add a toggle/control in the composer for auto-approve mode.
- When enabled, tool calls that would normally trigger the permission dock are automatically approved.
- Visual indicator of the current auto-approve state.

### File Attachments

- Add an attachment button to the composer.
- Support: file picker dialog, paste (Ctrl/Cmd+V for images), drag-and-drop onto the composer area.
- Show attached files as thumbnail previews below the composer text area.
- Allow removing individual attachments before sending.
- Attachments are sent as part of the prompt request payload (matching `sendConversationPromptInputSchema`).
- Support image files (preview as thumbnail) and document files (show filename + icon).

### `#` File Mention

- Typing `#` in the composer triggers a popover searching workspace files.
- Fuzzy search against the agent's workspace file tree.
- Selecting a file inserts the path as a styled text token in the textarea.
- On submit, file mention paths are parsed and sent as `FilePartInput` with the prompt.
- Implementation: textarea + popover approach (no contenteditable — that's deferred).

### `/` Slash Command Popover

- Typing `/` at the start of the prompt triggers a filtered popover listing available skills and built-in actions.
- Built-in actions: `/new` (start fresh), `/model` (switch model), `/compact` (compact conversation).
- Skills: populated from the agent's available skills.
- Selecting a command either: executes a client-side action (built-in), or sends via `POST /api/conversations/:id/command` (skills/custom).
- Keyboard navigation: arrow keys to highlight, Enter to select, Escape to dismiss.

### Shell Mode

- Typing `!` at the start of an empty prompt enters shell mode.
- Visual indicators: monospace font on the textarea, shell-specific placeholder text, mode badge/label.
- Submit dispatches via `POST /api/conversations/:id/shell` instead of the prompt endpoint.
- Result appears in the conversation like a normal assistant message.
- Pressing Escape exits shell mode and returns to normal prompt input.
- Popovers (`#`, `/`) are suppressed while in shell mode.

### Prompt History

- Up/Down arrow keys in an empty composer recall previous prompts.
- History is persisted in localStorage with a max of 100 entries.
- Separate history buckets for normal mode and shell mode.
- Up from empty input enters history (first previous prompt); Down returns to the draft the user was typing.
- Simple index-based navigation — no search or filtering.

## Out of Scope

- Context tool grouping and diff stats badges (Sub-Epic 3).
- Specialized per-tool renderers beyond generic cards (Sub-Epic 3).
- Right sidebar with workspace files (Sub-Epic 3).
- Mobile layout adaptations (Sub-Epic 3).
- Embedded terminal panel (not part of direct chat epic).
- Contenteditable composer with rich pills (deferred feature).
- Custom user-defined slash commands from `.opencode/command/*.md` (deferred feature).
- Followup queue (deferred feature).

## Acceptance Criteria

- The composer shows a model selector populated with connected provider models; selected model is sent with the prompt.
- Auto-approve toggle is visible and functional — when enabled, permission requests are auto-approved.
- Files can be attached via file picker, paste, or drag-and-drop; thumbnails are shown and attachments are sent with the prompt.
- `#` in the composer triggers a file search popover; selecting a file inserts it and it is sent as `FilePartInput` on submit.
- `/` at the start of the prompt opens a popover listing skills and built-in actions; selecting a command executes it.
- `!` at the start of an empty prompt enters shell mode with visual indicators; the command is executed via the shell endpoint and result appears in the conversation.
- Up/Down arrows recall previous prompts when the composer is empty; normal and shell modes have separate history.

## Key Files to Create/Modify

- `packages/frontend/src/components/chat/ChatComposer.tsx` — extend with model selector, auto-approve, attachments, shell mode toggle
- `packages/frontend/src/components/chat/` — new components:
  - `ModelSelector.tsx` — dropdown with provider models
  - `AutoApproveToggle.tsx` — toggle control
  - `AttachmentBar.tsx` — attachment previews + remove
  - `FileMentionPopover.tsx` — `#` triggered file search
  - `SlashCommandPopover.tsx` — `/` triggered command list
- `packages/frontend/src/hooks/usePromptHistory.ts` — localStorage-backed history with cursor navigation
- `packages/frontend/src/hooks/useShellMode.ts` — shell mode state management
- `packages/frontend/src/lib/file-search.ts` — workspace file fuzzy search for `#` mentions

## Reference

- OpenCode composer: `examples/opencode/packages/app/src/components/prompt-input.tsx`
- OpenCode slash popover: `examples/opencode/packages/app/src/components/prompt-input/slash-popover.tsx`
- OpenCode shell mode submit: `examples/opencode/packages/app/src/components/prompt-input/submit.ts` (lines 434-451)
- OpenCode prompt history: `examples/opencode/packages/app/src/components/prompt-input/history.ts`
- Backend shell endpoint: `POST /api/conversations/:id/shell` in `packages/backend/src/routes/conversations.ts`
- Backend command endpoint: `POST /api/conversations/:id/command` in `packages/backend/src/routes/conversations.ts`
