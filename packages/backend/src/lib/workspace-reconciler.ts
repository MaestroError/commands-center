import type { Logger } from "pino";

import type { AppDb } from "../db/client.js";
import type { RuntimeConfig } from "./runtime-config.js";

export type WorkspaceReconciler = {
  /** Human-readable name used in log messages. */
  name: string;
  /**
   * Reads source files/folders and upserts the corresponding derived DB rows,
   * deleting rows whose source is gone.  Called once at boot, in series, in
   * the order the reconcilers are registered.
   *
   * A reconciler must be idempotent — running it twice in a row must leave the
   * DB in the same state as running it once.
   */
  reconcile(opts: { config: RuntimeConfig; db: AppDb; logger: Logger }): Promise<void>;
};

/**
 * Runs every registered reconciler in series so that FK-dependent entities
 * (e.g. `task_templates` → `agents`) are always reconciled after their
 * prerequisites.
 *
 * Intended registration order:
 *   settings → mcp_servers → custom_tools → agents → task_templates
 *
 * A reconciler failure is logged but does not abort subsequent reconcilers —
 * a partial boot is better than a total boot failure when one config file is
 * corrupt.
 */
export async function runBootReconcile(
  reconcilers: WorkspaceReconciler[],
  opts: { config: RuntimeConfig; db: AppDb; logger: Logger },
): Promise<void> {
  for (const reconciler of reconcilers) {
    try {
      await reconciler.reconcile(opts);
      opts.logger.debug({ reconciler: reconciler.name }, "workspace reconcile completed");
    } catch (err) {
      opts.logger.error(
        { reconciler: reconciler.name, err },
        "workspace reconcile failed — derived cache may be stale until next boot",
      );
    }
  }
}
