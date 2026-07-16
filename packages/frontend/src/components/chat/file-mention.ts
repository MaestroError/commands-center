export function isMentionableWorkspacePath(path: string): boolean {
  return !path.split(/[\\/]/).includes("node_modules");
}

/**
 * How a mention resolves when the prompt is sent to the agent:
 * - `file` / `document`: a path inside the agent's own workspace (workspace files,
 *   or — in the global chat — the workspace-local `Documents/` folder). Emitted as
 *   a plain `#path` reference the agent reads relative to its workspace.
 * - `global-document`: a document from the shared global Documents root, mentioned
 *   from a specialist-scoped composer where a workspace-relative path would instead
 *   resolve to that specialist's *private* Documents. Emitted as `#<absolutePath>`
 *   (the document's real `fullPath`) so the agent reads exactly that file rather
 *   than guessing where the global root lives.
 */
export type MentionKind = "file" | "document" | "global-document";

export type MentionedFile = {
  path: string;
  filename: string;
  kind?: MentionKind;
  /** Absolute path used for the outgoing token; set for `global-document` mentions. */
  fullPath?: string;
};

export type FileMentionSelection = {
  path: string;
  filename: string;
  kind: MentionKind;
  fullPath?: string;
};

export function isGlobalDocumentMention(mention: { kind?: MentionKind }): boolean {
  return mention.kind === "global-document";
}

/** Build the `#...` token inserted into the outgoing prompt for a mention. */
export function buildMentionToken(mention: {
  path: string;
  kind?: MentionKind;
  fullPath?: string;
}): string {
  // Global documents live outside the specialist workspace, so reference them by
  // their absolute path — the agent can read it directly without resolving where
  // the shared Documents root is.
  if (mention.kind === "global-document" && mention.fullPath) {
    return `#${mention.fullPath}`;
  }
  return `#${mention.path}`;
}

/** Serialize a list of mentions into a space-joined prompt prefix. */
export function buildMentionPrefix(
  mentions: { path: string; kind?: MentionKind; fullPath?: string }[],
): string {
  return mentions.map(buildMentionToken).join(" ");
}

/**
 * Reconstruct a mention from a `#`-stripped token path (e.g. when re-parsing a
 * saved prompt back into chips). Preserves folder paths; everything is treated as
 * a workspace path (global-document tokens are absolute file references and
 * re-hydrate as plain files, which still resolve correctly).
 */
export function parseMentionPath(rawPath: string, display?: string): MentionedFile {
  const isFolder = rawPath.endsWith("/");
  return {
    path: rawPath,
    filename: display ?? (isFolder ? rawPath : (rawPath.split("/").pop() ?? rawPath)),
    kind: "file",
  };
}
