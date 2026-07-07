import { describe, expect, it } from "vitest";

import type { SpecialistCapabilitySelection } from "@cc/shared/schemas";

import {
  CC_MANAGED_GROUP_METAS,
  resolveCompanionPromptOverrides,
} from "@/mcp/cc-managed/group-metadata.js";
import { createCcManagedMcpServerRegistry } from "@/mcp/cc-managed/server-registry.js";
import type { createCustomToolService } from "@/services/custom-tool-service.js";

function selection(
  appMcpServers: SpecialistCapabilitySelection["appMcpServers"],
): Pick<SpecialistCapabilitySelection, "appMcpServers"> {
  return { appMcpServers };
}

describe("resolveCompanionPromptOverrides", () => {
  it("defaults follow each group's enabledByDefault when unselected", () => {
    const overrides = resolveCompanionPromptOverrides(selection([]));
    // Optional groups are off by default → their companion prompts are off.
    expect(overrides["mcp-instructions-notifications"]).toBe(false);
    expect(overrides["mcp-instructions-tasks-management"]).toBe(false);
  });

  it("enables the companion prompt when its group is enabled", () => {
    const overrides = resolveCompanionPromptOverrides(
      selection([{ name: "cc_notifications", enabled: true, action: "allow" }]),
    );
    expect(overrides["mcp-instructions-notifications"]).toBe(true);
  });

  it("treats a denied or disabled group as off", () => {
    const denied = resolveCompanionPromptOverrides(
      selection([{ name: "cc_notifications", enabled: true, action: "deny" }]),
    );
    expect(denied["mcp-instructions-notifications"]).toBe(false);

    const disabled = resolveCompanionPromptOverrides(
      selection([{ name: "cc_notifications", enabled: false, action: "allow" }]),
    );
    expect(disabled["mcp-instructions-notifications"]).toBe(false);
  });
});

describe("registry ↔ metadata coupling", () => {
  it("constructs without throwing (companion-prompt sync assertion passes)", () => {
    expect(() =>
      createCcManagedMcpServerRegistry({
        // customToolService is the only required option; metadata-only build.
        customToolService: {} as ReturnType<typeof createCustomToolService>,
      }),
    ).not.toThrow();
  });

  it("registers cc_notifications with its companion prompt", () => {
    const meta = CC_MANAGED_GROUP_METAS.find((entry) => entry.name === "cc_notifications");
    expect(meta?.companionPromptId).toBe("mcp-instructions-notifications");
    expect(meta?.enabledByDefault).toBe(false);
  });
});
