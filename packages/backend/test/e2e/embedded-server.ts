import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import { startServerRuntime } from "../../src/lib/start-server-runtime.js";
import { createEmbeddedRuntime } from "../../src/opencode/embedded-runtime.js";
import { createEmbeddedOAuthProvider } from "../helpers/embedded-oauth-provider.js";
import { createLocalModelProvider } from "./model-provider.js";
import { registerBuiltFrontend } from "./static-assets.js";

const workspace = await mkdtemp(join(tmpdir(), "cc-v2-browser-"));
const port = 4176;
const origin = `http://127.0.0.1:${port}`;
const provider = await createLocalModelProvider();
const oauthProvider = await createEmbeddedOAuthProvider();
const runtime = await startServerRuntime({
  cwd: workspace,
  env: {
    NODE_ENV: "test",
    CC_HOST: "127.0.0.1",
    CC_PORT: String(port),
    CC_WORKSPACE_DIR: workspace,
    CC_PUBLIC_ORIGIN: origin,
    CC_LOG_LEVEL: "warn",
    CC_UPDATE_CHECK: "false",
  },
  installSignalHandlers: false,
  createEmbeddedRuntime: (options) =>
    createEmbeddedRuntime({
      ...options,
      sdkOptions: { models: { fetch: false }, fs: { filewatcher: false, fff: false } },
      resolveEnvironment: async () => ({
        OPENCODE_TEST_HOME: workspace,
        ...(await options.resolveEnvironment()),
      }),
      prepareConfiguration: async (callbacks) => {
        await options.prepareConfiguration(callbacks);
        const directory = join(workspace, ".cc/opencode-v2/config/opencode");
        await mkdir(directory, { recursive: true });
        await writeFile(
          join(directory, "opencode.json"),
          JSON.stringify({
            model: "local-e2e/test",
            providers: {
              "local-e2e": {
                package: "@opencode/ai/providers/openai-compatible",
                settings: { baseURL: `${provider.origin}/v1`, apiKey: "fixture-only" },
                models: {
                  test: { variants: [{ id: "high", body: { reasoning_effort: "high" } }] },
                },
              },
            },
          }),
        );
      },
    }),
  register: async (server, context) => {
    const owner = context.ownerAccessService;
    if (!owner) throw new Error("Missing owner access service");
    const claim = await owner.rotateClaimCode();
    await owner.claim({
      claimCode: claim.code,
      password: "Local-v2-test-password!",
      confirmPassword: "Local-v2-test-password!",
    });
    const app = server.withTypeProvider<ZodTypeProvider>();
    app.post("/api/e2e/task-monitor/pause", () => {
      context.taskExecutionService?.dispose();
      return { paused: true };
    });
    app.post("/api/e2e/task-monitor/resume", async () => {
      await context.taskExecutionService?.resumeRunningTaskRuns();
      return { resumed: true };
    });
    app.get(
      "/api/e2e/specialist-runtime/:slug",
      { schema: { params: z.object({ slug: z.string() }) } },
      async (request) => {
        const specialist = await context.workspaceServices?.specialists.getBySlug(
          request.params.slug,
        );
        const host = context.embeddedRuntime?.host;
        if (!specialist || !host) throw new Error("Missing specialist runtime");
        return {
          tools: await host.listTools(specialist.workspacePath),
          servers: await host.mcp.list({ location: { directory: specialist.workspacePath } }),
        };
      },
    );
    app.get("/api/e2e/provider-requests", () => provider.requests);
    app.post("/api/e2e/provider/hold", () => {
      provider.hold();
      return { held: true };
    });
    app.post("/api/e2e/provider/release", () => {
      provider.release();
      return { held: false };
    });
    app.get("/api/e2e/mcp-provider", () => ({
      url: `${oauthProvider.origin}/mcp`,
      transport: "streamable-http",
      authMethod: "oauth",
      headers: [],
    }));
    registerBuiltFrontend(server);
  },
});
process.stdout.write(
  `Local v2 application E2E: ${origin}\nWorkspace: ${workspace}\nPassword: Local-v2-test-password!\n`,
);
let closing = false;
async function close(): Promise<void> {
  if (closing) return;
  closing = true;
  await runtime.drain("manual");
  await provider.close();
  await oauthProvider.close();
  await rm(workspace, { recursive: true, force: true });
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void close().catch((error: unknown) => {
      runtime.logger.error(error);
      process.exitCode = 1;
    });
  });
