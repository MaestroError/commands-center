import { describe, expect, it, vi } from "vitest";

import { runBootReconcile, type WorkspaceReconciler } from "../../src/lib/workspace-reconciler";
import type { RuntimeConfig } from "../../src/lib/runtime-config";
import type { AppDb } from "../../src/db/client";

const stubOpts = {
  config: {} as RuntimeConfig,
  db: {} as AppDb,
  logger: { debug: vi.fn(), error: vi.fn() } as never,
};

describe("runBootReconcile", () => {
  it("is a no-op for an empty reconciler list", async () => {
    await expect(runBootReconcile([], stubOpts)).resolves.toBeUndefined();
  });

  it("calls each reconciler in registration order", async () => {
    const order: string[] = [];
    const a: WorkspaceReconciler = {
      name: "a",
      reconcile: () => {
        order.push("a");
        return Promise.resolve();
      },
    };
    const b: WorkspaceReconciler = {
      name: "b",
      reconcile: () => {
        order.push("b");
        return Promise.resolve();
      },
    };
    const c: WorkspaceReconciler = {
      name: "c",
      reconcile: () => {
        order.push("c");
        return Promise.resolve();
      },
    };

    await runBootReconcile([a, b, c], stubOpts);
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("passes config, db, and logger to each reconciler", async () => {
    const received: unknown[] = [];
    const r: WorkspaceReconciler = {
      name: "r",
      reconcile: (opts) => {
        received.push(opts);
        return Promise.resolve();
      },
    };

    await runBootReconcile([r], stubOpts);
    expect(received[0]).toBe(stubOpts);
  });

  it("continues running subsequent reconcilers after one fails", async () => {
    const ran: string[] = [];
    const failing: WorkspaceReconciler = {
      name: "failing",
      reconcile: () => Promise.reject(new Error("boom")),
    };
    const after: WorkspaceReconciler = {
      name: "after",
      reconcile: () => {
        ran.push("after");
        return Promise.resolve();
      },
    };

    await runBootReconcile([failing, after], stubOpts);
    expect(ran).toEqual(["after"]);
  });

  it("logs an error when a reconciler fails without rethrowing", async () => {
    const logger = { debug: vi.fn(), error: vi.fn() } as never;
    const failing: WorkspaceReconciler = {
      name: "bad",
      reconcile: () => Promise.reject(new Error("disk error")),
    };

    await expect(runBootReconcile([failing], { ...stubOpts, logger })).resolves.toBeUndefined();

    expect((logger as { error: ReturnType<typeof vi.fn> }).error).toHaveBeenCalledWith(
      expect.objectContaining({ reconciler: "bad" }),
      expect.stringContaining("reconcile failed"),
    );
  });

  it("logs debug on success", async () => {
    const logger = { debug: vi.fn(), error: vi.fn() } as never;
    const ok: WorkspaceReconciler = {
      name: "ok",
      reconcile: () => Promise.resolve(),
    };

    await runBootReconcile([ok], { ...stubOpts, logger });

    expect((logger as { debug: ReturnType<typeof vi.fn> }).debug).toHaveBeenCalledWith(
      expect.objectContaining({ reconciler: "ok" }),
      expect.any(String),
    );
  });
});
