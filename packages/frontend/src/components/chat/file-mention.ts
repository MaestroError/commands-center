export function isMentionableWorkspacePath(path: string): boolean {
  return !path.split(/[\\/]/).includes("node_modules");
}

/**
 * How a mention resolves when the prompt is sent to the agent:
 * - `file` / `document`: a path inside the agent's own workspace (workspace files,
 *   or — in the global chat — the workspace-local `Documents/` folder). Emitted as
 *   a plain `#path` reference the agent reads relative to its workspace.
 * - `global-document`: a document from the shared global Documents root, mentioned
 *   from a specialist-scoped composer where a plain `#Documents/...` would instead
 *   resolve to that specialist's *private* Documents. Emitted with a distinct
 *   `#GlobalDocuments/<relative-path>` token so the agent reaches for the global
 *   document tools rather than a workspace-relative read.
 */
export type MentionKind = "file" | "document" | "global-document";

export type MentionedFile = {
  path: string;
  filename: string;
  kind?: MentionKind;
};

export type FileMentionSelection = {
  path: string;
  filename: string;
  kind: MentionKind;
};

/**
 * Path prefix (after the leading `#`) that marks a shared global-document
 * reference, distinguishing it from a workspace-relative `#path`.
 */
const GLOBAL_DOCUMENT_PATH_PREFIX = "GlobalDocuments/";

/** Prefix used to reference a shared global document from a specialist scope. */
const GLOBAL_DOCUMENT_MENTION_PREFIX = `#${GLOBAL_DOCUMENT_PATH_PREFIX}`;

export function isGlobalDocumentMention(mention: { kind?: MentionKind }): boolean {
  return mention.kind === "global-document";
}

/** Build the `#...` token inserted into the outgoing prompt for a mention. */
export function buildMentionToken(mention: { path: string; kind?: MentionKind }): string {
  if (mention.kind === "global-document") {
    return `${GLOBAL_DOCUMENT_MENTION_PREFIX}${mention.path}`;
  }
  return `#${mention.path}`;
}

/**
 * Reconstruct a mention from a `#`-stripped token path (e.g. when re-parsing a
 * saved prompt back into chips). A `GlobalDocuments/`-prefixed path becomes a
 * `global-document` mention; anything else is treated as a workspace path.
 */
export function parseMentionPath(rawPath: string, display?: string): MentionedFile {
  if (rawPath.startsWith(GLOBAL_DOCUMENT_PATH_PREFIX)) {
    const relativePath = rawPath.slice(GLOBAL_DOCUMENT_PATH_PREFIX.length);
    return {
      path: relativePath,
      filename: display ?? relativePath.split("/").pop() ?? relativePath,
      kind: "global-document",
    };
  }

  const isFolder = rawPath.endsWith("/");
  return {
    path: rawPath,
    filename: display ?? (isFolder ? rawPath : (rawPath.split("/").pop() ?? rawPath)),
    kind: "file",
  };
}

/** Serialize a list of mentions into a space-joined prompt prefix. */
export function buildMentionPrefix(mentions: { path: string; kind?: MentionKind }[]): string {
  return mentions.map(buildMentionToken).join(" ");
}
