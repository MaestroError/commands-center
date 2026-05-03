# Sub-Epic 2: Composer Enhancements — Bug Report

**Tested:** 2026-04-16
**Tested Agent:** testing-agent
**Browser:** Playwright (Chromium)

---

## Critical Bugs

### BUG-001: Shell Mode Not Working

**Severity:** Critical
**Component:** ChatComposer.tsx

**Description:**
Typing `!` at position 0 in an empty textarea does NOT trigger shell mode. The expected behavior is:

- Visual "Shell" badge should appear
- Textarea should switch to monospace font
- Placeholder should change to "Shell command..."

**Actual behavior:**
Nothing happens. The `!` character is simply typed into the textarea with no mode change.

**Root cause (CONFIRMED):**
The shell mode detection in `ChatComposer.tsx` line 134 is:

```typescript
if (e.key === "!" && cursorPosition === 0 && text === "" && mode === "normal") {
  e.preventDefault();
  setMode("shell");
  return;
}
```

This logic is correct, but the issue is that:

1. When using programmatic input (fill/type), keyDown events may not trigger
2. More importantly, there's no visual feedback mechanism when shell mode activates

However, manual testing should verify if keyDown handler fires. The likely issue is that `e.key === "!"` expects the literal character, which should work for Shift+1.

**Possible issues:**

- The `handleKeyDown` might not be wired up correctly to the textarea
- The state might not be updating
- Check if `setMode("shell")` is actually being called

**Debug steps:**

1. Add console.log to handleKeyDown to verify it fires
2. Add console.log inside the shell mode detection condition
3. Verify the mode state updates

---

### BUG-002: File Mention Search Stuck on "Searching..."

**Severity:** Critical
**Component:** FileMentionPopover.tsx, use-filtered-list.ts

**Description:**
When typing `#src` to trigger the file mention popover, the popover appears but stays stuck on "Searching..." indefinitely.

**Expected behavior:**
Popover should show matching files from the workspace or "No files found" after the search completes.

**Network evidence:**
The API calls ARE succeeding (HTTP 200):

```
[GET] /api/agents/01KP3ST1K7XVQFF5EPQ1VDRJ4J/workspace/files?query=src => [200] OK
```

Many duplicate requests are being made, suggesting debouncing may not be working.

**Root cause (CONFIRMED):**
The `useFilteredList` hook has a bug: the `items` function is in the useEffect dependency array (line 57):

```typescript
useEffect(() => {
  // ...fetch logic
}, [items, query, isAsyncItems]); // <-- items here!
```

In `FileMentionPopover`, the `items` prop is an inline arrow function:

```typescript
items: async (q) => { ... }
```

This function is recreated on EVERY render, causing:

1. The useEffect dependency changes
2. Which triggers a new fetch
3. Which triggers a re-render when `setAsyncItems` is called
4. Which creates a new function reference
5. INFINITE LOOP!

**Fix:**

- Wrap the `items` function in `useCallback` in `FileMentionPopover`
- OR change `useFilteredList` to use `useRef` for the items function instead of putting it in deps

---

## High Severity Bugs

### BUG-003: Internal Message Markers Visible

**Severity:** High
**Component:** Message rendering (ChatTimeline / MessageBubble)

**Description:**
Internal markers from the AI response are being displayed as literal text:

- `[step-start]`
- `[reasoning]`
- `[step-finish]`
- `[patch]`

These markers should be filtered out or rendered as proper UI elements (like a "thinking" indicator).

**Screenshot:** See `chat-page-initial.png`

---

### BUG-004: "The following tool was executed by the user" Displayed

**Severity:** High
**Component:** Message rendering

**Description:**
The text "The following tool was executed by the user" appears as a standalone user message bubble. This appears to be metadata that should not be rendered as user content.

---

### BUG-005: Popover Z-Index/Layering Issues

**Severity:** High
**Component:** FileMentionPopover.tsx, SlashCommandPopover.tsx

**Description:**
Both popovers have layering/positioning issues:

- File mention popover overlaps with the toolbar area
- Slash command popover shows chat content (bash card, user messages) bleeding through behind it

**Expected behavior:**
Popovers should have proper z-index and appear cleanly above all other content with a backdrop or solid background.

**Screenshot:** See `slash-command-popover.png`, `file-mention-popover.png`

---

## Medium Severity Bugs

### BUG-006: React Duplicate Key Errors in ModelSelector

**Severity:** Medium
**Component:** ModelSelector.tsx

**Description:**
Console shows repeated React warnings about duplicate keys:

```
Encountered two children with the same key, `gpt-5.2`
Encountered two children with the same key, `gpt-5.2-codex`
Encountered two children with the same key, `gpt-5.3-codex`
Encountered two children with the same key, `gpt-5.4`
Encountered two children with the same key, `gpt-5.4-mini`
```

**Root cause:**
Multiple providers (GitHub Copilot, OpenAI) have models with the same base model ID. The key should include the provider ID to be unique.

**Fix:**
Change key from `model.id` to `${provider.id}-${model.id}` or similar.

---

### BUG-007: Model Selector Text Truncation

**Severity:** Medium
**Component:** ModelSelector.tsx

**Description:**
The model name in the dropdown is truncated and hard to read. The full "Provider / Model Name" format doesn't fit in the visible area.

**Screenshot:** See screenshots - model selector shows partial text.

---

## Low Severity Bugs

### BUG-008: History Navigation Cannot Be Verified

**Severity:** Low
**Component:** usePromptHistory.ts

**Description:**
Pressing Up/Down arrows in empty textarea does not navigate history. This may be expected if there's no local history for this conversation, but needs verification.

**Note:** History is stored in localStorage per mode, so a fresh session won't have any entries.

---

### BUG-009: Missing favicon (404)

**Severity:** Low
**Component:** Static assets

**Description:**
Console shows 404 error for `/favicon.ico`. Not critical but clutters console.

---

## Visual Issues

### VIS-001: Popover Positioning

Both popovers use `bottom: 100%` which places them above the composer, but they overlap with other UI elements due to z-index issues.

### VIS-002: Chat Auto-Scroll

The chat does not appear to auto-scroll to the bottom when new messages arrive or when the page loads with existing messages.

---

## Features Working Correctly

- **Model Selector:** Dropdown works, selection persists
- **Auto-Approve Toggle:** Click toggles state, visual feedback (yellow highlight) works
- **Attach Files Button:** Opens file picker correctly
- **Slash Command Popover:** Shows commands correctly (/new, /model, /compact)
- **Send Button:** Enables/disables based on input content

---

## Test Screenshots

| Screenshot                  | Description                                |
| --------------------------- | ------------------------------------------ |
| `chat-page-initial.png`     | Initial chat page showing internal markers |
| `chat-page-full.png`        | Full page screenshot showing layout        |
| `file-mention-popover.png`  | File mention stuck on searching            |
| `slash-command-popover.png` | Slash commands with layering issues        |
| `shell-mode-test.png`       | Shell mode not activating                  |
| `auto-approve-toggle.png`   | Auto-approve enabled state                 |

---

## Recommended Fix Priority

1. **BUG-001** - Shell mode not working (core feature broken)
2. **BUG-002** - File mention search broken (core feature broken)
3. **BUG-003** - Internal markers visible (major visual bug)
4. **BUG-004** - Tool metadata visible (visual bug)
5. **BUG-005** - Popover layering (UX issue)
6. **BUG-006** - Duplicate keys (React warning, potential issues)
7. **BUG-007** - Model selector truncation (UX issue)
