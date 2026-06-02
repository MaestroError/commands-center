import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { Logger } from "pino";
import type { z } from "zod";

/**
 * Reads a bucket-B configuration file, validates it with a Zod schema, and
 * returns the parsed value.  Returns `null` in three safe cases:
 *   - the file does not exist (caller should use defaults)
 *   - the file contains invalid JSON (logged, caller uses defaults)
 *   - the value fails schema validation (logged, caller uses defaults)
 *
 * Only rethrows for unexpected I/O errors (e.g. EACCES).
 */
export async function readConfigFile<T>(
  path: string,
  schema: z.ZodType<T>,
  logger?: Logger,
): Promise<T | null> {
  let raw: string;

  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    logger?.error({ path }, "config file contains invalid JSON — using defaults");
    return null;
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    logger?.error(
      { path, issues: result.error.issues },
      "config file failed schema validation — using defaults",
    );
    return null;
  }

  return result.data;
}

/**
 * Atomically writes a bucket-B configuration file.  Serialises `data` to
 * indented JSON, writes to a sibling `.tmp` file, then renames over the
 * target so the source of truth is never partially written.  Creates the
 * parent directory if it does not exist.
 */
export async function writeConfigFileAtomic(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(tmp, path);
}
