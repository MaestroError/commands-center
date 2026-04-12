import os from "node:os";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_DATA_DIR = ".cc";
const DEFAULT_WORKSPACE_DIR_NAME = "workspace";
const DEFAULT_OPENCODE_TIMEOUT_MS = 30_000;
const DEFAULT_OPENCODE_STARTUP_TIMEOUT_MS = 30_000;
const DEFAULT_OPENCODE_SHUTDOWN_TIMEOUT_MS = 15_000;
const DEFAULT_OPENCODE_HEALTH_POLL_MS = 2_000;
const DEFAULT_OPENCODE_HOST = "127.0.0.1";
const DEFAULT_OPENCODE_PORT = 4100;
const DEFAULT_OPENCODE_MAX_RESTARTS = 3;
const DEFAULT_OPENCODE_RESTART_WINDOW_MS = 60_000;
const DEFAULT_MCP_AUTH_TIMEOUT_MS = 90_000;
const DEFAULT_DRAIN_TIMEOUT_MS = 15_000;
const DEFAULT_LOG_LEVEL = "info";

const logLevelSchema = z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]);

const positiveInteger = (name: string, defaultValue: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value === "") {
        return defaultValue;
      }

      const parsedValue = Number.parseInt(value, 10);

      if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${name} must be a positive integer`,
        });

        return z.NEVER;
      }

      return parsedValue;
    });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).optional().default("development"),
  CC_PORT: positiveInteger("CC_PORT", DEFAULT_PORT),
  CC_HOST: z.string().trim().optional().default(DEFAULT_HOST),
  CC_DATA_DIR: z.string().trim().optional().default(DEFAULT_DATA_DIR),
  CC_WORKSPACE_DIR: z.string().trim().optional(),
  DATABASE_URL: z.string().trim().optional(),
  CC_OPENCODE_TIMEOUT_MS: positiveInteger("CC_OPENCODE_TIMEOUT_MS", DEFAULT_OPENCODE_TIMEOUT_MS),
  CC_OPENCODE_STARTUP_TIMEOUT_MS: positiveInteger(
    "CC_OPENCODE_STARTUP_TIMEOUT_MS",
    DEFAULT_OPENCODE_STARTUP_TIMEOUT_MS,
  ),
  CC_OPENCODE_SHUTDOWN_TIMEOUT_MS: positiveInteger(
    "CC_OPENCODE_SHUTDOWN_TIMEOUT_MS",
    DEFAULT_OPENCODE_SHUTDOWN_TIMEOUT_MS,
  ),
  CC_OPENCODE_HEALTH_POLL_MS: positiveInteger(
    "CC_OPENCODE_HEALTH_POLL_MS",
    DEFAULT_OPENCODE_HEALTH_POLL_MS,
  ),
  CC_OPENCODE_HOST: z.string().trim().optional().default(DEFAULT_OPENCODE_HOST),
  CC_OPENCODE_PORT: positiveInteger("CC_OPENCODE_PORT", DEFAULT_OPENCODE_PORT),
  CC_OPENCODE_MAX_RESTARTS: positiveInteger(
    "CC_OPENCODE_MAX_RESTARTS",
    DEFAULT_OPENCODE_MAX_RESTARTS,
  ),
  CC_OPENCODE_RESTART_WINDOW_MS: positiveInteger(
    "CC_OPENCODE_RESTART_WINDOW_MS",
    DEFAULT_OPENCODE_RESTART_WINDOW_MS,
  ),
  CC_MCP_AUTH_TIMEOUT_MS: positiveInteger("CC_MCP_AUTH_TIMEOUT_MS", DEFAULT_MCP_AUTH_TIMEOUT_MS),
  CC_DRAIN_TIMEOUT_MS: positiveInteger("CC_DRAIN_TIMEOUT_MS", DEFAULT_DRAIN_TIMEOUT_MS),
  CC_LOG_LEVEL: logLevelSchema.optional().default(DEFAULT_LOG_LEVEL),
  CC_OPENCODE_PATH: z.string().trim().optional(),
});

export type RuntimeEnvironment = NodeJS.ProcessEnv;

export type RuntimeConfig = {
  nodeEnv: "development" | "test" | "production";
  server: {
    host: string;
    port: number;
  };
  paths: {
    cwd: string;
    dataDir: string;
    workspaceDir: string;
    subdirectories: {
      agents: string;
      auth: string;
      automations: string;
      database: string;
      mcp: string;
      preferences: string;
      sessions: string;
      tools: string;
      tmp: string;
    };
    databaseFile: string;
  };
  database: {
    databaseUrl?: string;
    sqlitePath: string;
  };
  timeouts: {
    opencodeRequestMs: number;
    opencodeStartupMs: number;
    opencodeShutdownMs: number;
    opencodeHealthPollMs: number;
    opencodeRestartWindowMs: number;
    mcpAuthMs: number;
    drainMs: number;
  };
  opencode: {
    host: string;
    port: number;
    maxRestarts: number;
    baseUrl: string;
  };
  logLevel: z.infer<typeof logLevelSchema>;
  opencodePath?: string;
};

export type RuntimeConfigOverrides = {
  host?: string;
  port?: number;
};

export function loadRuntimeConfig(options?: {
  cwd?: string;
  env?: RuntimeEnvironment;
  overrides?: RuntimeConfigOverrides;
}): RuntimeConfig {
  const env = options?.env ?? process.env;
  const cwd = options?.cwd ?? env["INIT_CWD"] ?? os.homedir();
  const parsedEnv = envSchema.safeParse(env);

  if (!parsedEnv.success) {
    const details = parsedEnv.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid runtime configuration: ${details}`);
  }

  const dataDir = resolve(cwd, parsedEnv.data.CC_DATA_DIR);
  const workspaceDir = parsedEnv.data.CC_WORKSPACE_DIR
    ? isAbsolute(parsedEnv.data.CC_WORKSPACE_DIR)
      ? parsedEnv.data.CC_WORKSPACE_DIR
      : resolve(cwd, parsedEnv.data.CC_WORKSPACE_DIR)
    : resolve(dataDir, DEFAULT_WORKSPACE_DIR_NAME);

  return {
    nodeEnv: parsedEnv.data.NODE_ENV,
    server: {
      host: options?.overrides?.host ?? parsedEnv.data.CC_HOST,
      port: options?.overrides?.port ?? parsedEnv.data.CC_PORT,
    },
    paths: {
      cwd,
      dataDir,
      workspaceDir,
      subdirectories: {
        agents: resolve(workspaceDir, "agents"),
        auth: resolve(workspaceDir, "auth"),
        automations: resolve(workspaceDir, "automations"),
        database: resolve(workspaceDir, "database"),
        mcp: resolve(workspaceDir, "mcp"),
        preferences: resolve(workspaceDir, "preferences"),
        sessions: resolve(workspaceDir, "sessions"),
        tools: resolve(workspaceDir, "tools"),
        tmp: resolve(workspaceDir, "tmp"),
      },
      databaseFile: resolve(workspaceDir, "database", "local.db"),
    },
    database: {
      databaseUrl: parsedEnv.data.DATABASE_URL || undefined,
      sqlitePath: resolve(workspaceDir, "database", "local.db"),
    },
    timeouts: {
      opencodeRequestMs: parsedEnv.data.CC_OPENCODE_TIMEOUT_MS,
      opencodeStartupMs: parsedEnv.data.CC_OPENCODE_STARTUP_TIMEOUT_MS,
      opencodeShutdownMs: parsedEnv.data.CC_OPENCODE_SHUTDOWN_TIMEOUT_MS,
      opencodeHealthPollMs: parsedEnv.data.CC_OPENCODE_HEALTH_POLL_MS,
      opencodeRestartWindowMs: parsedEnv.data.CC_OPENCODE_RESTART_WINDOW_MS,
      mcpAuthMs: parsedEnv.data.CC_MCP_AUTH_TIMEOUT_MS,
      drainMs: parsedEnv.data.CC_DRAIN_TIMEOUT_MS,
    },
    opencode: {
      host: parsedEnv.data.CC_OPENCODE_HOST,
      port: parsedEnv.data.CC_OPENCODE_PORT,
      maxRestarts: parsedEnv.data.CC_OPENCODE_MAX_RESTARTS,
      baseUrl: `http://${parsedEnv.data.CC_OPENCODE_HOST}:${String(parsedEnv.data.CC_OPENCODE_PORT)}`,
    },
    logLevel: parsedEnv.data.CC_LOG_LEVEL,
    opencodePath: parsedEnv.data.CC_OPENCODE_PATH || undefined,
  };
}

export function getStartupLogContext(config: RuntimeConfig): Record<string, unknown> {
  return {
    nodeEnv: config.nodeEnv,
    server: config.server,
    opencode: config.opencode,
    paths: {
      dataDir: config.paths.dataDir,
      workspaceDir: config.paths.workspaceDir,
      databaseFile: config.paths.databaseFile,
    },
    database: {
      hasDatabaseUrl: config.database.databaseUrl !== undefined,
      sqlitePath: config.database.sqlitePath,
    },
    timeouts: config.timeouts,
    logLevel: config.logLevel,
    opencodePathConfigured: config.opencodePath !== undefined,
  };
}
