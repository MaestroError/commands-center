/**
 * Builds the in-app Documents module href for a document path.
 *
 * Accepts either a path relative to the `Documents/` folder (e.g.
 * "design/overview.md") or a workspace-relative path that includes the
 * `Documents/` prefix (e.g. "Documents/design/overview.md"). Leading slashes
 * and a `Documents/` prefix are stripped so the resulting `path` query param is
 * always relative to the Documents root.
 */
export function buildDocumentHref(link: string): string {
  const relativePath = link.replace(/^\/+/, "").replace(/^Documents\//, "");
  return `/documents?path=${encodeURIComponent(relativePath)}`;
}
