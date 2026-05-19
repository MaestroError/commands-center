export function isMentionableWorkspacePath(path: string): boolean {
  return !path.split(/[\\/]/).includes("node_modules");
}
