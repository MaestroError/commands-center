// Builds a redacted, size-capped summary of a request's input for the per-token
// audit log. Never stores raw file bytes (base64 dataUrls are dropped), truncates
// long text, redacts token/secret-looking strings, and hard-caps the total size.

const MAX_TEXT_LENGTH = 500;
const MAX_JSON_BYTES = 4096;
const MAX_ARRAY_ITEMS = 20;
const MAX_OBJECT_KEYS = 30;
const MAX_DEPTH = 5;

// cc_ bearer tokens and long base64-ish blobs (e.g. an inlined dataUrl payload).
const SECRET_PATTERNS: RegExp[] = [/cc_[A-Za-z0-9_-]{10,}/g, /[A-Za-z0-9+/]{40,}={0,2}/g];

function redact(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, "[redacted]");
  }
  return result;
}

function summarizeValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) {
    return "[deep]";
  }
  if (typeof value === "string") {
    const redacted = redact(value);
    return redacted.length > MAX_TEXT_LENGTH ? `${redacted.slice(0, MAX_TEXT_LENGTH)}…` : redacted;
  }
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => summarizeValue(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`…(+${value.length - MAX_ARRAY_ITEMS} more)`);
    }
    return items;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
      // Never persist inline file bytes — keep only the metadata around them.
      out[key] = key === "dataUrl" ? "[omitted]" : summarizeValue(entry, depth + 1);
    }
    return out;
  }
  return value ?? null;
}

export function summarizeAuditInput(input: unknown): unknown {
  if (input === undefined || input === null) {
    return null;
  }
  const summarized = summarizeValue(input, 0);
  const json = JSON.stringify(summarized);
  // Measure actual UTF-8 bytes, not UTF-16 code units, so the "bytes" cap is
  // accurate for non-ASCII input.
  if (json !== undefined && Buffer.byteLength(json, "utf8") > MAX_JSON_BYTES) {
    return { truncated: true, note: `input omitted (>${String(MAX_JSON_BYTES)} bytes)` };
  }
  return summarized;
}
