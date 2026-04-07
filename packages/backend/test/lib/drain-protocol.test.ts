import pino from "pino";
import { describe, expect, it } from "vitest";

import { createDrainController } from "../../src/lib/drain-protocol";

describe("createDrainController", () => {
  it("runs registered phases in protocol order and only drains once", async () => {
    const calls: string[] = [];
    const controller = createDrainController({
      logger: pino({ enabled: false }),
      timeoutMs: 1000,
      handlers: {
        stopAcceptingConnections: () => {
          calls.push("stopAcceptingConnections");
        },
        terminateChildProcesses: () => {
          calls.push("terminateChildProcesses");
        },
        closeResources: () => {
          calls.push("closeResources");
        },
      },
    });

    await controller.drain("manual");
    await controller.drain("manual");

    expect(calls).toEqual([
      "stopAcceptingConnections",
      "terminateChildProcesses",
      "closeResources",
    ]);
  });
});
