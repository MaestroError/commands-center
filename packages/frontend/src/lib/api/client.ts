// Shared HTTP client: request helpers, CSRF handling, and API error parsing.
// Split out of the api.ts god-file (issue #99); domain modules import from here.

type RequestOptions = {
  method?: string;
  body?: unknown;
};

const CSRF_COOKIE_NAME = "cc_csrf_token";

const CSRF_HEADER_NAME = "x-csrf-token";

type ApiFetchOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit;
  signal?: AbortSignal;
};

const JSON_CONTENT_TYPE = "application/json";

export async function requestJson<T>(
  url: string,
  schema: { parse(input: unknown): T },
  options?: RequestOptions,
): Promise<T> {
  const response = await apiFetch(url, {
    method: options?.method ?? "GET",
    headers: options?.body ? { "content-type": "application/json" } : undefined,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = await readJsonPayload(url, response);

  if (!response.ok) {
    throw new Error(readApiError(payload, response.status, response.statusText));
  }

  return schema.parse(payload);
}

async function readJsonPayload(url: string, response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

  if (!contentType.includes(JSON_CONTENT_TYPE)) {
    const body = await response.text().catch(() => "");
    throw new Error(describeUnexpectedJsonResponse(url, contentType, body));
  }

  const payload = (await response.json().catch(() => undefined)) as unknown;
  if (payload === undefined) {
    throw new Error(`Received an invalid JSON response from ${url}.`);
  }

  return payload;
}

function describeUnexpectedJsonResponse(url: string, contentType: string, body: string): string {
  if (contentType.includes("text/html") || body.includes("<!doctype html")) {
    return `Unexpected HTML response from ${url}. The app shell was returned instead of the API response.`;
  }

  return `Unexpected non-JSON response from ${url}.`;
}

export async function apiFetch(url: string, options: ApiFetchOptions = {}): Promise<Response> {
  const response = await fetch(url, buildApiFetchInit(options));

  if (!(await shouldRetryWithFreshCsrf(response))) {
    return response;
  }

  const refreshed = await refreshCsrfToken();
  if (!refreshed) {
    return response;
  }

  return fetch(url, buildApiFetchInit(options));
}

function buildApiFetchInit(options: ApiFetchOptions = {}): RequestInit {
  const method = options.method ?? "GET";
  const headers = options.headers ? { ...options.headers } : undefined;
  const csrfToken = shouldAttachCsrfToken(method) ? readCookie(CSRF_COOKIE_NAME) : undefined;
  const init: RequestInit = { method };

  if (csrfToken) {
    const existingHeaderName = Object.keys(headers ?? {}).find(
      (header) => header.toLowerCase() === CSRF_HEADER_NAME,
    );
    const nextHeaders = headers ?? {};
    nextHeaders[existingHeaderName ?? CSRF_HEADER_NAME] = csrfToken;
    init.headers = nextHeaders;
  } else if (headers) {
    init.headers = headers;
  }

  if (options.body !== undefined) {
    init.body = options.body;
  }

  if (options.signal) {
    init.signal = options.signal;
  }

  return init;
}

async function shouldRetryWithFreshCsrf(response: Response): Promise<boolean> {
  if (response.status !== 403) {
    return false;
  }

  const payload = (await response
    .clone()
    .json()
    .catch(() => undefined)) as unknown;
  return isInvalidCsrfPayload(payload);
}

function isInvalidCsrfPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || !("error" in payload)) {
    return false;
  }

  const error = payload.error;
  if (!error || typeof error !== "object") {
    return false;
  }

  return (
    ("code" in error && error.code === "csrf_invalid") ||
    ("message" in error && error.message === "CSRF token is invalid.")
  );
}

async function refreshCsrfToken(): Promise<boolean> {
  const response = await fetch("/api/auth/csrf", { method: "GET" }).catch(() => undefined);
  return response?.ok ?? false;
}

function shouldAttachCsrfToken(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

function readCookie(name: string): string | undefined {
  const prefix = `${name}=`;
  const value = document.cookie
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(prefix))
    ?.slice(prefix.length);

  return value === undefined ? undefined : decodeURIComponent(value);
}

export function readApiError(payload: unknown, status: number, statusText?: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = payload.error;

    if (error && typeof error === "object") {
      const issues = readApiErrorIssues(error);

      if (issues.length > 0) {
        return issues.join(" ");
      }

      if ("message" in error && typeof error.message === "string") {
        return error.message;
      }
    }
  }

  return statusText || `Request failed with status ${String(status)}.`;
}

function readApiErrorIssues(error: object): string[] {
  if (!("details" in error) || !error.details || typeof error.details !== "object") {
    return [];
  }

  const details = error.details;
  if (!("issues" in details) || !Array.isArray(details.issues)) {
    return [];
  }

  return details.issues.filter((issue): issue is string => typeof issue === "string");
}

// --- Conversation API ---

export async function* parseSse<T>(
  response: Response,
  schema: { parse: (value: unknown) => T },
): AsyncGenerator<T> {
  if (!response.body) {
    throw new Error("SSE response has no body");
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += value;
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const block of parts) {
        const dataLines: string[] = [];

        for (const line of block.split("\n")) {
          if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trimStart());
          }
        }

        if (dataLines.length === 0) {
          continue;
        }

        try {
          const json = JSON.parse(dataLines.join("\n")) as unknown;
          yield schema.parse(json);
        } catch (err) {
          console.warn("[SSE] Failed to parse event:", dataLines.join("\n"), err);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
