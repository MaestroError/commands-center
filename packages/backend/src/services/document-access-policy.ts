import type { ApiTokenDocumentAccess } from "@cc/shared/schemas";

export function isDocumentPathWithinFolder(documentPath: string, folderPath: string): boolean {
  return documentPath === folderPath || documentPath.startsWith(`${folderPath}/`);
}

export function normalizeGlobalDocumentFolderPaths(folderPaths: string[]): string[] {
  const uniquePaths = [...new Set(folderPaths.map((path) => path.trim()))].sort();

  return uniquePaths.filter(
    (path) =>
      !uniquePaths.some(
        (candidate) => candidate !== path && isDocumentPathWithinFolder(path, candidate),
      ),
  );
}

export function isGlobalDocumentPathAuthorized(
  access: ApiTokenDocumentAccess,
  documentPath: string,
): boolean {
  return (
    access.global ||
    access.globalFolderPaths.some((folderPath) =>
      isDocumentPathWithinFolder(documentPath, folderPath),
    )
  );
}
