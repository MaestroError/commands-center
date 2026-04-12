# Deferred Chat Features

OpenCode web app features observed in `examples/opencode` that are out of scope for Phase 1. Consider adding later.

## Composer

- **Slash commands** — `/` at start of prompt opens a command menu (built-in commands, custom commands, MCP tools, skills). Consider adding later.
- **Shell mode** — `!` prefix or `Cmd+Shift+X` switches composer to monospace shell input for direct CLI execution. Consider adding later.
- **Prompt history** — Up/Down arrow keys navigate through previous prompts (100 entries, persisted separately for normal and shell modes). Consider adding later.
- **`@` mention pills** — typing `@` inserts non-editable reference pills for files and agents into the prompt. Consider adding later.
- **Contenteditable composer** — rich `contenteditable` div instead of `<textarea>`, enabling inline pills and mixed content. Consider adding later (start with plain textarea).

## Session Management

- **Session forking** — create a branch of an existing conversation to explore alternative paths. Consider adding later.
- **Session sharing** — generate a shareable URL for a conversation. Consider adding later.
- **Followup queue** — queue additional messages while the agent is busy, with Send now / Edit controls. Consider adding later.
- **Revert dock** — collapsible list of file changes the agent made, with per-item Restore buttons. Consider adding later.

## Rendering

- **Context tool grouping** — consecutive read/glob/grep/list tool calls collapsed into a single summary row (e.g., "3 reads, 2 searches"). Consider adding later.
- **Paced markdown streaming** — animated token reveal with 24ms pace and whitespace-snapping for smooth text appearance. Consider adding later (start with plain streaming append).
- **Diff viewer in tool cards** — inline before/after diff rendering for edit/write/apply_patch tool results. Consider adding later.
- **Subagent navigation** — task tool cards link to child session for inspecting subagent work. Consider adding later.

## Performance

- **Deferred turn mounting** — mount turns in batches of 3 per animation frame to avoid layout thrashing. Consider adding later.
- **CSS containment** — `content-visibility: auto` on off-screen turns for scroll performance. Consider adding later.
- **Session cache with LRU eviction** — limit how many sessions' messages are kept in memory. Consider adding later.
- **SSE event coalescing** — deduplicate rapid `message.part.updated` events within each ~16ms frame. Consider adding later.
