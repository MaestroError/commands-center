import { apiFetch, readApiError, requestJson } from "./client";

import {
  terminalListResponseSchema,
  terminalResizeInputSchema,
  terminalSessionSchema,
  type TerminalCreateInput,
  type TerminalSession,
  type TerminalResizeInput,
} from "@cc/shared/schemas";

export async function createTerminalSession(input: TerminalCreateInput): Promise<TerminalSession> {
  return requestJson<TerminalSession>("/api/terminal", terminalSessionSchema, {
    method: "POST",
    body: input,
  });
}

export async function listTerminalSessions(): Promise<TerminalSession[]> {
  const response = await requestJson<{ sessions: TerminalSession[] }>(
    "/api/terminal",
    terminalListResponseSchema,
  );
  return response.sessions;
}

export async function resizeTerminalSession(id: string, input: TerminalResizeInput): Promise<void> {
  const response = await apiFetch(`/api/terminal/${id}/resize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(terminalResizeInputSchema.parse(input)),
  });

  if (!response.ok && response.status !== 204) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new Error(readApiError(payload, response.status, response.statusText));
  }
}

export async function closeTerminalSession(id: string): Promise<void> {
  const response = await apiFetch(`/api/terminal/${id}`, { method: "DELETE" });

  if (!response.ok && response.status !== 204) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new Error(readApiError(payload, response.status, response.statusText));
  }
}

export function connectTerminalWebSocket(id: string): WebSocket {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return new WebSocket(`${protocol}//${window.location.host}/api/terminal/${id}/connect`);
}
