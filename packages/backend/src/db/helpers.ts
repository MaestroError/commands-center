import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { readConfigFile, writeConfigFileAtomic } from "../lib/config-file.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import type { WorkspaceReconciler } from "../lib/workspace-reconciler.js";
import type { AppDb } from "./client.js";
import { createId, now } from "./ids.js";
import { agents, settings } from "./schema/index.js";

// ---------------------------------------------------------------------------
// Settings file schema
// ---------------------------------------------------------------------------

const settingsFileSchema = z.object({
  version: z.literal(1),
  settings: z.record(z.string(), z.unknown()),
});

function settingsFilePath(config: RuntimeConfig): string {
  return resolve(config.paths.subdirectories.configuration, "settings.json");
}

// ---------------------------------------------------------------------------
// Settings — DB helpers (pure, no file I/O)
// ---------------------------------------------------------------------------

export async function upsertSetting(db: AppDb, key: string, value: unknown): Promise<void> {
  const existing = await db.query.settings.findFirst({
    where: (table, { eq }) => eq(table.key, key),
  });

  if (existing) {
    await db
      .update(settings)
      .set({
        value_json: JSON.stringify(value),
        updated_at: now(),
      })
      .where(eq(settings.id, existing.id));
    return;
  }

  const createdAt = now();

  await db.insert(settings).values({
    id: createId(),
    key,
    value_json: JSON.stringify(value),
    created_at: createdAt,
    updated_at: createdAt,
  });
}

export async function getSetting<T>(db: AppDb, key: string): Promise<T | undefined> {
  const record = await db.query.settings.findFirst({
    where: (table, { eq }) => eq(table.key, key),
  });

  if (!record) {
    return undefined;
  }

  return JSON.parse(record.value_json) as T;
}

// ---------------------------------------------------------------------------
// Settings — file-first write
// ---------------------------------------------------------------------------

/**
 * File-first variant of upsertSetting.  Merges the key into
 * configuration/settings.json first, then upserts the DB row.  Use this
 * wherever settings are written through an API handler; use the plain
 * upsertSetting only for boot-reconcile DB writes.
 */
export async function upsertSettingFilefirst(
  db: AppDb,
  config: RuntimeConfig,
  key: string,
  value: unknown,
): Promise<void> {
  const path = settingsFilePath(config);

  // Read the file explicitly so we can distinguish "missing" (safe to
  // default to empty) from "corrupt/invalid" (must abort rather than
  // silently discard all other settings).
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      raw = "";
    } else {
      throw err;
    }
  }

  let current: { version: 1; settings: Record<string, unknown> };

  if (raw === "") {
    current = { version: 1, settings: {} };
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(
        `configuration/settings.json contains invalid JSON — refusing write to avoid data loss. Fix or delete the file to continue.`,
      );
    }
    const result = settingsFileSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `configuration/settings.json failed schema validation — refusing write to avoid data loss. Fix or delete the file to continue.`,
      );
    }
    current = result.data;
  }

  await writeConfigFileAtomic(path, {
    ...current,
    settings: { ...current.settings, [key]: value },
  });

  await upsertSetting(db, key, value);
}

// ---------------------------------------------------------------------------
// Settings — boot reconciler
// ---------------------------------------------------------------------------

export const settingsReconciler: WorkspaceReconciler = {
  name: "settings",

  async reconcile({ config, db, logger }) {
    const data = await readConfigFile(settingsFilePath(config), settingsFileSchema, logger);
    if (!data) return;

    const fileKeys = new Set(Object.keys(data.settings));

    for (const [key, value] of Object.entries(data.settings)) {
      await upsertSetting(db, key, value);
    }

    const existing = await db.select().from(settings);
    for (const row of existing) {
      if (!fileKeys.has(row.key)) {
        await db.delete(settings).where(eq(settings.id, row.id));
      }
    }
  },
};

// ---------------------------------------------------------------------------
// Specialist helpers (unchanged)
// ---------------------------------------------------------------------------

export async function createAgentRecord(
  db: AppDb,
  input: {
    name: string;
    slug?: string;
    role: string;
    instructions: string;
    defaultModel?: string;
    iconPath?: string;
  },
) {
  const timestamp = now();
  const [agent] = await db
    .insert(agents)
    .values({
      id: createId(),
      slug: input.slug ?? input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name: input.name,
      role: input.role,
      instructions: input.instructions,
      default_model: input.defaultModel ?? "test/model",
      icon_path: input.iconPath,
      status: "active",
      capabilities_json: JSON.stringify({
        builtInSkills: [],
        workspaceSkills: [],
        customTools: [],
        mcpServers: [],
        toolPermissions: [],
      }),
      created_at: timestamp,
      updated_at: timestamp,
      archived_at: null,
    })
    .returning();

  return agent;
}

export async function listAgents(db: AppDb) {
  return db.query.agents.findMany({
    orderBy: (table, { desc }) => [desc(table.updated_at)],
  });
}
