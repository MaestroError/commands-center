const PUBLIC_MCP_PATH = "/api/public/mcp";
const PUBLIC_MCP_TOKEN_QUERY_PARAM = "key";
const REDACTED_QUERY_VALUE = "redacted";

export function redactSensitiveUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl, "http://localhost");

  if (!hasPublicMcpUrlToken(rawUrl)) {
    return rawUrl;
  }

  parsed.searchParams.set(PUBLIC_MCP_TOKEN_QUERY_PARAM, REDACTED_QUERY_VALUE);

  if (hasUrlOrigin(rawUrl)) {
    return parsed.toString();
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function hasPublicMcpUrlToken(rawUrl: string): boolean {
  const parsed = new URL(rawUrl, "http://localhost");

  return (
    parsed.pathname === PUBLIC_MCP_PATH && parsed.searchParams.has(PUBLIC_MCP_TOKEN_QUERY_PARAM)
  );
}

export function redactSensitiveQuery(rawQuery: unknown): unknown {
  if (!rawQuery || typeof rawQuery !== "object" || Array.isArray(rawQuery)) {
    return rawQuery;
  }

  return {
    ...(rawQuery as Record<string, unknown>),
    [PUBLIC_MCP_TOKEN_QUERY_PARAM]: REDACTED_QUERY_VALUE,
  };
}

function hasUrlOrigin(rawUrl: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(rawUrl);
}
