import { describe, expect, it, vi } from "vitest";

import {
  logOwnerClaimStartupInstructions,
  logPublicBindingGuidance,
} from "../../src/lib/start-server-runtime";
import { loadRuntimeConfig } from "../../src/lib/runtime-config";

describe("startup owner claim instructions", () => {
  it("generates and logs a first-run claim code for unclaimed workspaces", async () => {
    const logger = createLoggerMock();
    const ownerAccessService = {
      getState: vi.fn().mockResolvedValue({ sessions: [], rateLimits: {} }),
      rotateClaimCode: vi.fn().mockResolvedValue({
        purpose: "claim",
        code: "claim-code",
        warning: "temporary owner recovery power",
      }),
    };

    await logOwnerClaimStartupInstructions({
      config: loadRuntimeConfig({ cwd: "/tmp/project", env: { NODE_ENV: "test" } }),
      logger: logger as never,
      ownerAccessService: ownerAccessService as never,
    });

    expect(ownerAccessService.rotateClaimCode).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        authState: "unclaimed",
        claimCode: "claim-code",
        claimUrl: "http://localhost:3000/claim",
      }),
      "workspace is unclaimed; open the claim URL and use this one-time claim code",
    );
  });

  it("does not rotate when an active claim code already exists", async () => {
    const logger = createLoggerMock();
    const ownerAccessService = {
      getState: vi.fn().mockResolvedValue({
        sessions: [],
        rateLimits: {},
        claimCode: { expiresAt: "2999-01-01T00:00:00.000Z" },
      }),
      rotateClaimCode: vi.fn(),
    };

    await logOwnerClaimStartupInstructions({
      config: loadRuntimeConfig({ cwd: "/tmp/project", env: { NODE_ENV: "test" } }),
      logger: logger as never,
      ownerAccessService: ownerAccessService as never,
    });

    expect(ownerAccessService.rotateClaimCode).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ authState: "unclaimed" }),
      "workspace is unclaimed and an active claim code already exists; run ccenter claim --yes in the same workspace context if the code was missed",
    );
  });

  it("does not leak claim codes after the workspace is claimed", async () => {
    const logger = createLoggerMock();
    const ownerAccessService = {
      getState: vi.fn().mockResolvedValue({
        claimedAt: "2026-01-01T00:00:00.000Z",
        ownerPassword: { algorithm: "scrypt" },
        claimCode: { expiresAt: "2999-01-01T00:00:00.000Z" },
        sessions: [],
        rateLimits: {},
      }),
      rotateClaimCode: vi.fn(),
    };

    await logOwnerClaimStartupInstructions({
      config: loadRuntimeConfig({ cwd: "/tmp/project", env: { NODE_ENV: "test" } }),
      logger: logger as never,
      ownerAccessService: ownerAccessService as never,
    });

    expect(ownerAccessService.rotateClaimCode).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      { authState: "claimed" },
      "workspace owner access is claimed",
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe("startup public binding guidance", () => {
  it("warns when binding to an externally reachable address", () => {
    const logger = createLoggerMock();

    logPublicBindingGuidance(
      loadRuntimeConfig({
        cwd: "/tmp/project",
        env: { NODE_ENV: "production", CC_HOST: "0.0.0.0" },
      }),
      logger as never,
    );

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ host: "0.0.0.0" }),
      "server is bound to an externally reachable address; use HTTPS and set CC_PUBLIC_ORIGIN when exposing CommandsCenter publicly",
    );
  });

  it("does not warn for localhost bindings", () => {
    const logger = createLoggerMock();

    logPublicBindingGuidance(
      loadRuntimeConfig({
        cwd: "/tmp/project",
        env: { NODE_ENV: "production", CC_HOST: "127.0.0.1" },
      }),
      logger as never,
    );

    expect(logger.warn).not.toHaveBeenCalled();
  });
});

function createLoggerMock() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
  };
}
