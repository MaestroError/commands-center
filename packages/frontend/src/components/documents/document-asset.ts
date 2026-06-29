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
