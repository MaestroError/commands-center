import { describe, expect, it } from "vitest";

import { api_token_activity } from "../../src/db/schema/index";
import { createId } from "../../src/db/ids";
import { createTokenAuditService } from "../../src/services/token-audit-service";
import { createTestDatabase } from "../helpers/db";

describe("createTokenAuditService", () => {
  it("records and lists entries newest-first with a redacted input summary", async () => {
    const testDb = await createTestDatabase();
    const audit = createTokenAuditService({ db: testDb.client.db, config: testDb.config });

    try {
      await audit.record({
        tokenId: "tok-1",
        tokenName: "Automation",
        surface: "rest",
        action: "POST /api/public/v1/task-templates/:id/trigger",
        capabilityId: "trigger_task_template",
        targetKind: "template",
        targetId: "tmpl-1",
        input: {
          context: { text: "x".repeat(900) },
          files: [{ filename: "a.png", mimeType: "image/png", sizeBytes: 10, dataUrl: "AAAA" }],
          secret: "cc_supersecrettokenvalue123456",
        },
        outcome: "ok",
        statusCode: 200,
      });

      const listed = await audit.listForToken({ tokenId: "tok-1" });
      expect(listed.entries).toHaveLength(1);
      const entry = listed.entries[0]!;
      expect(entry).toMatchObject({
        tokenId: "tok-1",
        tokenName: "Automation",
        surface: "rest",
        capabilityId: "trigger_task_template",
        targetKind: "template",
        targetId: "tmpl-1",
        outcome: "ok",
        statusCode: 200,
      });

      const summary = entry.inputSummary as {
        context: { text: string };
        files: Array<{ dataUrl: string; sizeBytes: number }>;
        secret: string;
      };
      // Text truncated, file bytes omitted, secret redacted.
      expect(summary.context.text.length).toBeLessThan(900);
      expect(summary.files[0]?.dataUrl).toBe("[omitted]");
      expect(summary.files[0]?.sizeBytes).toBe(10);
      expect(summary.secret).toBe("[redacted]");
    } finally {
      await testDb.cleanup();
    }
  });

  it("paginates via cursor", async () => {
    const testDb = await createTestDatabase();
    const audit = createTokenAuditService({ db: testDb.client.db, config: testDb.config });

    try {
      for (let i = 0; i < 5; i += 1) {
        await audit.record({
          tokenId: "tok-1",
          tokenName: "A",
          surface: "mcp",
          action: `tool_${String(i)}`,
          outcome: "ok",
        });
      }

      const first = await audit.listForToken({ tokenId: "tok-1", limit: 2 });
      expect(first.entries).toHaveLength(2);
      expect(first.nextCursor).not.toBeNull();

      const second = await audit.listForToken({
        tokenId: "tok-1",
        limit: 2,
        cursor: first.nextCursor,
      });
      expect(second.entries).toHaveLength(2);
      // No overlap between pages.
      const firstIds = new Set(first.entries.map((e) => e.id));
      expect(second.entries.every((e) => !firstIds.has(e.id))).toBe(true);
    } finally {
      await testDb.cleanup();
    }
  });

  it("prunes entries older than the cutoff", async () => {
    const testDb = await createTestDatabase();
    const audit = createTokenAuditService({ db: testDb.client.db, config: testDb.config });

    try {
      const old = Date.now() - 60 * 24 * 60 * 60 * 1000;
      await testDb.client.db.insert(api_token_activity).values({
        id: createId(),
        token_id: "tok-1",
        token_name: "A",
        surface: "rest",
        action: "GET /api/public/v1/tasks",
        capability_id: null,
        target_kind: null,
        target_id: null,
        input_summary_json: null,
        outcome: "ok",
        status_code: 200,
        error_message: null,
        created_at: new Date(old),
      });
      await audit.record({
        tokenId: "tok-1",
        tokenName: "A",
        surface: "rest",
        action: "recent",
        outcome: "ok",
      });

      const deleted = await audit.prune(Date.now() - 30 * 24 * 60 * 60 * 1000);
      expect(deleted).toBe(1);
      const listed = await audit.listForToken({ tokenId: "tok-1" });
      expect(listed.entries).toHaveLength(1);
      expect(listed.entries[0]?.action).toBe("recent");
    } finally {
      await testDb.cleanup();
    }
  });

  it("reads and clamps the retention setting", async () => {
    const testDb = await createTestDatabase();
    const audit = createTokenAuditService({ db: testDb.client.db, config: testDb.config });

    try {
      expect(await audit.getSettings()).toEqual({ retentionWeeks: 4 });

      const updated = await audit.setSettings({ retentionWeeks: 8 });
      expect(updated).toEqual({ retentionWeeks: 8 });
      expect(await audit.getSettings()).toEqual({ retentionWeeks: 8 });

      await expect(audit.setSettings({ retentionWeeks: 25 })).rejects.toThrow();
    } finally {
      await testDb.cleanup();
    }
  });
});
