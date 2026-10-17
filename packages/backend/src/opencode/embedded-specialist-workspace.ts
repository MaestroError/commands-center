import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

import type { AppDb } from "../db/client.js";
import type { CustomToolService } from "../services/custom-tool-service.js";
import { prepareWorkspace } from "../services/specialist-workspace.js";
import { buildEmbeddedMcpDefinitions } from "./embedded-mcp-config.js";
import type { EmbeddedMcpOAuthCallbacks } from "./embedded-mcp-oauth-callbacks.js";
import { renderEmbeddedWorkspace } from "./embedded-workspace-config.js";

export async function prepareEmbeddedSpecialistWorkspace(
  options: Parameters<typeof prepareWorkspace>[0] & {
    db: AppDb;
    customToolService: CustomToolService;
    overwriteSlugs?: string[];
    oauthCallbacks?: EmbeddedMcpOAuthCallbacks;
  },
): Promise<void> {
  await options.customToolService.syncSpecialistAssignments({
    workspacePath: options.workspacePath,
    selectedToolSlugs: options.input.capabilities.customTools ?? [],
    overwriteSlugs: options.overwriteSlugs,
  });
  await writeEmbeddedSpecialistWorkspace(options);
}

export async function writeEmbeddedSpecialistWorkspace(
  options: Parameters<typeof prepareEmbeddedSpecialistWorkspace>[0],
): Promise<void> {
  const plugins = await syncEmbeddedSpecialistToolPlugins(options);
  const definitions = await buildEmbeddedMcpDefinitions(
    options.db,
    options.config,
    options.input.appMcpEntries,
    options.oauthCallbacks,
  );
  await prepareWorkspace({
    ...options,
    render: (input) => renderEmbeddedWorkspace(input, definitions, plugins),
  });
}

export async function syncEmbeddedSpecialistToolPlugins(options: {
  customToolService: CustomToolService;
  workspacePath: string;
}): Promise<string[]> {
  const tools = await options.customToolService.listAgentTools({
    workspacePath: options.workspacePath,
  });
  const pluginRoot = join(options.workspacePath, ".opencode", "cc-tools");
  await mkdir(pluginRoot, { recursive: true });
  const slugs = new Set(tools.map((tool) => tool.slug));
  for (const entry of await readdir(pluginRoot)) {
    if (!slugs.has(entry)) await rm(join(pluginRoot, entry), { recursive: true, force: true });
  }
  for (const tool of tools) {
    const pluginPath = join(pluginRoot, tool.slug);
    await mkdir(pluginPath, { recursive: true });
    const specifier = relative(pluginPath, tool.entryPath).replaceAll("\\", "/");
    await writeFile(
      join(pluginPath, "index.ts"),
      `export { default } from ${JSON.stringify(specifier)};\n`,
      "utf8",
    );
  }
  return tools.map((tool) => `./.opencode/cc-tools/${tool.slug}`);
}
