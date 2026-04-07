import { eq } from "drizzle-orm";

import type { AppDb } from "./client.js";
import { createId, now } from "./ids.js";
import { agents, settings } from "./schema/index.js";

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

export async function createAgentRecord(
  db: AppDb,
  input: {
    name: string;
    role: string;
    instructions: string;
    workspacePath: string;
    model?: string;
    iconPath?: string;
  },
) {
  const timestamp = now();
  const [agent] = await db
    .insert(agents)
    .values({
      id: createId(),
      name: input.name,
      role: input.role,
      instructions: input.instructions,
      workspace_path: input.workspacePath,
      model: input.model,
      icon_path: input.iconPath,
      created_at: timestamp,
      updated_at: timestamp,
    })
    .returning();

  return agent;
}

export async function listAgents(db: AppDb) {
  return db.query.agents.findMany({
    orderBy: (table, { desc }) => [desc(table.updated_at)],
  });
}
