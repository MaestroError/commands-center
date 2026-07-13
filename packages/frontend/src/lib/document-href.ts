import type { DocumentScope } from "@cc/shared/schemas";

/**
 * Builds the in-app Documents module href for a document path.
 *
 * Accepts either a path relative to the `Documents/` folder (e.g.
 * "design/overview.md") or a workspace-relative path that includes the
 * `Documents/` prefix (e.g. "Documents/design/overview.md"). Leading slashes
 * and a `Documents/` prefix are stripped so the resulting `path` query param is
 * always relative to the Documents root.
 *
 * Private documents live in a specialist's private workspace rather than the
 * shared module, so their href carries `scope=private&owner=<slug>` to point
 * the Documents page at the correct root.
 */
export function buildDocumentHref(
  link: string,
  options?: { scope?: DocumentScope | null; ownerSlug?: string | null },
): string {
  // Document artifact links may be stored with Windows-style backslashes (the
  // backend normalizes these when resolving on disk). The Documents page/API
  // only accept `/`-separated paths, so canonicalize before building the query.
  const relativePath = link
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^Documents\//, "");
  const scopePrefix =
    options?.scope === "private" && options.ownerSlug
      ? `scope=private&owner=${encodeURIComponent(options.ownerSlug)}&`
      : "";
  return `/documents?${scopePrefix}path=${encodeURIComponent(relativePath)}`;
}
