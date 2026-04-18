import { describe, it, expect, beforeEach } from "vitest";
import type { ConversationPart } from "@cc/shared/schemas";
import {
  CONTEXT_GROUP_TOOLS,
  HIDDEN_TOOLS,
  getToolName,
  getToolStatus,
  getToolInput,
  getStatusDisplay,
  registerTool,
  resolveToolRenderer,
} from "./tool-registry";

function makePart(
  overrides: Partial<ConversationPart> & { id: string; type: string },
): ConversationPart {
  return { ...overrides } as ConversationPart;
}

describe("tool-registry", () => {
  describe("CONTEXT_GROUP_TOOLS", () => {
    it("contains read, glob, grep, list", () => {
      expect(CONTEXT_GROUP_TOOLS).toEqual(new Set(["read", "glob", "grep", "list"]));
    });
  });

  describe("HIDDEN_TOOLS", () => {
    it("contains todowrite", () => {
      expect(HIDDEN_TOOLS.has("todowrite")).toBe(true);
    });
  });

  describe("getToolName", () => {
    it("returns tool field when present", () => {
      const part = makePart({ id: "1", type: "tool", tool: "bash" });
      expect(getToolName(part)).toBe("bash");
    });

    it("falls back to name field", () => {
      const part = makePart({ id: "1", type: "tool", name: "grep" });
      expect(getToolName(part)).toBe("grep");
    });

    it("returns 'tool' as default", () => {
      const part = makePart({ id: "1", type: "tool" });
      expect(getToolName(part)).toBe("tool");
    });
  });

  describe("getToolStatus", () => {
    it("extracts status from state", () => {
      const part = makePart({ id: "1", type: "tool", state: { status: "completed" } } as never);
      expect(getToolStatus(part)).toBe("completed");
    });

    it("returns undefined when no state", () => {
      const part = makePart({ id: "1", type: "tool" });
      expect(getToolStatus(part)).toBeUndefined();
    });
  });

  describe("getToolInput", () => {
    it("extracts input object from state", () => {
      const part = makePart({
        id: "1",
        type: "tool",
        state: { input: { command: "ls" } },
      } as never);
      expect(getToolInput(part)).toEqual({ command: "ls" });
    });

    it("returns undefined for non-object input", () => {
      const part = makePart({ id: "1", type: "tool", state: { input: "string" } } as never);
      expect(getToolInput(part)).toBeUndefined();
    });
  });

  describe("getStatusDisplay", () => {
    it("returns Running for pending", () => {
      expect(getStatusDisplay("pending")).toEqual({ label: "Running", className: "text-info" });
    });

    it("returns Running for running", () => {
      expect(getStatusDisplay("running")).toEqual({ label: "Running", className: "text-info" });
    });

    it("returns Completed for completed", () => {
      expect(getStatusDisplay("completed")).toEqual({
        label: "Completed",
        className: "text-success",
      });
    });

    it("returns Error for error", () => {
      expect(getStatusDisplay("error")).toEqual({ label: "Error", className: "text-danger" });
    });

    it("returns empty label for unknown status", () => {
      expect(getStatusDisplay(undefined)).toEqual({ label: "", className: "text-text-secondary" });
    });
  });

  describe("registerTool / resolveToolRenderer", () => {
    beforeEach(() => {
      // Register a dummy component
      registerTool("test-tool", (() => null) as never);
    });

    it("resolves a registered tool", () => {
      expect(resolveToolRenderer("test-tool")).toBeDefined();
    });

    it("returns undefined for unregistered tool", () => {
      expect(resolveToolRenderer("nonexistent")).toBeUndefined();
    });
  });
});
