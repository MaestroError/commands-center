import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "pino";
import type { RuntimeConfig } from "../../src/lib/runtime-config.js";
import { createOpenCodePtyBackend } from "../../src/services/terminal/opencode-pty-backend.js";
import { createTerminalBackendFactory } from "../../src/services/terminal-backend.js";

const createOpenCodePtyBackendMock = vi.mocked(createOpenCodePtyBackend);

function createConfig(): RuntimeConfig {
  return {
    opencode: { baseUrl: "http://opencode.test:4100" },
  } as unknown as RuntimeConfig;
}

function createLogger() {
  return {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
  } as unknown as Logger & {
    warn: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
  };
}

vi.mock("../../src/services/terminal/opencode-pty-backend.js", () => ({
  createOpenCodePtyBackend: vi.fn(() => ({
    type: "opencode" as const,
    create: vi.fn().mockResolvedValue({
      id: "oc-session-1",
      backend: "opencode",
      cwd: "/home/user",
      createdAt: Date.now(),
    }),
    attach: vi.fn(),
    resize: vi.fn(),
    close: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    isAvailable: vi.fn().mockReturnValue(true),
  })),
}));

describe("TerminalBackendFactory", () => {
  let logger: ReturnType<typeof createLogger>;
  let config: ReturnType<typeof createConfig>;
  let factory: ReturnType<typeof createTerminalBackendFactory>;

  beforeEach(() => {
    vi.clearAllMocks();
    createOpenCodePtyBackendMock.mockImplementation((options) => ({
      type: "opencode",
      create: vi.fn().mockResolvedValue({
        id: "oc-session-1",
        backend: "opencode",
        cwd: "/home/user",
        createdAt: Date.now(),
      }),
      attach: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      isAvailable: vi.fn(() => options.isAvailable?.() ?? true),
    }));
    logger = createLogger();
    config = createConfig();
    factory = createTerminalBackendFactory({ config, logger });
  });

  describe("create", () => {
    it("returns opencode backend when type is opencode", () => {
      const backend = factory.create("opencode");
      expect(backend.type).toBe("opencode");
    });
  });

  describe("getDefaultBackend", () => {
    it("returns opencode when opencode is available", () => {
      expect(factory.getDefaultBackend()).toBe("opencode");
    });
  });

  describe("isOpenCodeAvailable", () => {
    it("returns true when opencode backend is available", () => {
      expect(factory.isOpenCodeAvailable()).toBe(true);
    });

    it("returns false when opencode backend is unavailable", () => {
      const factoryUnavailable = createTerminalBackendFactory({
        config,
        logger,
        orchestrator: {
          getStatus: () =>
            ({
              state: "unhealthy",
              healthy: false,
              url: config.opencode.baseUrl,
              workspaceDir: "/test",
              restartCount: 0,
              maxRestarts: 0,
            }) as const,
        },
      });

      expect(factoryUnavailable.isOpenCodeAvailable()).toBe(false);
    });
  });

  describe("createWithFallback", () => {
    it("creates session with opencode backend when preferred and available", async () => {
      const result = await factory.createWithFallback({
        preferred: "opencode",
      });

      expect(result.backend.type).toBe("opencode");
    });

    it("throws when opencode is not available", async () => {
      const factoryWithUnavailable = createTerminalBackendFactory({
        config,
        logger,
        orchestrator: {
          getStatus: () =>
            ({
              state: "unhealthy",
              healthy: false,
              url: config.opencode.baseUrl,
              workspaceDir: "/test",
              restartCount: 0,
              maxRestarts: 0,
            }) as const,
        },
      });
      await expect(
        factoryWithUnavailable.createWithFallback({
          preferred: "opencode",
        }),
      ).rejects.toThrow("OpenCode terminal backend is unavailable.");
    });
  });

  describe("openCodeBackend", () => {
    it("exposes openCodeBackend", () => {
      expect(factory.openCodeBackend).toBeDefined();
      expect(factory.openCodeBackend.type).toBe("opencode");
    });
  });
});
