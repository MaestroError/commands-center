import { describe, expect, it } from "vitest";
import {
  terminalBackendTypeSchema,
  terminalCreateInputSchema,
  terminalListResponseSchema,
  terminalResizeInputSchema,
  terminalSessionSchema,
} from "../../src/schemas/terminal.js";

describe("terminal schemas", () => {
  describe("terminalBackendTypeSchema", () => {
    it("parses valid backend types", () => {
      expect(terminalBackendTypeSchema.parse("opencode")).toBe("opencode");
    });

    it("rejects invalid backend types", () => {
      expect(() => terminalBackendTypeSchema.parse("invalid")).toThrow();
      expect(() => terminalBackendTypeSchema.parse("")).toThrow();
    });
  });

  describe("terminalCreateInputSchema", () => {
    it("parses valid input with all fields", () => {
      const input = {
        backend: "opencode",
        cwd: "/home/user",
        shell: "/bin/zsh",
      };
      expect(terminalCreateInputSchema.parse(input)).toEqual(input);
    });

    it("parses valid input with optional fields omitted", () => {
      const input = {};
      const result = terminalCreateInputSchema.parse(input);
      expect(result.backend).toBeUndefined();
      expect(result.cwd).toBeUndefined();
      expect(result.shell).toBeUndefined();
    });

    it("parses valid input with only backend", () => {
      const input = { backend: "opencode" };
      expect(terminalCreateInputSchema.parse(input)).toEqual(input);
    });

    it("rejects invalid backend type", () => {
      const input = { backend: "invalid" };
      expect(() => terminalCreateInputSchema.parse(input)).toThrow();
    });

    it("rejects invalid cwd type", () => {
      const input = { cwd: 123 };
      expect(() => terminalCreateInputSchema.parse(input)).toThrow();
    });

    it("rejects invalid shell type", () => {
      const input = { shell: [] };
      expect(() => terminalCreateInputSchema.parse(input)).toThrow();
    });
  });

  describe("terminalSessionSchema", () => {
    it("parses valid session", () => {
      const session = {
        id: "session-123",
        backend: "opencode",
        cwd: "/home/user",
        createdAt: 1700000000000,
      };
      expect(terminalSessionSchema.parse(session)).toEqual(session);
    });

    it("rejects missing id", () => {
      const session = {
        backend: "opencode",
        cwd: "/home",
        createdAt: 1700000000000,
      };
      expect(() => terminalSessionSchema.parse(session)).toThrow();
    });

    it("rejects missing backend", () => {
      const session = {
        id: "session-123",
        cwd: "/home",
        createdAt: 1700000000000,
      };
      expect(() => terminalSessionSchema.parse(session)).toThrow();
    });

    it("rejects missing createdAt", () => {
      const session = {
        id: "session-123",
        backend: "opencode",
        cwd: "/home",
      };
      expect(() => terminalSessionSchema.parse(session)).toThrow();
    });

    it("rejects invalid backend type", () => {
      const session = {
        id: "session-123",
        backend: "invalid",
        cwd: "/home",
        createdAt: 1700000000000,
      };
      expect(() => terminalSessionSchema.parse(session)).toThrow();
    });

    it("rejects invalid createdAt type", () => {
      const session = {
        id: "session-123",
        backend: "opencode",
        cwd: "/home",
        createdAt: "1700000000000",
      };
      expect(() => terminalSessionSchema.parse(session)).toThrow();
    });
  });

  describe("terminalListResponseSchema", () => {
    it("parses valid list response", () => {
      const response = {
        sessions: [
          {
            id: "session-1",
            backend: "opencode",
            cwd: "/home/user",
            createdAt: 1700000000000,
          },
          {
            id: "session-2",
            backend: "opencode",
            cwd: "/workspace",
            createdAt: 1700000000001,
          },
        ],
      };
      expect(terminalListResponseSchema.parse(response)).toEqual(response);
    });

    it("parses empty sessions array", () => {
      const response = { sessions: [] };
      expect(terminalListResponseSchema.parse(response)).toEqual(response);
    });

    it("rejects missing sessions", () => {
      const response = {};
      expect(() => terminalListResponseSchema.parse(response)).toThrow();
    });

    it("rejects invalid session in array", () => {
      const response = {
        sessions: [{ id: "session-1" }],
      };
      expect(() => terminalListResponseSchema.parse(response)).toThrow();
    });
  });

  describe("terminalResizeInputSchema", () => {
    it("parses valid resize input", () => {
      const input = { cols: 80, rows: 24 };
      expect(terminalResizeInputSchema.parse(input)).toEqual(input);
    });

    it("parses minimal valid input", () => {
      const input = { cols: 1, rows: 1 };
      expect(terminalResizeInputSchema.parse(input)).toEqual(input);
    });

    it("parses maximal valid input", () => {
      const input = { cols: 200, rows: 100 };
      expect(terminalResizeInputSchema.parse(input)).toEqual(input);
    });

    it("rejects missing cols", () => {
      const input = { rows: 24 };
      expect(() => terminalResizeInputSchema.parse(input)).toThrow();
    });

    it("rejects missing rows", () => {
      const input = { cols: 80 };
      expect(() => terminalResizeInputSchema.parse(input)).toThrow();
    });

    it("rejects zero cols", () => {
      const input = { cols: 0, rows: 24 };
      expect(() => terminalResizeInputSchema.parse(input)).toThrow();
    });

    it("rejects negative cols", () => {
      const input = { cols: -1, rows: 24 };
      expect(() => terminalResizeInputSchema.parse(input)).toThrow();
    });

    it("rejects cols exceeding maximum", () => {
      const input = { cols: 201, rows: 24 };
      expect(() => terminalResizeInputSchema.parse(input)).toThrow();
    });

    it("rejects zero rows", () => {
      const input = { cols: 80, rows: 0 };
      expect(() => terminalResizeInputSchema.parse(input)).toThrow();
    });

    it("rejects negative rows", () => {
      const input = { cols: 80, rows: -1 };
      expect(() => terminalResizeInputSchema.parse(input)).toThrow();
    });

    it("rejects rows exceeding maximum", () => {
      const input = { cols: 80, rows: 101 };
      expect(() => terminalResizeInputSchema.parse(input)).toThrow();
    });

    it("rejects non-integer cols", () => {
      const input = { cols: 80.5, rows: 24 };
      expect(() => terminalResizeInputSchema.parse(input)).toThrow();
    });

    it("rejects non-integer rows", () => {
      const input = { cols: 80, rows: 24.5 };
      expect(() => terminalResizeInputSchema.parse(input)).toThrow();
    });

    it("rejects string cols", () => {
      const input = { cols: "80", rows: 24 };
      expect(() => terminalResizeInputSchema.parse(input)).toThrow();
    });

    it("rejects string rows", () => {
      const input = { cols: 80, rows: "24" };
      expect(() => terminalResizeInputSchema.parse(input)).toThrow();
    });
  });
});
