# Unify chat and task-context attachment normalization

## Goal

Make attaching a file to task context equivalent to attaching the same file in
the chat prompt composer at the OpenCode boundary. Text-like files must reach
OpenCode as `text/plain`, so OpenCode expands their contents into prompt text
instead of forwarding unsupported file media types to the model provider.

## Assumptions

- "The same action" means chat prompts, task runs, template runs, and public MCP
  template runs use one MIME-resolution rule before an attachment is sent to
  OpenCode.
- The original MIME type remains portable task metadata in the workspace. A
  Markdown attachment is still stored and displayed as `text/markdown`; only
  its OpenCode transport representation becomes `text/plain`.
- The existing chat behavior is authoritative: known textual filename
  extensions are treated as `text/plain`, while images, PDFs, and unknown
  binary files retain their existing MIME behavior.
- This change requires no database or filesystem migration and no dependency.

## Design decision

Extract the prompt-attachment MIME resolver from the frontend into the explicit
`@cc/shared/lib` public API, then use it from both the chat composer and the
backend OpenCode adapter.

This small refactor is necessary to reuse the existing chat rule instead of
copying a second extension list into the backend. Normalization belongs at the
OpenCode adapter as a final invariant because public MCP and other non-UI callers
bypass the chat composer.

When the outbound MIME changes, rewrite the data URL media-type header to match
the normalized MIME. Preserve the encoded bytes, filename, CommandsCenter
attachment identity, and stored task metadata. OpenCode continues generating
its own schema-compatible part ids.

## Todo

- [x] Add a pure shared prompt-attachment MIME resolver under
      `packages/shared/src/lib/` and export it from `@cc/shared/lib`.
- [x] Move the current chat text-extension and known-media rules into the shared
      resolver without changing chat behavior.
- [x] Refactor `ChatComposer` to use the shared resolver and remove the replaced
      frontend-only MIME logic from `attachment-utils.ts`.
- [x] Normalize every attachment in `opencode-service.ts` before building an
      OpenCode file part, covering synchronous prompts, asynchronous task prompts,
      and command attachments through the existing shared builder.
- [x] Rewrite a normalized attachment's data URL header so both `mime` and `url`
      say `text/plain`; leave its base64 payload unchanged.
- [x] Keep task-context upload validation and workspace metadata unchanged, so
      `.md`, `.csv`, and `.json` retain their original canonical MIME types at rest.
- [x] Add shared unit tests for known text extensions, browser-supplied text
      subtypes, missing MIME types, non-text media, and filenames without a known
      extension.
- [x] Adapt the frontend attachment tests to prove chat still uses the shared
      rule.
- [x] Add backend regression tests proving a task-style Markdown attachment is
      posted to OpenCode as a `text/plain` file part with a matching data URL and
      unchanged content.
- [x] Add backend coverage proving JSON/CSV text files normalize consistently
      and image/PDF attachments remain unchanged.
- [x] Run ESLint with `--fix` on all changed TypeScript files.
- [x] Run the focused shared, frontend, and backend unit tests, followed by
      `pnpm typecheck` and the full `pnpm test` suite.

## Success criteria

- A `.md` attachment submitted through chat, task context, a manual template
  run, or public MCP produces the same OpenCode transport representation:
  filename preserved, MIME `text/plain`, and identical decoded contents.
- OpenCode expands those attachments as text and no model provider receives a
  `text/markdown` file part.
- Other textual task-context formats already accepted by CommandsCenter, notably
  `.csv` and `.json`, follow the same text-delivery behavior as chat.
- Images and PDFs retain their current provider-supported file behavior.
- Task workspace files and task JSON retain their original canonical MIME
  metadata; copying the workspace remains lossless.
- No provider-specific branching or OpenCode source modification is introduced.
- ESLint, typecheck, focused tests, and the full unit/integration suite pass.

## Out of scope

- Patching the vendored/example OpenCode implementation or GitHub Copilot
  provider adapters.
- Changing the task-context attachment allow-list or size limit.
- Changing attachment display labels or downloadable file metadata.
- Adding an E2E test that depends on live provider credentials; the regression
  is verified at the deterministic OpenCode request boundary instead.
