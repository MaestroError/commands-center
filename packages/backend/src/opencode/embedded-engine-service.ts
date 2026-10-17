import type { RuntimeConfig } from "../lib/runtime-config.js";
import { BadRequestError } from "../lib/api-error.js";
import { createFileManagerService } from "../services/file-manager-service.js";
import type { OpenCodeService } from "../services/opencode-service.js";
import { createEmbeddedFileService } from "./embedded-file-service.js";
import type { EmbeddedRuntime } from "./embedded-runtime.js";

export function createEmbeddedEngineService(
  runtime: EmbeddedRuntime,
  config: RuntimeConfig,
): OpenCodeService {
  const files = createFileManagerService({ config });
  return {
    ...runtime.chat,
    ...runtime.mcp,
    ...createEmbeddedFileService({ host: runtime.host, config }),
    async listSessionChildren(directory, sessionID, signal) {
      await runtime.chat.getSession(directory, sessionID);
      const children = [];
      let cursor: string | undefined;
      do {
        const page = await runtime.host.sessions.list(
          cursor ? { cursor } : { parentID: sessionID },
          { signal },
        );
        children.push(...page.data);
        cursor = page.cursor.next ?? undefined;
      } while (cursor);
      return children;
    },
    dispose: () => runtime.reload(),
    disposeGlobal: () => runtime.reload(),
    async listAuthMethods() {
      return Object.fromEntries(
        (await runtime.providers.list()).map((entry) => [entry.provider.id, entry.authMethods]),
      );
    },
    setApiKey: (_directory, id, key) => runtime.providers.setApiKey(id, key),
    startOauth: (_directory, id, method, inputs) =>
      runtime.providers.startOauth(id, method, inputs),
    completeOauth: async (_directory, id, method, code) =>
      (await runtime.providers.completeOauth(id, method, code)).connected,
    disconnectProvider: (_directory, id) => runtime.providers.disconnect(id),
    completeMcpAuth: () =>
      Promise.reject(new BadRequestError("Complete MCP authorization in the browser callback.")),
    async listFiles(directory, path = ".") {
      const result = await files.listDirectory(
        { kind: "workspace", basePath: directory },
        { path },
      );
      return result.nodes.map((node) => ({
        name: node.name,
        path: node.path,
        absolute: node.absolutePath,
        type: node.type,
        ignored: false,
      }));
    },
  };
}
