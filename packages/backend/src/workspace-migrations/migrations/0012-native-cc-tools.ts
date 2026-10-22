import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { z } from "zod";
import { parse, type ParseError } from "jsonc-parser";

import { CC_MANAGED_GROUP_METAS } from "../../mcp/cc-managed/group-metadata.js";
import type { WorkspaceMigration } from "../types.js";

const backupSchema = z.object({
  files: z.array(
    z.object({
      path: z
        .string()
        .regex(/^(opencode\.jsonc|specialists\/(?:\.archived\/)?[a-zA-Z0-9_-]+\/opencode\.jsonc)$/),
      before: z.string(),
      after: z.string(),
    }),
  ),
  auth: z.string().optional(),
});
async function optionalFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
async function directories(path: string): Promise<string[]> {
  try {
    return (await readdir(path, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => join(path, entry.name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export const nativeCcToolsMigration: WorkspaceMigration = {
  id: "0012-native-cc-tools",
  description: "Remove generated internal MCP configuration and retire its credentials",
  async up({ config }) {
    const root = config.paths.workspaceDir;
    const backupPath = join(root, ".cc-migrations", "0012-native-cc-tools.json");
    const authPath = join(config.paths.subdirectories.auth, "cc-managed-mcp.json");
    const previous = await optionalFile(backupPath);
    let backup: z.infer<typeof backupSchema>;
    if (previous !== undefined) backup = backupSchema.parse(JSON.parse(previous));
    else {
      backup = { files: [], auth: await optionalFile(authPath) };
      const locations = [
        root,
        ...(await directories(config.paths.subdirectories.specialists)),
        ...(await directories(join(config.paths.subdirectories.specialists, ".archived"))),
      ];
      for (const location of locations) {
        const path = join(location, "opencode.jsonc");
        const before = await optionalFile(path);
        if (before === undefined) continue;
        const errors: ParseError[] = [];
        const parsedConfig: unknown = parse(before, errors, { allowTrailingComma: true });
        if (errors.length > 0) throw new Error(`Invalid JSONC configuration: ${path}`);
        const data = z.record(z.string(), z.unknown()).parse(parsedConfig);
        if (!data["mcp"]) continue;
        const mcp = z.record(z.string(), z.unknown()).parse(data["mcp"]);
        const servers = z.record(z.string(), z.unknown()).parse(mcp["servers"] ?? {});
        let changed = false;
        for (const group of CC_MANAGED_GROUP_METAS) {
          const parsed = z
            .object({ type: z.literal("remote"), url: z.string() })
            .safeParse(servers[group.name]);
          if (!parsed.success || !parsed.data.url.includes("/api/mcp/cc/")) continue;
          delete servers[group.name];
          changed = true;
        }
        if (changed)
          backup.files.push({
            path: relative(root, path).replaceAll("\\", "/"),
            before,
            after: `${JSON.stringify({ ...data, mcp: { ...mcp, servers } }, null, 2)}\n`,
          });
      }
      backupSchema.parse(backup);
      await writePrivateFile(backupPath, `${JSON.stringify(backup, null, 2)}\n`);
    }
    for (const file of backup.files) {
      const path = join(root, file.path);
      const current = await optionalFile(path);
      if (current === file.after) continue;
      if (current !== file.before)
        throw new Error(`Conflicting native tool migration file: ${file.path}`);
      await writePrivateFile(path, file.after);
    }
    const auth = await optionalFile(authPath);
    if (auth !== undefined && auth !== backup.auth)
      throw new Error("Internal MCP credentials changed during migration.");
    await rm(authPath, { force: true });
  },
  async down({ config }) {
    const root = config.paths.workspaceDir;
    const saved = await optionalFile(join(root, ".cc-migrations", "0012-native-cc-tools.json"));
    if (saved === undefined) return;
    const backup = backupSchema.parse(JSON.parse(saved));
    for (const file of backup.files) {
      const current = await optionalFile(join(root, file.path));
      if (current !== file.before && current !== file.after)
        throw new Error(`Cannot roll back changed native tool configuration: ${file.path}`);
    }
    const authPath = join(config.paths.subdirectories.auth, "cc-managed-mcp.json");
    const auth = await optionalFile(authPath);
    if (auth !== undefined && auth !== backup.auth)
      throw new Error("Cannot roll back changed MCP credentials.");
    for (const file of backup.files) await writePrivateFile(join(root, file.path), file.before);
    if (backup.auth !== undefined) {
      await mkdir(dirname(authPath), { recursive: true });
      await writePrivateFile(authPath, backup.auth);
    }
  },
};

async function writePrivateFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
