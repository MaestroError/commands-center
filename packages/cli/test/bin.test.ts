import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runCliMock } = vi.hoisted(() => ({
  runCliMock: vi.fn(),
}));

vi.mock("../src/cli.js", () => ({
  runCli: runCliMock,
}));

describe("bin entrypoint", () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.argv = ["node", "bin", "serve", "--port", "4010"];
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  it("passes CLI arguments to runCli", async () => {
    runCliMock.mockResolvedValue(undefined);

    await import("../src/bin.js");

    expect(runCliMock).toHaveBeenCalledWith(["serve", "--port", "4010"]);
  });

  it("logs and exits when runCli rejects", async () => {
    const error = new Error("boom");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const processExit = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: string | number | null) => code) as never);
    runCliMock.mockRejectedValue(error);

    await import("../src/bin.js");
    await Promise.resolve();

    expect(consoleError).toHaveBeenCalledWith(error);
    expect(processExit).toHaveBeenCalledWith(1);
  });
});
