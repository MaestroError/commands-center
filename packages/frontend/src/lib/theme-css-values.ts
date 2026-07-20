export function readThemeCssValue(variableName: `--${string}`): string {
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(variableName);
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`Missing theme CSS variable: ${variableName}`);
  }
  return normalized;
}

export function toHexColor(value: string): string {
  if (value.startsWith("#")) {
    return value;
  }

  const match = value.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d*\.?\d+)\s*)?\)$/,
  );
  if (!match) {
    throw new Error(`Unsupported theme color: ${value}`);
  }

  const channels = match.slice(1, 4).map((channel) => toHexChannel(Number(channel)));
  const alpha = match[4] === undefined ? "" : toHexChannel(Number(match[4]) * 255);
  return `#${channels.join("")}${alpha}`;
}

function toHexChannel(value: number): string {
  return Math.round(Math.min(255, Math.max(0, value)))
    .toString(16)
    .padStart(2, "0");
}
