import { resolve } from "node:path";
import { z } from "zod";

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_DATA_DIR = ".cc";
const DEFAULT_WORKSPACE_DIR_NAME = "workspace";
const DEFAULT_ENGINE_TIMEOUT_MS = 30_000;
const DEFAULT_ENGINE_STARTUP_TIMEOUT_MS = 30_000;
const DEFAULT_ENGINE_SHUTDOWN_TIMEOUT_MS = 15_000;
const DEFAULT_ENGINE_HEALTH_POLL_MS = 2_000;
const DEFAULT_ENGINE_HOST = "127.0.0.1";
const DEFAULT_ENGINE_PORT = 4096;
const DEFAULT_ENGINE_MAX_RESTARTS = 3;
const DEFAULT_ENGINE_RESTART_WINDOW_MS = 60_000;
const DEFAULT_PROVIDER_AUTH_TIMEOUT_MS = 300_000;
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
  CC_ENGINE_TIMEOUT_MS: positiveInteger("CC_ENGINE_TIMEOUT_MS", DEFAULT_ENGINE_TIMEOUT_MS),
  CC_ENGINE_STARTUP_TIMEOUT_MS: positiveInteger(
    "CC_ENGINE_STARTUP_TIMEOUT_MS",
    DEFAULT_ENGINE_STARTUP_TIMEOUT_MS,
  ),
  CC_ENGINE_SHUTDOWN_TIMEOUT_MS: positiveInteger(
    "CC_ENGINE_SHUTDOWN_TIMEOUT_MS",
    DEFAULT_ENGINE_SHUTDOWN_TIMEOUT_MS,
  ),
  CC_ENGINE_HEALTH_POLL_MS: positiveInteger(
    "CC_ENGINE_HEALTH_POLL_MS",
    DEFAULT_ENGINE_HEALTH_POLL_MS,
  ),
  CC_ENGINE_HOST: z.string().trim().optional().default(DEFAULT_ENGINE_HOST),
  CC_ENGINE_PORT: positiveInteger("CC_ENGINE_PORT", DEFAULT_ENGINE_PORT),
  CC_ENGINE_MAX_RESTARTS: positiveInteger("CC_ENGINE_MAX_RESTARTS", DEFAULT_ENGINE_MAX_RESTARTS),
  CC_ENGINE_RESTART_WINDOW_MS: positiveInteger(
    "CC_ENGINE_RESTART_WINDOW_MS",
    DEFAULT_ENGINE_RESTART_WINDOW_MS,
  ),
  CC_PROVIDER_AUTH_TIMEOUT_MS: positiveInteger(
    "CC_PROVIDER_AUTH_TIMEOUT_MS",
    DEFAULT_PROVIDER_AUTH_TIMEOUT_MS,
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
    engineRequestMs: number;
    engineStartupMs: number;
    engineShutdownMs: number;
    engineHealthPollMs: number;
    engineRestartWindowMs: number;
    providerAuthMs: number;
    mcpAuthMs: number;
    drainMs: number;
  };
  engine: {
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
  const cwd = options?.cwd ?? process.cwd();
  const env = options?.env ?? process.env;
  const parsedEnv = envSchema.safeParse(env);

  if (!parsedEnv.success) {
    const details = parsedEnv.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid runtime configuration: ${details}`);
  }

  const dataDir = resolve(cwd, parsedEnv.data.CC_DATA_DIR);
  const workspaceDir = parsedEnv.data.CC_WORKSPACE_DIR
    ? resolve(cwd, parsedEnv.data.CC_WORKSPACE_DIR)
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
      engineRequestMs: parsedEnv.data.CC_ENGINE_TIMEOUT_MS,
      engineStartupMs: parsedEnv.data.CC_ENGINE_STARTUP_TIMEOUT_MS,
      engineShutdownMs: parsedEnv.data.CC_ENGINE_SHUTDOWN_TIMEOUT_MS,
      engineHealthPollMs: parsedEnv.data.CC_ENGINE_HEALTH_POLL_MS,
      engineRestartWindowMs: parsedEnv.data.CC_ENGINE_RESTART_WINDOW_MS,
      providerAuthMs: parsedEnv.data.CC_PROVIDER_AUTH_TIMEOUT_MS,
      mcpAuthMs: parsedEnv.data.CC_MCP_AUTH_TIMEOUT_MS,
      drainMs: parsedEnv.data.CC_DRAIN_TIMEOUT_MS,
    },
    engine: {
      host: parsedEnv.data.CC_ENGINE_HOST,
      port: parsedEnv.data.CC_ENGINE_PORT,
      maxRestarts: parsedEnv.data.CC_ENGINE_MAX_RESTARTS,
      baseUrl: `http://${parsedEnv.data.CC_ENGINE_HOST}:${String(parsedEnv.data.CC_ENGINE_PORT)}`,
    },
    logLevel: parsedEnv.data.CC_LOG_LEVEL,
    opencodePath: parsedEnv.data.CC_OPENCODE_PATH || undefined,
  };
}

export function getStartupLogContext(config: RuntimeConfig): Record<string, unknown> {
  return {
    nodeEnv: config.nodeEnv,
    server: config.server,
    engine: config.engine,
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
