import { realpath } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

const pendingWrites = new Map<string, Promise<void>>();

export async function withFileMutationLock<T>(
  path: string,
  operation: () => Promise<T>,
): Promise<T> {
  let key: string;
  try {
    key = await realpath(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    key = resolve(await realpath(dirname(path)), basename(path));
  }
  const previous = pendingWrites.get(key);
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  pendingWrites.set(key, pending);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (pendingWrites.get(key) === pending) pendingWrites.delete(key);
  }
}
