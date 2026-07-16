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

/**
 * Builds the in-app Documents folder-view href for a folder path relative to the
 * Documents root. An empty `relativePath` targets the scope root. Private folders
 * carry `scope=private&owner=<slug>`.
 */
export function buildDocumentFolderHref(
  relativePath: string,
  options?: { scope?: DocumentScope | null; ownerSlug?: string | null },
): string {
  const scopePrefix =
    options?.scope === "private" && options.ownerSlug
      ? `scope=private&owner=${encodeURIComponent(options.ownerSlug)}&`
      : "";
  return `/documents?${scopePrefix}folder=${encodeURIComponent(relativePath)}`;
}

/**
 * Builds a File Manager href that reveals a Documents entry. Files open their
 * parent folder with the file selected; directories open the directory itself.
 * Private-scope entries live under `specialists/<slug>/Documents`.
 */
export function buildDocumentFileManagerHref(entry: {
  scope: DocumentScope;
  ownerSlug: string | null;
  relativePath: string;
  type: "file" | "directory";
}): string {
  const base =
    entry.scope === "private" && entry.ownerSlug
      ? `specialists/${entry.ownerSlug}/Documents`
      : "Documents";

  const params = new URLSearchParams({ root: "workspace" });
  if (entry.type === "directory") {
    params.set("path", `${base}/${entry.relativePath}`);
  } else {
    const lastSlash = entry.relativePath.lastIndexOf("/");
    const folder = lastSlash === -1 ? "" : entry.relativePath.slice(0, lastSlash);
    params.set("path", folder ? `${base}/${folder}` : base);
    params.set("select", `${base}/${entry.relativePath}`);
  }
  return `/files?${params.toString()}`;
}
