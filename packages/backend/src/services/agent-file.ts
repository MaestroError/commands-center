import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import type { Logger } from "pino";
import { z } from "zod";

import { createId, now } from "../db/ids.js";
import { agents } from "../db/schema/index.js";
import { readConfigFile, writeConfigFileAtomic } from "../lib/config-file.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import type { WorkspaceReconciler } from "../lib/workspace-reconciler.js";
import { parseRulesMarkdown } from "../opencode/workspace-contract.js";
import {
  specialistCapabilitySelectionSchema,
  type SpecialistCapabilitySelection,
} from "../schemas/specialists.js";

// Placeholder model for hand-dropped folders that carry no model hint. Non-empty
// so the agent row satisfies the schema; the owner is expected to set a real one.
const IMPORTED_AGENT_DEFAULT_MODEL = "unconfigured/model";
const IMPORTED_AGENT_DEFAULT_ROLE = "Imported agent";
const IMPORTED_AGENT_DEFAULT_INSTRUCTIONS = "Imported agent. Configure role and instructions.";

type SpecialistStatus = "active" | "archived";

// ---------------------------------------------------------------------------
// agent.json file schema  (agents/<slug>/agent.json)
// ---------------------------------------------------------------------------

export const agentFileSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  instructions: z.string().min(1),
  defaultModel: z.string().min(1),
  iconPath: z.string().min(1).optional(),
  capabilities: specialistCapabilitySelectionSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AgentFileContent = z.infer<typeof agentFileSchema>;

function agentsRoot(config: RuntimeConfig, status: SpecialistStatus): string {
  return status === "archived"
    ? join(config.paths.subdirectories.agents, ".archived")
    : config.paths.subdirectories.agents;
}

export function agentFilePath(
  config: RuntimeConfig,
  slug: string,
  status: SpecialistStatus,
): string {
  return join(agentsRoot(config, status), slug, "agent.json");
}

// Accept the input shape for capabilities (optional arrays) since callers pass
// the not-yet-defaulted selection; the schema fills defaults on read.
export type AgentFileInput = Omit<AgentFileContent, "version" | "capabilities"> & {
  capabilities: SpecialistCapabilitySelection;
};

export async function writeAgentFile(
  config: RuntimeConfig,
  slug: string,
  status: SpecialistStatus,
  content: AgentFileInput,
): Promise<void> {
  await writeConfigFileAtomic(agentFilePath(config, slug, status), { version: 1, ...content });
}

// ---------------------------------------------------------------------------
// Boot reconciler — folder = truth, agents row = derived cache
// ---------------------------------------------------------------------------

type DiscoveredAgent = AgentFileContent & { slug: string; status: SpecialistStatus };

export const agentReconciler: WorkspaceReconciler = {
  name: "agents",

  async reconcile({ config, db, logger }) {
    const discovered = [
      ...(await scanRoot(config, "active", logger)),
      ...(await scanRoot(config, "archived", logger)),
    ];

    const seenIds = new Set<string>();

    for (const agent of discovered) {
      seenIds.add(agent.id);

      const archivedAt = agent.status === "archived" ? new Date(agent.updatedAt) : null;
      const payload = {
        slug: agent.slug,
        name: agent.name,
        role: agent.role,
        instructions: agent.instructions,
        default_model: agent.defaultModel,
        icon_path: agent.iconPath ?? null,
        status: agent.status,
        capabilities_json: JSON.stringify(agent.capabilities),
        updated_at: new Date(agent.updatedAt),
        archived_at: archivedAt,
      };

      const existing = await db.query.agents.findFirst({
        where: (t, { eq: equals }) => equals(t.id, agent.id),
      });

      if (existing) {
        await db.update(agents).set(payload).where(eq(agents.id, agent.id));
      } else {
        await db.insert(agents).values({
          id: agent.id,
          ...payload,
          created_at: new Date(agent.createdAt),
        });
      }
    }

    // Delete derived rows whose source folder is gone.
    const rows = await db.select({ id: agents.id }).from(agents);
    for (const row of rows) {
      if (!seenIds.has(row.id)) {
        await db.delete(agents).where(eq(agents.id, row.id));
      }
    }
  },
};

async function scanRoot(
  config: RuntimeConfig,
  status: SpecialistStatus,
  logger: Logger,
): Promise<DiscoveredAgent[]> {
  const root = agentsRoot(config, status);
  const entries = await readDirEntries(root);
  const discovered: DiscoveredAgent[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    // Skip the archived container (only relevant under the active root) and any
    // hidden directories.
    if (entry.name.startsWith(".")) continue;

    const identity = await resolveAgentIdentity(config, entry.name, status, logger);
    if (identity) {
      discovered.push(identity);
    }
  }

  return discovered;
}

async function resolveAgentIdentity(
  config: RuntimeConfig,
  slug: string,
  status: SpecialistStatus,
  logger: Logger,
): Promise<DiscoveredAgent | undefined> {
  // 1. CC-native: agent.json present and valid.
  const file = await readConfigFile(agentFilePath(config, slug, status), agentFileSchema, logger);
  if (file) {
    return { ...file, slug, status };
  }

  // 2/3/4. Infer from render files, generate a stable id, then write agent.json
  // so the next boot is CC-native.
  const folder = join(agentsRoot(config, status), slug);
  const inferred = await inferFromFolder(folder, slug, logger);

  const timestamp = now().toISOString();
  const content: Omit<AgentFileContent, "version"> = {
    id: createId(),
    name: inferred.name,
    role: inferred.role,
    instructions: inferred.instructions,
    defaultModel: inferred.defaultModel,
    capabilities: specialistCapabilitySelectionSchema.parse({}),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  try {
    await writeAgentFile(config, slug, status, content);
  } catch (err) {
    // Read-only workspace: keep the agent usable for this boot with an in-memory
    // id and warn that stable identity cannot be persisted yet.
    logger.warn(
      { slug, err },
      "could not write agent.json; agent usable this boot but identity is not persisted",
    );
  }

  return { version: 1, ...content, slug, status };
}

async function inferFromFolder(
  folder: string,
  slug: string,
  logger: Logger,
): Promise<{ name: string; role: string; instructions: string; defaultModel: string }> {
  // OpenCode-style: AGENTS.md (+ opencode.jsonc for model).
  const rules = await readOptional(join(folder, "AGENTS.md"));
  if (rules) {
    try {
      const parsed = parseRulesMarkdown(rules);
      return {
        name: parsed.title,
        role: parsed.role,
        instructions: parsed.instructions,
        defaultModel: (await readModelFromConfig(folder)) ?? IMPORTED_AGENT_DEFAULT_MODEL,
      };
    } catch {
      // Malformed AGENTS.md — fall through to other layouts.
    }
  }

  // Claude-style: CLAUDE.md as instructions.
  const claude = await readOptional(join(folder, "CLAUDE.md"));
  if (claude && claude.trim().length > 0) {
    return {
      name: slug,
      role: IMPORTED_AGENT_DEFAULT_ROLE,
      instructions: claude.trim(),
      defaultModel: (await readModelFromConfig(folder)) ?? IMPORTED_AGENT_DEFAULT_MODEL,
    };
  }

  // Plain folder: defaults derived from the slug.
  logger.warn(
    { slug },
    "discovered agent folder without recognizable metadata; using placeholder role/model",
  );
  return {
    name: slug,
    role: IMPORTED_AGENT_DEFAULT_ROLE,
    instructions: IMPORTED_AGENT_DEFAULT_INSTRUCTIONS,
    defaultModel: IMPORTED_AGENT_DEFAULT_MODEL,
  };
}

async function readDirEntries(root: string) {
  try {
    return await readdir(root, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function readModelFromConfig(folder: string): Promise<string | undefined> {
  const raw = await readOptional(join(folder, "opencode.jsonc"));
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as { model?: unknown };
    return typeof parsed.model === "string" && parsed.model.length > 0 ? parsed.model : undefined;
  } catch {
    return undefined;
  }
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}
