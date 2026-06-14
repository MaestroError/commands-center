export function resolveSpecialistWorkspacePath(specialistSlug: string, path: string): string {
  const normalizedPath = path === "." ? "" : path.replace(/^\/+/, "");
  return normalizedPath.length === 0
    ? `specialists/${specialistSlug}`
    : `specialists/${specialistSlug}/${normalizedPath}`;
}
