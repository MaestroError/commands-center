import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createLogger } from "../../src/lib/logger.js";
import { nativeCcToolsMigration } from "../../src/workspace-migrations/migrations/0012-native-cc-tools.js";
import { createTestDatabase } from "../helpers/db.js";

describe("native CC tool configuration migration", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let paths: string[];
  let original: string;
  let auth: string;
  beforeEach(async () => {
    db = await createTestDatabase();
    paths = [
      db.config.paths.workspaceDir,
      join(db.config.paths.subdirectories.specialists, "alpha"),
      join(db.config.paths.subdirectories.specialists, ".archived", "beta"),
    ].map((path) => join(path, "opencode.jsonc"));
    original = JSON.stringify({
      model: "test",
      manual: true,
      mcp: {
        servers: {
          cc_default: {
            type: "remote",
            url: "http://localhost:3000/api/mcp/cc/cc-default/specialists/alpha",
            headers: { Authorization: "Bearer test-only" },
          },
          external: {
            type: "remote",
            url: "https://example.com/mcp",
            headers: { Authorization: "Bearer external-test" },
          },
        },
      },
    });
    for (const path of paths) {
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, original);
    }
    auth = join(db.config.paths.subdirectories.auth, "cc-managed-mcp.json");
    await mkdir(db.config.paths.subdirectories.auth, { recursive: true });
    await writeFile(auth, '{"signingSecret":"test-only"}');
  });
  afterEach(async () => db.cleanup());
  const context = () => ({ config: db.config, logger: createLogger(db.config) });

  it("migrates JSONC with comments and trailing commas", async () => {
    await writeFile(paths[0]!, `// configuration\n${original.slice(0, -1)},}`);
    await nativeCcToolsMigration.up(context());
    expect(await readFile(paths[0]!, "utf8")).not.toContain("test-only");
  });
  it("restores original JSONC text on rollback", async () => {
    const jsonc = `/* operator comment */\n${original.slice(0, -1)},}`;
    await writeFile(paths[0]!, jsonc);
    await nativeCcToolsMigration.up(context());
    await nativeCcToolsMigration.down(context());
    expect(await readFile(paths[0]!, "utf8")).toBe(jsonc);
  });
  it("leaves archived JSONC without generated entries unchanged", async () => {
    const jsonc = '// manual settings\n{"model":"test",}';
    await writeFile(paths[2]!, jsonc);
    await nativeCcToolsMigration.up(context());
    expect(await readFile(paths[2]!, "utf8")).toBe(jsonc);
  });
  it("rejects malformed JSONC without accepting the parser partial result", async () => {
    const malformed = original + " trailing garbage";
    await writeFile(paths[0]!, malformed);
    await expect(nativeCcToolsMigration.up(context())).rejects.toThrow("Invalid JSONC");
    expect(await readFile(paths[0]!, "utf8")).toBe(malformed);
  });
  it("restricts credential-bearing backup permissions", async () => {
    await nativeCcToolsMigration.up(context());
    const backup = join(
      db.config.paths.workspaceDir,
      ".cc-migrations",
      "0012-native-cc-tools.json",
    );
    expect((await stat(backup)).mode & 0o777).toBe(0o600);
  });
  it("keeps rewritten configs private", async () => {
    await nativeCcToolsMigration.up(context());
    expect((await stat(paths[0]!)).mode & 0o777).toBe(0o600);
  });
  it("removes generated entries from root and active and archived configs", async () => {
    await nativeCcToolsMigration.up(context());
    for (const path of paths) expect(await readFile(path, "utf8")).not.toContain("test-only");
  });
  it("preserves external MCP credentials and manual fields", async () => {
    await nativeCcToolsMigration.up(context());
    expect(JSON.parse(await readFile(paths[0]!, "utf8"))).toMatchObject({
      manual: true,
      model: "test",
      mcp: { servers: { external: { headers: { Authorization: "Bearer external-test" } } } },
    });
  });
  it("retires the internal signing credential", async () => {
    await nativeCcToolsMigration.up(context());
    await expect(readFile(auth)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("does not modify workspace gitignore", async () => {
    const path = join(db.config.paths.workspaceDir, ".gitignore");
    await writeFile(path, "# operator settings\n");
    await nativeCcToolsMigration.up(context());
    expect(await readFile(path, "utf8")).toBe("# operator settings\n");
  });
  it("can resume a partially applied migration", async () => {
    await nativeCcToolsMigration.up(context());
    await writeFile(paths[1]!, original);
    await nativeCcToolsMigration.up(context());
    expect(await readFile(paths[1]!, "utf8")).not.toContain("test-only");
  });
  it("is idempotent after completion", async () => {
    await nativeCcToolsMigration.up(context());
    const first = await readFile(paths[0]!, "utf8");
    await nativeCcToolsMigration.up(context());
    expect(await readFile(paths[0]!, "utf8")).toBe(first);
  });
  it("fails without replacing invalid configuration", async () => {
    await writeFile(paths[0]!, "invalid");
    await expect(nativeCcToolsMigration.up(context())).rejects.toThrow();
    expect(await readFile(paths[0]!, "utf8")).toBe("invalid");
  });
  it("restores the original files on rollback", async () => {
    await nativeCcToolsMigration.up(context());
    await nativeCcToolsMigration.down(context());
    for (const path of paths) expect(await readFile(path, "utf8")).toBe(original);
  });
  it("makes repeated rollback idempotent", async () => {
    await nativeCcToolsMigration.up(context());
    await nativeCcToolsMigration.down(context());
    await nativeCcToolsMigration.down(context());
    expect(await readFile(auth, "utf8")).toBe('{"signingSecret":"test-only"}');
  });
  it("refuses rollback over subsequent operator edits", async () => {
    await nativeCcToolsMigration.up(context());
    await writeFile(paths[1]!, '{"operatorEdit":true}');
    await expect(nativeCcToolsMigration.down(context())).rejects.toThrow("Cannot roll back");
    expect(await readFile(paths[1]!, "utf8")).toBe('{"operatorEdit":true}');
  });
  it("accepts a fresh workspace with no generated files", async () => {
    for (const path of paths) await rm(path);
    await rm(auth);
    await expect(nativeCcToolsMigration.up(context())).resolves.toBeUndefined();
  });
});
