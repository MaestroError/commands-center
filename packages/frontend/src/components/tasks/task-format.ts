export function formatToken(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatDate(value?: string): string {
  return value ? new Date(value).toLocaleString() : "Not set";
}
