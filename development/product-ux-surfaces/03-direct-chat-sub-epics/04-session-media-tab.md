# U3.4 Session Media Tab

## Goal

Add a "Media" tab to the right sidebar that lists all files (images, PDFs, documents) exchanged during the current conversation. Users can preview images inline, open/download PDFs and other files, and quickly recall what was shared — similar to Facebook Messenger's media tab.

## Pre-Conditions

- Sub-Epic 3 (Rich Display & Sidebar) is complete — the right sidebar with `WorkspaceLayout` context pane and tab system is working.
- The workspace files tab exists as the first sidebar tab.

## Architecture

### Data Flow (On-Demand from OpenCode)

Attachments are **not stored** in our DB (the `url` field is stripped during sync to keep DB size down). Instead, media is fetched on-demand from OpenCode's HTTP API:

1. Frontend opens the Media tab → calls `GET /api/conversations/:id/media`
2. Backend resolves the conversation's OpenCode session ID
3. Backend calls OpenCode `GET /session/:sessionID/message` to get all messages with parts
4. Backend filters for `FilePart` entries (`type: "file"`) that have a `data:` URL
5. Backend returns a flat list of media items: `{ id, messageId, filename, mime, url, createdAt }`
6. Frontend renders the list grouped by type (images, documents, other)

This avoids storing large base64 blobs in the DB while still providing full access to all session media.

### Media Item Schema

```typescript
interface SessionMediaItem {
  id: string;           // part ID (prt_...)
  messageId: string;    // parent message ID
  filename?: string;
  mime: string;
  url: string;          // data: URL with base64 content
  createdAt: string;    // ISO timestamp from parent message
}
```

## Scope

### Backend — Media Endpoint

- New route: `GET /api/conversations/:conversationId/media`
- Fetches all messages from OpenCode for the session
- Extracts `FilePart` entries with `data:` URLs from both user and assistant messages
- Also extracts file attachments from tool call state (`part.state.attachments`)
- Returns `SessionMediaItem[]` sorted by creation time (newest first)
- Response is not cached (always fresh from OpenCode)

### Frontend — Media Tab Component

- New "Media" tab added to the right sidebar (alongside "Files" tab from Sub-Epic 3)
- Tab shows a grid/list of all media items grouped into sections:
  - **Images** — thumbnail grid, click to open full-size preview in a lightbox/modal
  - **Documents** — list with file icon, filename, and mime type; click to download
  - **Other files** — same as documents, for any non-image/non-document files
- Each item shows:
  - Thumbnail (for images) or file type icon (for documents)
  - Filename (or "Untitled" fallback)
  - Timestamp
- Empty state: "No media shared in this conversation"
- Loading state while fetching from OpenCode

### Image Preview

- Clicking an image thumbnail opens a simple modal/lightbox with the full-size image
- Modal has close button (X), click-outside-to-close, and Escape key support
- Download button in the modal

### Download Support

- All media items have a download action
- Uses the `data:` URL to create a blob and trigger `<a download>` click
- Filename preserved from the original upload

## Out of Scope

- Persistent media storage in the DB (would require schema changes and significantly increase DB size)
- Media from previous/archived sessions (only current session)
- Video/audio playback
- Drag-and-drop from media tab back into composer
- Search/filter within media tab
- Pagination (sessions rarely have hundreds of attachments)

## Acceptance Criteria

- A "Media" tab appears in the right sidebar alongside the workspace files tab
- Opening the tab fetches and displays all images and documents from the current conversation
- Images render as a thumbnail grid; clicking opens a full-size preview modal
- Documents and other files render as a list with download action
- Downloading a file preserves the original filename
- Empty state is shown when no media exists
- Loading spinner shown while fetching from OpenCode
- Media tab updates when switching conversations
- On mobile, the media tab is accessible via the same sheet/overlay as other sidebar tabs

## Key Files to Create/Modify

- `packages/backend/src/routes/conversations.ts` — add `GET /api/conversations/:id/media` route
- `packages/backend/src/services/conversation-service.ts` — add `getMedia()` method
- `packages/backend/src/lib/message-mapper.ts` — add `extractMediaItems()` helper (reuses `FilePart` extraction logic but preserves `url`)
- `packages/shared/src/schemas/conversations.ts` — add `SessionMediaItem` schema
- `packages/frontend/src/lib/api.ts` — add `fetchConversationMedia()` API call
- `packages/frontend/src/components/chat/MediaTab.tsx` — media grid/list component
- `packages/frontend/src/components/chat/ImageLightbox.tsx` — full-size image preview modal
- `packages/frontend/src/pages/WorkspaceChatPage.tsx` — wire Media tab into sidebar

## Reference

- OpenCode file part handling: `examples/opencode/packages/app/src/utils/prompt.ts` (lines 82-110)
- OpenCode FilePart schema: `examples/opencode/packages/sdk/openapi.json` (`FilePart`, `FilePartInput`)
- Our attachment extraction: `packages/backend/src/lib/message-mapper.ts` (`extractAttachments`, `sanitizePart`)
- Facebook Messenger media tab UX: grouped by media type, thumbnail grid for images, list for documents
