import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile, copyFile, cp } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";

import {
  copyCustomToolToAgentsInputSchema,
  createCustomToolInputSchema,
  customToolAgentCopyListSchema,
  customToolAgentCopySchema,
  customToolBulkCopyResultSchema,
  customToolListSchema,
  customToolMutationResultSchema,
  customToolSchema,
  importAgentCustomToolInputSchema,
  type CreateCustomToolInput,
  type CustomTool,
  type CustomToolAgentCopy,
  type CustomToolDriftStatus,
  type CustomToolWarning,
} from "@cc/shared/schemas";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { createId } from "../db/ids.js";
import { custom_tools } from "../db/schema/index.js";
import type { AppDb } from "../db/client.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/api-error.js";
import type { OpenCodeService } from "./opencode-service.js";

const GLOBAL_METADATA_FILE = "cc-tool.json";
const GLOBAL_ENTRY_FILE = "tool.ts";
const AGENT_TOOL_DIR = join(".opencode", "tools");
const BUILT_IN_TOOL_NAMES = new Set([
  "apply_patch",
  "bash",
  "code",
  "edit",
  "fetch",
  "glob",
  "grep",
  "lsp",
  "patch",
  "plan",
  "question",
  "read",
  "search",
  "skill",
  "task",
  "todo",
  "todowrite",
  "webfetch",
  "write",
]);

const globalToolMetadataSchema = z.object({
  version: z.literal(1).default(1),
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  entryFile: z.string().min(1),
  fingerprint: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  enabled: z.boolean().default(true),
});

const agentCopyMetadataSchema = z.object({
  version: z.literal(1).default(1),
  managedBy: z.literal("cc"),
  localToolName: z.string().min(1).optional(),
  sourceToolSlug: z.string().min(1),
  sourceToolName: z.string().min(1),
  sourceDescription: z.string(),
  sourceFingerprint: z.string().min(1),
  entryFile: z.string().min(1),
  copiedAt: z.string().datetime(),
});

type GlobalToolMetadata = z.infer<typeof globalToolMetadataSchema>;
type AgentCopyMetadata = z.infer<typeof agentCopyMetadataSchema>;

export type CustomToolService = ReturnType<typeof createCustomToolService>;

export function createCustomToolService(options: {
  config: RuntimeConfig;
  db: AppDb;
  opencodeService: OpenCodeService;
  listAgents?: () => Promise<
    Array<{ id: string; slug: string; name: string; workspacePath: string }>
  >;
}) {
  function getGlobalToolDirectoryPath(slug: string): string {
    return join(options.config.paths.subdirectories.tools, slug);
  }

  return {
    async listGlobal(): Promise<CustomTool[]> {
      const tools = await readGlobalTools();
      await syncGlobalToolRows(tools);
      return customToolListSchema.parse(tools);
    },

    async getGlobal(slug: string): Promise<CustomTool> {
      const tool = await readGlobalTool(slug);

      if (!tool) {
        throw new NotFoundError("Custom tool not found.");
      }

      return customToolSchema.parse(tool);
    },

    async create(input: CreateCustomToolInput) {
      const parsed = createCustomToolInputSchema.parse(input);
      const slug = slugify(parsed.name);
      const directoryPath = getGlobalToolDirectoryPath(slug);
      const metadataPath = join(directoryPath, GLOBAL_METADATA_FILE);
      const entryPath = join(directoryPath, GLOBAL_ENTRY_FILE);

      if (await pathExists(directoryPath)) {
        throw new ConflictError(`Custom tool '${slug}' already exists.`);
      }

      const warnings = getBuiltInCollisionWarnings(slug);
      const timestamp = new Date().toISOString();

      await mkdir(directoryPath, { recursive: true });
      await writeFile(entryPath, renderToolTemplate(parsed.name, parsed.description), "utf8");

      const fingerprint = await computeToolSnapshotFingerprint({
        entryPath,
        supportDirectoryPath: directoryPath,
      });
      const metadata = globalToolMetadataSchema.parse({
        version: 1,
        id: createId(),
        slug,
        name: parsed.name.trim(),
        description: parsed.description.trim(),
        entryFile: GLOBAL_ENTRY_FILE,
        fingerprint,
        createdAt: timestamp,
        updatedAt: timestamp,
        enabled: true,
      });

      await writeGlobalMetadata(metadataPath, metadata);
      const tool = await materializeGlobalTool(directoryPath);
      await upsertGlobalToolRow(tool);
      return customToolMutationResultSchema.parse({ tool, overwritten: false, warnings });
    },

    async deleteGlobal(slug: string): Promise<void> {
      const tool = await readGlobalTool(slug);

      if (!tool) {
        throw new NotFoundError("Custom tool not found.");
      }

      await rm(tool.directoryPath, { recursive: true, force: true });
      await options.db.delete(custom_tools).where(eq(custom_tools.slug, slug));
    },

    async listAgentTools(agent: { workspacePath: string }): Promise<CustomToolAgentCopy[]> {
      return customToolAgentCopyListSchema.parse(await readAgentTools(agent.workspacePath));
    },

    async copyGlobalToAgents(input: {
      slug: string;
      agentIds: string[];
      destinationName?: string;
      overwrite: boolean;
    }) {
      const parsed = copyCustomToolToAgentsInputSchema.parse({
        agentIds: input.agentIds,
        destinationName: input.destinationName,
        overwrite: input.overwrite,
      });
      const source = await readGlobalTool(input.slug);

      if (!source) {
        throw new NotFoundError("Custom tool not found.");
      }

      const agents = await requireAgents(parsed.agentIds);
      const copied: Array<{ agentId: string; agentSlug: string; overwritten: boolean }> = [];

      for (const agent of agents) {
        const overwritten = await writeGlobalToolToAgent({
          source,
          workspacePath: agent.workspacePath,
          destinationName: parsed.destinationName,
          overwrite: parsed.overwrite,
        });
        await options.opencodeService.dispose(agent.workspacePath).catch(() => {});
        copied.push({ agentId: agent.id, agentSlug: agent.slug, overwritten });
      }

      return customToolBulkCopyResultSchema.parse({
        copied,
        warnings: source.warnings,
      });
    },

    async copyAgentToolToGlobal(input: {
      agent: { workspacePath: string };
      toolSlug: string;
      destinationName?: string;
      overwrite: boolean;
    }) {
      const parsed = importAgentCustomToolInputSchema.parse({
        destinationName: input.destinationName,
        overwrite: input.overwrite,
      });
      return copyAgentToolToGlobal({
        workspacePath: input.agent.workspacePath,
        toolSlug: input.toolSlug,
        destinationName: parsed.destinationName,
        overwrite: parsed.overwrite,
        move: false,
      });
    },

    async moveAgentToolToGlobal(input: {
      agent: { workspacePath: string };
      toolSlug: string;
      destinationName?: string;
      overwrite: boolean;
    }) {
      const parsed = importAgentCustomToolInputSchema.parse({
        destinationName: input.destinationName,
        overwrite: input.overwrite,
      });
      const result = await copyAgentToolToGlobal({
        workspacePath: input.agent.workspacePath,
        toolSlug: input.toolSlug,
        destinationName: parsed.destinationName,
        overwrite: parsed.overwrite,
        move: true,
      });
      await options.opencodeService.dispose(input.agent.workspacePath).catch(() => {});
      return result;
    },

    async syncAgentAssignments(input: {
      workspacePath: string;
      selectedToolSlugs: string[];
      overwriteSlugs?: string[];
    }): Promise<void> {
      const selected = new Set(input.selectedToolSlugs);
      const overwrite = new Set(input.overwriteSlugs ?? []);
      const globalTools = await readGlobalTools(false);
      const globalMap = new Map(globalTools.map((tool) => [tool.slug, tool]));
      const agentTools = await readAgentTools(input.workspacePath, globalMap);

      for (const slug of selected) {
        const source = globalMap.get(slug);

        if (!source) {
          throw new NotFoundError(`Custom tool '${slug}' does not exist.`);
        }

        const existing = agentTools.find((tool) => tool.slug === slug);

        if (!existing) {
          await writeGlobalToolToAgent({
            source,
            workspacePath: input.workspacePath,
            overwrite: false,
          });
          continue;
        }

        if (existing.isManaged && existing.sourceToolSlug === slug) {
          if (existing.status === "matching" && !overwrite.has(slug)) {
            continue;
          }

          if (!overwrite.has(slug)) {
            throw new ConflictError(
              `Custom tool '${slug}' already exists in this agent workspace with local differences. Confirm overwrite to replace it.`,
            );
          }

          await writeGlobalToolToAgent({
            source,
            workspacePath: input.workspacePath,
            destinationName: source.name,
            overwrite: true,
          });
          continue;
        }

        if (!overwrite.has(slug)) {
          throw new ConflictError(
            `Custom tool '${slug}' already exists in this agent workspace. Confirm overwrite to replace it.`,
          );
        }

        await writeGlobalToolToAgent({
          source,
          workspacePath: input.workspacePath,
          destinationName: source.name,
          overwrite: true,
        });
      }

      for (const tool of agentTools) {
        if (!tool.isManaged || !tool.sourceToolSlug || selected.has(tool.sourceToolSlug)) {
          continue;
        }

        await removeAgentToolSnapshot(input.workspacePath, tool.slug);
      }
    },
    async removeAgentTool(input: { workspacePath: string; toolSlug: string }): Promise<void> {
      const agentTool = await readAgentTool(input.workspacePath, input.toolSlug);

      if (!agentTool) {
        throw new NotFoundError("Agent custom tool not found.");
      }

      await removeAgentToolSnapshot(input.workspacePath, agentTool.slug);
    },
  };

  async function copyAgentToolToGlobal(input: {
    workspacePath: string;
    toolSlug: string;
    destinationName?: string;
    overwrite: boolean;
    move: boolean;
  }) {
    const agentTool = await readAgentTool(input.workspacePath, input.toolSlug);

    if (!agentTool) {
      throw new NotFoundError("Agent custom tool not found.");
    }

    const destinationName = input.destinationName?.trim() || agentTool.name;
    const destinationSlug = slugify(destinationName);
    const globalDirectoryPath = getGlobalToolDirectoryPath(destinationSlug);
    const existingRow = await options.db.query.custom_tools.findFirst({
      where: (table, operators) => operators.eq(table.slug, destinationSlug),
    });
    const overwritten = await pathExists(globalDirectoryPath);

    if (overwritten && !input.overwrite) {
      throw new ConflictError(
        `Custom tool '${agentTool.slug}' already exists globally. Confirm overwrite to replace it.`,
      );
    }

    if (overwritten) {
      await rm(globalDirectoryPath, { recursive: true, force: true });
    }

    await mkdir(globalDirectoryPath, { recursive: true });

    if (agentTool.supportDirectoryPath) {
      const managedEntryPath = join(agentTool.supportDirectoryPath, GLOBAL_ENTRY_FILE);

      if (await pathExists(managedEntryPath)) {
        await copyFile(managedEntryPath, join(globalDirectoryPath, GLOBAL_ENTRY_FILE));
      }

      const supportEntries = await readdir(agentTool.supportDirectoryPath, { withFileTypes: true });

      for (const entry of supportEntries) {
        if (entry.name === GLOBAL_ENTRY_FILE) {
          continue;
        }

        const sourcePath = join(agentTool.supportDirectoryPath, entry.name);
        const destinationPath = join(globalDirectoryPath, entry.name);

        if (entry.isDirectory()) {
          await cp(sourcePath, destinationPath, { recursive: true });
          continue;
        }

        await copyFile(sourcePath, destinationPath);
      }
    } else {
      await copyFile(agentTool.entryPath, join(globalDirectoryPath, GLOBAL_ENTRY_FILE));
    }

    const timestamp = new Date().toISOString();
    const fingerprint = await computeToolSnapshotFingerprint({
      entryPath: join(globalDirectoryPath, GLOBAL_ENTRY_FILE),
      supportDirectoryPath: globalDirectoryPath,
    });
    const metadata = globalToolMetadataSchema.parse({
      version: 1,
      id: createId(),
      slug: destinationSlug,
      name: destinationName,
      description: agentTool.description,
      entryFile: GLOBAL_ENTRY_FILE,
      fingerprint,
      createdAt: timestamp,
      updatedAt: timestamp,
      enabled: true,
    });

    await writeGlobalMetadata(join(globalDirectoryPath, GLOBAL_METADATA_FILE), metadata);

    if (input.move) {
      await removeAgentToolSnapshot(input.workspacePath, agentTool.slug);
    }

    const tool = await materializeGlobalTool(globalDirectoryPath);
    await upsertGlobalToolRow(tool, existingRow);
    return customToolMutationResultSchema.parse({
      tool,
      overwritten,
      warnings: getBuiltInCollisionWarnings(agentTool.slug),
    });
  }

  async function requireAgents(agentIds: string[]) {
    if (!options.listAgents) {
      throw new BadRequestError("Agent lookup is unavailable.");
    }

    const agents = await options.listAgents();
    const byId = new Map(agents.map((agent) => [agent.id, agent]));
    const resolved = agentIds.map((id) => byId.get(id)).filter((agent) => agent !== undefined);

    if (resolved.length !== agentIds.length) {
      throw new NotFoundError("One or more agents could not be found.");
    }

    return resolved;
  }

  async function readGlobalTools(includeUsage = true): Promise<CustomTool[]> {
    await mkdir(options.config.paths.subdirectories.tools, { recursive: true });
    const entries = await readdir(options.config.paths.subdirectories.tools, {
      withFileTypes: true,
    });
    const tools = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) =>
          materializeGlobalTool(join(options.config.paths.subdirectories.tools, entry.name)),
        ),
    );
    const usageBySlug = includeUsage
      ? await readGlobalUsageBySlug(tools)
      : new Map<string, CustomTool["usage"]>();
    return tools
      .map((tool) => ({ ...tool, usage: usageBySlug.get(tool.slug) ?? tool.usage }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async function readGlobalTool(slug: string): Promise<CustomTool | undefined> {
    const directoryPath = getGlobalToolDirectoryPath(slug);

    if (!(await pathExists(directoryPath))) {
      return undefined;
    }

    return materializeGlobalTool(directoryPath);
  }

  async function materializeGlobalTool(directoryPath: string): Promise<CustomTool> {
    const metadataPath = join(directoryPath, GLOBAL_METADATA_FILE);
    const metadata = globalToolMetadataSchema.parse(
      JSON.parse(await readFile(metadataPath, "utf8")),
    );
    const entryPath = join(directoryPath, metadata.entryFile);

    if (!(await pathExists(entryPath))) {
      throw new NotFoundError(
        `Custom tool entry '${metadata.entryFile}' is missing for '${metadata.slug}'.`,
      );
    }

    const fingerprint = await computeToolSnapshotFingerprint({
      entryPath,
      supportDirectoryPath: directoryPath,
    });
    const updatedAt = new Date(await readLatestMtimeMs(directoryPath)).toISOString();
    const nextMetadata = { ...metadata, fingerprint, updatedAt };

    if (metadata.fingerprint !== fingerprint || metadata.updatedAt !== updatedAt) {
      await writeGlobalMetadata(metadataPath, nextMetadata);
    }

    return customToolSchema.parse({
      id: metadata.id,
      slug: metadata.slug,
      name: metadata.name,
      description: metadata.description,
      entryFile: metadata.entryFile,
      entryPath,
      directoryPath,
      fingerprint,
      enabled: metadata.enabled,
      createdAt: metadata.createdAt,
      updatedAt,
      warnings: getBuiltInCollisionWarnings(metadata.slug),
      usage: [],
    });
  }

  async function readGlobalUsageBySlug(tools: CustomTool[]) {
    const usageBySlug = new Map<string, CustomTool["usage"]>();

    if (!options.listAgents) {
      return usageBySlug;
    }

    const agents = await options.listAgents();
    const globalMap = new Map(tools.map((tool) => [tool.slug, tool]));

    for (const agent of agents) {
      const agentTools = await readAgentTools(agent.workspacePath, globalMap);

      for (const tool of agentTools) {
        const sourceSlug = tool.sourceToolSlug ?? tool.slug;

        if (!globalMap.has(sourceSlug)) {
          continue;
        }

        const usage = usageBySlug.get(sourceSlug) ?? [];
        usage.push({
          agentId: agent.id,
          agentSlug: agent.slug,
          agentName: agent.name,
          status: tool.status,
          copiedAt: tool.copiedAt,
          entryFile: tool.entryFile,
        });
        usageBySlug.set(sourceSlug, usage);
      }
    }

    return usageBySlug;
  }

  async function readAgentTools(
    workspacePath: string,
    globalMap?: Map<string, CustomTool>,
  ): Promise<CustomToolAgentCopy[]> {
    const toolsDirectoryPath = join(workspacePath, AGENT_TOOL_DIR);

    if (!(await pathExists(toolsDirectoryPath))) {
      return [];
    }

    const resolvedGlobalMap =
      globalMap ?? new Map((await readGlobalTools(false)).map((tool) => [tool.slug, tool]));
    const entries = await readdir(toolsDirectoryPath, { withFileTypes: true });
    const toolEntries = entries.filter(
      (entry) => entry.isFile() && [".js", ".ts"].includes(extname(entry.name)),
    );

    const tools = await Promise.all(
      toolEntries.map(async (entry) => {
        const slug = basename(entry.name, extname(entry.name));
        return readAgentTool(workspacePath, slug, resolvedGlobalMap);
      }),
    );

    return tools
      .filter((tool): tool is CustomToolAgentCopy => tool !== undefined)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async function readAgentTool(
    workspacePath: string,
    slug: string,
    globalMap?: Map<string, CustomTool>,
  ): Promise<CustomToolAgentCopy | undefined> {
    const entryPath = join(workspacePath, AGENT_TOOL_DIR, `${slug}.ts`);
    const entryPathJs = join(workspacePath, AGENT_TOOL_DIR, `${slug}.js`);
    const supportDirectoryPath = join(workspacePath, AGENT_TOOL_DIR, slug);
    const metadataPath = join(workspacePath, AGENT_TOOL_DIR, `${slug}.cc-tool-copy.json`);
    const resolvedEntryPath = (await pathExists(entryPath))
      ? entryPath
      : (await pathExists(entryPathJs))
        ? entryPathJs
        : undefined;

    if (!resolvedEntryPath) {
      return undefined;
    }

    const metadata = (await pathExists(metadataPath))
      ? agentCopyMetadataSchema.parse(JSON.parse(await readFile(metadataPath, "utf8")))
      : undefined;
    const fingerprint =
      metadata && (await pathExists(join(supportDirectoryPath, GLOBAL_ENTRY_FILE)))
        ? await computeDirectoryFingerprint(supportDirectoryPath)
        : await computeToolSnapshotFingerprint({
            entryPath: resolvedEntryPath,
            supportDirectoryPath: (await pathExists(supportDirectoryPath))
              ? supportDirectoryPath
              : undefined,
          });
    const resolvedGlobalMap =
      globalMap ?? new Map((await readGlobalTools(false)).map((tool) => [tool.slug, tool]));
    const sourceTool = metadata
      ? resolvedGlobalMap.get(metadata.sourceToolSlug)
      : resolvedGlobalMap.get(slug);
    const status = getAgentToolStatus({ fingerprint, metadata, sourceTool });
    const warnings = getBuiltInCollisionWarnings(slug);

    return customToolAgentCopySchema.parse({
      slug,
      name: metadata?.localToolName ?? metadata?.sourceToolName ?? sourceTool?.name ?? slug,
      description: metadata?.sourceDescription ?? sourceTool?.description ?? "",
      entryFile: basename(resolvedEntryPath),
      entryPath: resolvedEntryPath,
      supportDirectoryPath: (await pathExists(supportDirectoryPath))
        ? supportDirectoryPath
        : undefined,
      fingerprint,
      status,
      isManaged: metadata?.managedBy === "cc",
      sourceToolSlug: metadata?.sourceToolSlug,
      sourceFingerprint: metadata?.sourceFingerprint,
      copiedAt: metadata?.copiedAt,
      warnings,
    });
  }

  async function writeGlobalToolToAgent(input: {
    source: CustomTool;
    workspacePath: string;
    destinationName?: string;
    overwrite: boolean;
  }): Promise<boolean> {
    const destinationName = input.destinationName?.trim() || input.source.name;
    const destinationSlug = slugify(destinationName);
    const toolsDirectoryPath = join(input.workspacePath, AGENT_TOOL_DIR);
    const targetEntryPath = join(
      toolsDirectoryPath,
      `${destinationSlug}${extname(input.source.entryFile) || ".ts"}`,
    );
    const targetSupportDirectoryPath = join(toolsDirectoryPath, destinationSlug);
    const targetMetadataPath = join(toolsDirectoryPath, `${destinationSlug}.cc-tool-copy.json`);
    const existing =
      (await pathExists(targetEntryPath)) ||
      (await pathExists(join(toolsDirectoryPath, `${destinationSlug}.js`))) ||
      (await pathExists(join(toolsDirectoryPath, `${destinationSlug}.ts`))) ||
      (await pathExists(targetSupportDirectoryPath));

    if (existing && !input.overwrite) {
      throw new ConflictError(
        `Custom tool '${destinationSlug}' already exists in this agent workspace. Confirm overwrite to replace it.`,
      );
    }

    await mkdir(toolsDirectoryPath, { recursive: true });

    if (existing) {
      await removeAgentToolSnapshot(input.workspacePath, destinationSlug);
    }

    await mkdir(targetSupportDirectoryPath, { recursive: true });
    const supportFiles = await readdir(input.source.directoryPath, { withFileTypes: true });

    for (const entry of supportFiles) {
      if (entry.name === GLOBAL_METADATA_FILE) {
        continue;
      }

      const sourcePath = join(input.source.directoryPath, entry.name);
      const destinationPath = join(targetSupportDirectoryPath, entry.name);

      if (entry.isDirectory()) {
        await cp(sourcePath, destinationPath, { recursive: true });
        continue;
      }

      await mkdir(targetSupportDirectoryPath, { recursive: true });
      await copyFile(sourcePath, destinationPath);
    }

    await writeFile(
      targetEntryPath,
      renderAgentEntryWrapper(destinationSlug, input.source.entryFile),
      "utf8",
    );

    const metadata = agentCopyMetadataSchema.parse({
      version: 1,
      managedBy: "cc",
      localToolName: destinationName,
      sourceToolSlug: input.source.slug,
      sourceToolName: input.source.name,
      sourceDescription: input.source.description,
      sourceFingerprint: input.source.fingerprint,
      entryFile: basename(targetEntryPath),
      copiedAt: new Date().toISOString(),
    });

    await writeFile(targetMetadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    return existing;
  }

  async function removeAgentToolSnapshot(workspacePath: string, slug: string): Promise<void> {
    const toolsDirectoryPath = join(workspacePath, AGENT_TOOL_DIR);
    await rm(join(toolsDirectoryPath, `${slug}.ts`), { force: true });
    await rm(join(toolsDirectoryPath, `${slug}.js`), { force: true });
    await rm(join(toolsDirectoryPath, slug), { recursive: true, force: true });
    await rm(join(toolsDirectoryPath, `${slug}.cc-tool-copy.json`), { force: true });
  }

  async function computeToolSnapshotFingerprint(input: {
    entryPath: string;
    supportDirectoryPath?: string;
  }): Promise<string> {
    const files = [{ absolutePath: input.entryPath, relativePath: basename(input.entryPath) }];

    if (input.supportDirectoryPath && (await pathExists(input.supportDirectoryPath))) {
      files.push(
        ...(await listSnapshotFiles(
          input.supportDirectoryPath,
          input.supportDirectoryPath,
          new Set([input.entryPath]),
        )),
      );
    }

    const hash = createHash("sha256");

    for (const file of files.sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath),
    )) {
      hash.update(`${file.relativePath}\n`);
      hash.update(await readFile(file.absolutePath));
      hash.update("\n");
    }

    return hash.digest("hex");
  }

  async function computeDirectoryFingerprint(root: string): Promise<string> {
    const hash = createHash("sha256");
    const files = await listSnapshotFiles(root, root, new Set());

    for (const file of files.sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath),
    )) {
      hash.update(`${file.relativePath}\n`);
      hash.update(await readFile(file.absolutePath));
      hash.update("\n");
    }

    return hash.digest("hex");
  }

  async function listSnapshotFiles(
    root: string,
    baseRoot: string,
    excluded = new Set<string>(),
  ): Promise<Array<{ absolutePath: string; relativePath: string }>> {
    const entries = await readdir(root, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const absolutePath = join(root, entry.name);

        if (
          excluded.has(absolutePath) ||
          entry.name === GLOBAL_METADATA_FILE ||
          entry.name.endsWith(".cc-tool-copy.json")
        ) {
          return [];
        }

        if (entry.isDirectory()) {
          return listSnapshotFiles(absolutePath, baseRoot, excluded);
        }

        return [{ absolutePath, relativePath: relative(baseRoot, absolutePath) }];
      }),
    );

    return files.flat();
  }

  async function readLatestMtimeMs(root: string): Promise<number> {
    const rootStats = await stat(root);
    let latest = rootStats.mtimeMs;
    const entries = await readdir(root, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name === GLOBAL_METADATA_FILE) {
        continue;
      }

      const absolutePath = join(root, entry.name);
      const entryStats = await stat(absolutePath);
      latest = Math.max(latest, entryStats.mtimeMs);

      if (entry.isDirectory()) {
        latest = Math.max(latest, await readLatestMtimeMs(absolutePath));
      }
    }

    return latest;
  }

  async function writeGlobalMetadata(path: string, metadata: GlobalToolMetadata): Promise<void> {
    await writeFile(path, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  }

  async function syncGlobalToolRows(tools: CustomTool[]): Promise<void> {
    const existing = await options.db.select().from(custom_tools);
    const existingBySlug = new Map(existing.map((row) => [row.slug, row]));
    const nextSlugs = new Set(tools.map((tool) => tool.slug));

    for (const tool of tools) {
      await upsertGlobalToolRow(tool, existingBySlug.get(tool.slug));
    }

    for (const row of existing) {
      if (!nextSlugs.has(row.slug)) {
        await options.db.delete(custom_tools).where(eq(custom_tools.slug, row.slug));
      }
    }
  }

  async function upsertGlobalToolRow(
    tool: CustomTool,
    existing?: typeof custom_tools.$inferSelect,
  ): Promise<void> {
    const payload = {
      slug: tool.slug,
      name: tool.name,
      description: tool.description,
      entry_file: tool.entryFile,
      fingerprint: tool.fingerprint,
      enabled: tool.enabled,
      created_at: new Date(tool.createdAt),
      updated_at: new Date(tool.updatedAt),
    };

    if (existing) {
      await options.db.update(custom_tools).set(payload).where(eq(custom_tools.slug, tool.slug));
      return;
    }

    await options.db.insert(custom_tools).values({ id: tool.id, ...payload });
  }
}

function renderToolTemplate(name: string, description: string): string {
  return [
    'import { tool } from "@opencode-ai/plugin";',
    "",
    "export default tool({",
    `  description: ${JSON.stringify(description || `TODO: describe ${name.trim()}.`)},`,
    "  args: {},",
    "  async execute() {",
    '    return "TODO: implement this tool.";',
    "  },",
    "});",
    "",
  ].join("\n");
}

function renderAgentEntryWrapper(slug: string, entryFile: string): string {
  const specifier = `./${slug}/${entryFile.replace(/\.(ts|js)$/u, "")}`;

  return [`export { default } from ${JSON.stringify(specifier)};`, ""].join("\n");
}

function getAgentToolStatus(input: {
  fingerprint: string;
  metadata?: AgentCopyMetadata;
  sourceTool?: CustomTool;
}): CustomToolDriftStatus {
  if (!input.metadata) {
    return input.sourceTool ? "unknown" : "agent_only";
  }

  if (!input.sourceTool) {
    return "agent_only";
  }

  if (input.sourceTool.fingerprint === input.fingerprint) {
    return "matching";
  }

  if (input.metadata.sourceFingerprint === input.fingerprint) {
    return "outdated";
  }

  return "modified";
}

function getBuiltInCollisionWarnings(slug: string): CustomToolWarning[] {
  if (!BUILT_IN_TOOL_NAMES.has(slug)) {
    return [];
  }

  return [
    {
      code: "built_in_collision",
      message: `Custom tool '${slug}' collides with a built-in OpenCode tool name and can override it.`,
    },
  ];
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return slug || "tool";
}
