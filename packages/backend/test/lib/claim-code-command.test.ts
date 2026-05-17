import { beforeEach, describe, expect, it, vi } from "vitest";

const { questionMock, readlineCloseMock } = vi.hoisted(() => ({
  questionMock: vi.fn(),
  readlineCloseMock: vi.fn(),
}));

vi.mock("node:readline/promises", () => ({
  createInterface: () => ({
    question: questionMock,
    close: readlineCloseMock,
  }),
}));

import { runClaimCodeCommand } from "../../src/lib/claim-code-command";
import { loadRuntimeConfig } from "../../src/lib/runtime-config";

describe("runClaimCodeCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    questionMock.mockResolvedValue("n");
  });

  it("prints text claim output with workspace when requested", async () => {
    const ownerAccessService = createOwnerAccessServiceMock();

    await expect(
      runClaimCodeCommand({
        config: loadRuntimeConfig({ cwd: "/tmp/project", env: { NODE_ENV: "test" } }),
        ownerAccessService,
        yes: false,
        format: "text",
        includeWorkspace: true,
      }),
    ).resolves.toEqual([
      "Workspace: /tmp/project/.cc/workspace",
      "CLAIM code: claim-code",
      "temporary owner recovery power",
    ]);
  });

  it("prints json claim output when requested", async () => {
    const ownerAccessService = createOwnerAccessServiceMock();

    await expect(
      runClaimCodeCommand({
        config: loadRuntimeConfig({ cwd: "/tmp/project", env: { NODE_ENV: "test" } }),
        ownerAccessService,
        yes: false,
        format: "json",
      }),
    ).resolves.toEqual([
      JSON.stringify({
        purpose: "claim",
        code: "claim-code",
        warning: "temporary owner recovery power",
      }),
    ]);
  });

  it("cancels active claim-code rotation when confirmation is declined", async () => {
    const ownerAccessService = createOwnerAccessServiceMock({
      claimCode: { expiresAt: "2999-01-01T00:00:00.000Z" },
    });

    await expect(
      runClaimCodeCommand({
        config: loadRuntimeConfig({ cwd: "/tmp/project", env: { NODE_ENV: "test" } }),
        ownerAccessService,
        yes: false,
        format: "text",
      }),
    ).resolves.toEqual(["Claim-code generation cancelled."]);

    expect(questionMock).toHaveBeenCalledWith(
      "An active claim code already exists. Generating a new code removes the old code, and you will have to use the new code to claim this workspace. Continue? [y/N] ",
    );
    expect(readlineCloseMock).toHaveBeenCalledOnce();
    expect(ownerAccessService.rotateClaimCode).not.toHaveBeenCalled();
  });

  it("rotates active claim codes without prompting when confirmed by flag", async () => {
    const ownerAccessService = createOwnerAccessServiceMock({
      claimCode: { expiresAt: "2999-01-01T00:00:00.000Z" },
    });

    await runClaimCodeCommand({
      config: loadRuntimeConfig({ cwd: "/tmp/project", env: { NODE_ENV: "test" } }),
      ownerAccessService,
      yes: true,
      format: "text",
    });

    expect(questionMock).not.toHaveBeenCalled();
    expect(ownerAccessService.rotateClaimCode).toHaveBeenCalledOnce();
  });
});

function createOwnerAccessServiceMock(state: Record<string, unknown> = {}) {
  return {
    getState: vi.fn().mockResolvedValue({ sessions: [], rateLimits: {}, ...state }),
    rotateClaimCode: vi.fn().mockResolvedValue({
      purpose: "claim",
      code: "claim-code",
      warning: "temporary owner recovery power",
    }),
  };
}
