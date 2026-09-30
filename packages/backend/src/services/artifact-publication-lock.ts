import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { setTimeout } from "node:timers/promises";

import Database from "better-sqlite3";

import { ConflictError } from "../lib/api-error.js";

export async function acquireArtifactPublicationLock(manifestPath: string): Promise<() => void> {
  await mkdir(dirname(manifestPath), { recursive: true });
  const database = new Database(`${manifestPath}.lock.sqlite`, { timeout: 0 });
  const deadline = Date.now() + 5_000;

  try {
    while (true) {
      try {
        database.exec("BEGIN IMMEDIATE");
        return () => database.close();
      } catch (error) {
        if (!(error instanceof Database.SqliteError) || error.code !== "SQLITE_BUSY") {
          throw error;
        }
        if (Date.now() >= deadline) {
          throw new ConflictError(
            "Artifact publication is busy in another process. Retry shortly.",
          );
        }
        await setTimeout(50);
      }
    }
  } catch (error) {
    database.close();
    throw error;
  }
}
