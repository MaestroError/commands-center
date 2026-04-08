import { spawn, type ChildProcess } from "node:child_process";

import type { Logger } from "pino";

import { resolveOpencodeBinary, type OpenCodeBinary } from "../lib/opencode-binary.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";

export type WorkspaceTarget = {
  directory?: string;
  workspaceId?: string;
};

export type WorkspaceRequestInit = Omit<RequestInit, "body"> & {
  body?: unknown;
  timeoutMs?: number;
};

export type EngineState = "stopped" | "starting" | "healthy" | "unhealthy" | "stopping";

export type EngineStatus = {
  state: EngineState;
  healthy: boolean;
  url: string;
  workspaceDir: string;
  pid?: number;
  binaryPath?: string;
  binarySource?: OpenCodeBinary["source"];
  startedAt?: string;
  lastHealthCheckAt?: string;
  lastHealthyAt?: string;
  lastExitCode?: number;
  lastExitSignal?: NodeJS.Signals;
  lastError?: string;
  restartCount: number;
  maxRestarts: number;
};

export type WorkspaceClient = {
  request<T>(path: string, init?: WorkspaceRequestInit): Promise<T>;
  getPath(): Promise<{
    home: string;
    state: string;
    config: string;
    worktree: string;
    directory: string;
  }>;
  disposeInstance(): Promise<boolean>;
};

export type OpenCodeOrchestrator = {
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(reason: string): Promise<void>;
  refreshHealth(): Promise<boolean>;
  getStatus(): EngineStatus;
  createWorkspaceClient(target: WorkspaceTarget): WorkspaceClient;
  disposeWorkspace(target: WorkspaceTarget): Promise<boolean>;
};

type SpawnFn = typeof spawn;
type FetchFn = typeof fetch;

export function createOpenCodeOrchestrator(options: {
  config: RuntimeConfig;
  logger: Logger;
  spawnProcess?: SpawnFn;
  fetch?: FetchFn;
  resolveBinary?: typeof resolveOpencodeBinary;
}): OpenCodeOrchestrator {
  const spawnProcess = options.spawnProcess ?? spawn;
  const fetchFn = options.fetch ?? fetch;
  const resolveBinary = options.resolveBinary ?? resolveOpencodeBinary;
  const useDetachedProcess =
    process.platform !== "win32" && options.config.nodeEnv !== "development";

  let child: ChildProcess | undefined;
  let state: EngineState = "stopped";
  let healthy = false;
  let startPromise: Promise<void> | undefined;
  let stopPromise: Promise<void> | undefined;
  let pollTimer: NodeJS.Timeout | undefined;
  let binary: OpenCodeBinary | undefined;
  let startedAt: number | undefined;
  let lastHealthCheckAt: number | undefined;
  let lastHealthyAt: number | undefined;
  let lastExitCode: number | undefined;
  let lastExitSignal: NodeJS.Signals | undefined;
  let lastError: string | undefined;
  let restartHistory: number[] = [];
  let intentionalStop = false;

  async function start(): Promise<void> {
    if (startPromise) {
      return startPromise;
    }

    if (child && (state === "starting" || state === "healthy" || state === "unhealthy")) {
      return;
    }

    startPromise = (async () => {
      binary = await resolveBinary(options.config);
      intentionalStop = false;
      state = "starting";
      healthy = false;
      startedAt = undefined;
      lastError = undefined;
      lastExitCode = undefined;
      lastExitSignal = undefined;

      const next = spawnProcess(
        binary.path,
        [
          "serve",
          `--hostname=${options.config.engine.host}`,
          `--port=${String(options.config.engine.port)}`,
        ],
        {
          cwd: options.config.paths.cwd,
          env: process.env,
          detached: useDetachedProcess,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      child = next;

      next.stdout?.on("data", (chunk: Buffer | string) => {
        const output = chunk.toString().trim();

        if (output) {
          options.logger.debug({ output }, "opencode stdout");
        }
      });

      next.stderr?.on("data", (chunk: Buffer | string) => {
        const output = chunk.toString().trim();

        if (output) {
          options.logger.warn({ output }, "opencode stderr");
        }
      });

      next.once("error", (error) => {
        lastError = formatError(error);
      });

      next.once("exit", (code, signal) => {
        stopPolling();
        healthy = false;
        lastExitCode = typeof code === "number" ? code : undefined;
        lastExitSignal = signal ?? undefined;

        if (child?.pid === next.pid) {
          child = undefined;
        }

        if (intentionalStop || state === "stopping") {
          state = "stopped";
          options.logger.info({ code, signal }, "opencode stopped");
          return;
        }

        state = "unhealthy";
        lastError ??= `OpenCode exited unexpectedly with code ${String(code)}.`;

        if (startPromise) {
          options.logger.error({ code, signal }, "opencode exited during startup");
          return;
        }

        options.logger.error({ code, signal }, "opencode exited unexpectedly");
        void restartAfterCrash();
      });

      options.logger.info(
        {
          pid: next.pid,
          binaryPath: binary.path,
          binarySource: binary.source,
          url: options.config.engine.baseUrl,
        },
        "starting opencode engine",
      );

      try {
        await waitForHealthy();
      } catch (error) {
        lastError = formatError(error);
        await terminateChild(next, options.config.timeouts.engineShutdownMs);
        state = "unhealthy";
        throw error;
      }

      startedAt = Date.now();
      healthy = true;
      state = "healthy";
      lastHealthyAt = startedAt;
      startPolling();

      options.logger.info(
        {
          pid: next.pid,
          url: options.config.engine.baseUrl,
        },
        "opencode engine is healthy",
      );
    })().finally(() => {
      startPromise = undefined;
    });

    return startPromise;
  }

  async function stop(): Promise<void> {
    if (stopPromise) {
      return stopPromise;
    }

    stopPromise = (async () => {
      intentionalStop = true;
      stopPolling();
      healthy = false;

      if (!child) {
        state = "stopped";
        return;
      }

      state = "stopping";
      await terminateChild(child, options.config.timeouts.engineShutdownMs);
      state = "stopped";
    })().finally(() => {
      stopPromise = undefined;
    });

    return stopPromise;
  }

  async function restart(reason: string): Promise<void> {
    options.logger.warn({ reason }, "restarting opencode engine");
    await stop();
    await start();
  }

  async function refreshHealth(): Promise<boolean> {
    if (!child || state === "stopped" || state === "stopping") {
      healthy = false;

      if (state !== "starting") {
        state = "stopped";
      }

      return false;
    }

    lastHealthCheckAt = Date.now();

    try {
      const response = await request<{ healthy: boolean; version: string }>("/global/health");
      healthy = response.healthy;

      if (response.healthy) {
        lastHealthyAt = Date.now();

        if (state !== "starting") {
          state = "healthy";
        }
      } else if (state !== "starting") {
        state = "unhealthy";
      }

      return response.healthy;
    } catch (error) {
      healthy = false;
      lastError = formatError(error);

      if (state !== "starting") {
        state = "unhealthy";
      }

      options.logger.warn({ err: error }, "opencode health check failed");
      return false;
    }
  }

  function getStatus(): EngineStatus {
    return {
      state,
      healthy,
      url: options.config.engine.baseUrl,
      workspaceDir: options.config.paths.workspaceDir,
      pid: child?.pid,
      binaryPath: binary?.path,
      binarySource: binary?.source,
      startedAt: startedAt ? new Date(startedAt).toISOString() : undefined,
      lastHealthCheckAt: lastHealthCheckAt ? new Date(lastHealthCheckAt).toISOString() : undefined,
      lastHealthyAt: lastHealthyAt ? new Date(lastHealthyAt).toISOString() : undefined,
      lastExitCode,
      lastExitSignal,
      lastError,
      restartCount: restartHistory.length,
      maxRestarts: options.config.engine.maxRestarts,
    };
  }

  function createWorkspaceClient(target: WorkspaceTarget): WorkspaceClient {
    return {
      request: <T>(path: string, init?: WorkspaceRequestInit) =>
        request<T>(path, {
          ...init,
          target,
        }),
      getPath: () =>
        request<{
          home: string;
          state: string;
          config: string;
          worktree: string;
          directory: string;
        }>("/path", { target }),
      disposeInstance: () => request<boolean>("/instance/dispose", { method: "POST", target }),
    };
  }

  async function disposeWorkspace(target: WorkspaceTarget): Promise<boolean> {
    return request<boolean>("/instance/dispose", {
      method: "POST",
      target,
    });
  }

  async function request<T>(
    path: string,
    init?: WorkspaceRequestInit & { target?: WorkspaceTarget },
  ): Promise<T> {
    if (!child || state === "stopped" || state === "stopping") {
      throw new Error("OpenCode engine is not running.");
    }

    const url = new URL(path, options.config.engine.baseUrl);

    if (init?.target?.directory) {
      url.searchParams.set("directory", init.target.directory);
    }

    if (init?.target?.workspaceId) {
      url.searchParams.set("workspace", init.target.workspaceId);
    }

    const { body, target: _target, timeoutMs, ...rest } = init ?? {};
    const headers = new Headers(init?.headers);
    const requestInit: RequestInit = {
      ...rest,
      headers,
    };

    if (body !== undefined) {
      requestInit.body = serializeBody(body, headers);
    }

    const response = await fetchWithTimeout(url, requestInit, timeoutMs);

    if (!response.ok) {
      throw new Error(
        `OpenCode request to ${url.pathname} failed with status ${String(response.status)}.`,
      );
    }

    const contentType = response.headers.get("content-type");

    if (contentType?.includes("application/json")) {
      return (await response.json()) as T;
    }

    return (await response.text()) as T;
  }

  function startPolling(): void {
    stopPolling();

    pollTimer = setInterval(() => {
      void refreshHealth();
    }, options.config.timeouts.engineHealthPollMs);

    pollTimer.unref();
  }

  function stopPolling(): void {
    if (!pollTimer) {
      return;
    }

    clearInterval(pollTimer);
    pollTimer = undefined;
  }

  async function waitForHealthy(): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < options.config.timeouts.engineStartupMs) {
      if (!child) {
        throw new Error("OpenCode process exited before becoming healthy.");
      }

      if (await refreshHealth()) {
        return;
      }

      await sleep(250);
    }

    throw new Error(
      `OpenCode did not become healthy within ${String(options.config.timeouts.engineStartupMs)}ms.`,
    );
  }

  async function restartAfterCrash(): Promise<void> {
    const now = Date.now();
    restartHistory = restartHistory.filter(
      (value) => now - value < options.config.timeouts.engineRestartWindowMs,
    );

    if (restartHistory.length >= options.config.engine.maxRestarts) {
      options.logger.error(
        {
          restarts: restartHistory.length,
          windowMs: options.config.timeouts.engineRestartWindowMs,
        },
        "opencode restart limit reached",
      );
      return;
    }

    restartHistory.push(now);

    try {
      await start();
    } catch (error) {
      options.logger.error({ err: error }, "opencode restart failed");
    }
  }

  async function fetchWithTimeout(
    input: URL | string,
    init?: RequestInit,
    timeoutMs?: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort(new Error("OpenCode request timed out."));
    }, timeoutMs ?? options.config.timeouts.engineRequestMs);

    timeout.unref();

    try {
      return await fetchFn(input, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async function terminateChild(proc: ChildProcess, timeoutMs: number): Promise<void> {
    if (!proc.pid || proc.exitCode !== null) {
      return;
    }

    signalProcess(proc, "SIGTERM");

    try {
      await waitForExit(proc, timeoutMs);
    } catch {
      signalProcess(proc, "SIGKILL");
      await waitForExit(proc, timeoutMs);
    }
  }

  function signalProcess(proc: ChildProcess, signal: NodeJS.Signals): void {
    try {
      if (useDetachedProcess && proc.pid) {
        process.kill(-proc.pid, signal);
        return;
      }

      proc.kill(signal);
    } catch (error) {
      if (!isMissingProcessError(error)) {
        throw error;
      }
    }
  }

  function waitForExit(proc: ChildProcess, timeoutMs: number): Promise<void> {
    if (proc.exitCode !== null) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const done = () => {
        clearTimeout(timeout);
        proc.off("exit", done);
        resolve();
      };

      const timeout = setTimeout(() => {
        proc.off("exit", done);
        reject(new Error(`Timed out waiting for OpenCode to exit after ${String(timeoutMs)}ms.`));
      }, timeoutMs);

      timeout.unref();
      proc.once("exit", done);
    });
  }

  function serializeBody(body: unknown, headers: Headers): RequestInit["body"] {
    if (typeof body === "string") {
      return body;
    }

    if (body instanceof URLSearchParams) {
      return body;
    }

    if (body instanceof FormData) {
      return body;
    }

    if (body instanceof Blob) {
      return body;
    }

    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
      return body instanceof ArrayBuffer
        ? body
        : new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
    }

    headers.set("content-type", "application/json");
    return JSON.stringify(body);
  }

  function formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }

  function isMissingProcessError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && error.code === "ESRCH";
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, ms);
      timeout.unref();
    });
  }

  return {
    start,
    stop,
    restart,
    refreshHealth,
    getStatus,
    createWorkspaceClient,
    disposeWorkspace,
  };
}
