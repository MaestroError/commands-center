import { createServer } from "node:net";
import { once } from "node:events";

import { BadRequestError } from "../lib/api-error.js";

type CallbackQuery = {
  state?: string;
  code?: string;
  iss?: string;
  error?: string;
  error_description?: string;
};
type Target = { serverID: string; redirect_uri: string; callback_port: number };
type Pending = {
  target: Target;
  expires: number;
  isPending: () => Promise<boolean>;
  controller: AbortController;
};
export type EmbeddedMcpOAuthCallbacks = {
  configure(serverID: string): Promise<{ redirect_uri: string; callback_port: number }>;
  track(url: string, expires: number, isPending: () => Promise<boolean>): () => void;
  complete(serverID: string, query: CallbackQuery): Promise<boolean>;
  dispose(): void;
};

export function createEmbeddedMcpOAuthCallbacks(publicOrigin: string): EmbeddedMcpOAuthCallbacks {
  const targets = new Map<string, Promise<Target>>();
  const ready = new Map<string, Target>();
  const pending = new Map<string, Pending>();
  const controllers = new Set<AbortController>();
  let disposed = false;

  async function allocate(serverID: string): Promise<Target> {
    const listener = createServer();
    listener.listen(0, "127.0.0.1");
    await once(listener, "listening");
    const address = listener.address();
    if (!address || typeof address === "string") throw new Error("Missing callback port");
    await new Promise<void>((resolve, reject) =>
      listener.close((error) => (error ? reject(error) : resolve())),
    );
    const redirect_uri = new URL(
      `/api/mcp-servers/${encodeURIComponent(serverID)}/auth/redirect`,
      publicOrigin,
    ).toString();
    const target = { serverID, redirect_uri, callback_port: address.port };
    if ([...ready.values()].some((entry) => entry.callback_port === target.callback_port))
      return allocate(serverID);
    if (disposed) throw new Error("MCP OAuth callbacks are closed");
    ready.set(redirect_uri, target);
    return target;
  }

  return {
    async configure(serverID) {
      if (disposed) throw new Error("MCP OAuth callbacks are closed");
      let target = targets.get(serverID);
      if (!target) {
        target = allocate(serverID).catch((error: unknown) => {
          targets.delete(serverID);
          throw error;
        });
        targets.set(serverID, target);
      }
      const { redirect_uri, callback_port } = await target;
      return { redirect_uri, callback_port };
    },
    track(url, expires, isPending) {
      if (disposed) throw new Error("MCP OAuth callbacks are closed");
      const authorization = new URL(url);
      const state = authorization.searchParams.get("state");
      const target = ready.get(authorization.searchParams.get("redirect_uri") ?? "");
      if (!target || !state || expires <= Date.now())
        throw new BadRequestError("Invalid MCP OAuth callback configuration.");
      const controller = new AbortController();
      const attempt = { target, expires, isPending, controller };
      const revoke = () => {
        if (pending.get(state) === attempt) pending.delete(state);
        controller.abort();
        controllers.delete(controller);
      };
      pending.set(state, attempt);
      controllers.add(controller);
      const timer = setTimeout(revoke, Math.max(0, expires - Date.now()));
      timer.unref();
      controller.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
      return revoke;
    },
    async complete(serverID, query) {
      const state = query.state ?? "";
      const attempt = pending.get(state);
      if (!attempt || attempt.target.serverID !== serverID || attempt.expires <= Date.now())
        throw new BadRequestError(
          "Unknown or expired MCP authorization. Start authorization again.",
        );
      if (!query.code && !query.error) throw new BadRequestError("Missing OAuth code or error.");
      pending.delete(state);
      try {
        if (!(await attempt.isPending()))
          throw new BadRequestError("MCP authorization is no longer pending.");
        const target = new URL(attempt.target.redirect_uri);
        const callback = new URL(
          target.pathname,
          `http://127.0.0.1:${attempt.target.callback_port}`,
        );
        for (const [key, value] of Object.entries(query))
          if (value !== undefined) callback.searchParams.set(key, value);
        const response = await fetch(callback, {
          redirect: "error",
          headers: { Connection: "close" },
          signal: AbortSignal.any([attempt.controller.signal, AbortSignal.timeout(30000)]),
        });
        await response.body?.cancel();
        return response.ok;
      } finally {
        attempt.controller.abort();
        controllers.delete(attempt.controller);
      }
    },
    dispose() {
      disposed = true;
      for (const controller of controllers) controller.abort();
      controllers.clear();
      pending.clear();
      ready.clear();
      targets.clear();
    },
  };
}
