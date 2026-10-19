import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { withFileMutationLock } from "../../src/lib/file-mutation-lock.js";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "cc-file-lock-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

it("serializes writes through symlink aliases", async () => {
  const path = join(directory, "prompt.md");
  const alias = join(directory, "alias.md");
  await writeFile(path, "Prompt");
  await symlink(path, alias);
  let active = 0;
  let maximum = 0;
  await Promise.all(
    [path, alias, path].map((target) =>
      withFileMutationLock(target, async () => {
        active += 1;
        maximum = Math.max(maximum, active);
        await writeFile(path, "Changed");
        active -= 1;
      }),
    ),
  );
  expect(maximum).toBe(1);
});

it("releases a lock after a failed operation", async () => {
  const path = join(directory, "prompt.md");
  await expect(
    withFileMutationLock(path, () => Promise.reject(new Error("Failed write"))),
  ).rejects.toThrow("Failed write");
  await expect(withFileMutationLock(path, () => Promise.resolve("Recovered"))).resolves.toBe(
    "Recovered",
  );
});
