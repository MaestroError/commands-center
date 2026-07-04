// Split out of FileManagerPage.tsx (issue #99).

import type { FileManagerRootKind, FileManagerUploadResponse } from "@cc/shared/schemas";

export const ROOT_LABELS: Record<FileManagerRootKind, string> = {
  workspace: "Workspace",
  "all-specialists": "All Specialists",
  "host-filesystem": "Root",
};

export function getInitialRoot(searchParams: URLSearchParams): FileManagerRootKind {
  const requested = searchParams.get("root");

  if (
    requested === "workspace" ||
    requested === "all-specialists" ||
    requested === "host-filesystem"
  ) {
    return requested;
  }

  return "workspace";
}

export function buildFileManagerRouteSignature(
  root: FileManagerRootKind,
  currentPath: string,
  selectedPath: string,
): string {
  return `${root}::${currentPath}::${selectedPath}`;
}

export function buildBreadcrumbs(currentPath: string): Array<{ label: string; path: string }> {
  if (currentPath === ".") {
    return [];
  }

  const segments = currentPath.split(/[\\/]/).filter(Boolean);
  const crumbs: Array<{ label: string; path: string }> = [];
  let activePath = "";

  for (const segment of segments) {
    activePath = activePath === "" ? segment : `${activePath}/${segment}`;
    crumbs.push({ label: segment, path: activePath });
  }

  return crumbs;
}

export function collapseBreadcrumbs(
  breadcrumbs: Array<{ label: string; path: string }>,
): Array<{ label: string; path: string }> {
  if (breadcrumbs.length === 0) {
    return [];
  }

  if (breadcrumbs.length <= 3) {
    return breadcrumbs;
  }

  const firstVisibleIndex = breadcrumbs.length - 3;
  const hiddenJumpTarget = breadcrumbs[firstVisibleIndex - 1];

  if (!hiddenJumpTarget) {
    return breadcrumbs.slice(-3);
  }

  return [{ label: "...", path: hiddenJumpTarget.path }, ...breadcrumbs.slice(-3)];
}

export function getParentPath(currentPath: string): string | undefined {
  if (currentPath === ".") {
    return undefined;
  }

  const segments = currentPath.split(/[\\/]/).filter(Boolean);

  if (segments.length <= 1) {
    return ".";
  }

  return segments.slice(0, -1).join("/");
}

export function buildUploadSummaryMessage(result: FileManagerUploadResponse): string {
  const uploadedCount = result.uploaded.length;
  const rejectedCount = result.rejected.length;

  if (rejectedCount === 0) {
    return `Uploaded ${uploadedCount} entr${uploadedCount === 1 ? "y" : "ies"}.`;
  }

  return `Uploaded ${uploadedCount} entr${uploadedCount === 1 ? "y" : "ies"}; ${rejectedCount} rejected.`;
}

export function formatSize(sizeBytes: number | undefined): string {
  if (sizeBytes === undefined) {
    return "Unknown";
  }

  return `${(sizeBytes / 1024).toFixed(sizeBytes < 1024 ? 1 : 0)} KB`;
}

export function formatLineCount(lineCount: number): string {
  return `${lineCount} line${lineCount === 1 ? "" : "s"}`;
}
