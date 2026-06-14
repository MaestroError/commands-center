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
// so the specialist row satisfies the schema; the owner is expected to set a real one.
const IMPORTED_SPECIALIST_DEFAULT_MODEL = "unconfigured/model";
const IMPORTED_SPECIALIST_DEFAULT_ROLE = "Imported specialist";
const IMPORTED_SPECIALIST_DEFAULT_INSTRUCTIONS =
  "Imported specialist. Configure role and instructions.";

type SpecialistStatus = "active" | "archived";

// ---------------------------------------------------------------------------
// specialist.json file schema  (specialists/<slug>/specialist.json)
// ---------------------------------------------------------------------------

export const specialistFileSchema = z.object({
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

export type SpecialistFileContent = z.infer<typeof specialistFileSchema>;

function specialistsRoot(config: RuntimeConfig, status: SpecialistStatus): string {
  return status === "archived"
    ? join(config.paths.subdirectories.specialists, ".archived")
    : config.paths.subdirectories.specialists;
}

export function specialistFilePath(
  config: RuntimeConfig,
  slug: string,
  status: SpecialistStatus,
): string {
  return join(specialistsRoot(config, status), slug, "specialist.json");
}

// Accept the input shape for capabilities (optional arrays) since callers pass
// the not-yet-defaulted selection; the schema fills defaults on read.
export type SpecialistFileInput = Omit<SpecialistFileContent, "version" | "capabilities"> & {
  capabilities: SpecialistCapabilitySelection;
};

export async function writeSpecialistFile(
  config: RuntimeConfig,
  slug: string,
  status: SpecialistStatus,
  content: SpecialistFileInput,
): Promise<void> {
  await writeConfigFileAtomic(specialistFilePath(config, slug, status), { version: 1, ...content });
}

// ---------------------------------------------------------------------------
// Boot reconciler — folder = truth, specialists row = derived cache
// ---------------------------------------------------------------------------

type DiscoveredSpecialist = SpecialistFileContent & { slug: string; status: SpecialistStatus };

export const specialistReconciler: WorkspaceReconciler = {
  name: "specialists",

  async reconcile({ config, db, logger }) {
    const discovered = [
      ...(await scanRoot(config, "active", logger)),
      ...(await scanRoot(config, "archived", logger)),
    ];

    const seenIds = new Set<string>();

    for (const specialist of discovered) {
      seenIds.add(specialist.id);

      const archivedAt = specialist.status === "archived" ? new Date(specialist.updatedAt) : null;
      const payload = {
        slug: specialist.slug,
        name: specialist.name,
        role: specialist.role,
        instructions: specialist.instructions,
        default_model: specialist.defaultModel,
        icon_path: specialist.iconPath ?? null,
        status: specialist.status,
        capabilities_json: JSON.stringify(specialist.capabilities),
        updated_at: new Date(specialist.updatedAt),
        archived_at: archivedAt,
      };

      const existing = await db.query.agents.findFirst({
        where: (t, { eq: equals }) => equals(t.id, specialist.id),
      });

      if (existing) {
        await db.update(agents).set(payload).where(eq(agents.id, specialist.id));
      } else {
        await db.insert(agents).values({
          id: specialist.id,
          ...payload,
          created_at: new Date(specialist.createdAt),
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
): Promise<DiscoveredSpecialist[]> {
  const root = specialistsRoot(config, status);
  const entries = await readDirEntries(root);
  const discovered: DiscoveredSpecialist[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    // Skip the archived container (only relevant under the active root) and any
    // hidden directories.
    if (entry.name.startsWith(".")) continue;

    const identity = await resolveSpecialistIdentity(config, entry.name, status, logger);
    if (identity) {
      discovered.push(identity);
    }
  }

  return discovered;
}

async function resolveSpecialistIdentity(
  config: RuntimeConfig,
  slug: string,
  status: SpecialistStatus,
  logger: Logger,
): Promise<DiscoveredSpecialist | undefined> {
  // 1. CC-native: specialist.json present and valid.
  const file = await readConfigFile(
    specialistFilePath(config, slug, status),
    specialistFileSchema,
    logger,
  );
  if (file) {
    return { ...file, slug, status };
  }

  // 2/3/4. Infer from render files, generate a stable id, then write specialist.json
  // so the next boot is CC-native.
  const folder = join(specialistsRoot(config, status), slug);
  const inferred = await inferFromFolder(folder, slug, logger);

  const timestamp = now().toISOString();
  const content: Omit<SpecialistFileContent, "version"> = {
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
    await writeSpecialistFile(config, slug, status, content);
  } catch (err) {
    // Read-only workspace: keep the specialist usable for this boot with an in-memory
    // id and warn that stable identity cannot be persisted yet.
    logger.warn(
      { slug, err },
      "could not write specialist.json; specialist usable this boot but identity is not persisted",
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
        defaultModel: (await readModelFromConfig(folder)) ?? IMPORTED_SPECIALIST_DEFAULT_MODEL,
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
      role: IMPORTED_SPECIALIST_DEFAULT_ROLE,
      instructions: claude.trim(),
      defaultModel: (await readModelFromConfig(folder)) ?? IMPORTED_SPECIALIST_DEFAULT_MODEL,
    };
  }

  // Plain folder: defaults derived from the slug.
  logger.warn(
    { slug },
    "discovered specialist folder without recognizable metadata; using placeholder role/model",
  );
  return {
    name: slug,
    role: IMPORTED_SPECIALIST_DEFAULT_ROLE,
    instructions: IMPORTED_SPECIALIST_DEFAULT_INSTRUCTIONS,
    defaultModel: IMPORTED_SPECIALIST_DEFAULT_MODEL,
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
