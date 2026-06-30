/**
 * Resolves an image/link reference stored in document markdown into a URL the
 * browser can load.
 *
 * - `http(s):`, `data:`, and `blob:` URLs are returned unchanged.
 * - Everything else is treated as a workspace reference (optionally prefixed
 *   with `workspace:`) and routed through the asset-serving endpoint, so the
 *   markdown keeps a clean, portable reference while the editor displays the
 *   real file.
 */
export function resolveDocumentAssetUrl(originalUrl: string): string {
  const url = originalUrl.trim();
  if (!url) {
    return originalUrl;
  }
  if (isExternalUrl(url)) {
    return url;
  }

  const workspacePath = url.replace(/^workspace:/i, "").replace(/^\/+/, "");
  if (!workspacePath) {
    return originalUrl;
  }

  const params = new URLSearchParams({ path: workspacePath });
  return `/api/documents/asset?${params.toString()}`;
}

function isExternalUrl(url: string): boolean {
  return /^(https?:|data:|blob:)/i.test(url);
}

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".bmp",
  ".ico",
  ".svg",
]);

/** True when a workspace path points at an image we can render inline. */
export function isImagePath(path: string): boolean {
  const lower = path.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot === -1) {
    return false;
  }
  return IMAGE_EXTENSIONS.has(lower.slice(dot));
}

/**
 * Builds the markdown to insert when referencing a workspace file:
 * - images render inline via a portable `workspace:` reference;
 * - other files become a link (label = path) that opens in the File Manager.
 */
export function buildWorkspaceInsertMarkdown(path: string, fileManagerHref: string): string {
  const name = path.split("/").pop() ?? path;
  if (isImagePath(path)) {
    return `![${name}](workspace:${path})`;
  }
  return `[${path}](${fileManagerHref})`;
}
